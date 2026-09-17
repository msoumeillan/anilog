import { beforeEach, describe, expect, it } from 'vitest';
import { entryKey } from './ids';
import type { SearchItem } from './quickSearch';
import { readRecent, RECENT_MAX, saveRecent, withOpened } from './recentResults';

/*
 * Les tests tournent en environnement `node` : pas de `localStorage`. On en
 * pose un en mémoire, comme pour le volume du lecteur — ce qu'on vérifie ici
 * est notre logique, pas celle du navigateur.
 */
const memoire = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memoire.get(k) ?? null,
    setItem: (k: string, v: string) => void memoire.set(k, v),
    removeItem: (k: string) => void memoire.delete(k),
  },
});

const KEY = 'anilog:search:recent';

const item = (patch: Partial<SearchItem> = {}): SearchItem => ({
  key: 'anime:16498',
  kind: 'anime',
  href: '/anime/16498',
  title: 'Attack on Titan',
  meta: 'TV series · 2013',
  image: 'https://img/16498.jpg',
  libraryKey: entryKey('anime', 16498),
  ...patch,
});

describe('withOpened : la liste après une ouverture', () => {
  it('met le dernier ouvert en tête', () => {
    const a = item({ key: 'anime:1' });
    const b = item({ key: 'anime:2' });
    expect(withOpened([a], b).map((i) => i.key)).toEqual(['anime:2', 'anime:1']);
  });

  it('ne garde qu’une ligne par résultat, avec ce qu’il affiche aujourd’hui', () => {
    const avant = item({ title: 'Shingeki no Kyojin' });
    const apres = item({ title: 'Attack on Titan' });
    const liste = withOpened([avant, item({ key: 'anime:2' })], apres);
    expect(liste.map((i) => i.key)).toEqual(['anime:16498', 'anime:2']);
    expect(liste[0]?.title).toBe('Attack on Titan');
  });

  it('s’arrête à huit : le panneau ne doit pas défiler', () => {
    let liste: SearchItem[] = [];
    for (let i = 0; i < RECENT_MAX + 4; i++) liste = withOpened(liste, item({ key: `anime:${i}` }));
    expect(liste).toHaveLength(RECENT_MAX);
    expect(liste[0]?.key).toBe(`anime:${RECENT_MAX + 3}`);
  });
});

describe('ce qui se relit du stockage', () => {
  beforeEach(() => memoire.clear());

  it('retrouve ce qu’on a écrit', () => {
    const liste = [
      item(),
      item({
        key: 'studio:43',
        kind: 'studio',
        href: '/studio/43',
        image: null,
        libraryKey: undefined,
      }),
    ];
    saveRecent(liste);
    expect(readRecent()).toEqual(liste);
  });

  it('oublie tout plutôt que de garder une liste vide', () => {
    saveRecent([item()]);
    saveRecent([]);
    expect(memoire.get(KEY)).toBeUndefined();
    expect(readRecent()).toEqual([]);
  });

  it('se passe d’un stockage abîmé', () => {
    memoire.set(KEY, '{ pas du JSON');
    expect(readRecent()).toEqual([]);
    memoire.set(KEY, '"une chaîne"');
    expect(readRecent()).toEqual([]);
  });

  it('écarte la ligne illisible, et garde les autres', () => {
    /* Le stockage vient d'ailleurs : une version passée de l'app, une main
       dans les outils du navigateur. Une ligne fautive ne doit pas tout
       emporter — ni ouvrir ce qu'elle veut. */
    memoire.set(
      KEY,
      JSON.stringify([
        item(),
        { ...item({ key: 'anime:2' }), href: 'https://ailleurs.example/piege' },
        { ...item({ key: 'anime:3' }), kind: 'inconnu' },
        { ...item({ key: 'anime:4' }), libraryKey: 'pas une clé' },
        { ...item({ key: 'anime:5' }), image: 'javascript:alert(1)' },
        item({ key: 'anime:6' }),
      ]),
    );
    expect(readRecent().map((i) => i.key)).toEqual(['anime:16498', 'anime:6']);
  });

  it('n’en relit pas plus que huit', () => {
    const trop = Array.from({ length: 12 }, (_, i) => item({ key: `anime:${i}` }));
    memoire.set(KEY, JSON.stringify(trop));
    expect(readRecent()).toHaveLength(RECENT_MAX);
  });
});
