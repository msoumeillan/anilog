/**
 * Correspondance AniList → TMDB, côté logique pure.
 *
 * Le fetch est ailleurs ; ici on ne fait que décider QUOI demander et
 * comment renuméroter ce qui revient. C'est la partie qui peut se tromper en
 * silence — un décalage mal appliqué décale toute une liste sans rien casser
 * — donc c'est la partie qui a des tests.
 */

export interface TmdbTarget {
  id: number;
  /** Absent quand la fiche AniList couvre la série entière. */
  season?: number;
  /** Épisodes à retrancher : la fiche commence au milieu d'une saison TMDB. */
  offset: number;
}

/**
 * Lit une entrée de la table : `[id]`, `[id, saison]` ou `[id, saison, décalage]`.
 * Voir `scripts/build-tmdb-map.ts` pour la provenance.
 */
export function tmdbTarget(raw: number[] | undefined): TmdbTarget | null {
  if (!raw || raw.length === 0) return null;
  const [id, season, offset] = raw;
  if (typeof id !== 'number' || id <= 0) return null;
  if (typeof season !== 'number') return { id, offset: 0 };
  return { id, season, offset: typeof offset === 'number' ? offset : 0 };
}

export interface TmdbGroup {
  id: string;
  name: string;
  /** 2 = ordre absolu, dans la nomenclature TMDB. */
  type: number;
  episode_count: number;
}

/**
 * Le groupe d'épisodes qui suit la numérotation d'AniList.
 *
 * TMDB découpe One Piece en 23 saisons ; AniList numérote de 1 à 1175 sans
 * interruption. Le pont est un « episode group » de type absolu — mais il y
 * en a souvent plusieurs, et ils ne se valent pas : sur One Piece,
 * « With Specials » (1 220 épisodes) décale tout d'un cran, tandis que
 * « No Specials » (1 181) tombe juste. Vérifié à l'épisode 1 et à l'épisode
 * 1 000.
 *
 * On choisit donc par le NOMBRE, pas par le nom : celui qui s'approche le
 * plus du total annoncé par la série. Un écart trop grand vaut mieux refusé
 * que subi.
 */
export function pickAbsoluteGroup(groups: TmdbGroup[], expected: number): TmdbGroup | null {
  const absolus = groups.filter((g) => g.type === 2 && g.episode_count > 0);
  if (absolus.length === 0 || expected <= 0) return null;

  const best = absolus.reduce((a, b) =>
    Math.abs(b.episode_count - expected) < Math.abs(a.episode_count - expected) ? b : a,
  );

  /* Au-delà de 10 % d'écart, on ne sait plus à quoi on a affaire. Mieux vaut
     retomber sur nos sources habituelles que d'aligner de travers. */
  return Math.abs(best.episode_count - expected) <= Math.max(5, expected * 0.1) ? best : null;
}

export interface TmdbEpisode {
  episode_number: number;
  name?: string | null;
  overview?: string | null;
  still_path?: string | null;
  air_date?: string | null;
  /** Note du public TMDB, sur 10. */
  vote_average?: number | null;
  vote_count?: number | null;
  /** Durée en minutes — la seule source qui la donne PAR épisode. */
  runtime?: number | null;
}

/** Ce qu'on retient d'un épisode TMDB, une fois renuméroté. */
export interface EpisodeInfo {
  title?: string;
  synopsis?: string;
  still?: string;
  aired?: string;
  /** Note du public, sur 10, et son assise. */
  rating?: number;
  votes?: number;
  runtime?: number;
}

/** `/t/p/w300` : assez net pour une vignette de liste, léger pour mille lignes. */
export function stillUrl(path: string | null | undefined): string | undefined {
  return path ? `https://image.tmdb.org/t/p/w300${path}` : undefined;
}

const info = (e: TmdbEpisode): EpisodeInfo => ({
  title: e.name?.trim() || undefined,
  synopsis: e.overview?.trim() || undefined,
  still: stillUrl(e.still_path),
  aired: e.air_date || undefined,
  /* Une note sans votes n'est pas une note : TMDB renvoie 0 quand personne
     ne s'est prononcé, et l'afficher ferait passer un épisode pour détesté. */
  rating: e.vote_count ? (e.vote_average ?? undefined) : undefined,
  votes: e.vote_count || undefined,
  runtime: e.runtime || undefined,
});

/**
 * Épisodes d'UNE saison, ramenés à la numérotation de la fiche AniList.
 *
 * Attack on Titan saison 3 partie 2 commence au treizième épisode de la
 * saison TMDB : son épisode 1 est leur épisode 13, d'où le décalage.
 */
