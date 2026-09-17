import { describe, expect, it } from 'vitest';
import type { QuickSearchManga, QuickSearchResult } from '../api/anilist/hooks';
import type { MbSeries } from '../api/mangabaka/client';
import { entryKey, mbEntryKey } from './ids';
import {
  mangaBakaThenAniList,
  mbQuickSearchPath,
  relevantMedia,
  relevantSeries,
  resultsPageTerm,
  searchPageHref,
  searchSections,
  searchTerm,
  stepIndex,
  type MangaSource,
} from './quickSearch';

/** Une œuvre d'AniList. Les synonymes ne servent qu'aux mangas ; un anime les ignore. */
const oeuvre = (id: number, patch: Partial<QuickSearchManga> = {}): QuickSearchManga => ({
  id,
  title: { romaji: `Romaji ${id}`, english: `English ${id}`, native: null },
  coverImage: { medium: `https://img/${id}.jpg` },
  format: 'TV',
  seasonYear: 2023,
  startDate: { year: 2023 },
  synonyms: null,
  ...patch,
});

const vide = (): QuickSearchResult => ({
  anime: { media: [] },
  manga: { media: [] },
  characters: { characters: [] },
  staff: { staff: [] },
  studios: { studios: [] },
});

const serie = (id: number, patch: Partial<MbSeries> = {}): MbSeries => ({
  id,
  canonical_url: null,
  title: `Series ${id}`,
  type: 'manga',
  year: 2020,
  content_rating: 'safe',
  state: 'active',
  merged_with: null,
  cover: { x150: { x1: `https://mb/${id}-150.jpg`, x2: `https://mb/${id}-300.jpg` } },
  rating: null,
  total_chapters: null,
  final_volume: null,
  anime: null,
  publishers: null,
  source: null,
  ...patch,
});

const anilist: MangaSource = { from: 'anilist' };

/*
 * Les vraies réponses du 15 septembre 2026 pour « snk » : Attack on Titan en
 * tête des deux côtés, mais l'abréviation n'est que dans les synonymes
 * d'AniList. « Land of the Lustrous » est le bruit de MangaBaka.
 */
const aotAniList = () =>
  oeuvre(53390, {
    format: 'MANGA',
    title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' },
    synonyms: ['Atak Tytanów', 'SnK', 'AoT'],
  });
const aotMangaBaka = () =>
  serie(4024, { title: 'ATTACK ON TITAN', source: { anilist: { id: 53390 } } });
const lustrous = () =>
  serie(616, { title: 'Land of the Lustrous', source: { anilist: { id: 74489 } } });

/**
 * Le panneau pour une réponse AniList. Le terme par défaut figure dans tous
 * les titres du gabarit — « English 21 » —, pour que le filtre de pertinence
 * des mangas ne gêne pas les tests qui portent sur autre chose.
 */
const sections = (result: QuickSearchResult, manga: MangaSource = anilist, term = 'english') =>
  searchSections({ term, result }, manga);

/** Les mangas du panneau pour une réponse MangaBaka donnée. */
const mangasDe = (term: string, series: MbSeries[]) =>
  searchSections(undefined, { from: 'mangabaka', term, series })[0]?.items ?? [];

describe('searchTerm : ce qu’on envoie', () => {
  it('retire les espaces autour et en double', () => {
    expect(searchTerm('  oshi   no  ko ')).toBe('oshi no ko');
  });

  it('ne cherche rien sous deux caractères', () => {
    expect(searchTerm('')).toBe('');
    expect(searchTerm('o')).toBe('');
    expect(searchTerm('  o  ')).toBe('');
    expect(searchTerm('ok')).toBe('ok');
  });
});

describe('mbQuickSearchPath : la recherche MangaBaka', () => {
  it('écarte le pornographique et les « other » au serveur, et demande de la marge', () => {
    const url = new URL(`https://api${mbQuickSearchPath('oshi no ko')}`);
    expect(url.pathname).toBe('/series/search');
    expect(url.searchParams.get('q')).toBe('oshi no ko');
    expect(url.searchParams.get('not_content_rating')).toBe('pornographic');
    expect(url.searchParams.get('type_not')).toBe('other');
    expect(Number(url.searchParams.get('limit'))).toBeGreaterThan(4);
  });

  it('en demande trente pour la page de tous les résultats', () => {
    const url = new URL(`https://api${mbQuickSearchPath('oshi no ko', 30)}`);
    expect(url.searchParams.get('limit')).toBe('30');
  });
});

