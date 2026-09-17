import { describe, expect, it } from 'vitest';
import { asLibrarySort, librarySorts, sortLibrary } from './libraryOrder';
import type { LibraryEntry } from '../types/library';

const e = (over: Partial<LibraryEntry> & { title: string }): LibraryEntry =>
  ({
    key: `anime:${over.title}`,
    media: 'anime',
    ids: { anilist: 1 },
    status: 'completed',
    progress: { kind: 'anime', episodes: 0 },
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as LibraryEntry;

const titres = (l: LibraryEntry[]) => l.map((x) => x.title);

describe('sortLibrary', () => {
  it('trie par titre, comme un dictionnaire', () => {
    /* `localeCompare` et non `<` : sans lui « Émilie » passerait après « Zoé »,
       parce qu'on comparerait des points de code. */
    const l = [e({ title: 'Zoé' }), e({ title: 'Émilie' }), e({ title: 'Akira' })];
    expect(titres(sortLibrary(l, 'title'))).toEqual(['Akira', 'Émilie', 'Zoé']);
  });

  it('range les nombres dans l’ordre humain', () => {
    // « Part 10 » vient après « Part 9 », pas avant.
    const l = [e({ title: 'Part 10' }), e({ title: 'Part 9' }), e({ title: 'Part 1' })];
    expect(titres(sortLibrary(l, 'title'))).toEqual(['Part 1', 'Part 9', 'Part 10']);
  });

  it('trie par note, la meilleure d’abord', () => {
    const l = [e({ title: 'b', score: 6 }), e({ title: 'a', score: 10 })];
    expect(titres(sortLibrary(l, 'score'))).toEqual(['a', 'b']);
  });

  it('met CE QUI N’A PAS DE VALEUR à la fin', () => {
    /* Mélanger « sans note » aux mauvaises notes ferait lire un vide comme un
       jugement. */
    const l = [
      e({ title: 'sans' }),
      e({ title: 'basse', score: 3 }),
      e({ title: 'haute', score: 9 }),
    ];
    expect(titres(sortLibrary(l, 'score'))).toEqual(['haute', 'basse', 'sans']);
  });

  it('départage les égalités par titre, toujours', () => {
    /* Sans ça, deux œuvres notées 8 changent de place d'un affichage à
       l'autre selon l'ordre de la table, et la grille semble bouger seule. */
    const l = [
      e({ title: 'c', score: 8 }),
      e({ title: 'a', score: 8 }),
      e({ title: 'b', score: 8 }),
    ];
    expect(titres(sortLibrary(l, 'score'))).toEqual(['a', 'b', 'c']);
  });

  it('est stable : deux appels donnent le même ordre', () => {
    const l = [e({ title: 'c' }), e({ title: 'a' }), e({ title: 'b' })];
    expect(titres(sortLibrary(l, 'updated'))).toEqual(titres(sortLibrary(l, 'updated')));
  });

  it('ne modifie pas le tableau qu’on lui donne', () => {
    // `sort` trie EN PLACE : sans copie, l'appelant verrait son état bouger.
    const l = [e({ title: 'b' }), e({ title: 'a' })];
    sortLibrary(l, 'title');
    expect(titres(l)).toEqual(['b', 'a']);
  });

  it('trie par année de sortie, la plus récente d’abord', () => {
    const l = [
      e({ title: 'vieux', seasonYear: 1998 }),
      e({ title: 'sans annee' }),
      e({ title: 'recent', seasonYear: 2024 }),
    ];
    expect(titres(sortLibrary(l, 'released'))).toEqual(['recent', 'vieux', 'sans annee']);
  });

  it('trie par date de fin, la plus récente d’abord', () => {
    const l = [
      e({ title: 'jamais fini' }),
      e({ title: 'vieux', finishedAt: '2020-01-01T00:00:00.000Z' }),
      e({ title: 'hier', finishedAt: '2026-09-01T00:00:00.000Z' }),
    ];
    expect(titres(sortLibrary(l, 'finished'))).toEqual(['hier', 'vieux', 'jamais fini']);
  });

  it('trie par date d’ajout et par date de modification', () => {
    const l = [
      e({ title: 'a', addedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }),
      e({ title: 'b', addedAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(titres(sortLibrary(l, 'added'))).toEqual(['b', 'a']);
    expect(titres(sortLibrary(l, 'updated'))).toEqual(['a', 'b']);
  });

  it('encaisse une collection vide', () => {
    expect(sortLibrary([], 'score')).toEqual([]);
  });
});

describe('librarySorts', () => {
  it('n’offre « Release year » qu’à l’anime', () => {
    /* La saison et l'année viennent du calendrier de diffusion, qu'AniList ne
       renseigne pas pour le manga : le tri rangerait tout dans le même sac, ce
       qui ressemble à une panne. */
    expect(librarySorts('anime').map((s) => s.value)).toContain('released');
    expect(librarySorts('manga').map((s) => s.value)).not.toContain('released');
  });

  it('garde « Last updated » en tête, c’est le défaut', () => {
    expect(librarySorts('manga')[0]?.value).toBe('updated');
  });
});

describe('asLibrarySort', () => {
  it('accepte les tris connus', () => {
    for (const s of librarySorts('anime')) expect(asLibrarySort(s.value)).toBe(s.value);
  });

  it('refuse le reste plutôt que de trier au hasard', () => {
    for (const bad of ['', 'BANANA', 'Title', null, undefined]) {
      expect(asLibrarySort(bad), String(bad)).toBeNull();
    }
  });
});
