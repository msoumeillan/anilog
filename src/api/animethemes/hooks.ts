import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  animeThemes,
  AnimeThemesError,
  type RawAnimeIndex,
  type RawAnimeScope,
  type RawAnimeScopes,
  type RawAnimeThemes,
  type RawArtistIndex,
  type RawArtistScope,
  type RawMusicSearch,
  type RawSeriesIndex,
  type RawSeriesScope,
  type RawStudioIndex,
  type RawStudioScope,
  type RawThemeIndex,
  type RawThemeInfo,
  type RawThemeShuffle,
} from './client';
import {
  ANIME_INDEX,
  ANIME_SCOPE,
  ANIME_SCOPES,
  ANIME_THEMES,
  ARTIST_INDEX,
  ARTIST_SCOPE,
  MUSIC_SEARCH,
  SERIES_INDEX,
  SERIES_SCOPE,
  STUDIO_INDEX,
  STUDIO_SCOPE,
  THEME_INDEX,
  THEME_INFO,
  THEMES_SHUFFLE,
} from './queries';
import {
  artistThemes,
  coverOf,
  groupThemes,
  remoteThemes,
  scopedAnimeThemes,
  themesInOrder,
  themesOf,
  type RemoteTheme,
  type Theme,
} from '../../lib/themes';
import {
  animeRows,
  artistRows,
  indexVariables,
  searchVariables,
  seriesRows,
  studioRows,
  themeInfo,
  type BrowseFilters,
  type CatalogueRow,
  type MusicCategory,
  type MusicScope,
  type ThemeInfo,
} from '../../lib/musicBrowse';

/* Du GraphQL, mais une forme consommée par écran : un compteur manuel suffit,
   à incrémenter quand cette forme change. */
const SHAPE = 2;

const MINUTE = 60_000;

/**
 * Combien de lignes par page.
 *
 * Trente : assez pour remplir l'écran, assez peu pour que la réponse arrive.
 * Leur API met de 0,7 à 10 s selon l'heure, et un lot plus gros ne fait que
 * rallonger l'attente avant le premier pixel.
 */
export const PAGE = 30;

/**
 * Combien d'anime on ouvre d'une série ou d'un studio, et combien de titres
 * d'un artiste.
 *
 * A-1 Pictures a 134 anime, soit cinq cents génériques et autant de vidéos :
 * tout demander ferait attendre dix secondes pour une liste que personne ne
 * descendra. On prend les plus récents et l'écran dit combien il y en a en
 * tout — une liste honnêtement coupée vaut mieux qu'une page qui rame.
 */
const SCOPE_ANIME = 20;
const SCOPE_PERFORMANCES = 60;

/**
 * Les openings et endings d'un anime.
 *
 * Mis en cache une SEMAINE, et ce n'est pas de la négligence : un opening
 * diffusé ne change plus. Ce qui bouge, c'est l'ajout d'un thème récent — une
 * saison en cours — et une semaine de retard là-dessus ne coûte rien.
 *
 * Cette générosité a une raison mesurée : leur API répond entre 0,7 et 10
 * secondes selon l'heure, sur la même requête. Le cache est ce qui empêche
 * l'écran d'attendre deux fois.
 */
export function useAnimeThemes(anilistId: number | undefined) {
  return useQuery({
    queryKey: ['animethemes', SHAPE, anilistId ?? 0],
    enabled: typeof anilistId === 'number' && anilistId > 0,
    staleTime: 7 * 24 * 60 * MINUTE,
    gcTime: 7 * 24 * 60 * MINUTE,
    /* Un anime absent du catalogue ne le devient pas en réessayant, et la
       section disparaît simplement. */
    retry: (count, error) =>
      !(error instanceof AnimeThemesError && error.status === 404) && count < 1,
    queryFn: async ({ signal }): Promise<Theme[]> =>
      themesOf(await animeThemes<RawAnimeThemes>(ANIME_THEMES, { id: [anilistId] }, signal)),
  });
}

