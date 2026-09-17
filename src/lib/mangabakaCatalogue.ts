import type { MbRelation, MbSeries } from '../api/mangabaka/client';

/**
 * Le catalogue MangaBaka : ce qu'on peut lui demander, et comment.
 *
 * ESSAI. On le construit a cote de l'existant, sans toucher au schema de la
 * bibliotheque, pour comparer en vrai avant de decider s'il remplace AniList
 * du cote manga. Rien ici n'est encore une identite.
 */

export interface CatalogueFilters {
  /** Texte libre. Vide = tout le catalogue, plus de 300 000 series. */
  q: string;
  sort: string;
  type: string;
  status: string;
  genre: string;
  tag: string;
  /** Un nom d'auteur ou d'artiste, tel que MangaBaka l'ecrit. */
  staff: string;
  publisher: string;
}

export const NO_FILTERS: CatalogueFilters = {
  q: '',
  sort: 'popularity_asc',
  type: '',
  status: '',
  genre: '',
  tag: '',
  staff: '',
  publisher: '',
};

/**
 * Les tris.
 *
 * ⚠️ `popularity` est un RANG, pas un score : 1 est le plus populaire. Donc
 * `popularity_asc` pour « les plus populaires », et `popularity_desc` remonte
 * le rang 301 600 — mesure faite, il s'appelle litteralement « unknown title
 * (please report on ...) ». Le nom du parametre dit l'exact contraire de ce
 * qu'on veut ; c'est le genre de piege qui remplit un bandeau d'accueil de
 * fiches vides.
 *
 * `trending_7d` et `trending_30d` n'ont pas d'equivalent chez AniList pour le
 * manga.
 */
export const SORTS = [
  { value: 'popularity_asc', label: 'Popularity' },
  { value: 'score_desc', label: 'Score' },
  { value: 'trending_7d', label: 'Trending, 7 days' },
  { value: 'trending_30d', label: 'Trending, 30 days' },
  { value: 'latest', label: 'Latest update' },
  { value: 'published_year_desc', label: 'Newest' },
  { value: 'published_year_asc', label: 'Oldest' },
  { value: 'name_asc', label: 'Title A–Z' },
] as const;

/** Le vocabulaire de MangaBaka, verbatim — il ne se traduit pas. */
export const TYPES = [
  { value: 'manga', label: 'Manga' },
  { value: 'novel', label: 'Novel' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'manhua', label: 'Manhua' },
  { value: 'oel', label: 'OEL' },
  { value: 'other', label: 'Other' },
] as const;

