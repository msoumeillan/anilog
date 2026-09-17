import { describe, expect, it } from 'vitest';
import {
  asSongSort,
  bestSongs,
  defaultSongSort,
  buildSongs,
  favouriteRows,
  filterSongs,
  orphanFavourites,
  rowsFromRemote,
  songSorts,
  songStats,
  sortSongs,
  topArtists,
  type SongRow,
} from './songList';
import { songKey } from './ids';
import type { Theme } from './themes';
import type { LibraryEntry } from '../types/library';
import type { SongJudgement } from '../store/songs';

const entree = (id: number, title: string, over: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({
    key: `anime:${id}`,
    media: 'anime',
    ids: { anilist: id },
    title,
    status: 'completed',
    progress: { kind: 'anime', episodes: 0 },
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as LibraryEntry;

const theme = (slug: string, title: string, over: Partial<Theme> = {}): Theme => ({
  slug,
  kind: slug.startsWith('ED') ? 'ED' : 'OP',
  sequence: 1,
  title,
  artists: ['Utatan'],
  versions: [
    {
      version: 1,
      episodes: '1-6',
      start: 1,
      spoiler: false,
      videos: [{ link: `https://v/${slug}].webm`, resolution: 1080, nc: true, size: 66_000_000 }],
    },
  ],
  ...over,
});

const catalogue =
  (table: Record<number, Theme[]>) =>
  (id: number): Theme[] =>
    table[id] ?? [];

describe('buildSongs', () => {
  it('croise la bibliothèque et le catalogue', () => {
    const rows = buildSongs(
      [entree(1, 'Assassination Classroom')],
      catalogue({ 1: [theme('OP1', 'Seishun'), theme('ED1', 'Hello')] }),
      {},
    );
    expect(rows.map((r) => r.key)).toEqual(['song:1:OP1', 'song:1:ED1']);
    expect(rows[0]).toMatchObject({
      anime: 'Assassination Classroom',
      kind: 'OP',
      favourite: false,
    });
  });

  it('ignore le manga : il n’a pas d’opening', () => {
    const manga = entree(2, 'Berserk', { media: 'manga' });
    expect(buildSongs([manga], catalogue({ 2: [theme('OP1', 'X')] }), {})).toEqual([]);
  });

  it('écarte un générique SANS vidéo', () => {
    const sansVideo = theme('OP1', 'X', {
      versions: [{ version: 1, episodes: null, start: null, spoiler: false, videos: [] }],
    });
    expect(buildSongs([entree(1, 'A')], catalogue({ 1: [sansVideo] }), {})).toEqual([]);
  });

  it('ne montre QUE ce qu’on suit, même si le cache en sait plus', () => {
    /* Le catalogue est un cache : il garde ce qu'on ne suit plus, et ce n'est
       pas une raison de l'afficher. */
    const rows = buildSongs(
      [entree(1, 'A')],
      catalogue({ 1: [theme('OP1', 'X')], 999: [theme('OP1', 'Fantome')] }),
      {},
    );
    expect(rows).toHaveLength(1);
  });

  it('recopie la note et le favori', () => {
    const avis: Record<string, SongJudgement> = {
      'song:1:OP1': { score: 9, favourite: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    };
    const rows = buildSongs([entree(1, 'A')], catalogue({ 1: [theme('OP1', 'X')] }), avis);
    expect(rows[0]).toMatchObject({ score: 9, favourite: true });
  });
});

/* La clé est TYPÉE : `song:1:OP1` et non un nom libre. Le fixture la fabrique
   à partir de l'anime et du slug, comme le fait le vrai code. */
const rangee = (id: number, slug: string, over: Partial<SongRow> = {}): SongRow => ({
  key: songKey(id, slug),
  anilistId: id,
  slug,
  kind: slug.startsWith('ED') ? 'ED' : 'OP',
  title: slug,
  artists: [],
  anime: 'Anime',
  link: 'https://v/x.webm',
  favourite: false,
  ...over,
});

const cles = (rows: SongRow[]) => rows.map((r) => r.key);

describe('filterSongs', () => {
  const rows = [
    rangee(1, 'OP1', { title: 'Seishun', anime: 'Ansatsu', artists: ['Utatan'] }),
    rangee(1, 'ED1', { title: 'Hello', anime: 'Ansatsu', favourite: true }),
    rangee(2, 'OP1', { title: 'Guren', anime: 'Shingeki', artists: ['Linked Horizon'] }),
  ];

  it('filtre par type', () => {
    expect(cles(filterSongs(rows, { kind: 'ED', favouritesOnly: false, q: '' }))).toEqual([
      'song:1:ED1',
    ]);
  });

  it('filtre sur les favoris', () => {
    expect(cles(filterSongs(rows, { kind: 'all', favouritesOnly: true, q: '' }))).toEqual([
      'song:1:ED1',
    ]);
  });

  it('cherche dans le titre, l’anime ET l’artiste', () => {
    /* Personne ne se souvient du titre japonais d'un générique ; on cherche par
       l'anime ou par le groupe. */
    const cherche = (q: string) =>
      cles(filterSongs(rows, { kind: 'all', favouritesOnly: false, q }));
    expect(cherche('seishun')).toEqual(['song:1:OP1']);
    expect(cherche('shingeki')).toEqual(['song:2:OP1']);
    expect(cherche('linked')).toEqual(['song:2:OP1']);
  });

  it('ignore la casse et les espaces autour', () => {
    expect(cles(filterSongs(rows, { kind: 'all', favouritesOnly: false, q: '  GUREN ' }))).toEqual([
      'song:2:OP1',
    ]);
  });
});

describe('sortSongs', () => {
  it('groupe par anime, et garde OP avant ED à l’intérieur', () => {
    const rows = [
      rangee(2, 'ED1', { anime: 'B' }),
      rangee(1, 'OP2', { anime: 'A' }),
      rangee(2, 'OP1', { anime: 'B' }),
      rangee(1, 'OP1', { anime: 'A' }),
    ];
    expect(cles(sortSongs(rows, 'anime'))).toEqual([
      'song:1:OP1',
      'song:1:OP2',
      'song:2:OP1',
      'song:2:ED1',
    ]);
  });

  it('met les chansons NON NOTÉES à la fin', () => {
    // Une chanson sans note n'est pas une chanson mal notée.
    const rows = [
      rangee(1, 'OP1', { title: 'zzz' }),
      rangee(2, 'OP1', { title: 'b', score: 3 }),
      rangee(3, 'OP1', { title: 'a', score: 9 }),
    ];
    expect(cles(sortSongs(rows, 'score'))).toEqual(['song:3:OP1', 'song:2:OP1', 'song:1:OP1']);
  });

  it('départage les égalités par titre', () => {
    const rows = [
      rangee(3, 'OP1', { title: 'c', score: 8 }),
      rangee(1, 'OP1', { title: 'a', score: 8 }),
      rangee(2, 'OP1', { title: 'b', score: 8 }),
    ];
    expect(cles(sortSongs(rows, 'score'))).toEqual(['song:1:OP1', 'song:2:OP1', 'song:3:OP1']);
  });

  it('trie par année, la plus récente d’abord, les sans-année en dernier', () => {
    const rows = [
      rangee(1, 'OP1', { title: 'v', year: 1999 }),
      rangee(2, 'OP1', { title: 's' }),
      rangee(3, 'OP1', { title: 'r', year: 2024 }),
    ];
    expect(cles(sortSongs(rows, 'year'))).toEqual(['song:3:OP1', 'song:1:OP1', 'song:2:OP1']);
  });

  it('ne modifie pas le tableau qu’on lui donne', () => {
    const rows = [rangee(2, 'OP1', { title: 'b' }), rangee(1, 'OP1', { title: 'a' })];
    sortSongs(rows, 'title');
    expect(cles(rows)).toEqual(['song:2:OP1', 'song:1:OP1']);
  });
});

describe('les tris, selon la provenance', () => {
  it('refuse ce qu’il ne connaît pas plutôt que de trier au hasard', () => {
    expect(asSongSort('score')).toBe('score');
    for (const bad of ['', 'BANANA', null, undefined]) expect(asSongSort(bad)).toBeNull();
  });

  it('n’offre « My score » qu’en LOCAL', () => {
    /* Trier trente résultats distants par une note qu'on n'a donnée à aucun
       rangerait tout dans le même sac, ce qui ressemble à une panne. */
    expect(songSorts(false).map((s) => s.value)).toContain('score');
    expect(songSorts(true).map((s) => s.value)).not.toContain('score');
    expect(asSongSort('score', true)).toBeNull();
  });

  it('n’offre « As found » qu’à DISTANCE, et en fait le défaut', () => {
    /* C'est l'ordre du serveur : la pertinence sur une recherche, le hasard sur
       un tirage. Le remplacer d'office perdrait la seule chose qu'il sait et
       que nous ne savons pas. */
    expect(songSorts(true)[0]?.value).toBe('found');
    expect(songSorts(false).map((s) => s.value)).not.toContain('found');
    expect(defaultSongSort(true)).toBe('found');
    expect(defaultSongSort(false)).toBe('anime');
  });

  it('offre les trois autres des DEUX côtés', () => {
    for (const v of ['anime', 'title', 'year']) {
      expect(songSorts(true).map((s) => s.value)).toContain(v);
      expect(songSorts(false).map((s) => s.value)).toContain(v);
    }
  });

  it('« As found » ne touche à rien, mais rend une copie', () => {
    const rows = [rangee(2, 'OP1', { title: 'b' }), rangee(1, 'OP1', { title: 'a' })];
    const trie = sortSongs(rows, 'found');
    expect(cles(trie)).toEqual(['song:2:OP1', 'song:1:OP1']);
    expect(trie).not.toBe(rows);
  });
});

describe('ce que Stats en tire', () => {
  const rows = [
    rangee(1, 'OP1', { artists: ['Utatan'], score: 9, favourite: true }),
    rangee(1, 'ED1', { artists: ['moumoon'], score: 7 }),
    rangee(2, 'OP1', { artists: ['Utatan', 'Linked Horizon'] }),
  ];

  it('compte les notées, les favorites et la moyenne', () => {
    expect(songStats(rows)).toEqual({ total: 3, rated: 2, favourites: 1, mean: 8 });
  });

  it('ne rend pas de moyenne quand rien n’est noté', () => {
    expect(songStats([rangee(1, 'OP1')]).mean).toBeNull();
  });

  it('compte une chanson pour CHACUN de ses interprètes', () => {
    // Un duo compte deux fois : la somme dépasse le nombre de chansons.
    const top = topArtists(rows);
    expect(top[0]).toEqual({ artist: 'Utatan', count: 2, mean: 9 });
    expect(top.map((a) => a.artist)).toContain('Linked Horizon');
  });

  it('ne met sur le podium que ce qui est noté', () => {
    expect(cles(bestSongs(rows))).toEqual(['song:1:OP1', 'song:1:ED1']);
  });
});

describe('ce qui vient du catalogue entier', () => {
  const distant = {
    anilistId: 20605,
    anime: 'Tokyo Ghoul',
    year: 2014,
    cover: null,
    theme: {
      slug: 'OP1',
      kind: 'OP' as const,
      sequence: 1,
      title: 'unravel',
      artists: ['TK from Ling tosite sigure'],
      versions: [
        {
          version: 1,
          episodes: null,
          start: null,
          spoiler: false,
          videos: [{ link: 'https://v/tg.webm', resolution: 1080, nc: true, size: 60_000_000 }],
        },
      ],
    },
  };

  it('donne la MÊME forme de ligne que la bibliothèque', () => {
    /* La liste, le lecteur et la notation ne doivent pas savoir d'où vient ce
       qu'ils manipulent. */
    const r = rowsFromRemote([distant], {});
    expect(r[0]).toEqual({
      key: 'song:20605:OP1',
      anilistId: 20605,
      slug: 'OP1',
      kind: 'OP',
      title: 'unravel',
      artists: ['TK from Ling tosite sigure'],
      anime: 'Tokyo Ghoul',
      link: 'https://v/tg.webm',
      year: 2014,
      cover: null,
      score: undefined,
      favourite: false,
    });
  });

  it('recopie la note déjà donnée à ce générique', () => {
    const avis: Record<string, SongJudgement> = {
      'song:20605:OP1': { score: 10, favourite: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    };
    expect(rowsFromRemote([distant], avis)[0]).toMatchObject({ score: 10, favourite: true });
  });
});

describe('favouriteRows', () => {
  const avis = (over: Partial<SongJudgement> = {}): SongJudgement => ({
    favourite: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('préfère la bibliothèque à l’instantané', () => {
    // Elle a le titre à jour ; l'instantané est une photo d'un autre moment.
    const enBibliotheque = rangee(1, 'OP1', { anime: 'Titre a jour', favourite: true });
    const rows = favouriteRows(
      {
        'song:1:OP1': avis({
          snapshot: {
            anilistId: 1,
            slug: 'OP1',
            kind: 'OP',
            title: 'vieux',
            artists: [],
            anime: 'Vieux titre',
            link: 'https://v/x.webm',
          },
        }),
      },
      [enBibliotheque],
    );
    expect(rows[0]?.anime).toBe('Titre a jour');
  });

  it('rend affichable un favori d’une série qu’on ne suit PAS', () => {
    /* C'est tout l'intérêt de l'instantané : sans lui, l'étoile existerait sur
       le disque et l'écran n'aurait rien à montrer. */
    const rows = favouriteRows(
      {
        'song:20605:OP1': avis({
          score: 10,
          snapshot: {
            anilistId: 20605,
            slug: 'OP1',
            kind: 'OP',
            title: 'unravel',
            artists: ['TK'],
            anime: 'Tokyo Ghoul',
            link: 'https://v/tg.webm',
          },
        }),
      },
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'unravel', score: 10, favourite: true });
  });

  it('n’invente rien pour un favori sans instantané', () => {
    expect(favouriteRows({ 'song:1:OP1': avis() }, [])).toEqual([]);
  });

  it('ignore ce qui n’est pas étoilé, et les clés qui n’en sont pas', () => {
    const table = {
      'song:1:OP1': avis({ favourite: false, score: 5 }),
      'pas-une-cle': avis(),
    };
    expect(favouriteRows(table, [rangee(1, 'OP1')])).toEqual([]);
  });
});

describe('orphanFavourites', () => {
  const avis = (over: Partial<SongJudgement> = {}): SongJudgement => ({
    favourite: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });
  const photo = {
    anilistId: 3,
    slug: 'OP1',
    kind: 'OP' as const,
    title: 't',
    artists: [],
    anime: 'a',
    link: 'https://v/x.webm',
  };

  it('désigne les anime des favoris qu’on ne sait pas afficher', () => {
    /* Le cas mesuré : étoilés depuis le lecteur, sans instantané, et hors de la
       bibliothèque — invisibles dans Favourites. */
    const table = {
      'song:150672:OP1': avis(),
      'song:150672:ED1': avis(),
      'song:20605:OP1': avis(),
    };
    expect(orphanFavourites(table, [])).toEqual([20605, 150672]);
  });

  it('laisse ceux qu’on sait déjà afficher, et ce qui n’est pas un favori', () => {
    const table = {
      'song:1:OP1': avis(), // dans la bibliothèque
      'song:2:OP1': avis({ favourite: false, score: 8 }), // noté, pas étoilé
      'song:3:OP1': avis({ snapshot: photo }), // a son instantané
      'pas-une-cle': avis(),
    };
    expect(orphanFavourites(table, [rangee(1, 'OP1')])).toEqual([]);
  });
});