/**
 * D'où vient ce qu'on écoute : l'anime, sa série, son studio, ses interprètes.
 *
 * Demandé SEULEMENT quand le lecteur est agrandi — c'est là qu'on lit ce
 * panneau, et une requête par chanson écoutée serait payée par tout le monde
 * pour ceux qui l'ouvrent. Mis en cache une semaine comme les génériques d'une
 * fiche : le studio d'un anime diffusé ne change plus.
 */
export function useThemeInfo(anilistId: number, slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['animethemes', 'info', SHAPE, anilistId, slug],
    enabled: enabled && anilistId > 0,
    staleTime: 7 * 24 * 60 * MINUTE,
    gcTime: 7 * 24 * 60 * MINUTE,
    retry: 1,
    queryFn: async ({ signal }): Promise<ThemeInfo> =>
      themeInfo(
        await animeThemes<RawThemeInfo>(THEME_INFO, { id: [anilistId], slug }, signal),
        anilistId,
      ),
  });
}

/**
 * Une page du catalogue : des génériques, ou des lignes d'index.
 *
 * UNE seule forme pour les cinq catégories. Ce qui change d'un artiste à un
 * studio tient dans un libellé, pas dans une structure — et l'écran n'a donc
 * qu'un chemin, pas cinq.
 */
export interface CataloguePage {
  /** Les génériques — catégorie « Themes » et portées. */
  themes: RemoteTheme[];
  /** Les lignes d'index — anime, artistes, séries, studios. */
  rows: CatalogueRow[];
  /**
   * Combien il y en a en tout. `null` sur une recherche : leur `search` ne le
   * dit pas, et un total inventé ferait une pagination qui ment.
   */
  total: number | null;
  hasMore: boolean;
}

const VIDE: CataloguePage = { themes: [], rows: [], total: null, hasMore: false };

/** Ce que `paginatorInfo` dit, ramené à ce que l'écran en fait. */
function paginee(
  page: { paginatorInfo: { total: number | null; hasMorePages: boolean | null } | null } | null,
  contenu: Partial<CataloguePage>,
): CataloguePage {
  return {
    ...VIDE,
    ...contenu,
    total: page?.paginatorInfo?.total ?? null,
    hasMore: page?.paginatorInfo?.hasMorePages ?? false,
  };
}

/**
 * Parcourir une catégorie, sans rien chercher de précis.
 *
 * Le tri « Random » des génériques passe par une AUTRE requête, et pour une
 * raison qui n'est pas de la coquetterie : `animethemeShuffle` est la seule qui
 * sache écarter les spoilers côté serveur. Un générique marqué spoiler montre
 * souvent la fin de la série, et personne n'a demandé à la voir en ouvrant un
 * onglet.
 */
export function useCatalogue(
  cat: MusicCategory,
  filters: BrowseFilters,
  page: number,
  seed: number,
  enabled: boolean,
) {
  const variables = indexVariables(cat, filters, page, PAGE);
  const tirage = cat === 'themes' && filters.sort === 'RANDOM';

  return useQuery({
    /* La GRAINE n'entre dans aucune requête : elle ne sert qu'à changer la clé
       de cache pour qu'un clic sur « Shuffle » redemande vraiment. Sans elle,
       TanStack rendrait le même tirage et le bouton semblerait cassé. */
    queryKey: ['animethemes', 'catalogue', SHAPE, cat, seed, variables],
    enabled,
    /* Un index ne bouge pas d'une minute à l'autre ; un tirage, si — mais c'est
       le bouton « Shuffle » qui le redemande, pas le temps qui passe. */
    staleTime: 30 * MINUTE,
    retry: 1,
    queryFn: async ({ signal }): Promise<CataloguePage> => {
      if (tirage) {
        const d = await animeThemes<RawThemeShuffle>(
          THEMES_SHUFFLE,
          /* Une LISTE : leur argument est `[ThemeType!]`, là où
             `animethemePagination` attend un scalaire. */
          { type: filters.type === 'all' ? null : [filters.type], first: PAGE },
          signal,
        );
        return { ...VIDE, themes: remoteThemes(d.animethemeShuffle) };
      }

      switch (cat) {
        case 'themes': {
          const d = await animeThemes<RawThemeIndex>(THEME_INDEX, variables, signal);
          return paginee(d.animethemePagination, {
            themes: remoteThemes(d.animethemePagination?.data),
          });
        }
        case 'anime': {
          const d = await animeThemes<RawAnimeIndex>(ANIME_INDEX, variables, signal);
          return paginee(d.animePagination, { rows: animeRows(d.animePagination?.data) });
        }
        case 'artists': {
          const d = await animeThemes<RawArtistIndex>(ARTIST_INDEX, variables, signal);
          return paginee(d.artistPagination, { rows: artistRows(d.artistPagination?.data) });
        }
        case 'series': {
          const d = await animeThemes<RawSeriesIndex>(SERIES_INDEX, variables, signal);
          return paginee(d.seriesPagination, { rows: seriesRows(d.seriesPagination?.data) });
        }
        case 'studios': {
          const d = await animeThemes<RawStudioIndex>(STUDIO_INDEX, variables, signal);
          return paginee(d.studioPagination, { rows: studioRows(d.studioPagination?.data) });
        }
      }
    },
  });
}

