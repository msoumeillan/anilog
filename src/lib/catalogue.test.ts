import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  catalogueOptions,
  groupByYear,
  releaseYear,
  sortCatalogue,
  NO_FILTERS,
  type CatalogueFilters,
  type CatalogueItem,
  type SortableItem,
} from './catalogue';

/* `in` plutôt que `??` : il faut pouvoir passer explicitement `format: null`
   sans que la valeur par défaut le remplace. */
const item = (p: Partial<CatalogueItem> & { startYear?: number | null }): CatalogueItem => ({
  format: 'format' in p ? (p.format ?? null) : 'TV',
  season: p.season ?? null,
  seasonYear: p.seasonYear ?? null,
  startDate: { year: p.startYear ?? null },
  genres: p.genres ?? [],
});

const filtres = (p: Partial<CatalogueFilters>): CatalogueFilters => ({ ...NO_FILTERS, ...p });

describe('releaseYear', () => {
  it('préfère startDate à seasonYear', () => {
    expect(releaseYear(item({ startYear: 2019, seasonYear: 2020 }))).toBe(2019);
  });

  it('retombe sur seasonYear — les films et les OVA n’ont pas de saison', () => {
    expect(releaseYear(item({ startYear: null, seasonYear: 2014 }))).toBe(2014);
  });

  it('renvoie null pour un titre annoncé sans date', () => {
    expect(releaseYear(item({}))).toBeNull();
  });
});

describe('applyFilters', () => {
  const catalogue = [
    item({ format: 'TV', season: 'SPRING', startYear: 2019, genres: ['Action', 'Fantasy'] }),
    item({ format: 'MOVIE', season: null, startYear: 2020, genres: ['Action'] }),
    item({ format: 'TV', season: 'FALL', startYear: 2020, genres: ['Comedy'] }),
  ];

  it('ne touche à rien sans filtre', () => {
    expect(applyFilters(catalogue, NO_FILTERS)).toHaveLength(3);
  });

  it('filtre par format, saison et genre', () => {
    expect(applyFilters(catalogue, filtres({ format: 'MOVIE' }))).toHaveLength(1);
    expect(applyFilters(catalogue, filtres({ season: 'FALL' }))).toHaveLength(1);
    expect(applyFilters(catalogue, filtres({ genre: 'Action' }))).toHaveLength(2);
  });

  it('filtre par année malgré le repli sur seasonYear', () => {
    const mixte = [item({ startYear: 2020 }), item({ startYear: null, seasonYear: 2020 })];
    expect(applyFilters(mixte, filtres({ year: '2020' }))).toHaveLength(2);
  });

  it('cumule les filtres', () => {
    expect(applyFilters(catalogue, filtres({ format: 'TV', year: '2020' }))).toHaveLength(1);
    expect(applyFilters(catalogue, filtres({ format: 'MOVIE', genre: 'Comedy' }))).toHaveLength(0);
  });

  it('n’attrape pas un titre sans date avec un filtre d’année', () => {
    expect(applyFilters([item({})], filtres({ year: 'null' }))).toHaveLength(0);
  });
});

describe('catalogueOptions', () => {
  const catalogue = [
    item({ format: 'MOVIE', season: 'FALL', startYear: 2020, genres: ['Fantasy', 'Action'] }),
    item({ format: 'TV', season: 'WINTER', startYear: 2011, genres: ['Action'] }),
    item({ format: 'TV', season: 'WINTER', startYear: 2020, genres: [] }),
  ];

  it('ne propose que ce que le studio a réellement produit', () => {
    const o = catalogueOptions(catalogue);
    expect(o.formats).toEqual(['TV', 'MOVIE']);
    expect(o.years).toEqual([2020, 2011]);
    expect(o.genres).toEqual(['Action', 'Fantasy']);
  });

  it('ordonne formats et saisons par sens, pas par alphabet', () => {
    const o = catalogueOptions([
      item({ format: 'MUSIC', season: 'FALL' }),
      item({ format: 'TV', season: 'WINTER' }),
      item({ format: 'OVA', season: 'SUMMER' }),
    ]);
    expect(o.formats).toEqual(['TV', 'OVA', 'MUSIC']);
    expect(o.seasons).toEqual(['WINTER', 'SUMMER', 'FALL']);
  });

  it('ignore les valeurs absentes', () => {
    const o = catalogueOptions([item({ format: null, season: null })]);
    expect(o).toEqual({ formats: [], seasons: [], years: [], genres: [] });
  });
});

