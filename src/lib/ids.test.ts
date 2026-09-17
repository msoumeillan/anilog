import { describe, expect, it } from 'vitest';
import {
  asMedia,
  entryKey,
  mbEntryKey,
  parseEntryKey,
  favouriteKindOf,
  personKey,
  isEntryKey,
} from './ids';

describe('clés d’entrée', () => {
  it('fait l’aller-retour', () => {
    expect(parseEntryKey(entryKey('anime', 20755))).toEqual({
      media: 'anime',
      source: 'anilist',
      anilistId: 20755,
    });
    expect(parseEntryKey(entryKey('manga', 30002))).toEqual({
      media: 'manga',
      source: 'anilist',
      anilistId: 30002,
    });
  });

  it('fait l’aller-retour sur une œuvre qu’AniList n’a pas', () => {
    // Le roman Lord of Mysteries : chez MangaBaka, absent d'AniList.
    expect(parseEntryKey(mbEntryKey(84351))).toEqual({
      media: 'manga',
      source: 'mangabaka',
      mangaBakaId: 84351,
    });
  });

  it('ne confond pas les deux espaces d’identifiants', () => {
    /* La série 3397 de MangaBaka est Solo Leveling ; le manga 3397 d'AniList
       est une autre œuvre. Sans le préfixe, suivre l'une marquerait l'autre. */
    expect(mbEntryKey(3397)).not.toBe(entryKey('manga', 3397));
    expect(parseEntryKey(mbEntryKey(3397))).not.toEqual(parseEntryKey(entryKey('manga', 3397)));
  });

  it('refuse un anime chez MangaBaka : ils ne cataloguent que du manga', () => {
    expect(parseEntryKey('anime:mb84351')).toBeNull();
  });

  it('rejette ce qui n’est pas une clé', () => {
    for (const bad of [
      '',
      'anime',
      'film:12',
      'anime:',
      'anime:abc',
      'anime:0',
      'anime:-3',
      'anime:1.5',
      'manga:mb',
      'manga:mb0',
      'manga:mbx',
    ]) {
      expect(parseEntryKey(bad), bad).toBeNull();
    }
  });
});

describe('asMedia', () => {
  it('ramène les majuscules d’AniList au format des clés', () => {
    expect(asMedia('ANIME')).toBe('anime');
    expect(asMedia('MANGA')).toBe('manga');
  });

  it('laisse passer ce qui est déjà au bon format', () => {
    expect(asMedia('anime')).toBe('anime');
  });

  it('refuse ce qui n’est pas un média plutôt que de fabriquer une clé morte', () => {
    expect(asMedia('CHARACTER')).toBeNull();
    expect(asMedia(undefined)).toBeNull();
    expect(asMedia(null)).toBeNull();
    expect(asMedia('')).toBeNull();
  });
});

describe('personKey', () => {
  it('nomme les espaces d’AniList sans les confondre', () => {
    expect(personKey('character', 17)).toBe('character:17');
    expect(personKey('staff', 95269)).toBe('staff:95269');
    expect(personKey('studio', 561)).toBe('studio:561');
  });
});

describe('favouriteKindOf', () => {
  it('reconnaît une œuvre, quelle que soit sa source', () => {
    expect(favouriteKindOf('anime:21')).toBe('anime');
    expect(favouriteKindOf('manga:105778')).toBe('manga');
    // Le préfixe `mb` ne change pas le média : c'est du manga chez MangaBaka.
    expect(favouriteKindOf('manga:mb1677')).toBe('manga');
  });

  it('reconnaît un personnage, un staff, un studio', () => {
    expect(favouriteKindOf('character:17')).toBe('character');
    expect(favouriteKindOf('staff:95269')).toBe('staff');
    expect(favouriteKindOf('studio:561')).toBe('studio');
  });

  it('refuse tout le reste plutôt que de fabriquer une case introuvable', () => {
    for (const bad of [
      '',
      'studio',
      'studio:',
      'studio:0',
      'studio:-1',
      'studio:x',
      'studio:1.5',
      'music:12',
      'anime:mb1677',
    ]) {
      expect(favouriteKindOf(bad), bad).toBeNull();
    }
  });
});

describe('isEntryKey', () => {
  it('reconnait les cles d’oeuvre, AniList comme MangaBaka', () => {
    expect(isEntryKey('anime:21')).toBe(true);
    expect(isEntryKey('manga:105778')).toBe(true);
    expect(isEntryKey('manga:mb1677')).toBe(true);
  });

  it('refuse ce qui n’en est pas', () => {
    /* dnd-kit rend des identifiants nus : un rang porte un UUID, le vivier
       s’appelle « unranked ». Ni l’un ni l’autre ne doit passer pour une
       oeuvre et entrer dans le store. */
    for (const bad of ['unranked', '', 'anime:', 'anime:0', 'character:17', 'e1a9-4f2b-88c1']) {
      expect(isEntryKey(bad), bad).toBe(false);
    }
  });
});
