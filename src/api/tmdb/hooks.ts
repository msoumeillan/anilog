import { useQuery } from '@tanstack/react-query';
import { tmdb, tmdbEnabled, TmdbError } from './client';
import mapUrl from '../../data/tmdbMap.json?url';
import { preferSeason, sortImages, type TmdbImage } from '../../lib/artwork';
import {
  alignedRelease,
  indexAbsoluteGroup,
  indexSeason,
  matchShow,
  pickAbsoluteGroup,
  searchQuery,
  tmdbTarget,
  type EpisodeInfo,
  type TmdbCandidate,
  type TmdbEpisode,
  type TmdbGroup,
  type TmdbTarget,
} from '../../lib/tmdb';

/**
 * Épisodes d'un anime vus par TMDB, renumérotés comme AniList.
 *
 * La table de correspondance est servie en fichier séparé (`?url` plutôt
 * qu'un import direct) : 117 Ko qui n'ont rien à faire dans le bundle
 * principal, et qui ne sont chargés que sur une page d'épisodes.
 */

type Table = Record<string, number[]>;

let table: Promise<Table> | null = null;

/** Chargée une seule fois par session, à la première page d'épisodes. */
function loadTable(): Promise<Table> {
  table ??= fetch(mapUrl).then((r) => r.json() as Promise<Table>);
  return table;
}

/**
 * Retrouve la série quand la table ne la connaît pas.
 *
 * La table couvre 72 % des séries TV mais seulement 19 % des fiches récentes :
 * « False Memory (2026) » y figure sans identifiant TMDB, personne ne l'ayant
 * encore relié. On cherche donc par titre — au prix d'une requête, et en
 * refusant tout ce qui n'est pas certain.
 *
 * Une seule saison acceptée : sur une série qui en a plusieurs, rien ne dit
 * LAQUELLE correspond à la fiche AniList, et se tromper collerait les images
 * d'une autre saison sur chaque épisode.
 */
async function searchShow(
  hints: TmdbHints,
  signal: AbortSignal | undefined,
): Promise<TmdbTarget | null> {
  const query = hints.titles.find((t) => t?.trim());
  if (!query) return null;

  const found = await tmdb<{ results?: TmdbCandidate[] }>(
    `/search/tv?query=${encodeURIComponent(searchQuery(query))}`,
    signal,
  );
  const show = matchShow(found.results ?? [], hints.titles, hints.year);
  if (!show) return null;

  const detail = await tmdb<{ number_of_seasons?: number }>(`/tv/${show.id}`, signal);
  if ((detail.number_of_seasons ?? 1) > 1) return null;

  return { id: show.id, season: 1, offset: 0 };
}

export interface TmdbHints {
  titles: (string | null | undefined)[];
  year: number | null | undefined;
  /** Début de la fiche, `YYYY-MM-DD`. Sert à valider l'alignement. */
  start?: string;
  /**
   * Format MOVIE d'AniList. Un film ne se cherche pas au même endroit —
   * strictement `format === 'MOVIE'`, pas « une seule unité » : un OAV en un
   * épisode reste une série pour TMDB.
   */
  movie?: boolean;
}

/**
 * Le dernier filtre, commun aux trois chemins.
 *
 * Ce qu'on s'apprête à appeler « épisode 1 » doit avoir été diffusé le jour
 * où la fiche AniList commence. Un identifiant, une saison, un décalage ou un
 * groupe absolu erronés se trahissent tous ici — et en une seule comparaison,
 * faite sur une donnée qui ne vient pas de la table de correspondance.
 *
 * Mieux vaut ne rien afficher qu'afficher la mauvaise saison : c'est
 * précisément ce qui était arrivé à Kaguya-sama, dont les douze épisodes par
 * saison rendaient toute vérification par le nombre impossible.
 */
function verifie(
  episodes: Map<number, EpisodeInfo>,
  hints: TmdbHints | undefined,
): Map<number, EpisodeInfo> | null {
  return alignedRelease(episodes.get(1)?.aired, hints?.start) ? episodes : null;
}

