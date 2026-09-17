/**
 * Tri, filtrage et groupement du catalogue d'un studio.
 *
 * Pourquoi côté client : AniList n'accepte que `sort` et `isMain` sur la
 * connexion `Studio.media` — ni format, ni saison, ni année, ni genre. Et
 * `Page.media`, qui sait tout filtrer, n'a aucun argument `studio`. Il n'y a
 * donc pas de version serveur de ces filtres à aller chercher : c'est ici ou
 * nulle part.
 *
 * Conséquence directe : un filtre ne dit la vérité que sur ce qui est chargé.
 * C'est la page qui se charge de compléter le catalogue avant de filtrer ; ce
 * module ne fait que des fonctions pures sur une liste donnée.
 */

export interface CatalogueItem {
  format: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: { year: number | null };
  genres: string[];
}

export interface CatalogueFilters {
  format: string;
  season: string;
  year: string;
  genre: string;
}

export const NO_FILTERS: CatalogueFilters = { format: '', season: '', year: '', genre: '' };

/** Ordres d'affichage voulus — l'alphabétique n'a de sens ni pour l'un ni pour l'autre. */
const FORMAT_ORDER = ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'];
const SEASON_ORDER = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

const rank = (order: string[], value: string) => {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
};

/**
 * L'année de sortie.
 *
 * `startDate` fait foi, `seasonYear` sert de repli : les films et les OVA
 * n'ont souvent pas de saison. Peut valoir `null` — sur ufotable, 7 titres sur
 * 75 sont annoncés sans date.
 */
export function releaseYear(item: CatalogueItem): number | null {
  return item.startDate?.year ?? item.seasonYear ?? null;
}

export function activeFilterCount(f: CatalogueFilters): number {
  return [f.format, f.season, f.year, f.genre].filter(Boolean).length;
}

export function applyFilters<T extends CatalogueItem>(items: T[], f: CatalogueFilters): T[] {
  return items.filter((m) => {
    if (f.format && m.format !== f.format) return false;
    if (f.season && m.season !== f.season) return false;
    /* Comparaison numérique, pas textuelle : `String(null)` vaut "null" et
       ferait correspondre un titre sans date à un filtre d'année. */
    if (f.year && releaseYear(m) !== Number(f.year)) return false;
    if (f.genre && !m.genres.includes(f.genre)) return false;
    return true;
  });
}

/**
 * Les valeurs proposées, tirées du catalogue lui-même.
 *
 * Bien meilleur qu'une liste générique : le sélecteur d'année d'un studio né
 * en 2000 ne propose pas 1970, et celui des genres ne propose pas ceux qu'il
 * n'a jamais produits. Chaque option renvoie donc au moins un résultat.
 */
export function catalogueOptions(items: CatalogueItem[]) {
  const formats = new Set<string>();
  const seasons = new Set<string>();
  const years = new Set<number>();
  const genres = new Set<string>();

  for (const m of items) {
    if (m.format) formats.add(m.format);
    if (m.season) seasons.add(m.season);
    const y = releaseYear(m);
    if (y !== null) years.add(y);
    for (const g of m.genres) genres.add(g);
  }

  return {
    formats: [...formats].sort((a, b) => rank(FORMAT_ORDER, a) - rank(FORMAT_ORDER, b)),
    seasons: [...seasons].sort((a, b) => rank(SEASON_ORDER, a) - rank(SEASON_ORDER, b)),
    years: [...years].sort((a, b) => b - a),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
  };
}

// ─────────────────────────────────────────────────────────────
//  Tri
// ─────────────────────────────────────────────────────────────

/**
 * Le tri est au client, comme les filtres, mais pour une autre raison.
 *
 * AniList sait trier `Studio.media` côté serveur. Mais chaque tri est un cache
 * et un catalogue complet à part : 16 requêtes à chaque changement sur un gros
 * studio, quand le quota est de 30 par minute. Charger une fois puis trier ici
 * coûte une fraction de ça et rend chaque changement instantané.
 *
 * Bonus non prévu : le tri par titre suit le titre RÉELLEMENT affiché, ce que
 * le serveur ne peut pas faire — il ne sait pas qu'on préfère l'anglais avec
 * repli sur le romaji.
 */
export type SortKey = 'newest' | 'oldest' | 'score' | 'title' | 'members';

/** Le même vocabulaire de tri partout : studios, genres, tags. */
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'score', label: 'Highest rated' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'members', label: 'Most members' },
];

/** Les deux tris chronologiques, seuls à justifier un découpage par année. */
export const BY_DATE = new Set<SortKey>(['newest', 'oldest']);

/**
 * L'équivalent serveur, pour les listes trop grandes pour tenir en mémoire.
 *
 * Un genre compte des milliers de titres : impossible de les charger pour les
 * trier ici, comme on le fait pour un studio. C'est donc AniList qui trie, et
 * `sortCatalogue` ne sert que là où le catalogue entier est chargé.
 */
export const MEDIA_SORT: Record<SortKey, string> = {
  newest: 'START_DATE_DESC',
  oldest: 'START_DATE',
  score: 'SCORE_DESC',
  title: 'TITLE_ENGLISH',
  members: 'POPULARITY_DESC',
};

export interface SortableItem extends CatalogueItem {
  averageScore: number | null;
  popularity: number | null;
}

export function sortCatalogue<T extends SortableItem>(
  items: T[],
  key: SortKey,
  titleOf: (item: T) => string,
): T[] {
  const copy = [...items];

  /* Le tri de JavaScript est stable : à égalité, l'ordre du serveur — la date
     décroissante — sert de départage, ce qui est le bon choix par défaut. */
  switch (key) {
    case 'newest':
      /* Sans date en tête : ce sont les annonces les plus récentes, et c'est
         aussi ce que fait AniList. */
      return copy.sort((a, b) => (releaseYear(b) ?? Infinity) - (releaseYear(a) ?? Infinity));
    case 'oldest':
      /* Sans date en dernier, cette fois : un titre annoncé n'est pas ancien.
         AniList les met en tête dans les deux sens, ce qui n'a pas de sens ici. */
      return copy.sort((a, b) => (releaseYear(a) ?? Infinity) - (releaseYear(b) ?? Infinity));
    case 'score':
      return copy.sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1));
    case 'members':
      return copy.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1));
    case 'title':
      return copy.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  }
}

export interface YearGroup<T> {
  /** `null` pour les titres annoncés sans date. */
  year: number | null;
  items: T[];
}

/**
 * Regroupe par année en respectant l'ordre reçu.
 *
 * Le serveur a déjà trié : les années sortent dans le bon sens sans qu'on les
 * retrie, y compris quand le tri est ascendant. On groupe par valeur plutôt
 * que par suites consécutives, pour qu'une année ne puisse pas donner deux
 * sections si un titre s'en retrouve séparé.
 *
 * AniList place les titres sans date en tête dans les deux sens de tri ; ils
 * forment donc naturellement le premier groupe.
 */
export function groupByYear<T extends CatalogueItem>(items: T[]): YearGroup<T>[] {
  const groups = new Map<number | null, T[]>();
  for (const m of items) {
    const y = releaseYear(m);
    const bucket = groups.get(y);
    if (bucket) bucket.push(m);
    else groups.set(y, [m]);
  }
  return [...groups].map(([year, list]) => ({ year, items: list }));
}
