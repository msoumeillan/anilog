import { describe, expect, it } from 'vitest';
import { seiyuu, voicesByLanguage, type Voice } from './voice';

const voix = (id: number, full: string, languageV2: string): Voice => ({
  id,
  name: { full },
  languageV2,
});

const takeuchi = voix(95015, 'Junko Takeuchi', 'Japanese');
const baillien = voix(96634, 'Carole Baillien', 'French');
const maile = voix(1, 'Maile Flanagan', 'English');

describe('seiyuu', () => {
  it('prend le japonais, pas le premier venu', () => {
    expect(seiyuu([baillien, takeuchi, maile])).toEqual({ id: 95015, name: 'Junko Takeuchi' });
  });

  it('renvoie null s’il n’y a pas de version japonaise', () => {
    expect(seiyuu([baillien])).toBeNull();
    expect(seiyuu([])).toBeNull();
  });
});

describe('voicesByLanguage', () => {
  it('met le japonais en tête et trie le reste alphabétiquement', () => {
    const { languages } = voicesByLanguage([{ voiceActors: [maile, baillien, takeuchi] }]);
    expect(languages).toEqual(['Japanese', 'English', 'French']);
  });

  it('agrège sur toutes les apparitions', () => {
    const { languages } = voicesByLanguage([
      { voiceActors: [takeuchi] },
      { voiceActors: [baillien] },
    ]);
    expect(languages).toEqual(['Japanese', 'French']);
  });

  it('ne compte pas deux fois un doubleur qui reprend le rôle', () => {
    const { actorsIn } = voicesByLanguage([
      { voiceActors: [takeuchi] },
      { voiceActors: [takeuchi] },
      { voiceActors: [takeuchi] },
    ]);
    expect(actorsIn('Japanese')).toEqual([{ id: 95015, name: 'Junko Takeuchi' }]);
  });

  it('garde deux doubleurs distincts pour une même langue', () => {
    const autre = voix(99999, 'Autre Seiyuu', 'Japanese');
    const { actorsIn } = voicesByLanguage([{ voiceActors: [takeuchi, autre] }]);
    expect(actorsIn('Japanese')).toHaveLength(2);
  });

  it('renvoie une liste vide pour une langue absente', () => {
    const { actorsIn } = voicesByLanguage([{ voiceActors: [takeuchi] }]);
    expect(actorsIn('Klingon')).toEqual([]);
  });
});
