import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { anilist } from './client';
import { fingerprint } from '../../lib/fingerprint';
import {
  ANIME_DETAIL,
  MANGA_DETAIL,
  BROWSE,
  UP_NEXT,
  AIRING_SCHEDULE,
  CHARACTER_DETAIL,
  STAFF_DETAIL,
  STUDIO_DETAIL,
  WEEK_SCHEDULE,
  LINK_SOURCES,
  QUICK_SEARCH,
  SEARCH_RESULTS,
} from './queries';

/**
 * Les hooks de données.
 *
 * TanStack Query s'occupe du cache, de la déduplication, des réessais et de
 * la fraîcheur — c'est exactement ce que faisaient à la main `apiGet`,
 * `pendingRequests` et `cacheTTL` dans la v1, en 150 lignes plus fragiles.
 *
 * Le quota AniList est de 30 requêtes/minute : les `staleTime` généreux
 * ci-dessous ne sont pas une optimisation, ce sont eux qui rendent
 * la navigation possible.
 */

const MINUTE = 60_000;

/**
 * Cle de cache d'une requete.
 *
 * Deux choses en font partie, et les deux etaient un compteur a incrementer
 * a la main avant :
 *
 *   - l'empreinte du TEXTE de la requete : ajouter un champ change la cle
 *     toute seule. On avait oublie de le faire une fois, et l'ancienne forme
 *     de donnee avait ete servie au nouveau code.
 *   - la FORME du cache : useQuery et useInfiniteQuery ne stockent pas la
 *     meme structure, et servir l'une a l'autre plante la page. Le meme
 *     oubli, sous un autre angle.
 */
function cacheKey(query: string, kind: 'one' | 'pages', ...rest: unknown[]) {
  return ['anilist', kind, fingerprint(query), ...rest] as const;
}

export const keys = {
  animeDetail: (id: number) => cacheKey(ANIME_DETAIL, 'one', 'anime', id),
  mangaDetail: (id: number) => cacheKey(MANGA_DETAIL, 'one', 'manga', id),
  browse: (vars: BrowseVars) => cacheKey(BROWSE, 'pages', 'browse', vars),
  upNext: (ids: number[]) => cacheKey(UP_NEXT, 'one', 'upNext', [...ids].sort()),
  character: (id: number) => cacheKey(CHARACTER_DETAIL, 'one', 'character', id),
  staff: (id: number) => cacheKey(STAFF_DETAIL, 'one', 'staff', id),
  studio: (id: number) => cacheKey(STUDIO_DETAIL, 'one', 'studio', id),
  airing: (id: number) => cacheKey(AIRING_SCHEDULE, 'one', 'airing', id),
  /* La fenetre de temps ET la liste suivie : deux semaines differentes, ou deux
     bibliotheques differentes, ne sont pas le meme resultat. */
  week: (ids: string, from: number) => cacheKey(WEEK_SCHEDULE, 'one', 'week', ids, from),
  linkSources: () => cacheKey(LINK_SOURCES, 'one', 'link-sources'),
  quickSearch: (term: string) => cacheKey(QUICK_SEARCH, 'one', 'quick-search', term),
  searchResults: (term: string) => cacheKey(SEARCH_RESULTS, 'one', 'search-results', term),
};

export function useAnimeDetail(id: number | undefined) {
  return useQuery({
    queryKey: keys.animeDetail(id ?? 0),
    enabled: typeof id === 'number' && id > 0,
    // Une fiche ne change quasiment jamais : inutile de la redemander.
    staleTime: 60 * MINUTE,
    queryFn: ({ signal }) => anilist<{ Media: AnimeDetail }>(ANIME_DETAIL, { id }, signal),
    select: (d) => d.Media,
  });
}

export function useMangaDetail(id: number | undefined) {
  return useQuery({
    queryKey: keys.mangaDetail(id ?? 0),
    enabled: typeof id === 'number' && id > 0,
    staleTime: 60 * MINUTE,
    queryFn: ({ signal }) => anilist<{ Media: MangaDetail }>(MANGA_DETAIL, { id }, signal),
    select: (d) => d.Media,
  });
}

