import { describe, expect, it } from 'vitest';
import {
  animeRows,
  artistRows,
  asBrowseSort,
  asCategory,
  defaultBrowseSort,
  indexVariables,
  letterPattern,
  parseScope,
  scopeLabel,
  scopeParam,
  searchVariables,
  seriesRows,
  studioRows,
  themeInfo,
  type BrowseFilters,
} from './musicBrowse';
import type {
  RawAtAnimeCard,
  RawAtArtistCard,
  RawAtStudioCard,
  RawThemeInfo,
} from '../api/animethemes/client';

/**
 * Les fixtures reprennent des réponses RÉELLES d'AnimeThemes, relevées le 12
 * septembre 2026 — [Oshi no Ko], YOASOBI, A-1 Pictures. Pas une forme supposée :
 * leur schéma déclare presque tout nullable, et `song` revient bel et bien nul
 * sur certains génériques de l'index.
 */

const AUCUN: BrowseFilters = {
  letter: '',
  season: '',
  year: '',
  format: '',
  type: 'all',
  sort: 'TITLE_ROMAJI',
};

describe('asCategory', () => {
  it('accepte les cinq catégories', () => {
    expect(asCategory('anime')).toBe('anime');
    expect(asCategory('studios')).toBe('studios');
  });

  it('retombe sur les génériques — c’est un onglet Musiques', () => {
    expect(asCategory(null)).toBe('themes');
    expect(asCategory('playlists')).toBe('themes');
  });
});

describe('letterPattern', () => {
  it('rend le motif SQL qu’attend leur `_like`', () => {
    expect(letterPattern('A')).toBe('a%');
    expect(letterPattern('z')).toBe('z%');
  });

  it('rend RIEN plutôt qu’un motif vide', () => {
    /* Un `''` ou un `null` partirait dans la requête et filtrerait sur rien —
       voir `indexVariables`, où l'absence est la seule forme sûre. */
    expect(letterPattern('')).toBeUndefined();
    expect(letterPattern('4')).toBeUndefined();
    expect(letterPattern('  ')).toBeUndefined();
  });
});

describe('asBrowseSort', () => {
  it('garde un tri qui a cours dans cette catégorie', () => {
    expect(asBrowseSort('studios', 'NAME_DESC')).toBe('NAME_DESC');
    expect(asBrowseSort('anime', 'YEAR_DESC')).toBe('YEAR_DESC');
  });

  it('ÉCARTE un tri d’une autre catégorie', () => {
    /* Leur API répond « Sorting by this value is not supported » : on retombe
       sur le défaut plutôt que de laisser passer une page en panne. */
    expect(asBrowseSort('studios', 'TITLE_ROMAJI')).toBe(defaultBrowseSort('studios'));
    expect(asBrowseSort('themes', 'NAME')).toBe('RANDOM');
  });
});

describe('indexVariables', () => {
  it('n’écrit JAMAIS un filtre absent', () => {
    /* Le piège mesuré : `season: null` passé par variable rend zéro résultat
       au lieu de tout. Un filtre absent doit être absent de l'objet. */
    const v = indexVariables('anime', AUCUN, 1, 30);
    expect(Object.keys(v).sort()).toEqual(['first', 'page', 'sort']);
    expect(Object.values(v)).not.toContain(null);
    expect(Object.values(v)).not.toContain(undefined);
  });

  it('pose les filtres d’un index d’anime, l’année en NOMBRE', () => {
    const v = indexVariables(
      'anime',
      { ...AUCUN, letter: 'O', season: 'SPRING', year: '2023', format: 'TV' },
      2,
      30,
    );
    expect(v).toEqual({
      first: 30,
      page: 2,
      sort: ['TITLE_ROMAJI'],
      letter: 'o%',
      season: 'SPRING',
      year: 2023,
      format: 'TV',
    });
  });

  it('ne donne ni saison ni lettre aux autres catégories', () => {
    /* Une saison n'a pas de sens pour un artiste, et la requête ne la déclare
       même pas : passer la variable la ferait refuser. */
    const v = indexVariables('artists', { ...AUCUN, letter: 'Y', season: 'FALL' }, 1, 30);
    expect(v).toEqual({ first: 30, page: 1, sort: ['TITLE_ROMAJI'], letter: 'y%' });
  });

  it('donne au générique son type, et pas de lettre', () => {
    /* Le titre d'une chanson vit dans une autre table que le générique : leur
       `_like` ne la traverse pas, et la requête n'a donc pas de lettre. */
    const v = indexVariables(
      'themes',
      { ...AUCUN, letter: 'A', type: 'ED', sort: 'RANDOM' },
      1,
      30,
    );
    expect(v).toEqual({ first: 30, page: 1, sort: ['RANDOM'], type: 'ED' });
  });

  it('omet le type quand il vaut « tous »', () => {
    expect(indexVariables('themes', AUCUN, 1, 30)).not.toHaveProperty('type');
  });
});

