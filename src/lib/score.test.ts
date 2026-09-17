import { describe, expect, it } from 'vitest';
import { outOfTen } from './score';

describe('outOfTen', () => {
  it('ramène sur l’échelle que tout le monde lit', () => {
    expect(outOfTen(86)).toBe('8.6');
    expect(outOfTen(91)).toBe('9.1');
    expect(outOfTen(100)).toBe('10.0');
  });

  it('garde une décimale, même ronde', () => {
    // « 9 » et « 9.0 » ne s'alignent pas dans une grille.
    expect(outOfTen(90)).toBe('9.0');
  });

  it('ne rend rien plutôt qu’un zéro : c’est une absence de votes', () => {
    expect(outOfTen(0)).toBeNull();
    expect(outOfTen(null)).toBeNull();
    expect(outOfTen(undefined)).toBeNull();
  });
});