export interface BrowseVars {
  type: 'ANIME' | 'MANGA';
  page?: number;
  perPage?: number;
  sort?: string[];
  search?: string;
  genres?: string[];
  tags?: string[];
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
  /** Bornes `AAAAMMJJ`, alternative au filtre par saison — voir `lib/season`. */
  startFrom?: number;
  startTo?: number;
  formats?: string[];
  status?: string;
  /** Code ISO 3166-1 : `JP`, `CN`, `KR`, `TW`. */
  country?: string;
  /** Pays à écarter — voir la requête d'appoint d'une saison dans `Browse`. */
  countryNotIn?: string[];
}

/**
 * Parcourir en défilement infini.
 *
 * `perPage` à 50 plutôt que 30 : AniList plafonne à 30 requêtes/minute, et
 * chaque page chargée en consomme une. Doubler la taille des pages divise
 * par deux le coût d'un même défilement.
 *
 * Le plafond d'auto-chargement — `AUTO_PAGES`, dans `lib/paging` — vit dans
 * l'UI, pas ici : le hook sait charger, c'est la page qui décide quand
 * s'arrêter.
 */
export function useBrowseInfinite(vars: BrowseVars, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.browse(vars),
    enabled,
    staleTime: 15 * MINUTE,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      anilist<{ Page: BrowsePage }>(BROWSE, { ...vars, page: pageParam }, signal).then(
        (d) => d.Page,
      ),
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? last.pageInfo.currentPage + 1 : undefined,
  });
}

/**
 * La file « À voir ». On lui passe les identifiants des séries en cours,
 * elle renvoie de quoi calculer le « +N restants » côté client.
 */
export function useUpNext(ids: number[]) {
  return useQuery({
    queryKey: keys.upNext(ids),
    enabled: ids.length > 0,
    // Un épisode peut sortir pendant la session : on rafraîchit plus souvent.
    staleTime: 5 * MINUTE,
    queryFn: ({ signal }) => anilist<{ Page: { media: UpNextMedia[] } }>(UP_NEXT, { ids }, signal),
    select: (d) => d.Page.media,
  });
}

// ─────────────────────────────────────────────────────────────
//  Formes de réponse — volontairement partielles
//  (on ne type que ce que l'app consomme réellement)
// ─────────────────────────────────────────────────────────────

export interface Title {
  romaji: string;
  english: string | null;
  native: string | null;
}
export interface Cover {
  medium: string | null;
  large: string | null;
  extraLarge: string | null;
  color: string | null;
}
export interface NextAiring {
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
}
/** AniList plafonne `total` sur les connexions imbriquees : a lire comme un ordre de grandeur. */
export interface ConnectionInfo {
  total: number;
  hasNextPage: boolean;
}

export interface StreamingEpisode {
  title: string | null;
  thumbnail: string | null;
  url: string | null;
  site: string | null;
}

export interface MediaBase {
  id: number;
  idMal: number | null;
  title: Title;
  coverImage: Cover;
  format: string | null;
  status: string | null;
  averageScore: number | null;
  genres: string[];
}

export interface AnimeDetail extends MediaBase {
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  duration: number | null;
  season: string | null;
  seasonYear: number | null;
  /** La requête la demandait déjà ; le type l'ignorait. */
  startDate: FuzzyDate;
  meanScore: number | null;
  popularity: number | null;
  favourites: number | null;
  tags: { name: string; rank: number; isMediaSpoiler: boolean }[];
  studios: { edges: { isMain: boolean; node: { id: number; name: string } }[] };
  trailer: { id: string; site: string; thumbnail: string | null } | null;
  externalLinks: { site: string; url: string; type: string | null; icon: string | null }[];
  nextAiringEpisode: NextAiring | null;
  stats: { scoreDistribution: { score: number; amount: number }[] | null };
  streamingEpisodes: StreamingEpisode[];
  relations: { edges: { relationType: string; node: MediaBase & { type: string } }[] };
  characters: {
    pageInfo: ConnectionInfo;
    edges: {
      role: string;
      node: {
        id: number;
        name: { full: string; native: string | null };
        image: { medium: string | null };
      };
      voiceActors: {
        id: number;
        name: { full: string };
        image: { medium: string | null };
        /** « Japanese », « French »… */
        languageV2: string;
      }[];
    }[];
  };
  staff: {
    pageInfo: ConnectionInfo;
    edges: {
      role: string;
      node: { id: number; name: { full: string }; image: { medium: string | null } };
    }[];
  };
  recommendations: {
    edges: {
      node: { rating: number; mediaRecommendation: (MediaBase & { type: string }) | null };
    }[];
  };
}

