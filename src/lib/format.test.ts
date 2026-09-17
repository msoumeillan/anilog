import { describe, expect, it } from 'vitest';
import { isSingleUnit } from './format';

describe('isSingleUnit', () => {
  it('reconnaît un film', () => {
    // Spirited Away, Your Name, A Silent Voice : MOVIE, 1 épisode.
    expect(isSingleUnit('MOVIE', 1)).toBe(true);
    // Un film annoncé sans compte d'épisodes reste un film.
    expect(isSingleUnit('MOVIE', null)).toBe(true);
  });

  it('reconnaît un OVA ou un ONA en un épisode', () => {
    expect(isSingleUnit('OVA', 1)).toBe(true);
    expect(isSingleUnit('ONA', 1)).toBe(true);
    expect(isSingleUnit('SPECIAL', 1)).toBe(true);
  });

  it('laisse les séries tranquilles', () => {
    expect(isSingleUnit('TV', 25)).toBe(false);
    expect(isSingleUnit('TV', 2)).toBe(false);
    // Série en cours : le total est inconnu, ce n'est pas une pièce unique.
    expect(isSingleUnit('TV', null)).toBe(false);
    expect(isSingleUnit(null, undefined)).toBe(false);
  });
});
