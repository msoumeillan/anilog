import { describe, expect, it } from 'vitest';
import { FORMATS, SEASONS, formatLabel, mangaTypeVars, seasonLabel } from './mediaOptions';

/*
 * Ces deux fonctions sont la SEULE façon d'écrire un format ou une saison.
 * Il en existait trois, dont deux tables de formats qui divergeaient : la page
 * studio connaissait `MUSIC`, la bulle de survol non, si bien que le même
 * anime s'annonçait « Music video » sur sa carte et « MUSIC » au survol.
 */

describe('seasonLabel', () => {
  it('nomme les quatre saisons', () => {
    expect(seasonLabel('WINTER')).toBe('Winter');
    expect(seasonLabel('SUMMER')).toBe('Summer');
  });

  it('couvre toute la liste proposée au filtre', () => {
    for (const s of SEASONS) expect(seasonLabel(s.value)).toBe(s.label);
  });

  it('capitalise ce qu’elle ne connaît pas', () => {
    expect(seasonLabel('AUTRE')).toBe('Autre');
  });
});

describe('formatLabel', () => {
  it('couvre toute la liste proposée au filtre', () => {
    for (const f of FORMATS) expect(formatLabel(f.value)).toBe(f.label);
  });

  it('nomme les formats qu’AniList renvoie sans qu’on les propose', () => {
    expect(formatLabel('MUSIC')).toBe('Music video');
  });

  it('capitalise ce qu’elle ne connaît pas, plutôt que de rendre vide', () => {
    expect(formatLabel('WHATEVER')).toBe('Whatever');
  });
});

describe('mangaTypeVars', () => {
  /*
   * Le piège : manhwa et manhua ne sont pas des formats chez AniList. Les
   * trois valent `MANGA` ; c'est le pays qui les sépare. Un « type » de manga
   * pose donc DEUX filtres.
   */
  it('sépare les trois par le pays, pas par le format', () => {
    expect(mangaTypeVars('manga')).toEqual({ format: 'MANGA', country: 'JP' });
    expect(mangaTypeVars('manhwa')).toEqual({ format: 'MANGA', country: 'KR' });
    expect(mangaTypeVars('manhua')).toEqual({ format: 'MANGA', country: 'CN' });
  });

  it('laisse le pays libre là où il ne veut rien dire', () => {
    expect(mangaTypeVars('novel')).toEqual({ format: 'NOVEL', country: undefined });
    expect(mangaTypeVars('one_shot')).toEqual({ format: 'ONE_SHOT', country: undefined });
  });

  it('ne pose aucun filtre sur une valeur inconnue — « Any » comprise', () => {
    expect(mangaTypeVars('')).toEqual({});
    expect(mangaTypeVars('webtoon')).toEqual({});
  });
});