/**
 * La recherche, dans la catégorie ouverte.
 *
 * Une seule requête sert les cinq — voir `MUSIC_SEARCH` : les `@include`
 * n'embarquent que la section regardée. Pagination manuelle, parce que leur
 * `search` ne dit pas combien de résultats existent : on propose la page
 * suivante tant que celle-ci est pleine, ce qui ne ment sur rien.
 */
export function useMusicSearch(q: string, cat: MusicCategory, page: number) {
  const propre = q.trim();

  return useQuery({
    queryKey: ['animethemes', 'search', SHAPE, cat, propre, page],
    enabled: propre.length >= 2,
    /* Une recherche ne change pas d'une minute à l'autre, et retaper la même
       ne doit rien redemander. */
    staleTime: 60 * MINUTE,
    retry: 1,
    queryFn: async ({ signal }): Promise<CataloguePage> => {
      const d = await animeThemes<RawMusicSearch>(
        MUSIC_SEARCH,
        searchVariables(propre, cat, page, PAGE),
        signal,
      );
      const s = d.search;
      const contenu: Partial<CataloguePage> =
        cat === 'themes'
          ? { themes: remoteThemes(s?.animethemes) }
          : cat === 'anime'
            ? { rows: animeRows(s?.anime) }
            : cat === 'artists'
              ? { rows: artistRows(s?.artists) }
              : cat === 'series'
                ? { rows: seriesRows(s?.series) }
                : { rows: studioRows(s?.studios) };

      const trouves = (contenu.themes?.length ?? 0) + (contenu.rows?.length ?? 0);
      return { ...VIDE, ...contenu, hasMore: trouves >= PAGE };
    },
  });
}

/**
 * Les génériques de TOUTE une page d'anime, dans l'ordre de la page.
 *
 * C'est la file de lecture d'une table dépliée : Idol, Mephisto, puis Fatal —
 * l'anime suivant — au lieu de revenir à Idol. Demandés au moment où l'on JOUE,
 * pas au dépliage : déplier un anime pour lire le nom de son opening ne doit
 * pas coûter la page entière. Une requête, par identifiants AniList — voir
 * `ANIME_SCOPES` ; un anime qui n'en a pas manque à la file, et ne se joue pas
 * davantage dans sa table.
 */
export function useAnimeListThemes() {
  const client = useQueryClient();
  return useCallback(
    (rows: readonly CatalogueRow[]): Promise<RemoteTheme[]> => {
      const slugs = rows.map((r) => r.slug);
      const ids = [...new Set(rows.flatMap((r) => (r.anilistId === null ? [] : [r.anilistId])))];
      return client.fetchQuery({
        queryKey: ['animethemes', 'scopes', SHAPE, slugs],
        staleTime: 60 * MINUTE,
        queryFn: async ({ signal }) =>
          themesInOrder(
            (await animeThemes<RawAnimeScopes>(ANIME_SCOPES, { id: ids }, signal))
              .findAnimeByExternalSite,
            slugs,
          ),
      });
    },
    [client],
  );
}

