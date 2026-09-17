import { describe, expect, it } from 'vitest';
import { anilistType, readMode, unitLabel } from './mediaMode';

const params = (query: string) => new URLSearchParams(query);

describe('readMode', () => {
  it('lit le manga quand l’URL le dit', () => {
    expect(readMode(params('media=manga'))).toBe('manga');
  });

  it('retombe sur l’anime — une adresse sans paramètre reste la plus courante', () => {
    expect(readMode(params(''))).toBe('anime');
    expect(readMode(params('media=anime'))).toBe('anime');
  });

  it('ne se laisse pas dicter n’importe quoi par l’URL', () => {
    expect(readMode(params('media=manhwa'))).toBe('anime');
    expect(readMode(params('media='))).toBe('anime');
  });
});

describe('anilistType', () => {
  it('traduit pour l’API', () => {
    expect(anilistType('manga')).toBe('MANGA');
    expect(anilistType('anime')).toBe('ANIME');
  });
});

describe('unitLabel', () => {
  it('compte des épisodes ou des chapitres', () => {
    expect(unitLabel('anime')).toBe('episode');
    expect(unitLabel('manga')).toBe('chapter');
    expect(unitLabel('manga', true)).toBe('chapters');
  });
});
