/**
 * Les listes de valeurs qu'AniList accepte comme filtres.
 *
 * Elles sont fixes et connues d'avance — contrairement au catalogue d'un
 * studio, où les options se déduisent de ce qui est chargé. Partagées entre
 * Browse et les pages de collection pour que les deux barres de filtres ne
 * divergent pas.
 */

export const SEASONS = [
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
] as const;

export const FORMATS = [
  { value: 'TV', label: 'TV series' },
  { value: 'TV_SHORT', label: 'TV short' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
] as const;

/**
 * Les quatre pays qui produisent de l'animation sérielle.
 *
 * Codes ISO 3166-1, ce qu'attend `countryOfOrigin` chez AniList. La liste est
 * volontairement courte : ce filtre sert à isoler ou écarter les donghua et
 * les productions coréennes, pas à parcourir un atlas.
 */
export const COUNTRIES = [
  { value: 'JP', label: 'Japan' },
  { value: 'CN', label: 'China' },
  { value: 'KR', label: 'South Korea' },
  { value: 'TW', label: 'Taiwan' },
] as const;

/** L'année prochaine en tête : les annonces comptent autant que les sorties. */
/**
 * Les formats d'un manga. Vocabulaire entièrement distinct de celui d'un
 * anime : c'est pour ça que le filtre `format` est jeté quand on bascule
 * d'un média à l'autre — voir `lib/mediaMode`.
 */
const MANGA_FORMATS = [
  { value: 'MANGA', label: 'Manga' },
  { value: 'NOVEL', label: 'Light novel' },
  { value: 'ONE_SHOT', label: 'One shot' },
] as const;

/**
 * Ce qu'on appelle « type » quand on parle de manga.
 *
 * ATTENTION : manhwa et manhua ne sont PAS des formats chez AniList. Le format
 * vaut `MANGA` pour les trois ; c'est le PAYS D'ORIGINE qui les distingue —
 * Corée pour le manhwa, Chine pour le manhua. Les proposer côte à côte dans
 * une seule liste demande donc de poser deux filtres à la fois, ce que
 * `mangaTypeVars` fait.
 *
 * Taïwan produit aussi des manhua, mais `countryOfOrigin` n'accepte qu'une
 * valeur : « Manhua » veut dire la Chine continentale ici.
 */
export const MANGA_TYPES = [
  { value: 'manga', label: 'Manga', format: 'MANGA', country: 'JP' },
  { value: 'manhwa', label: 'Manhwa', format: 'MANGA', country: 'KR' },
  { value: 'manhua', label: 'Manhua', format: 'MANGA', country: 'CN' },
  { value: 'novel', label: 'Light novel', format: 'NOVEL', country: undefined },
  { value: 'one_shot', label: 'One shot', format: 'ONE_SHOT', country: undefined },
] as const;

/** Les deux filtres que porte un type de manga. Vide si le type est inconnu. */
export function mangaTypeVars(value: string): { format?: string; country?: string } {
  const found = MANGA_TYPES.find((t) => t.value === value);
  return found ? { format: found.format, country: found.country } : {};
}

/** Les formats à proposer, selon le média. */
export function formatsFor(media: 'anime' | 'manga') {
  return media === 'manga' ? MANGA_FORMATS : FORMATS;
}

/**
 * Le libellé d'un format, y compris ceux qu'on ne propose PAS au filtre.
 *
 * AniList renvoie des formats que la liste ci-dessus n'offre pas — `MUSIC`
 * pour un clip. Ils doivent quand même s'écrire proprement là où ils
 * s'affichent, d'où une table plus large que les options.
 *
 * Un seul endroit : la page studio en tenait une deuxième, avec `MUSIC` que
 * l'autre ignorait, si bien que le même anime s'annonçait « Music video » sur
 * sa carte et « MUSIC » dans la bulle de survol.
 */
const FORMAT_LABELS: Record<string, string> = {
  ...Object.fromEntries(FORMATS.map((f) => [f.value, f.label])),
  ...Object.fromEntries(MANGA_FORMATS.map((f) => [f.value, f.label])),
  MUSIC: 'Music video',
};

/** `WINTER` → `Winter`. */
export function seasonLabel(value: string): string {
  return SEASONS.find((s) => s.value === value)?.label ?? capitalise(value);
}

/** `TV` → `TV series`. Rend la valeur brute plutôt que rien si elle est inconnue. */
export function formatLabel(value: string): string {
  return FORMAT_LABELS[value] ?? capitalise(value);
}

/**
 * Repli commun : `RELEASING` → `Releasing`, pour ce qu'aucune table ne couvre.
 *
 * La majuscule est POSÉE, pas supposée. AniList écrit en capitales, mais
 * MangaBaka écrit en minuscules — « manga », « manhwa » — et se contenter de
 * garder le premier caractère les laissait tels quels.
 */
function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i);

export const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

export const STATUSES = [
  { value: 'RELEASING', label: 'Releasing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'NOT_YET_RELEASED', label: 'Not yet released' },
  { value: 'HIATUS', label: 'Hiatus' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;