describe('la page de tous les résultats', () => {
  it('garde le terme dans l’adresse, encodé', () => {
    expect(searchPageHref('oshi no ko')).toBe('/search?q=oshi+no+ko');
    expect(searchPageHref('推しの子 & co')).toBe(
      `/search?${new URLSearchParams({ q: '推しの子 & co' }).toString()}`,
    );
  });

  it('range les mangas comme le panneau, sans plafond : MangaBaka puis AniList', () => {
    const series = relevantSeries(
      [
        serie(593, { title: '[Oshi no Ko]', source: { anilist: { id: 117195 } } }),
        serie(78176, { title: 'Hoshi no Ko!' }),
        serie(531343, { title: '[Oshi no Ko] fan novel' }),
      ],
      'oshi no ko',
    );
    const media = [
      { id: 117195, nom: '[Oshi no Ko]' },
      { id: 188598, nom: 'Futari no Etude' },
      { id: 131580, nom: 'Hoshi no Ko' },
    ];
    const hits = mangaBakaThenAniList(series, media).map((h) =>
      h.from === 'mangabaka' ? `mb ${h.series.id}` : `al ${h.media.id}`,
    );
    /* Le doublon d'AniList s'efface devant MangaBaka ; son bruit, lui, reste en
       fin de liste — la page montre TOUT, le classement d'AniList le met en
       dernier. */
    expect(hits).toEqual(['mb 593', 'mb 531343', 'al 188598', 'al 131580']);
  });

  it('reconnaît une série de MangaBaka trouvée par un synonyme, grâce à la page 1 d’AniList', () => {
    /* Un résultat d'AniList ne confirme que s'il répond lui-même au terme : sans
       « snk » dans ses synonymes, Land of the Lustrous reste du bruit. */
    const lustrousAniList = oeuvre(74489, {
      format: 'MANGA',
      title: { romaji: 'Houseki no Kuni', english: 'Land of the Lustrous', native: null },
    });
    const series = relevantSeries(
      [aotMangaBaka(), lustrous()],
      'snk',
      relevantMedia([aotAniList(), lustrousAniList], 'snk'),
    );
    expect(series.map((s) => s.title)).toEqual(['ATTACK ON TITAN']);
  });
});

