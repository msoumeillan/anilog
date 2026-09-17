import { describe, expect, it } from 'vitest';
import { altTitles, displayTitle } from './title';

describe('displayTitle', () => {
  it('préfère l’anglais — l’interface est en anglais', () => {
    expect(displayTitle({ english: 'Attack on Titan', romaji: 'Shingeki no Kyojin' })).toBe(
      'Attack on Titan',
    );
  });

  it('retombe sur le romaji puis le natif', () => {
    expect(displayTitle({ english: null, romaji: 'Shingeki no Kyojin' })).toBe(
      'Shingeki no Kyojin',
    );
    expect(displayTitle({ english: null, romaji: null, native: '進撃の巨人' })).toBe('進撃の巨人');
  });

  it('traite une chaîne vide ou blanche comme absente', () => {
    expect(displayTitle({ english: '   ', romaji: 'Romaji' })).toBe('Romaji');
  });

  it('ne rend jamais un blanc', () => {
    expect(displayTitle(null)).toBe('Untitled');
    expect(displayTitle({})).toBe('Untitled');
  });
});

describe('altTitles', () => {
  it('ne répète pas le titre déjà affiché', () => {
    expect(
      altTitles({ english: 'Attack on Titan', romaji: 'Shingeki no Kyojin', native: '進撃の巨人' }),
    ).toEqual(['Shingeki no Kyojin', '進撃の巨人']);
  });

  it('exclut le romaji quand c’est lui qui est affiché', () => {
    expect(altTitles({ english: null, romaji: 'Bleach', native: 'ブリーチ' })).toEqual([
      'ブリーチ',
    ]);
  });
});