export interface MangaDetail extends MediaBase {
  bannerImage: string | null;
  /** Le trailer de l'adaptation, quand elle existe. */
  trailer: { id: string; site: string; thumbnail: string | null } | null;
  description: string | null;
  chapters: number | null;
  volumes: number | null;
  countryOfOrigin: string | null;
  /** Demandées par la requête depuis le début ; le type les ignorait. */
  startDate: FuzzyDate;
  endDate: FuzzyDate;
  meanScore: number | null;
  popularity: number | null;
  favourites: number | null;
  tags: { name: string; rank: number; isMediaSpoiler: boolean }[];
  externalLinks: { site: string; url: string; type: string | null }[];
  stats: { scoreDistribution: { score: number; amount: number }[] | null };
  relations: { edges: { relationType: string; node: MediaBase & { type: string } }[] };
  characters: {
    pageInfo: ConnectionInfo;
    edges: {
      role: string;
      node: { id: number; name: { full: string }; image: { medium: string | null } };
    }[];
  };
  staff: {
    pageInfo: ConnectionInfo;
    edges: {
      role: string;
      /** L'image était déjà demandée par la requête ; le type l'ignorait. */
      node: { id: number; name: { full: string }; image: { medium: string | null } };
    }[];
  };
  recommendations: {
    edges: {
      node: { rating: number; mediaRecommendation: (MediaBase & { type: string }) | null };
    }[];
  };
}

export interface BrowsePage {
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
  media: (MediaBase & {
    episodes: number | null;
    chapters: number | null;
    volumes: number | null;
    season: string | null;
    seasonYear: number | null;
    /** Mois et jour compris : ils rangent en saison ce qu'AniList n'y range pas. */
    startDate: { year: number | null; month: number | null; day: number | null };
    /** Porte le tri par défaut, donc la fusion des deux listes d'une saison. */
    popularity: number | null;
    /** Voir `TIP` dans `queries.ts` : le tri se fait au client, pas au serveur. */
    studios: { edges: { isMain: boolean; node: { id: number; name: string } }[] };
    nextAiringEpisode: { episode: number; airingAt: number } | null;
  })[];
}

export interface UpNextMedia extends Pick<
  MediaBase,
  'id' | 'idMal' | 'title' | 'coverImage' | 'status'
> {
  episodes: number | null;
  nextAiringEpisode: NextAiring | null;
  streamingEpisodes: StreamingEpisode[];
}

// ─────────────────────────────────────────────────────────────
//  Personnage, staff, studio — les pages « feuilles »
// ─────────────────────────────────────────────────────────────

/** Ces fiches ne bougent quasiment jamais : on les garde longtemps. */
const LEAF_STALE = 6 * 60 * MINUTE;

export function useCharacter(id: number | undefined) {
  return useQuery({
    queryKey: keys.character(id ?? 0),
    enabled: typeof id === 'number' && id > 0,
    staleTime: LEAF_STALE,
    queryFn: ({ signal }) =>
      anilist<{ Character: CharacterDetail }>(CHARACTER_DETAIL, { id }, signal),
    select: (d) => d.Character,
  });
}

export function useStaff(id: number | undefined) {
  return useQuery({
    queryKey: keys.staff(id ?? 0),
    enabled: typeof id === 'number' && id > 0,
    staleTime: LEAF_STALE,
    queryFn: ({ signal }) => anilist<{ Staff: StaffDetail }>(STAFF_DETAIL, { id }, signal),
    select: (d) => d.Staff,
  });
}

export interface AiringSlot {
  episode: number;
  /** Secondes Unix. */
  airingAt: number;
}

/**
 * Le calendrier annoncé d'une série en cours.
 *
 * Séparé de la fiche, et tiré seulement quand la série diffuse encore : c'est
 * une requête de plus, et elle n'apprendrait rien sur une série terminée.
 */