describe('searchSections : la réponse rangée', () => {
  it('garde un ordre fixe et nomme chaque catégorie', () => {
    const data: QuickSearchResult = {
      anime: { media: [oeuvre(1)] },
      manga: { media: [oeuvre(2, { format: 'MANGA' })] },
      characters: {
        characters: [
          { id: 3, name: { full: 'Ruby Hoshino' }, image: { medium: null }, media: { nodes: [] } },
        ],
      },
      staff: {
        staff: [
          { id: 4, name: { full: 'Aka Akasaka' }, image: { medium: null }, primaryOccupations: [] },
        ],
      },
      studios: { studios: [{ id: 5, name: 'Doga Kobo', isAnimationStudio: true }] },
    };
    expect(sections(data).map((s) => s.label)).toEqual([
      'Anime',
      'Manga',
      'Characters',
      'Staff',
      'Studios',
    ]);
  });

  it('fait disparaître une catégorie vide plutôt que d’afficher un titre au-dessus de rien', () => {
    const data = vide();
    data.studios.studios.push({ id: 6, name: 'ufotable', isAnimationStudio: true });
    expect(sections(data).map((s) => s.kind)).toEqual(['studio']);
    expect(sections(vide())).toEqual([]);
    expect(searchSections(undefined, { from: 'pending' })).toEqual([]);
  });

  it('mène chaque résultat à sa fiche, sans confondre l’anime 21 et le manga 21', () => {
    const data = vide();
    data.anime.media.push(oeuvre(21));
    data.manga.media.push(oeuvre(21, { format: 'MANGA' }));
    data.characters.characters.push({
      id: 40,
      name: { full: 'Luffy' },
      image: { medium: null },
      media: { nodes: [] },
    });
    data.staff.staff.push({
      id: 41,
      name: { full: 'Oda' },
      image: { medium: null },
      primaryOccupations: [],
    });
    data.studios.studios.push({ id: 42, name: 'Toei', isAnimationStudio: true });

    const items = sections(data).flatMap((s) => s.items);
    expect(items.map((i) => i.href)).toEqual([
      '/anime/21',
      '/manga/21',
      '/character/40',
      '/staff/41',
      '/studio/42',
    ]);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('écrit le format en toutes lettres, puis l’année', () => {
    const data = vide();
    data.anime.media.push(oeuvre(1, { format: 'TV', seasonYear: 2023 }));
    data.manga.media.push(
      oeuvre(2, { format: 'ONE_SHOT', seasonYear: null, startDate: { year: 2022 } }),
    );
    const [anime, manga] = sections(data);
    expect(anime?.items[0]?.meta).toBe('TV series · 2023');
    expect(manga?.items[0]?.meta).toBe('One shot · 2022');
  });

  it('se contente de ce qu’il sait : pas de format, ou pas d’année', () => {
    const data = vide();
    data.anime.media.push(
      oeuvre(1, { format: null, seasonYear: null, startDate: { year: 2027 } }),
      oeuvre(2, { format: 'MOVIE', seasonYear: null, startDate: { year: null } }),
      oeuvre(3, { format: null, seasonYear: null, startDate: { year: null } }),
    );
    expect(sections(data)[0]?.items.map((i) => i.meta)).toEqual(['2027', 'Movie', '']);
  });

  it('prend le titre anglais, et le romaji quand il manque', () => {
    const data = vide();
    data.anime.media.push(
      oeuvre(1, { title: { romaji: 'Oshi no Ko', english: '[Oshi no Ko]', native: '推しの子' } }),
      oeuvre(2, { title: { romaji: 'Shingeki no Kyojin', english: null, native: null } }),
    );
    expect(sections(data)[0]?.items.map((i) => i.title)).toEqual([
      '[Oshi no Ko]',
      'Shingeki no Kyojin',
    ]);
  });

  it('dit de quelle œuvre vient un personnage, et rien quand AniList ne le sait pas', () => {
    const data = vide();
    data.characters.characters.push(
      {
        id: 1,
        name: { full: 'Ruby Hoshino' },
        image: { medium: 'https://img/ruby.jpg' },
        media: {
          nodes: [{ title: { romaji: 'Oshi no Ko', english: 'OSHI NO KO', native: null } }],
        },
      },
      { id: 2, name: { full: 'Sans œuvre' }, image: { medium: null }, media: { nodes: [] } },
    );
    const items = sections(data)[0]?.items ?? [];
    expect(items.map((i) => [i.title, i.meta])).toEqual([
      ['Ruby Hoshino', 'OSHI NO KO'],
      ['Sans œuvre', ''],
    ]);
  });

  it('résume un staff à ses deux premiers métiers', () => {
    const data = vide();
    data.staff.staff.push({
      id: 1,
      name: { full: 'Hayao Miyazaki' },
      image: { medium: null },
      primaryOccupations: ['Director', 'Animator', 'Writer'],
    });
    expect(sections(data)[0]?.items[0]?.meta).toBe('Director · Animator');
  });

  it('distingue un studio d’animation d’un producteur, comme la page studio', () => {
    const data = vide();
    data.studios.studios.push(
      { id: 1, name: 'ufotable', isAnimationStudio: true },
      { id: 2, name: 'Aniplex', isAnimationStudio: false },
    );
    expect(sections(data)[0]?.items.map((i) => i.meta)).toEqual(['Animation studio', 'Producer']);
  });

  it('lit le statut d’une œuvre AniList sous sa clé, et rien pour une personne', () => {
    const data = vide();
    data.anime.media.push(oeuvre(21));
    data.staff.staff.push({
      id: 4,
      name: { full: 'Oda' },
      image: { medium: null },
      primaryOccupations: [],
    });
    const [anime, staff] = sections(data);
    expect(anime?.items[0]?.libraryKey).toBe(entryKey('anime', 21));
    expect(staff?.items[0]?.libraryKey).toBeUndefined();
  });
});

describe('les mangas : MangaBaka d’abord, AniList pour compléter', () => {
  /** Une œuvre d'AniList sous son seul titre anglais. */
  const manga = (id: number, english: string, format = 'MANGA') =>
    oeuvre(id, { format, title: { romaji: english, english, native: null } });

  it('complète avec AniList ce que MangaBaka n’a pas trouvé — Futari no Etude', () => {
    /* Les vraies réponses du 15 septembre 2026 pour « oshi no ko » : MangaBaka
       ne classe pas Futari no Etude dans ses 60 premiers, AniList le met
       cinquième, et le bruit arrive des deux côtés. */
    const data = vide();
    data.manga.media.push(
      manga(117195, '[Oshi no Ko]'),
      manga(168162, '[Oshi no Ko]: interlude'),
      manga(170596, '[Oshi no Ko] Spica the First Star', 'NOVEL'),
      manga(153520, '[Oshi no Ko]: Tokubetsu-hen', 'ONE_SHOT'),
      manga(188598, '[Oshi no Ko]: Futari no Etude', 'NOVEL'),
      manga(214268, 'Tensei Shitara Oshi no Ko Neko-chan ni Nattemashita'),
      manga(131580, 'Hoshi no Ko', 'ONE_SHOT'),
    );
    const mb: MangaSource = {
      from: 'mangabaka',
      term: 'oshi no ko',
      series: [
        serie(593, { title: '[Oshi no Ko]', source: { anilist: { id: 117195 } } }),
        serie(78176, { title: 'Hoshi no Ko!' }),
        serie(101238, {
          title: '[Oshi no Ko] Spica the First Star',
          type: 'novel',
          source: { anilist: { id: 170596 } },
        }),
        serie(100496, {
          title: '[Oshi no Ko]: Tokubetsu-hen',
          source: { anilist: { id: 153520 } },
        }),
      ],
    };

    const items = sections(data, mb, 'oshi no ko')[0]?.items ?? [];
    expect(items.map((i) => `${i.title} → ${i.href}`)).toEqual([
      '[Oshi no Ko] → /mangabaka/593',
      '[Oshi no Ko] Spica the First Star → /mangabaka/101238',
      '[Oshi no Ko]: Tokubetsu-hen → /mangabaka/100496',
      '[Oshi no Ko]: interlude → /manga/168162',
      '[Oshi no Ko]: Futari no Etude → /manga/188598',
      'Tensei Shitara Oshi no Ko Neko-chan ni Nattemashita → /manga/214268',
    ]);
  });

  it('garde quatre places à MangaBaka au plus, et six en tout', () => {
    const data = vide();
    data.manga.media.push(...[1, 2, 3].map((id) => manga(id, `One Piece AniList ${id}`)));
    const series = [11, 12, 13, 14, 15].map((id) => serie(id, { title: `One Piece ${id}` }));
    const items = sections(data, { from: 'mangabaka', term: 'one piece', series }, 'one piece')[0]
      ?.items;
    expect(items?.map((i) => i.href)).toEqual([
      '/mangabaka/11',
      '/mangabaka/12',
      '/mangabaka/13',
      '/mangabaka/14',
      '/manga/1',
      '/manga/2',
    ]);
  });

  it('se rabat sur AniList quand MangaBaka n’a pas répondu, bruit écarté', () => {
    const data = vide();
    data.manga.media.push(manga(30642, 'Vinland Saga'), manga(1, 'Vinland Tales'));
    expect(sections(data, anilist, 'vinland saga')[0]?.items.map((i) => i.href)).toEqual([
      '/manga/30642',
    ]);
  });

  it('trouve un manga par ses synonymes d’AniList — « snk »', () => {
    /* Aucun titre d'Attack on Titan ne contient « snk » : sans ses synonymes,
       le panneau montrait l'anime et faisait disparaître le manga. */
    const data = vide();
    data.manga.media.push(aotAniList());
    expect(sections(data, anilist, 'snk')[0]?.items.map((i) => i.href)).toEqual(['/manga/53390']);
  });

  it('garde la série de MangaBaka qu’AniList reconnaît, et une seule fois', () => {
    const data = vide();
    data.manga.media.push(aotAniList());
    const mb: MangaSource = {
      from: 'mangabaka',
      term: 'snk',
      series: [aotMangaBaka(), lustrous()],
    };
    expect(sections(data, mb, 'snk')[0]?.items.map((i) => `${i.title} → ${i.href}`)).toEqual([
      'ATTACK ON TITAN → /mangabaka/4024',
    ]);
  });

  it('ne se fie à AniList que pour le même terme', () => {
    /* Pendant la frappe, AniList répond encore pour « snk » quand MangaBaka
       répond déjà pour « land » : sa confirmation ne vaut pas pour l'autre. */
    const data = vide();
    data.manga.media.push(aotAniList());
    const mb: MangaSource = {
      from: 'mangabaka',
      term: 'land',
      series: [aotMangaBaka(), lustrous()],
    };
    const hrefs = sections(data, mb, 'snk')[0]?.items.map((i) => i.href);
    expect(hrefs).toContain('/mangabaka/616');
    expect(hrefs).not.toContain('/mangabaka/4024');
  });

  it('n’affiche aucun manga tant que MangaBaka cherche', () => {
    const data = vide();
    data.manga.media.push(oeuvre(30013, { format: 'MANGA' }));
    expect(sections(data, { from: 'pending' })).toEqual([]);
  });

  it('écarte le bruit de leur recherche : chaque mot doit commencer un mot du titre', () => {
    /* Les vrais premiers résultats de MangaBaka pour « oshi no ko ». */
    const items = mangasDe('oshi no ko', [
      serie(593, { title: '[Oshi no Ko]' }),
      serie(78176, { title: 'Hoshi no Ko!' }),
      serie(101238, { title: '[Oshi no Ko] Spica the First Star', type: 'novel' }),
      serie(11321, { title: 'Honey and Clover' }),
    ]);
    expect(items.map((i) => i.title)).toEqual([
      '[Oshi no Ko]',
      '[Oshi no Ko] Spica the First Star',
    ]);
  });

  it('cherche aussi dans les titres alternatifs, et accepte le début d’un mot', () => {
    const items = mangasDe('shingeki berserk', [
      serie(1, {
        title: 'Attack on Titan',
        secondary_titles: { ja: [{ title: 'Shingeki no Kyojin Berserker' }] },
      }),
    ]);
    expect(items.map((i) => i.title)).toEqual(['Attack on Titan']);
  });

  it('ignore les accents, et cherche le japonais tel quel dans le titre', () => {
    expect(mangasDe('pokemon', [serie(1, { title: 'Pokémon Adventures' })])).toHaveLength(1);
    expect(
      mangasDe('の子', [serie(593, { title: '[Oshi no Ko]', native_title: '【推しの子】' })]),
    ).toHaveLength(1);
  });

  it('garde Berserk, classé « erotica », mais jamais le pornographique', () => {
    const items = mangasDe('berserk', [
      serie(1692, { title: 'BERSERK', content_rating: 'erotica' }),
      serie(2, { title: 'Berserk dj', content_rating: 'pornographic' }),
    ]);
    expect(items.map((i) => i.title)).toEqual(['BERSERK']);
  });

  it('écarte les fiches fusionnées et celles qui attendent un titre', () => {
    const items = mangasDe('frieren', [
      serie(1, { title: 'Frieren', merged_with: 1995 }),
      serie(2, { title: 'unknown title (please report on Discord)', native_title: 'Frieren' }),
      serie(1995, { title: 'Frieren: Beyond Journey’s End' }),
    ]);
    expect(items.map((i) => i.href)).toEqual(['/mangabaka/1995']);
  });

  it('en montre quatre au plus', () => {
    const series = [1, 2, 3, 4, 5, 6].map((id) => serie(id, { title: `One Piece ${id}` }));
    expect(mangasDe('one piece', series)).toHaveLength(4);
  });

  it('écrit le type de MangaBaka et l’année, avec la plus petite couverture', () => {
    const [item] = mangasDe('solo leveling', [
      serie(3397, { title: 'Solo Leveling', type: 'manhwa', year: 2018 }),
    ]);
    expect(item?.meta).toBe('Manhwa · 2018');
    expect(item?.image).toBe('https://mb/3397-150.jpg');
  });

  it('lit le statut sous la clé AniList quand la série en a une, sous sa clé MangaBaka sinon', () => {
    const items = mangasDe('shadow', [
      serie(1995, { title: 'Shadow House', source: { anilist: { id: 98463 } } }),
      serie(531343, { title: 'Shadow Slave', type: 'novel' }),
    ]);
    expect(items.map((i) => i.libraryKey)).toEqual([entryKey('manga', 98463), mbEntryKey(531343)]);
  });
});

describe('resultsPageTerm : ce que cherche la page où l’on est', () => {
  it('rend le terme de la page de résultats, pour le garder dans le champ', () => {
    expect(resultsPageTerm('/search', '?q=oshi+no+ko')).toBe('oshi no ko');
  });

  it('ne rend rien ailleurs, ni sans terme cherchable', () => {
    expect(resultsPageTerm('/browse', '?q=gundam')).toBe('');
    expect(resultsPageTerm('/anime/16498', '')).toBe('');
    expect(resultsPageTerm('/search', '')).toBe('');
    expect(resultsPageTerm('/search', '?q=o')).toBe('');
  });
});

describe('stepIndex : les flèches du clavier', () => {
  it('descend et monte d’une option', () => {
    expect(stepIndex(0, 5, 1)).toBe(1);
    expect(stepIndex(3, 5, -1)).toBe(2);
  });

  it('boucle aux deux bouts', () => {
    expect(stepIndex(4, 5, 1)).toBe(0);
    expect(stepIndex(0, 5, -1)).toBe(4);
  });

  it('part du bon bout quand rien n’est choisi', () => {
    expect(stepIndex(-1, 5, 1)).toBe(0);
    expect(stepIndex(-1, 5, -1)).toBe(4);
  });

  it('ne choisit rien dans une liste vide', () => {
    expect(stepIndex(0, 0, 1)).toBe(-1);
    expect(stepIndex(-1, 0, -1)).toBe(-1);
  });
});
