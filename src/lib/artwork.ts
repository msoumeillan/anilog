/**
 * Affiches et arrière-plans de rechange, côté logique pure.
 *
 * TMDB en héberge beaucoup plus qu'on ne l'imagine : mesuré sur les séries du
 * projet, 76 à 255 affiches et 27 à 204 arrière-plans par série, dans une
 * quinzaine de langues. AniList n'en expose qu'une de chaque. C'est tout
 * l'intérêt de la fonctionnalité — et aussi son problème : 255 vignettes ne
 * se parcourent pas à l'œil sans un filtre.
 *
 * Le fetch est ailleurs. Ici on ne fait que trier, dédoublonner et filtrer.
 */

/**
 * Une image telle que TMDB la renvoie.
 *
 * `iso_639_1` vaut `null` sur une image sans texte — mais TMDB sert AUSSI la
 * chaîne vide pour dire la même chose. Les deux se traitent donc partout de
 * la même façon : une chaîne vide passée telle quelle serait une langue à
 * part entière dans le filtre, et ferait lever `Intl.DisplayNames`.
 */
export interface TmdbImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
  width: number;
  height: number;
}

/**
 * Les tailles servies par TMDB. On stocke le CHEMIN de l'image, jamais son
 * URL complète : la vignette d'une grille et l'affiche d'une fiche n'ont pas
 * besoin de la même définition, et figer une taille au moment du choix
 * obligerait à tout réécrire pour en changer.
 */
export type ArtSize = 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original';

export function artUrl(path: string | null | undefined, size: ArtSize): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

// ─────────────────────────────────────────────────────────────
//  Langues
// ─────────────────────────────────────────────────────────────

/** Toutes langues confondues. */
export const ANY_LANGUAGE = 'all';
/** Les images sans texte — souvent les plus belles, et les seules qui ne datent pas. */
export const TEXTLESS = 'none';

/**
 * Les langues présentes, la plus fournie en tête.
 *
 * Construite à partir des images reçues plutôt que d'une liste figée : chaque
 * série a les siennes, et proposer un filtre qui ne renvoie rien serait pire
 * que de ne pas le proposer.
 */
export function languagesOf(images: TmdbImage[]): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const image of images) {
    const code = image.iso_639_1 || TEXTLESS;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function filterByLanguage(images: TmdbImage[], language: string): TmdbImage[] {
  if (language === ANY_LANGUAGE) return images;
  /* `!i.iso_639_1` et non `i.iso_639_1 === null` : voir `TmdbImage`, la
     chaîne vide veut dire « sans texte » elle aussi. */
  if (language === TEXTLESS) return images.filter((i) => !i.iso_639_1);
  return images.filter((i) => i.iso_639_1 === language);
}

let namer: Intl.DisplayNames | null = null;

/**
 * « ja » → « Japanese ».
 *
 * `Intl.DisplayNames` plutôt qu'une table à nous : elle connaît les quinze
 * langues qui sortent ici, et les suivantes. Elle résout même les codes
 * obsolètes que TMDB traîne — « mo » donne « Romanian ». Un code inconnu mais
 * bien formé revient tel quel ; c'est un code MAL formé qui lève, la chaîne
 * vide en tête, d'où le repli.
 */
export function languageLabel(code: string): string {
  if (code === ANY_LANGUAGE) return 'All languages';
  if (code === TEXTLESS) return 'No text';
  try {
    namer ??= new Intl.DisplayNames(['en'], { type: 'language' });
    return namer.of(code) ?? code;
  } catch {
    return code;
  }
}

// ─────────────────────────────────────────────────────────────
//  Mise en ordre
// ─────────────────────────────────────────────────────────────

/**
 * Les mieux notées d'abord.
 *
 * `vote_average` seul ne suffit pas : une image à 5,4 portée par 8 votes vaut
 * mieux qu'une à 5,4 portée par un seul. Le chemin départage en dernier
 * ressort, pour que deux ouvertures de la fenêtre donnent le même ordre —
 * une grille qui se réarrange entre deux visites est une grille où l'on ne
 * retrouve pas ce qu'on avait repéré.
 */
export function sortImages(images: TmdbImage[]): TmdbImage[] {
  return [...images].sort(
    (a, b) =>
      b.vote_average - a.vote_average ||
      b.vote_count - a.vote_count ||
      a.file_path.localeCompare(b.file_path),
  );
}

/**
 * Les affiches d'une saison précèdent celles de la série, sans doublon.
 *
 * Quand la fiche AniList désigne une saison, ce sont les affiches DE CETTE
 * SAISON qui la représentent — les autres montrent souvent la première. TMDB
 * sert parfois la même image aux deux niveaux, d'où le dédoublonnage par
 * chemin, qui garde la première occurrence donc la plus spécifique.
 */
export function preferSeason(season: TmdbImage[], show: TmdbImage[]): TmdbImage[] {
  const seen = new Set<string>();
  const out: TmdbImage[] = [];
  for (const image of [...sortImages(season), ...sortImages(show)]) {
    if (seen.has(image.file_path)) continue;
    seen.add(image.file_path);
    out.push(image);
  }
  return out;
}
