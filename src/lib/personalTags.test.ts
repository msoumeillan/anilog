import { describe, expect, it } from 'vitest';
import { addTag, entriesWithTag, hasTag, normalizeTag, removeTag, tagCounts } from './personalTags';
import type { LibraryEntry } from '../types/library';

const entry = (
  id: number,
  tags: string[],
  updatedAt = '2026-01-01T00:00:00.000Z',
): LibraryEntry => ({
  key: `anime:${id}`,
  media: 'anime',
  ids: { anilist: id },
  title: `Titre ${id}`,
  status: 'completed',
  progress: { kind: 'anime', episodes: 0 },
  tags,
  addedAt: updatedAt,
  updatedAt,
});

describe('normalizeTag', () => {
  it('nettoie les bords et réduit les espaces', () => {
    expect(normalizeTag('  comfort   watch  ')).toBe('comfort watch');
  });

  it('conserve la casse saisie', () => {
    expect(normalizeTag('Comfort Watch')).toBe('Comfort Watch');
  });
});

describe('addTag', () => {
  it('ajoute une nouvelle étiquette', () => {
    expect(addTag(['Comfort'], 'Peak fiction')).toEqual(['Comfort', 'Peak fiction']);
  });

  it('ne double pas une étiquette écrite dans une autre casse', () => {
    /* « Comfort » et « comfort » sont la même intention : se retrouver avec
       les deux dans sa liste est agaçant. */
    const tags = ['Comfort'];
    expect(addTag(tags, 'comfort')).toBe(tags);
    expect(addTag(tags, '  COMFORT ')).toBe(tags);
  });

  it('ignore une saisie vide', () => {
    const tags = ['Comfort'];
    expect(addTag(tags, '   ')).toBe(tags);
  });
});

describe('removeTag', () => {
  it('retire quelle que soit la casse', () => {
    expect(removeTag(['Comfort', 'Rewatch'], 'COMFORT')).toEqual(['Rewatch']);
  });
});

describe('hasTag', () => {
  it('ignore la casse', () => {
    expect(hasTag(entry(1, ['Comfort']), 'comfort')).toBe(true);
    expect(hasTag(entry(1, ['Comfort']), 'autre')).toBe(false);
  });

  it('gère une entrée sans étiquette', () => {
    const nu = { ...entry(1, []), tags: undefined };
    expect(hasTag(nu, 'comfort')).toBe(false);
  });
});

describe('tagCounts', () => {
  it('compte et classe par fréquence', () => {
    const counts = tagCounts([
      entry(1, ['Comfort', 'Peak']),
      entry(2, ['Comfort']),
      entry(3, ['Comfort', 'Peak']),
    ]);
    expect(counts).toEqual([
      { tag: 'Comfort', count: 3 },
      { tag: 'Peak', count: 2 },
    ]);
  });

  it('regroupe les graphies et garde la première vue', () => {
    const counts = tagCounts([entry(1, ['Comfort']), entry(2, ['comfort'])]);
    expect(counts).toEqual([{ tag: 'Comfort', count: 2 }]);
  });

  it('départage les ex æquo par ordre alphabétique', () => {
    const counts = tagCounts([entry(1, ['Zeta', 'Alpha'])]);
    expect(counts.map((c) => c.tag)).toEqual(['Alpha', 'Zeta']);
  });

  it('renvoie une liste vide sans étiquette', () => {
    expect(tagCounts([{ ...entry(1, []), tags: undefined }])).toEqual([]);
  });
});

describe('entriesWithTag', () => {
  it('ne garde que les entrées concernées, les plus récentes d’abord', () => {
    const trouvees = entriesWithTag(
      [
        entry(1, ['Comfort'], '2026-01-01T00:00:00.000Z'),
        entry(2, ['Autre'], '2026-02-01T00:00:00.000Z'),
        entry(3, ['comfort'], '2026-03-01T00:00:00.000Z'),
      ],
      'Comfort',
    );
    expect(trouvees.map((e) => e.ids.anilist)).toEqual([3, 1]);
  });
});