export function indexSeason(episodes: TmdbEpisode[], offset = 0): Map<number, EpisodeInfo> {
  const out = new Map<number, EpisodeInfo>();
  for (const e of episodes) {
    const n = e.episode_number - offset;
    if (n >= 1) out.set(n, info(e));
  }
  return out;
}

/**
 * Épisodes d'un groupe absolu.
 *
 * C'est la POSITION dans la liste aplatie qui fait le numéro, pas
 * `episode_number` — celui-ci reste relatif à la saison d'origine et
 * recommence à 1 vingt-trois fois sur One Piece.
 */
export function indexAbsoluteGroup(
  groups: { episodes?: TmdbEpisode[] }[],
): Map<number, EpisodeInfo> {
  const out = new Map<number, EpisodeInfo>();
  let n = 0;
  for (const g of groups) {
    for (const e of g.episodes ?? []) out.set(++n, info(e));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
//  Repli : retrouver la série par son titre
// ─────────────────────────────────────────────────────────────

/**
 * Pourquoi ce repli existe.
 *
 * La table de correspondance couvre 72 % des séries TV, mais seulement 19 %
 * des fiches récentes — celles qu'on regarde en ce moment. « False Memory
 * (2026) » est bien dans la source, sans identifiant TMDB : personne ne l'a
 * encore relié.
 *
 * On cherche donc par titre, mais en refusant tout ce qui n'est pas certain :
 * une correspondance fausse mettrait les images d'une AUTRE série sur chaque
 * épisode, ce qui est pire que pas d'image du tout.
 */

/** AniList écrit « False Memory (2026) », TMDB « False Memory ». */
export function searchQuery(title: string): string {
  return title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

/** Comparaison indifférente à la casse, aux accents et à la ponctuation. */
function normalize(value: string): string {
  return searchQuery(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3000-\u9fff]+/g, '');
}

export interface TmdbCandidate {
  id: number;
  name?: string | null;
  original_name?: string | null;
  first_air_date?: string | null;
}

/**
 * Le candidat retenu, ou rien.
 *
 * Trois garde-fous, et il faut les trois : un titre identique après
 * normalisation, une année de première diffusion compatible, et un seul
 * candidat en lice. Au moindre doute on renonce.
 */
export function matchShow(
  candidates: TmdbCandidate[],
  titles: (string | null | undefined)[],
  year: number | null | undefined,
): TmdbCandidate | null {
  const attendus = new Set(
    titles
      .filter((t): t is string => Boolean(t?.trim()))
      .map(normalize)
      .filter(Boolean),
  );
  if (attendus.size === 0) return null;

  const retenus = candidates.filter((c) => {
    const memeTitre =
      (c.name && attendus.has(normalize(c.name))) ||
      (c.original_name && attendus.has(normalize(c.original_name)));
    if (!memeTitre) return false;

    if (!year) return true;
    const anneeTmdb = Number(c.first_air_date?.slice(0, 4));
    // Un an d'écart est courant : une série de fin décembre bascule d'année.
    return !Number.isFinite(anneeTmdb) || Math.abs(anneeTmdb - year) <= 1;
  });

  if (retenus.length === 1) return retenus[0] ?? null;
  if (retenus.length === 0 || !year) return null;

  // Plusieurs titres identiques : seule l'année exacte peut départager.
  const exacts = retenus.filter((c) => Number(c.first_air_date?.slice(0, 4)) === year);
  return exacts.length === 1 ? (exacts[0] ?? null) : null;
}

// ─────────────────────────────────────────────────────────────
//  Vérification de l'alignement
// ─────────────────────────────────────────────────────────────

/**
 * L'invariant qui remplace les garde-fous au cas par cas.
 *
 * Ce qu'on appelle « épisode 1 » doit avoir été diffusé le jour où la fiche
 * AniList commence. Cette seule comparaison valide TOUT d'un coup —
 * l'identifiant de la série, le numéro de saison ET le décalage — avec une
 * donnée qui ne vient pas de la table de correspondance.
 *
 * Mesuré sur seize fiches mappées : quinze à zéro jour d'écart, Evangelion à
 * un jour. Un mauvais alignement, lui, se compte en mois ou en années —
 * Kaguya-sama saison 2 commence quinze mois après la première.
 *
 * On ne juge que si les deux dates sont connues : ne pas pouvoir vérifier
 * n'est pas une raison de rejeter.
 */
export function alignedRelease(
  episodeAired: string | null | undefined,
  entryStart: string | null | undefined,
  toleranceDays = 7,
): boolean {
  if (!episodeAired || !entryStart) return true;
  const a = Date.parse(episodeAired);
  const b = Date.parse(entryStart);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(a - b) <= toleranceDays * 86_400_000;
}
