const ENDPOINT = 'https://graphql.animethemes.moe/';

/**
 * Client AnimeThemes.
 *
 * La source des openings et endings, et de leurs VIDÉOS. Choisie contre
 * AniSongDB après mesure sur 80 anime tirés d'AniList — populaires, récents,
 * obscurs — parce que la question posée était la vidéo :
 *
 *   AnimeThemes héberge ses propres fichiers, et c'est sa raison d'être :
 *   1080p, source Blu-ray, SANS crédits. AniSongDB pointe vers le CDN d'Anime
 *   Music Quiz, en 720p — l'infrastructure d'un jeu, qui ne nous doit rien.
 *
 *   Il donne la PLAGE D'ÉPISODES de chaque version — « 1-6 », « 7-8 ». C'est
 *   ce qui permet de marquer, dans la liste des épisodes, l'endroit où
 *   l'opening change. AniSongDB ne le sait pas.
 *
 *   Il se filtre directement sur l'identifiant ANILIST, qui est notre identité
 *   — décision 2. Pas de recherche par titre, pas de chaîne à trois maillons
 *   comme en v1.
 *
 * Ce qu'on y perd, et qui est vrai : AniSongDB couvrait 66 anime sur 80 contre
 * 62, porte les chansons d'insert qu'AnimeThemes n'a pas, et répond en 40 ms
 * là où celui-ci prend de 0,7 à 10 s selon l'heure. Le jour où l'on voudra les
 * inserts ou une page qui balaie toute la bibliothèque, c'est lui qu'il faudra
 * brancher à côté.
 *
 * GraphQL et non l'API REST : leur documentation annonce que « the JSON:API is
 * deprecated and it will be removed ».
 */

/**
 * 90 requêtes par minute annoncées, soit une toutes les 667 ms. On laisse une
 * marge : une fiche n'en demande qu'une, et la réponse est mise en cache pour
 * une semaine — un opening ne change pas.
 */
const MIN_INTERVAL_MS = 700;

export class AnimeThemesError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AnimeThemesError';
    this.status = status;
  }
}

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

/** File propre à cet hôte, comme celle de MangaBaka. */
function slot(): Promise<void> {
  const next = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  chain = next.catch(() => {});
  return next;
}

export async function animeThemes<T>(
  query: string,
  variables: object = {},
  signal?: AbortSignal,
): Promise<T> {
  await slot();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      /* AnimeThemes rend 403 a une requete SANS User-Agent — mesure : le fetch
         de node en est depourvu et se fait refuser, curl passe. Le navigateur
         pose toujours le sien et ignore silencieusement celui-ci, qui est un
         en-tete interdit ; cette ligne ne sert donc qu'a `npm run check:queries`,
         qui peut ainsi verifier la requete pour de vrai — ce qu'AniList
         n'autorise pas. */
      'User-Agent': 'AniLog/2',
    },
    body: JSON.stringify({ query, variables }),
    signal,
  });

  const body = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message: string }[];
  } | null;

  if (!res.ok || !body) {
    throw new AnimeThemesError(`AnimeThemes responded ${res.status}.`, res.status);
  }
  if (body.errors?.length) {
    throw new AnimeThemesError(body.errors.map((e) => e.message).join(' · '), res.status);
  }
  if (!body.data) {
    throw new AnimeThemesError('Empty response from AnimeThemes.', res.status);
  }
  return body.data;
}

/**
 * La forme BRUTE rendue par la requête — voir `queries.ts`.
 *
 * Tout est facultatif jusqu'à l'os, et ce n'est pas de la timidité : leur
 * schéma déclare presque tout nullable, et `sequence` revient bel et bien nul
 * sur un ending unique — mesuré sur Assassination Classroom. La mise en forme
 * vit dans `lib/themes`, qui est pur et testé.
 */
export interface RawThemeVideo {
  link: string | null;
  resolution: number | null;
  nc: boolean | null;
  subbed: boolean | null;
  size: number | null;
}