describe('sortCatalogue', () => {
  const titre = (m: SortableItem & { nom?: string }) => m.nom ?? '';
  const oeuvre = (
    nom: string,
    p: { year?: number | null; score?: number | null; pop?: number | null },
  ): SortableItem & { nom: string } => ({
    ...item({ startYear: p.year ?? null }),
    averageScore: p.score ?? null,
    popularity: p.pop ?? null,
    nom,
  });

  const catalogue = [
    oeuvre('Banana', { year: 2011, score: 70, pop: 500 }),
    oeuvre('Apple', { year: 2020, score: 90, pop: 100 }),
    oeuvre('Cherry', { year: null, score: null, pop: null }),
    oeuvre('Date', { year: 2015, score: 80, pop: 900 }),
  ];

  it('ne modifie pas la liste reçue', () => {
    const avant = catalogue.map((m) => m.nom);
    sortCatalogue(catalogue, 'score', titre);
    expect(catalogue.map((m) => m.nom)).toEqual(avant);
  });

  it('du plus récent au plus vieux, les annonces sans date en tête', () => {
    expect(sortCatalogue(catalogue, 'newest', titre).map((m) => m.nom)).toEqual([
      'Cherry',
      'Apple',
      'Date',
      'Banana',
    ]);
  });

  it('du plus vieux au plus récent, les annonces sans date en dernier', () => {
    /* Divergence assumée avec AniList, qui les met en tête dans les deux sens :
       un titre annoncé n'est pas le plus ancien du catalogue. */
    expect(sortCatalogue(catalogue, 'oldest', titre).map((m) => m.nom)).toEqual([
      'Banana',
      'Date',
      'Apple',
      'Cherry',
    ]);
  });

  it('par score, les non notés en dernier', () => {
    expect(sortCatalogue(catalogue, 'score', titre).map((m) => m.nom)).toEqual([
      'Apple',
      'Date',
      'Banana',
      'Cherry',
    ]);
  });

  it('par nombre de membres', () => {
    expect(sortCatalogue(catalogue, 'members', titre).map((m) => m.nom)).toEqual([
      'Date',
      'Banana',
      'Apple',
      'Cherry',
    ]);
  });

  it('par titre affiché, pas par titre serveur', () => {
    expect(sortCatalogue(catalogue, 'title', titre).map((m) => m.nom)).toEqual([
      'Apple',
      'Banana',
      'Cherry',
      'Date',
    ]);
  });

  it('départage les ex æquo par l’ordre reçu', () => {
    const exaequo = [
      oeuvre('premier', { year: 2020, score: 80 }),
      oeuvre('second', { year: 2020, score: 80 }),
    ];
    expect(sortCatalogue(exaequo, 'score', titre).map((m) => m.nom)).toEqual(['premier', 'second']);
  });
});

describe('groupByYear', () => {
  it('respecte l’ordre reçu — c’est le serveur qui a trié', () => {
    const g = groupByYear([
      item({ startYear: 2020 }),
      item({ startYear: 2020 }),
      item({ startYear: 2019 }),
    ]);
    expect(g.map((x) => x.year)).toEqual([2020, 2019]);
    expect(g[0]?.items).toHaveLength(2);
  });

  it('marche aussi en tri ascendant', () => {
    const g = groupByYear([item({ startYear: 2011 }), item({ startYear: 2020 })]);
    expect(g.map((x) => x.year)).toEqual([2011, 2020]);
  });

  it('range les titres sans date dans un groupe null', () => {
    /* AniList les place en tête dans les deux sens de tri : ils forment le
       premier groupe, celui qu'on affiche « TBA ». */
    const g = groupByYear([item({}), item({}), item({ startYear: 2026 })]);
    expect(g[0]?.year).toBeNull();
    expect(g[0]?.items).toHaveLength(2);
    expect(g[1]?.year).toBe(2026);
  });

  it('ne coupe pas une année en deux sections si un titre s’en trouve séparé', () => {
    const g = groupByYear([
      item({ startYear: 2020 }),
      item({ startYear: 2019 }),
      item({ startYear: 2020 }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]?.items).toHaveLength(2);
  });
});