/**
 * Quelle fiche TMDB, et quelle saison.
 *
 * La table d'abord, la recherche par titre en repli. Partagée par les
 * épisodes et les images : les deux doivent désigner la MÊME saison, sans
 * quoi on afficherait l'affiche d'une saison au-dessus des épisodes d'une
 * autre.
 */
async function resolveTarget(
  anilistId: number,
  hints: TmdbHints | undefined,
  signal: AbortSignal | undefined,
): Promise<TmdbTarget | null> {
  return (
    tmdbTarget((await loadTable())[String(anilistId)]) ??
    (hints ? await searchShow(hints, signal) : null)
  );
}

async function fetchEpisodes(
  anilistId: number,
  hints: TmdbHints | undefined,
  signal: AbortSignal | undefined,
): Promise<Map<number, EpisodeInfo> | null> {
  const target = await resolveTarget(anilistId, hints, signal);
  if (!target) return null;

  // Cas simple : la fiche AniList correspond à une saison TMDB.
  if (target.season) {
    /* Sauf que la saison annoncée n'existe pas toujours : TMDB range les deux
       saisons de Jujutsu Kaisen dans UNE de 59 épisodes, alors que la table
       en promet une deuxième. Un 404 n'est donc pas une panne, c'est une
       correspondance périmée — on renonce sans bruit plutôt que d'insister. */
    const season = await tmdb<{ episodes?: TmdbEpisode[] }>(
      `/tv/${target.id}/season/${target.season}`,
      signal,
    ).catch((error: unknown) => {
      if (error instanceof TmdbError && error.status === 404) return null;
      throw error;
    });
    if (!season) return null;
    return verifie(indexSeason(season.episodes ?? [], target.offset), hints);
  }

  /* Cas des longues séries : la fiche couvre TOUT. Reste à savoir comment
     TMDB les numérote — Conan tient en une saison de 1 212, One Piece est
     découpé en 23 saisons alors qu'AniList compte d'un trait. */
  const show = await tmdb<{ number_of_seasons?: number; number_of_episodes?: number }>(
    `/tv/${target.id}`,
    signal,
  );

  if ((show.number_of_seasons ?? 1) <= 1) {
    const season = await tmdb<{ episodes?: TmdbEpisode[] }>(`/tv/${target.id}/season/1`, signal);
    return verifie(indexSeason(season.episodes ?? []), hints);
  }

  const groups = await tmdb<{ results?: TmdbGroup[] }>(`/tv/${target.id}/episode_groups`, signal);
  const chosen = pickAbsoluteGroup(groups.results ?? [], show.number_of_episodes ?? 0);
  // Aucun ordre absolu fiable : on préfère nos sources habituelles à un mauvais alignement.
  if (!chosen) return null;

  const detail = await tmdb<{ groups?: { episodes?: TmdbEpisode[] }[] }>(
    `/tv/episode_group/${chosen.id}`,
    signal,
  );
  return verifie(indexAbsoluteGroup(detail.groups ?? []), hints);
}

export function useTmdbEpisodes(anilistId: number | undefined, hints?: TmdbHints) {
  return useQuery({
    queryKey: ['tmdb', 'episodes', anilistId ?? 0],
    // `hints` conditionne le repli : sans eux on ne saurait pas quoi chercher.
    enabled: tmdbEnabled && typeof anilistId === 'number' && anilistId > 0 && Boolean(hints),
    // Titres, images et synopsis d'épisodes ne bougent quasiment jamais.
    staleTime: 24 * 60 * 60_000,
    // Une correspondance absente ne se répare pas en réessayant.
    retry: (count, error) => !(error instanceof TmdbError && error.status === 404) && count < 1,
    queryFn: ({ signal }) => fetchEpisodes(anilistId ?? 0, hints, signal),
  });
}

// ─────────────────────────────────────────────────────────────
//  Affiches et arrière-plans
// ─────────────────────────────────────────────────────────────

/** Un résultat de `/search/movie`. Mêmes champs que pour une série, autres noms. */
interface TmdbMovie {
  id: number;
  title?: string | null;
  original_title?: string | null;
  release_date?: string | null;
}