export interface RawAnimeTheme {
  type: string | null;
  sequence: number | null;
  slug: string | null;
  song: {
    title: { romaji: string | null } | null;
    performances: { artist: { name: { main: string | null } | null } | null }[] | null;
  } | null;
  animethemeentries:
    | {
        version: number | null;
        episodes: string | null;
        spoiler: boolean | null;
        videos: { nodes: RawThemeVideo[] } | null;
      }[]
    | null;
}

export interface RawAnimeThemes {
  findAnimeByExternalSite: { animethemes: RawAnimeTheme[] | null }[] | null;
}

/** La forme du lot : `resources` en plus, pour savoir a qui appartient quoi. */
export interface RawAnimeThemesBatch {
  findAnimeByExternalSite:
    | {
        resources: { nodes: { site: string | null; externalId: number | null }[] } | null;
        animethemes: RawAnimeTheme[] | null;
      }[]
    | null;
}

/**
 * Un theme rendu par la recherche ou le tirage : le meme que sur une fiche,
 * plus l'anime auquel il appartient.
 */
export interface RawRemoteTheme extends RawAnimeTheme {
  anime: RawAtAnimeRef | null;
}

export interface RawThemeSearch {
  search: { animethemes: RawRemoteTheme[] | null } | null;
}

export interface RawThemeShuffle {
  animethemeShuffle: RawRemoteTheme[] | null;
}

// ─────────────────────────────────────────────────────────────
//  Le CATALOGUE : anime, artistes, séries, studios
// ─────────────────────────────────────────────────────────────

/**
 * Ce que l'onglet Musiques parcourt, au-delà des génériques.
 *
 * AnimeThemes n'est pas qu'une liste de chansons : c'est un catalogue indexé
 * par anime, par artiste, par série et par studio, et chacune de ces entrées
 * mène à de la musique. Les types ci-dessous sont la forme BRUTE de ces index
 * — mise en forme dans `lib/musicBrowse`, qui est pur et testé.
 *
 * Tout reste facultatif jusqu'à l'os, pour la même raison que les thèmes : leur
 * schéma déclare presque tout nullable, et `song` revient bel et bien nul sur
 * certains génériques de l'index — mesuré sur « Duel Masters Charge ».
 */

/** L'affiche d'un anime, le portrait d'un artiste, le logo d'un studio. */
export interface RawAtImage {
  link: string | null;
  /** `SMALL_COVER`, `LARGE_COVER`… Sert à choisir, pas à afficher. */
  facet: string | null;
}

/** L'identité d'un anime : de quoi le nommer, l'illustrer et l'ouvrir. */
export interface RawAtAnimeRef {
  slug: string | null;
  title: { romaji: string | null } | null;
  year: number | null;
  images: { nodes: RawAtImage[] } | null;
  resources: { nodes: { site: string | null; externalId: number | null }[] } | null;
}

/** L'anime tel qu'une ligne d'index le montre : l'identité, plus le décompte. */
export interface RawAtAnimeCard extends RawAtAnimeRef {
  seasonLocalized: string | null;
  formatLocalized: string | null;
  /** Demandé pour être COMPTÉ — « 2 themes » sur la ligne. */
  animethemes: { id: number | null }[] | null;
}

export interface RawAtArtistCard {
  slug: string | null;
  name: { main: string | null } | null;
  images: { nodes: RawAtImage[] } | null;
}

export interface RawAtSeriesCard {
  slug: string | null;
  name: string | null;
  anime: { pageInfo: { total: number | null } | null } | null;
}

export interface RawAtStudioCard extends RawAtSeriesCard {
  images: { nodes: RawAtImage[] } | null;
}

/**
 * Une page d'index.
 *
 * `paginatorInfo` porte le TOTAL, ce que la recherche plein texte ne sait pas
 * dire : c'est lui qui permet d'annoncer « 1 / 214 » plutôt qu'un bouton
 * « suivant » qui pourrait ne mener nulle part.
 */
export interface RawAtPage<T> {
  paginatorInfo: { total: number | null; hasMorePages: boolean | null } | null;
  data: T[] | null;
}