export function useAiringSchedule(id: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.airing(id ?? 0),
    enabled: enabled && typeof id === 'number' && id > 0,
    // Une grille de diffusion bouge, mais pas d'une minute à l'autre.
    staleTime: 6 * 60 * MINUTE,
    queryFn: ({ signal }) =>
      anilist<{ Page: { airingSchedules: AiringSlot[] } }>(AIRING_SCHEDULE, { id }, signal),
    select: (d) => d.Page.airingSchedules,
  });
}

export function useStudio(id: number | undefined) {
  return useQuery({
    queryKey: keys.studio(id ?? 0),
    enabled: typeof id === 'number' && id > 0,
    staleTime: LEAF_STALE,
    queryFn: ({ signal }) => anilist<{ Studio: StudioDetail }>(STUDIO_DETAIL, { id }, signal),
    select: (d) => d.Studio,
  });
}

export interface FuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface VoiceActor {
  id: number;
  name: { full: string };
  languageV2: string;
  image: { medium: string | null };
}

/** Une œuvre telle qu'elle apparaît dans une liste de la fiche. */
/**
 * Une œuvre citée depuis une autre fiche — personnage, staff, studio.
 *
 * Les quatre derniers champs correspondent au fragment `TIP` de `queries.ts`
 * et n'existent que pour la bulle de survol des cartes. Les deux se modifient
 * ensemble : un champ ajouté ici sans l'être là-bas serait `undefined` à
 * l'exécution sans que rien ne le signale.
 */
export interface RelatedMedia extends Pick<MediaBase, 'id' | 'title' | 'coverImage' | 'format'> {
  type: string;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  /** Voir `TIP` dans `queries.ts` : le tri se fait au client, pas au serveur. */
  studios: { edges: { isMain: boolean; node: { id: number; name: string } }[] };
}

export interface CharacterDetail {
  id: number;
  name: { full: string; native: string | null; alternative: string[] };
  image: { large: string | null };
  description: string | null;
  gender: string | null;
  age: string | null;
  bloodType: string | null;
  dateOfBirth: FuzzyDate;
  favourites: number | null;
  media: {
    pageInfo: ConnectionInfo;
    edges: { characterRole: string; voiceActors: VoiceActor[]; node: RelatedMedia }[];
  };
}

export interface StaffDetail {
  id: number;
  name: { full: string; native: string | null };
  image: { large: string | null };
  description: string | null;
  primaryOccupations: string[];
  gender: string | null;
  age: number | null;
  homeTown: string | null;
  yearsActive: number[];
  dateOfBirth: FuzzyDate;
  favourites: number | null;
  staffMedia: { pageInfo: ConnectionInfo; edges: { staffRole: string; node: RelatedMedia }[] };
  characters: {
    pageInfo: ConnectionInfo;
    nodes: { id: number; name: { full: string }; image: { medium: string | null } }[];
  };
}

/**
 * Reponses des requetes paginees.
 *
 * Elles ne redecrivent pas les elements : ceux-ci viennent des types de fiche
 * ci-dessus, seule source de verite. Seul `pageInfo` differe — ces requetes
 * ne demandent que `hasNextPage`, pas le `total` que les fiches recuperent.
 *
 * Annoter le parametre de `connection` avec l'un de ces types suffit a
 * `useMore` : plus de cast a ecrire, donc plus de cast qui peut mentir.
 */
export interface CharactersPage {
  Media: { characters: { pageInfo: PageInfo; edges: AnimeDetail['characters']['edges'] } };
}
export interface StaffPage {
  Media: { staff: { pageInfo: PageInfo; edges: AnimeDetail['staff']['edges'] } };
}
export interface CharacterMediaPage {
  Character: { media: { pageInfo: PageInfo; edges: CharacterDetail['media']['edges'] } };
}
export interface StaffMediaPage {
  Staff: { staffMedia: { pageInfo: PageInfo; edges: StaffDetail['staffMedia']['edges'] } };
}
export interface StaffCharactersPage {
  Staff: { characters: { pageInfo: PageInfo; nodes: StaffDetail['characters']['nodes'] } };
}
export interface StudioMediaPage {
  Studio: { media: { pageInfo: PageInfo; nodes: StudioDetail['media']['nodes'] } };
}