/**
 * Retrouver au catalogue les chansons des favoris qu'on ne sait plus afficher.
 *
 * Voir `orphanFavourites`, qui dit lesquels, et `restoreSnapshots`, qui les
 * répare. Par lots d'une page — trente anime, 1,6 s mesurées —, et une seule
 * fois par ensemble d'identifiants dans la session : un favori introuvable ne
 * se redemande pas à chaque passage sur l'onglet.
 */
export function useFavouriteRepair(anilistIds: readonly number[]) {
  return useQuery({
    queryKey: ['animethemes', 'repair', SHAPE, anilistIds],
    enabled: anilistIds.length > 0,
    staleTime: Infinity,
    retry: 1,
    queryFn: async ({ signal }): Promise<RemoteTheme[]> => {
      const trouves: RemoteTheme[] = [];
      for (let i = 0; i < anilistIds.length; i += PAGE) {
        const d = await animeThemes<RawAnimeScopes>(
          ANIME_SCOPES,
          { id: anilistIds.slice(i, i + PAGE) },
          signal,
        );
        trouves.push(...(d.findAnimeByExternalSite ?? []).flatMap((a) => scopedAnimeThemes(a)));
      }
      return trouves;
    },
  });
}

/** Ce qu'une portée ouverte montre : un nom, une image, et de la musique. */
export interface ScopeResult {
  title: string;
  image: string | null;
  /** L'identifiant AniList d'un anime : c'est lui qui ouvre la fiche. */
  anilistId: number | null;
  themes: RemoteTheme[];
  /** Combien d'anime la portée contient, quand elle en groupe plusieurs. */
  animeTotal: number | null;
  animeShown: number | null;
}

/**
 * Tout ce qu'on écoute d'un anime, d'un artiste, d'une série ou d'un studio.
 *
 * C'est ce qui empêche les index d'être des listes mortes : cliquer une ligne
 * doit mener quelque part, et dans un onglet Musiques cet endroit ne peut être
 * qu'une file de lecture.
 */
export function useMusicScope(scope: MusicScope | null) {
  return useQuery({
    queryKey: ['animethemes', 'scope', SHAPE, scope?.kind ?? '', scope?.slug ?? ''],
    enabled: Boolean(scope),
    staleTime: 60 * MINUTE,
    retry: 1,
    queryFn: async ({ signal }): Promise<ScopeResult> => {
      const vide: ScopeResult = {
        title: scope?.slug ?? '',
        image: null,
        anilistId: null,
        themes: [],
        animeTotal: null,
        animeShown: null,
      };
      if (!scope) return vide;
      const variables = { slug: scope.slug, first: SCOPE_ANIME };

      if (scope.kind === 'anime') {
        const d = await animeThemes<RawAnimeScope>(ANIME_SCOPE, { slug: scope.slug }, signal);
        const themes = scopedAnimeThemes(d.anime);
        return {
          ...vide,
          title: d.anime?.title?.romaji?.trim() || scope.slug,
          image: coverOf(d.anime?.images),
          anilistId: themes[0]?.anilistId ?? null,
          themes,
        };
      }

      if (scope.kind === 'artist') {
        const d = await animeThemes<RawArtistScope>(
          ARTIST_SCOPE,
          { slug: scope.slug, first: SCOPE_PERFORMANCES },
          signal,
        );
        return {
          ...vide,
          title: d.artist?.name?.main?.trim() || scope.slug,
          image: coverOf(d.artist?.images),
          themes: artistThemes(d),
        };
      }

      const groupe =
        scope.kind === 'series'
          ? (await animeThemes<RawSeriesScope>(SERIES_SCOPE, variables, signal)).series
          : (await animeThemes<RawStudioScope>(STUDIO_SCOPE, variables, signal)).studio;

      return {
        ...vide,
        title: groupe?.name?.trim() || scope.slug,
        image: coverOf(groupe?.images),
        themes: groupThemes(groupe),
        animeTotal: groupe?.anime?.pageInfo?.total ?? null,
        animeShown: groupe?.anime?.nodes?.length ?? null,
      };
    },
  });
}