export interface RawAnimeIndex {
  animePagination: RawAtPage<RawAtAnimeCard> | null;
}
export interface RawArtistIndex {
  artistPagination: RawAtPage<RawAtArtistCard> | null;
}
export interface RawSeriesIndex {
  seriesPagination: RawAtPage<RawAtSeriesCard> | null;
}
export interface RawStudioIndex {
  studioPagination: RawAtPage<RawAtStudioCard> | null;
}
export interface RawThemeIndex {
  animethemePagination: RawAtPage<RawRemoteTheme> | null;
}

/**
 * La recherche, qui répond pour TOUTES les catégories d'un coup.
 *
 * Les champs sont facultatifs ici et pas ailleurs : la requête ne demande que
 * les sections affichées — voir le `@include` de `MUSIC_SEARCH`. Une section
 * absente de la réponse n'est pas une section vide, c'est une section qu'on
 * n'a pas demandée.
 */
export interface RawMusicSearch {
  search: {
    anime?: RawAtAnimeCard[] | null;
    animethemes?: RawRemoteTheme[] | null;
    artists?: RawAtArtistCard[] | null;
    series?: RawAtSeriesCard[] | null;
    studios?: RawAtStudioCard[] | null;
  } | null;
}

/** Une entrée du panneau d'infos : une série, un studio, un artiste. */
export interface RawAtNamed {
  slug: string | null;
  name: string | null;
  images?: { nodes: RawAtImage[] } | null;
}

/**
 * D'où vient ce qu'on écoute — voir `THEME_INFO`.
 *
 * `themeCount` et `current` sont deux alias du même champ : combien de
 * génériques porte cet anime, et qui chante celui qu'on écoute.
 */
export interface RawAtThemeInfo {
  slug: string | null;
  title: { romaji: string | null } | null;
  year: number | null;
  seasonLocalized: string | null;
  formatLocalized: string | null;
  images: { nodes: RawAtImage[] } | null;
  themeCount: { id: number | null }[] | null;
  series: { nodes: RawAtNamed[] } | null;
  studios: { nodes: RawAtNamed[] } | null;
  current:
    | {
        song: {
          performances:
            | {
                artist: {
                  slug: string | null;
                  name: { main: string | null } | null;
                  images: { nodes: RawAtImage[] } | null;
                } | null;
              }[]
            | null;
        } | null;
        /** Les versions et leurs fichiers : de quoi en proposer un autre. */
        animethemeentries: RawAnimeTheme['animethemeentries'];
      }[]
    | null;
}

export interface RawThemeInfo {
  findAnimeByExternalSite: RawAtThemeInfo[] | null;
}

/** Un anime et TOUS ses génériques — ce qu'une portée ouvre. */
export interface RawAtScopedAnime extends RawAtAnimeRef {
  animethemes: RawAnimeTheme[] | null;
}

export interface RawAnimeScope {
  anime: RawAtScopedAnime | null;
}

/** Plusieurs portées d'anime d'un coup — dans l'ordre du serveur, pas celui demandé. */
export interface RawAnimeScopes {
  findAnimeByExternalSite: RawAtScopedAnime[] | null;
}

export interface RawArtistScope {
  artist: {
    name: { main: string | null } | null;
    images: { nodes: RawAtImage[] } | null;
    performances:
      | {
          song: { animethemes: (RawAnimeTheme & { anime: RawAtAnimeRef | null })[] | null } | null;
        }[]
      | null;
  } | null;
}

/**
 * Une série ou un studio : un NOM et des anime. La même forme pour les deux,
 * parce que la question posée est la même — « qu'est-ce qu'on écoute de ça ? ».
 * `images` est facultatif parce qu'une série n'en a pas chez eux, un studio si.
 */
export interface RawAtGroup {
  name: string | null;
  images?: { nodes: RawAtImage[] } | null;
  anime: { pageInfo: { total: number | null } | null; nodes: RawAtScopedAnime[] | null } | null;
}

export interface RawSeriesScope {
  series: RawAtGroup | null;
}
export interface RawStudioScope {
  studio: RawAtGroup | null;
}