interface PageInfo {
  hasNextPage: boolean;
}

export interface StudioDetail {
  id: number;
  name: string;
  isAnimationStudio: boolean;
  favourites: number | null;
  media: {
    pageInfo: { hasNextPage: boolean };
    nodes: StudioMedia[];
  };
}

/** Une œuvre du catalogue d'un studio — porte de quoi trier, filtrer et grouper. */
export interface StudioMedia extends RelatedMedia {
  averageScore: number | null;
  popularity: number | null;
  startDate: { year: number | null };
  genres: string[];
}

/** Une plateforme de streaming : son nom chez AniList, son icône, sa couleur. */
export interface LinkSource {
  site: string;
  icon: string | null;
  color: string | null;
}

/**
 * Le catalogue des plateformes, pour leurs logos — voir `LINK_SOURCES`.
 *
 * Une semaine de cache : une icône ne change pas, et la liste entière tient en
 * une requête.
 */
export function useLinkSources() {
  return useQuery({
    queryKey: keys.linkSources(),
    staleTime: 7 * 24 * 60 * MINUTE,
    gcTime: 7 * 24 * 60 * MINUTE,
    queryFn: async ({ signal }): Promise<LinkSource[]> =>
      (
        await anilist<{ ExternalLinkSourceCollection: LinkSource[] | null }>(
          LINK_SOURCES,
          {},
          signal,
        )
      ).ExternalLinkSourceCollection ?? [],
  });
}

/** Une œuvre dans la recherche de l'en-tête — voir `QUICK_SEARCH`. */
export interface QuickSearchMedia {
  id: number;
  title: Title;
  coverImage: { medium: string | null };
  format: string | null;
  seasonYear: number | null;
  startDate: { year: number | null };
}

/** Un manga de la recherche : ses synonymes en plus, pour le filtre de pertinence. */
export interface QuickSearchManga extends QuickSearchMedia {
  synonyms: string[] | null;
}

/** La réponse de `QUICK_SEARCH` : une page par catégorie, sous son alias. */
export interface QuickSearchResult {
  anime: { media: QuickSearchMedia[] };
  manga: { media: QuickSearchManga[] };
  characters: {
    characters: {
      id: number;
      name: { full: string };
      image: { medium: string | null };
      media: { nodes: { title: Title }[] };
    }[];
  };
  staff: {
    staff: {
      id: number;
      name: { full: string };
      image: { medium: string | null };
      primaryOccupations: string[];
    }[];
  };
  studios: { studios: { id: number; name: string; isAnimationStudio: boolean }[] };
}

/** Une réponse de `QUICK_SEARCH`, avec le terme pour lequel elle a été trouvée. */
export interface QuickSearchAnswer {
  term: string;
  result: QuickSearchResult;
}

/**
 * La recherche de l'en-tête, pour un terme déjà nettoyé — voir `searchTerm`.
 *
 * `keepPreviousData` : pendant la frappe, les résultats du terme précédent
 * restent affichés jusqu'à ce que les nouveaux arrivent. Sans lui, le panneau
 * se viderait et se remplirait à chaque lettre. Le terme revient avec eux :
 * c'est avec lui que leurs mangas se filtrent, comme ceux de MangaBaka.
 */
export function useQuickSearch(term: string) {
  return useQuery({
    queryKey: keys.quickSearch(term),
    enabled: term !== '',
    staleTime: 10 * MINUTE,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<QuickSearchAnswer> => ({
      term,
      result: await anilist<QuickSearchResult>(QUICK_SEARCH, { search: term }, signal),
    }),
  });
}

/** Un personnage de la page de résultats — voir `SEARCH_RESULTS`. */
export interface SearchCharacter {
  id: number;
  name: { full: string };
  image: { medium: string | null };
  /** Son œuvre la plus populaire, pour les homonymes — et un lien vers elle. */
  media: { nodes: { id: number; type: string; title: Title }[] };
}

