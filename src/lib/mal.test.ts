import { describe, expect, it } from 'vitest';
import { magazines } from './mal';

describe('magazines', () => {
  it('garde l’ordre de MyAnimeList quand il y en a plusieurs', () => {
    /* Une série qui déménage garde ses deux sérialisations, et l'ordre est
       chronologique : en élire une reviendrait à effacer l'autre. */
    expect(
      magazines({
        serializations: [
          { mal_id: 83, name: 'Shounen Jump (Weekly)', url: '' },
          { mal_id: 5, name: 'Young Jump', url: '' },
        ],
      }),
    ).toEqual([
      { name: 'Shounen Jump (Weekly)', malId: 83 },
      { name: 'Young Jump', malId: 5 },
    ]);
  });

  it('rend un identifiant nul plutôt qu’un lien mort', () => {
    expect(
      magazines({ serializations: [{ mal_id: 0 as number, name: 'Inconnu', url: '' }] }),
    ).toEqual([{ name: 'Inconnu', malId: 0 }]);
  });

  it('écarte une entrée sans nom', () => {
    expect(magazines({ serializations: [{ mal_id: 1, name: '  ', url: 'x' }] })).toEqual([]);
  });

  it('encaisse une fiche vide', () => {
    expect(magazines({ serializations: null })).toEqual([]);
    expect(magazines(null)).toEqual([]);
  });
});