describe('searchVariables', () => {
  it('n’allume que la section regardée', () => {
    const v = searchVariables('  unravel ', 'artists', 3, 30);
    expect(v).toEqual({
      q: 'unravel',
      first: 30,
      page: 3,
      themes: false,
      anime: false,
      artists: true,
      series: false,
      studios: false,
    });
  });
});

describe('animeRows', () => {
  const carte = (over: Partial<RawAtAnimeCard> = {}): RawAtAnimeCard => ({
    slug: 'oshi_no_ko',
    title: { romaji: '[Oshi no Ko]' },
    year: 2023,
    seasonLocalized: 'Spring',
    formatLocalized: 'TV',
    images: {
      nodes: [
        { link: 'https://i/large.png', facet: 'LARGE_COVER' },
        { link: 'https://i/small.avif', facet: 'SMALL_COVER' },
      ],
    },
    animethemes: [{ id: 1 }, { id: 2 }],
    resources: {
      nodes: [
        { site: 'MAL', externalId: 52034 },
        { site: 'ANILIST', externalId: 150672 },
      ],
    },
    ...over,
  });

  it('écrit la ligne de contexte que la vraie page écrit', () => {
    expect(animeRows([carte()])[0]).toEqual({
      kind: 'anime',
      slug: 'oshi_no_ko',
      title: '[Oshi no Ko]',
      meta: 'TV · Spring 2023 · 2 themes',
      image: 'https://i/small.avif',
      anilistId: 150672,
      shape: 'poster',
    });
  });

  it('préfère la PETITE image — c’est une vignette de quarante pixels', () => {
    const grandeSeule = carte({
      images: { nodes: [{ link: 'https://i/l.png', facet: 'LARGE_COVER' }] },
    });
    expect(animeRows([grandeSeule])[0]?.image).toBe('https://i/l.png');
    expect(animeRows([carte({ images: null })])[0]?.image).toBeNull();
  });

  it('n’invente ni point ni pluriel', () => {
    const nu = carte({
      seasonLocalized: null,
      formatLocalized: null,
      year: null,
      animethemes: [{ id: 1 }],
    });
    expect(animeRows([nu])[0]?.meta).toBe('1 theme');
    expect(animeRows([carte({ animethemes: [] })])[0]?.meta).toBe('TV · Spring 2023');
  });

  it('ÉCARTE ce qui n’a pas de slug — la ligne ne mènerait nulle part', () => {
    expect(animeRows([carte({ slug: null })])).toEqual([]);
    expect(animeRows(null)).toEqual([]);
  });

  it('se passe d’identifiant AniList sans disparaître', () => {
    /* Contrairement à un générique, un anime d'index reste utile sans lui : sa
       portée s'ouvre par le slug d'AnimeThemes. Seul le lien vers la fiche
       tombe. */
    const inconnu = carte({ resources: { nodes: [{ site: 'MAL', externalId: 1 }] } });
    expect(animeRows([inconnu])[0]).toMatchObject({ anilistId: null, slug: 'oshi_no_ko' });
  });
});

describe('artistRows, seriesRows, studioRows', () => {
  const artiste: RawAtArtistCard = {
    slug: 'yoasobi',
    name: { main: 'YOASOBI' },
    images: { nodes: [{ link: 'https://i/yoasobi.avif', facet: 'SMALL_COVER' }] },
  };

  const studio: RawAtStudioCard = {
    slug: 'a_1_pictures',
    name: 'A-1 Pictures',
    anime: { pageInfo: { total: 134 } },
    images: { nodes: [{ link: 'https://i/a1.png', facet: 'LARGE_COVER' }] },
  };

  it('rend un portrait carré pour un artiste', () => {
    expect(artistRows([artiste])[0]).toEqual({
      kind: 'artist',
      slug: 'yoasobi',
      title: 'YOASOBI',
      meta: 'Artist',
      image: 'https://i/yoasobi.avif',
      anilistId: null,
      shape: 'square',
    });
  });

  it('compte les anime d’une série et d’un studio', () => {
    expect(studioRows([studio])[0]).toMatchObject({
      kind: 'studio',
      meta: 'Studio · 134 anime',
      image: 'https://i/a1.png',
    });
    const serie = { slug: 'monogatari', name: 'Monogatari', anime: { pageInfo: { total: 15 } } };
    expect(seriesRows([serie])[0]).toMatchObject({ kind: 'series', meta: 'Series · 15 anime' });
  });

  it('tait un décompte que le catalogue ne donne pas', () => {
    const sansCompte = { slug: 'x', name: 'X', anime: null };
    expect(seriesRows([sansCompte])[0]?.meta).toBe('Series');
  });
});

