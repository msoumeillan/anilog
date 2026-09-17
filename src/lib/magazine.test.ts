import { describe, expect, it } from 'vitest';
import { inMalOrder } from './magazine';

const m = (id: number, idMal: number | null) => ({ id, idMal });

describe('inMalOrder', () => {
  it('rétablit le classement de MyAnimeList', () => {
    /* AniList rend ce qu'il trouve dans SON ordre : sans ce recollage, le
       classement par popularité du magazine serait perdu. */
    expect(inMalOrder([m(30011, 11), m(30013, 13), m(30021, 21)], [13, 21, 11])).toEqual([
      m(30013, 13),
      m(30021, 21),
      m(30011, 11),
    ]);
  });

  it('écarte ce qu’AniList ne connaît pas', () => {
    // Une carte sans fiche ne mène nulle part.
    expect(inMalOrder([m(30013, 13)], [13, 999])).toEqual([m(30013, 13)]);
  });

  it('écarte une fiche sans identifiant MyAnimeList : rien ne la situe', () => {
    expect(inMalOrder([m(1, null), m(30013, 13)], [13])).toEqual([m(30013, 13)]);
  });

  it('ne rend rien quand rien ne correspond', () => {
    expect(inMalOrder([], [13, 21])).toEqual([]);
    expect(inMalOrder([m(30013, 13)], [])).toEqual([]);
  });
});