export const STATUS = [
  { value: 'releasing', label: 'Releasing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'On hiatus' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'upcoming', label: 'Upcoming' },
] as const;

/**
 * Les genres, tels que MangaBaka les nomme.
 *
 * Leur enumeration en compte 46 ; on garde ceux qui servent a chercher une
 * lecture, pas ceux qui servent a en exclure. Chaque valeur ci-dessous est
 * RECOPIEE de leur enumeration, pas devinee : le serveur repond 400 sur une
 * valeur inconnue, jamais une liste vide — « isekai_free », invente d'apres
 * le vocabulaire d'AniList, s'est fait refuser.
 */
export const GENRES = [
  'action',
  'adventure',
  'comedy',
  'drama',
  'fantasy',
  'historical',
  'horror',
  'josei',
  'martial_arts',
  'mecha',
  'mystery',
  'psychological',
  'romance',
  'school_life',
  'sci-fi',
  'seinen',
  'shoujo',
  'shounen',
  'slice_of_life',
  'sports',
  'supernatural',
  'suspense',
  'thriller',
  'tragedy',
] as const;

/** « school_life » n'est pas un libelle. */
export function genreLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** « hiatus » → « On hiatus », comme dans le filtre. */
export function statusLabel(value: string | null | undefined): string | undefined {
  return STATUS.find((s) => s.value === value)?.label;
}

/** « manhwa » → « Manhwa », « oel » → « OEL », comme dans le filtre. */
export function typeLabel(value: string | null | undefined): string | undefined {
  return TYPES.find((t) => t.value === value)?.label;
}

export function activeCount(f: CatalogueFilters): number {
  return [f.type, f.status, f.genre, f.tag, f.staff, f.publisher].filter(Boolean).length;
}

/** Le chemin a demander. Les filtres vides ne s'ecrivent pas. */
export function cataloguePath(page: number, perPage: number, f: CatalogueFilters): string {
  const params = new URLSearchParams({ limit: String(perPage), page: String(page) });

  const q = f.q.trim();
  if (q) params.set('q', q);
  /* Une recherche textuelle se trie par pertinence d'elle-meme ; lui imposer
     la popularite remonterait One Piece pour n'importe quelle requete. */
  else params.set('sort_by', f.sort);

  if (f.type) params.set('type', f.type);
  if (f.status) params.set('status', f.status);
  if (f.genre) params.set('genre', f.genre);
  /* Contrairement au genre, le tag est du texte libre chez eux : aucune
     enumeration a respecter, et une valeur inconnue rend zero au lieu de 400. */
  if (f.tag) params.set('tag', f.tag);
  /* Ce que leur propre site rend cliquable sur une fiche : l'auteur et
     l'editeur. L'annee, elle, n'y est PAS un filtre — c'est une info-bulle,
     et l'API refuse les six noms de parametre qu'on peut lui supposer. */
  if (f.staff) params.set('staff', f.staff);
  if (f.publisher) params.set('publisher', f.publisher);

  /* Ecartee au serveur, et pas seulement a l'affichage : filtree apres coup,
     une page perdait ses lignes et le catalogue affichait des pages courtes. */
  params.set('not_content_rating', HIDDEN_RATING);

  return `/series/search?${params.toString()}`;
}

/**
 * La couverture, a la taille voulue.
 *
 * Trois densites d'ecran sont servies ; on prend x2, qui reste net sur un
 * telephone sans peser comme le fichier d'origine — 672 Ko pour Solo Leveling.
 */
export function coverUrl(
  series: MbSeries | null | undefined,
  size: 'x150' | 'x250' | 'x350',
): string | null {
  const set = series?.cover?.[size];
  return set?.x2 ?? set?.x1 ?? series?.cover?.raw?.url ?? null;
}

/**
 * Le titre que MangaBaka pose quand il n'en a pas.
 *
 * Ce n'est pas une oeuvre, c'est une fiche a completer, et elle remonte en
 * tete d'une recherche comme les autres — « Shadow Slave » la ramenait en
 * premier resultat.
 */
const SANS_TITRE = 'unknown title';

/**
 * La seule notation que l'app n'affiche pas.
 *
 * L'equivalent du `isAdult: false` que portent toutes les requetes AniList :
 * sans lui, une recherche anodine ramenait « Torokase Orgasm ».
 *
 * `erotica` etait ecartee aussi, et c'etait trop large. Mesure le 15 septembre
 * 2026 : sur les 50 series `erotica` les plus populaires, 30 ne sont PAS
 * adultes chez AniList — Berserk, Vagabond, Homunculus, Prison School,
 * Heavenly Delusion —, et le catalogue les cachait toutes. Les 20 qu'AniList
 * marque adultes reviennent avec elles : aucun genre de MangaBaka ne separe
 * proprement les deux groupes.
 */
export const HIDDEN_RATING = 'pornographic';

/**
 * Les series affichables.
 *
 * Une fiche fusionnee (`merged_with`) fait doublon avec celle qui l'a
 * absorbee, et une fiche sans titre est une fiche a completer.
 */
export function displayable(list: readonly MbSeries[] | null | undefined): MbSeries[] {
  return (list ?? []).filter(
    (s) =>
      s.merged_with == null &&
      s.state !== 'merged' &&
      s.content_rating !== HIDDEN_RATING &&
      !(s.title ?? '').toLowerCase().startsWith(SANS_TITRE),
  );
}

/**
 * Les titres alternatifs, degroupes et dedoublonnes.
 *
 * MangaBaka les range par langue, y compris sous une cle « unknown » qui
 * melange le coreen, l'espagnol et le turc. On aplatit : la fiche les affiche
 * a la suite, sans promettre une langue qu'on ne connait pas.
 */
export function altTitles(series: MbSeries | null | undefined, limit = 4): string[] {
  const groupes = Object.values(series?.secondary_titles ?? {});
  const vus = new Set<string>();
  const out: string[] = [];

  for (const groupe of groupes) {
    for (const t of groupe ?? []) {
      const titre = t.title?.trim();
      if (!titre || titre === series?.title || vus.has(titre)) continue;
      vus.add(titre);
      out.push(titre);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export interface MbLink {
  url: string;
  label: string;
}

export interface MbLinkGroup {
  label: string;
  links: MbLink[];
}

/**
 * Les groupes de liens, dans l'ordre ou MangaBaka les presente.
 *
 * Leur `type` est le vocabulaire brut ; le libelle est celui de leur site.
 * « buy » n'y figure pas : acheter n'est pas consulter, et ce n'est pas ce
 * qu'on vient chercher sur une fiche.
 */
const GROUPES = [
  { type: 'webplatform', label: 'Read officially' },
  { type: 'publisher', label: 'Publisher' },
  { type: 'info', label: 'Info' },
  { type: 'social', label: 'Social' },
] as const;

/** L'anglais d'abord, le francais ensuite, le reste apres. */
function rangLangue(langue: string | null | undefined): number {
  const rang = { en: 0, fr: 1 }[langue ?? ''];
  return rang ?? 2;
}

/**
 * Les liens sortants, groupes par nature.
 *
 * Une premiere version ecartait `webplatform` pour ne pas noyer le reste —
 * Solo Leveling en aligne six. C'etait jeter les liens de lecture officielle,
 * qui sont justement les plus utiles. Groupes et plafonnes, ils tiennent.
 */
export function linkGroups(series: MbSeries | null | undefined, parGroupe = 5): MbLinkGroup[] {
  const out: MbLinkGroup[] = [];

  /* Une oeuvre a souvent DEUX pages Wikipedia, `en` et `ja`, sous le meme nom
     — la deduplication n'en garde qu'une, autant que ce soit la lisible.
     L'anglais d'abord, le francais ensuite, le reste apres. */
  const parLangue = [...(series?.links_v2 ?? [])].sort(
    (a, b) => rangLangue(a.language) - rangLangue(b.language),
  );

  for (const { type, label } of GROUPES) {
    const vus = new Set<string>();
    const links: MbLink[] = [];

    for (const l of parLangue) {
      if (l.type !== type) continue;
      const url = l.url?.trim();
      const nom = l.name_display?.trim();
      if (!url || !nom || vus.has(nom)) continue;
      vus.add(nom);
      links.push({ url, label: nom });
      if (links.length >= parGroupe) break;
    }

    if (links.length > 0) out.push({ label, links });
  }
  return out;
}

/**
 * Ou mene une serie du catalogue.
 *
 * Toujours vers SA fiche MangaBaka. C'est elle qui fait autorite du cote
 * manga : elle porte les chapitres parus, les notes des sept bases, les
 * editeurs, et AniList vient l'enrichir par-dessus quand il connait l'oeuvre.
 * Passer par `/manga/<idAniList>` ferait un aller-retour pour revenir ici.
 */
/**
 * Une recherche dans le catalogue MangaBaka, cote APPLICATION.
 *
 * A ne pas confondre avec `cataloguePath`, qui construit l'adresse de leur API.
 * Celle-ci est une route de l'app : elle sert a envoyer quelqu'un chercher un
 * titre, par exemple ceux qu'un import n'a pas su relier.
 */
export function mbCataloguePath(q: string): string {
  const params = new URLSearchParams();
  const propre = q.trim();
  if (propre) params.set('q', propre);
  const query = params.toString();
  return query ? `/mangabaka?${query}` : '/mangabaka';
}

export function mbSeriesHref(series: MbSeries | null | undefined): string | null {
  return series ? `/mangabaka/${series.id}` : null;
}

/** « spin_off » n'est pas un libelle. */
export function relationLabel(type: string | null | undefined): string {
  return (type ?? 'related').replace(/_/g, ' ');
}

/**
 * L'ordre dans lequel on lit des relations.
 *
 * D'abord ce qui se lit AVANT et APRES — une prequelle, une suite — puis
 * l'adaptation, qui est la question suivante la plus frequente. Le reste
 * ensuite, dans l'ordre ou la source le donne.
 *
 * Les deux sources n'ont pas le meme vocabulaire : AniList ecrit `PREQUEL`,
 * MangaBaka `prequel`. La comparaison se fait donc en minuscules.
 */
const ORDRE_RELATIONS = ['prequel', 'sequel', 'adaptation'];

export function relationRank(relation: string | null | undefined): number {
  const i = ORDRE_RELATIONS.indexOf((relation ?? '').trim().toLowerCase().replace(/_/g, ' '));
  return i === -1 ? ORDRE_RELATIONS.length : i;
}

export interface MbRelated {
  relation: string;
  series: MbSeries;
}

/**
 * Les oeuvres liees, filtrees comme le reste du catalogue.
 *
 * Les memes regles que `displayable` s'appliquent : une suite pornographique
 * n'a pas plus sa place ici que dans une recherche, et une fiche fusionnee
 * ferait doublon.
 */
export function relations(list: readonly MbRelation[] | null | undefined, limit = 12): MbRelated[] {
  const out: MbRelated[] = [];
  for (const r of list ?? []) {
    const [serie] = displayable(r.series ? [r.series] : []);
    if (!serie?.title) continue;
    out.push({ relation: relationLabel(r.relation_type), series: serie });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * La periode de parution, telle que MangaBaka la donne.
 *
 * Des dates ISO, pas des `FuzzyDate` comme AniList : « 1997-07-22 ». Une fin
 * absente veut dire que ca court encore.
 */
export function publishedRange(series: MbSeries | null | undefined): string {
  const debut = series?.published?.start_date?.slice(0, 10);
  const fin = series?.published?.end_date?.slice(0, 10);
  if (!debut) return '—';
  return `${debut} → ${fin ?? '—'}`;
}

/**
 * Le pays d'origine, deduit du type.
 *
 * MangaBaka ne porte pas de champ pays ; son `type` le dit deja, et c'est la
 * meme information qu'AniList range dans `countryOfOrigin`. On ne devine que
 * la ou la reponse est certaine : un manhwa est coreen, un manhua chinois.
 */
export function countryOf(series: MbSeries | null | undefined): string {
  const par: Record<string, string> = { manga: 'JP', manhwa: 'KR', manhua: 'CN' };
  return par[series?.type ?? ''] ?? '—';
}