describe('les portées', () => {
  it('fait l’aller-retour par l’URL', () => {
    const scope = { kind: 'studio' as const, slug: 'a_1_pictures' };
    expect(scopeParam(scope)).toBe('studio:a_1_pictures');
    expect(parseScope('studio:a_1_pictures')).toEqual(scope);
  });

  it('refuse ce qui n’est pas une portée', () => {
    /* Une portée inventée enverrait une requête sur un slug qui n'existe pas,
       et l'écran montrerait une liste vide sans dire pourquoi. */
    expect(parseScope('')).toBeNull();
    expect(parseScope('studio:')).toBeNull();
    expect(parseScope('playlist:mine')).toBeNull();
    expect(parseScope(null)).toBeNull();
  });

  it('nomme la portée comme l’écran la nomme', () => {
    expect(scopeLabel('artist')).toBe('Artist');
    expect(scopeLabel('series')).toBe('Series');
  });
});

describe('themeInfo', () => {
  /* Relevé sur [Oshi no Ko] OP1 le 12 septembre 2026 — l'anime, sa série, son
     studio, et YOASOBI. */
  const brut: RawThemeInfo = {
    findAnimeByExternalSite: [
      {
        slug: 'oshi_no_ko',
        title: { romaji: '[Oshi no Ko]' },
        year: 2023,
        seasonLocalized: 'Spring',
        formatLocalized: 'TV',
        images: { nodes: [{ link: 'https://i/onk.avif', facet: 'SMALL_COVER' }] },
        themeCount: [{ id: 12293 }, { id: 12294 }],
        series: { nodes: [{ slug: 'oshi_no_ko', name: '[Oshi no Ko]' }] },
        studios: { nodes: [{ slug: 'doga_kobo', name: 'Doga Kobo', images: null }] },
        current: [
          {
            animethemeentries: [
              {
                version: 1,
                episodes: '1-11',
                spoiler: false,
                videos: {
                  nodes: [
                    {
                      link: 'https://v/idol-720.webm',
                      resolution: 720,
                      nc: false,
                      subbed: false,
                      size: 38_000_000,
                    },
                    {
                      link: 'https://v/idol-1080.webm',
                      resolution: 1080,
                      nc: true,
                      subbed: false,
                      size: 51_000_000,
                    },
                  ],
                },
              },
            ],
            song: {
              performances: [
                { artist: { slug: 'yoasobi', name: { main: 'YOASOBI' }, images: null } },
                /* Le même artiste, deux rôles sur la chanson. */
                { artist: { slug: 'yoasobi', name: { main: 'YOASOBI' }, images: null } },
              ],
            },
          },
        ],
      },
    ],
  };

  it('range l’origine d’un côté, les interprètes de l’autre', () => {
    const info = themeInfo(brut, 150672);
    expect(info.origin.map((r) => `${r.kind}:${r.title}`)).toEqual([
      'anime:[Oshi no Ko]',
      'series:[Oshi no Ko]',
      'studio:Doga Kobo',
    ]);
    expect(info.origin[0]).toMatchObject({
      meta: 'TV · Spring 2023 · 2 themes',
      image: 'https://i/onk.avif',
      /* L'identifiant est celui qu'on a DEMANDÉ : la réponse ne le répète pas,
         et sans lui la ligne perdrait son lien vers la fiche. */
      anilistId: 150672,
    });
  });

  it('ne compte un interprète qu’une fois', () => {
    /* Un artiste revient autant de fois qu'il a de rôles sur la chanson. */
    expect(themeInfo(brut, 150672).artists).toEqual([
      {
        kind: 'artist',
        slug: 'yoasobi',
        title: 'YOASOBI',
        meta: 'Artist',
        image: null,
        anilistId: null,
        shape: 'square',
      },
    ]);
  });

  it('rend des listes vides quand ils ne connaissent pas l’anime', () => {
    const rien = { origin: [], artists: [], sources: [] };
    expect(themeInfo({ findAnimeByExternalSite: [] }, 1)).toEqual(rien);
    expect(themeInfo(undefined, 1)).toEqual(rien);
  });

  it('propose les fichiers du générique en cours, le meilleur en tête', () => {
    /* [Oshi no Ko] OP1 en a deux : la diffusion web 720p et le Blu-ray 1080p
       sans crédits. Sans version multiple, le « v1 » ne s'écrit pas. */
    expect(themeInfo(brut, 150672).sources).toEqual([
      { link: 'https://v/idol-1080.webm', label: '1080p · NC', episodes: '1-11', size: 51_000_000 },
      { link: 'https://v/idol-720.webm', label: '720p', episodes: '1-11', size: 38_000_000 },
    ]);
  });
});