/**
 * La fiche TMDB d'un film.
 *
 * `/search/tv` ne trouvera jamais un film — et, plus gênant, peut trouver une
 * SÉRIE homonyme et lui coller ses affiches. Mesuré sur « Your Name » : la
 * recherche TV ne renvoyait rien, donc rien ne s'affichait ; mais c'était la
 * chance du titre, pas une garantie.
 *
 * `matchShow` s'applique tel quel : ses trois garde-fous — titre identique
 * après normalisation, année compatible, un seul candidat — ne dépendent pas
 * du média. Seuls les noms de champs changent, d'où la conversion.
 */
async function searchMovie(
  hints: TmdbHints,
  signal: AbortSignal | undefined,
): Promise<number | null> {
  const query = hints.titles.find((t) => t?.trim());
  if (!query) return null;

  const found = await tmdb<{ results?: TmdbMovie[] }>(
    `/search/movie?query=${encodeURIComponent(searchQuery(query))}`,
    signal,
  );

  const candidates: TmdbCandidate[] = (found.results ?? []).map((m) => ({
    id: m.id,
    name: m.title,
    original_name: m.original_title,
    first_air_date: m.release_date,
  }));

  return matchShow(candidates, hints.titles, hints.year)?.id ?? null;
}

export interface TmdbArtwork {
  posters: TmdbImage[];
  backdrops: TmdbImage[];
}

async function fetchArtwork(
  anilistId: number,
  hints: TmdbHints | undefined,
  signal: AbortSignal | undefined,
): Promise<TmdbArtwork | null> {
  /* Les films d'abord : la table de correspondance ne contient que des séries,
     et un film qui la traverserait finirait dans la recherche TV. */
  if (hints?.movie) {
    const movieId = await searchMovie(hints, signal);
    if (!movieId) return null;
    const images = await tmdb<{ posters?: TmdbImage[]; backdrops?: TmdbImage[] }>(
      `/movie/${movieId}/images`,
      signal,
    );
    return {
      posters: sortImages(images.posters ?? []),
      backdrops: sortImages(images.backdrops ?? []),
    };
  }

  const target = await resolveTarget(anilistId, hints, signal);
  if (!target) return null;

  const show = await tmdb<{ posters?: TmdbImage[]; backdrops?: TmdbImage[] }>(
    `/tv/${target.id}/images`,
    signal,
  );

  /* Les affiches propres à la saison désignée, quand il y en a une. TMDB n'en
     sert qu'à ce niveau — mesuré : 45 pour Oshi no Ko, 12 pour Kaguya-sama S3
     — et AUCUN arrière-plan, qui restent une affaire de série entière.

     Un 404 ici n'est pas une panne : c'est la même correspondance périmée que
     pour les épisodes, où TMDB fond deux saisons en une. On garde alors les
     images de la série plutôt que de renoncer à tout. */
  const season = target.season
    ? await tmdb<{ posters?: TmdbImage[] }>(
        `/tv/${target.id}/season/${target.season}/images`,
        signal,
      ).catch((error: unknown) => {
        if (error instanceof TmdbError && error.status === 404) return null;
        throw error;
      })
    : null;

  return {
    posters: preferSeason(season?.posters ?? [], show.posters ?? []),
    backdrops: sortImages(show.backdrops ?? []),
  };
}

/**
 * Les images de rechange d'une œuvre.
 *
 * À n'appeler que depuis la fenêtre ouverte : deux requêtes pour une centaine
 * d'images n'ont rien à faire au chargement d'une fiche que personne n'a
 * demandé à rhabiller.
 */
export function useTmdbArtwork(anilistId: number | undefined, hints?: TmdbHints) {
  return useQuery({
    queryKey: ['tmdb', 'artwork', anilistId ?? 0],
    enabled: tmdbEnabled && typeof anilistId === 'number' && anilistId > 0 && Boolean(hints),
    // Le catalogue d'affiches d'une série ne bouge pas dans la journée.
    staleTime: 24 * 60 * 60_000,
    retry: (count, error) => !(error instanceof TmdbError && error.status === 404) && count < 1,
    queryFn: ({ signal }) => fetchArtwork(anilistId ?? 0, hints, signal),
  });
}
