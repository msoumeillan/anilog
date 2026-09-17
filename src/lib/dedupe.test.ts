import { describe, expect, it } from 'vitest';
import { dedupeBy } from './dedupe';

describe('dedupeBy', () => {
  it('garde la première occurrence, pas la dernière', () => {
    const items = [
      { id: 1, from: 'page1' },
      { id: 2, from: 'page1' },
      { id: 1, from: 'page2' },
    ];
    expect(dedupeBy(items, (i) => i.id)).toEqual([
      { id: 1, from: 'page1' },
      { id: 2, from: 'page1' },
    ]);
  });

  it('préserve l’ordre', () => {
    const items = [3, 1, 3, 2, 1].map((id) => ({ id }));
    expect(dedupeBy(items, (i) => i.id).map((i) => i.id)).toEqual([3, 1, 2]);
  });

  it('ne confond pas 1 et "1"', () => {
    const items = [{ k: 1 }, { k: '1' }];
    expect(dedupeBy(items, (i) => i.k)).toHaveLength(2);
  });
});