export interface SearchStaff {
  id: number;
  name: { full: string };
  image: { medium: string | null };
  primaryOccupations: string[];
}

export interface SearchStudio {
  id: number;
  name: string;
  isAnimationStudio: boolean;
}

/**
 * La première page de chaque catégorie. Les œuvres ont la forme de `BROWSE`,
 * les mangas leurs synonymes en plus — voir `SEARCH_RESULTS`.
 */
export interface SearchResults {
  anime: { pageInfo: PageInfo; media: BrowsePage['media'] };
  manga: {
    pageInfo: PageInfo;
    media: (BrowsePage['media'][number] & { synonyms: string[] | null })[];
  };
  characters: { pageInfo: PageInfo; characters: SearchCharacter[] };
  staff: { pageInfo: PageInfo; staff: SearchStaff[] };
  studios: { pageInfo: PageInfo; studios: SearchStudio[] };
}

/** Les pages suivantes, pour `useMore` — voir `CHARACTER_SEARCH_PAGE` et ses voisines. */
export interface CharacterSearchPage {
  Page: { pageInfo: PageInfo; characters: SearchCharacter[] };
}
export interface StaffSearchPage {
  Page: { pageInfo: PageInfo; staff: SearchStaff[] };
}
export interface StudioSearchPage {
  Page: { pageInfo: PageInfo; studios: SearchStudio[] };
}

/**
 * La page de tous les résultats, première page de chaque catégorie.
 *
 * Sans `keepPreviousData`, contrairement à la recherche de l'en-tête : une
 * autre recherche est une autre page, et y montrer un instant les résultats
 * de la précédente ferait croire qu'ils répondent à la nouvelle.
 */
export function useSearchResults(term: string) {
  return useQuery({
    queryKey: keys.searchResults(term),
    enabled: term !== '',
    staleTime: 10 * MINUTE,
    queryFn: ({ signal }) => anilist<SearchResults>(SEARCH_RESULTS, { search: term }, signal),
  });
}

/** Une diffusion de la semaine, telle qu'AniList la rend. */
export interface WeekSlot {
  episode: number;
  airingAt: number;
  mediaId: number;
  media: {
    id: number;
    title: { romaji: string | null; english: string | null; native: string | null };
    coverImage: { medium: string | null; large: string | null };
    format: string | null;
    episodes: number | null;
    countryOfOrigin: string | null;
    externalLinks: { site: string; url: string; type: string | null }[] | null;
  };
}

/**
 * Les diffusions d'une fenêtre de temps.
 *
 * `ids` vide = TOUT ce qui passe cette semaine-là ; une liste = seulement
 * celles-ci. La même requête sert donc les deux vues de l'onglet Calendrier.
 *
 * Une semaine tient en une page pour une bibliothèque, pas pour le monde
 * entier : on suit `hasNextPage` jusqu'à cinq pages. Le calendrier demande
 * NEUF jours — deux de marge avant le lundi, voir `pages/Calendar` — et ces
 * neuf jours comptaient 181 diffusions autour du 7 septembre 2026 : trois
 * pages de 50 coupaient le dimanche soir, et une rentrée d'octobre en compte
 * davantage. Au-delà de cinq, on s'arrête : 250 diffusions débordent sept
 * colonnes, et tirer dix pages coûterait le tiers du quota AniList.
 */
export function useWeekSchedule(ids: readonly number[] | null, from: number, to: number) {
  return useQuery({
    queryKey: keys.week(ids ? [...ids].sort((a, b) => a - b).join(',') : 'all', from),
    // Une grille de diffusion bouge, mais pas d'une minute à l'autre.
    staleTime: 30 * MINUTE,
    queryFn: async ({ signal }): Promise<WeekSlot[]> => {
      const out: WeekSlot[] = [];
      for (let page = 1; page <= 5; page += 1) {
        const d = await anilist<{
          Page: { pageInfo: { hasNextPage: boolean }; airingSchedules: WeekSlot[] };
        }>(WEEK_SCHEDULE, { ids: ids ?? undefined, start: from, end: to, page }, signal);
        out.push(...d.Page.airingSchedules);
        if (!d.Page.pageInfo.hasNextPage) break;
      }
      return out;
    },
  });
}
