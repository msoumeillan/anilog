import { describe, expect, it } from 'vitest';
import { byMonth, dayOf, diaryEvents, monthLabel } from './diary';
import type { LibraryEntry } from '../types/library';

const entree = (over: Partial<LibraryEntry> & { title: string }): LibraryEntry =>
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

describe('diaryEvents', () => {
  it('date le début et la fin', () => {
    const e = diaryEvents([
      entree({
        title: 'Vinland Saga',
        startedAt: '2026-06-01T00:00:00.000Z',
        finishedAt: '2026-08-20T00:00:00.000Z',
      }),
    ]);
    expect(e.map((x) => x.kind)).toEqual(['completed', 'started']);
    expect(e[0]?.at).toBe('2026-08-20T00:00:00.000Z');
  });

  it('ajoute une ligne par épisode vu', () => {
    /* C'est là qu'un journal devient un journal : une ligne par séance. */
    const e = diaryEvents([
      entree({
        title: 'X',
        episodes: {
          1: { watchedAt: ['2026-08-01T00:00:00.000Z'], updatedAt: '' },
          2: { watchedAt: ['2026-08-02T00:00:00.000Z'], updatedAt: '' },
        },
      }),
    ]);
    expect(e.map((x) => x.episode)).toEqual([2, 1]);
  });

  it('compte les revisionnages, à partir du deuxième', () => {
    /* `watchedAt` est une LISTE — décision 4 : un revisionnage ajoute sa
       ligne au lieu d'écraser la première. */
    const e = diaryEvents([
      entree({
        title: 'X',
        episodes: {
          1: {
            watchedAt: ['2026-01-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'],
            updatedAt: '',
          },
        },
      }),
    ]);
    expect(e.map((x) => x.rewatch)).toEqual([2, undefined]);
  });

  it('n’invente pas de date à partir de `updatedAt`', () => {
    /* Il bouge au moindre changement — une note corrigée, une étiquette
       ajoutée — et le prendre pour une date de lecture remplirait le journal
       de faux souvenirs. */
    expect(diaryEvents([entree({ title: 'X' })])).toEqual([]);
  });

  it('classe du plus récent au plus ancien', () => {
    const e = diaryEvents([
      entree({ title: 'vieux', finishedAt: '2026-01-01T00:00:00.000Z' }),
      entree({ title: 'recent', finishedAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    expect(e.map((x) => x.entry.title)).toEqual(['recent', 'vieux']);
  });
});

describe('byMonth', () => {
  it('groupe par mois, du plus récent au plus ancien', () => {
    const e = diaryEvents([
      entree({ title: 'a', finishedAt: '2026-07-15T00:00:00.000Z' }),
      entree({ title: 'b', finishedAt: '2026-08-02T00:00:00.000Z' }),
      entree({ title: 'c', finishedAt: '2026-08-20T00:00:00.000Z' }),
    ]);
    const m = byMonth(e);
    expect(m.map((x) => x.key)).toEqual(['2026-08', '2026-07']);
    expect(m[0]?.events).toHaveLength(2);
  });

  it('encaisse un journal vide', () => {
    expect(byMonth([])).toEqual([]);
  });
});

describe('monthLabel', () => {
  it('rend le mois lisible', () => {
    expect(monthLabel('2026-08')).toBe('August 2026');
  });

  it('rend la clé telle quelle si elle ne se lit pas', () => {
    expect(monthLabel('pas-une-date')).toBe('pas-une-date');
  });
});

describe('dayOf', () => {
  it('rend le quantième, sans zéro devant', () => {
    // Le mois est déjà dans le titre du groupe.
    expect(dayOf('2026-08-07T12:00:00.000Z')).toBe('7');
    expect(dayOf('2026-08-20T12:00:00.000Z')).toBe('20');
  });
});
