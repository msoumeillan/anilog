import { describe, expect, it } from 'vitest';
import { backupFilename, BACKUP_VERSION, readBackup, summarise } from './backup';

/**
 * Une sauvegarde se relit APRÈS coup, parfois des mois plus tard, sur une autre
 * machine. Ce qu'on teste ici est ce qu'on ne pourra plus corriger à ce
 * moment-là : le refus d'un fichier qui n'en est pas un, et l'exactitude du
 * récapitulatif — c'est lui qu'on lit avant d'effacer sa bibliothèque.
 */

const enveloppe = (items: Record<string, unknown>) => ({ version: 1, items });

const fichier = (over: Record<string, unknown> = {}) => ({
  app: 'anilog',
  version: BACKUP_VERSION,
  createdAt: '2026-09-09T10:00:00.000Z',
  items: {
    'anilog:meta': { version: 1, user: { username: 'moi' } },
    'anilog:entry:anime:21': { key: 'anime:21' },
    'anilog:entry:manga:30': { key: 'manga:30' },
    'anilog:lists': enveloppe({ lists: { a: {}, b: {} }, tierLists: { t: {} } }),
    'anilog:favourites': enveloppe({ 'anime:21': {}, 'character:17': {} }),
    'anilog:artwork': enveloppe({ 'anime:21': {} }),
    'anilog:songs': enveloppe({ 'song:21:OP1': {}, 'song:21:ED1': {}, 'song:1:OP1': {} }),
    'anilog:playlists': enveloppe({
      'une-playlist': { id: 'une-playlist', name: 'Idols', tracks: [] },
    }),
  },
  ...over,
});

describe('readBackup', () => {
  it('accepte un fichier bien formé', () => {
    const r = readBackup(fichier());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.createdAt).toBe('2026-09-09T10:00:00.000Z');
  });

  it('refuse ce qui ne vient pas d’ici', () => {
    /* Un `.json` quelconque déposé par erreur doit être refusé AVANT qu'on
       efface quoi que ce soit, pas après. */
    for (const mauvais of [null, 42, 'texte', {}, { app: 'autre-app', version: 1, items: {} }]) {
      expect(readBackup(mauvais).ok, JSON.stringify(mauvais)).toBe(false);
    }
  });

  it('refuse une sauvegarde plus RÉCENTE que l’app', () => {
    /* L'inverse d'une migration : on ne sait pas lire un format qui n'existait
       pas quand ce code a été écrit, et deviner effacerait des champs. */
    const r = readBackup(fichier({ version: BACKUP_VERSION + 1 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain('Update the app');
  });

  it('refuse un fichier sans contenu à restaurer', () => {
    expect(readBackup(fichier({ items: null })).ok).toBe(false);
    expect(readBackup({ app: 'anilog', version: 1 }).ok).toBe(false);
  });

  it('encaisse une date absente plutôt que de refuser', () => {
    // La date est un confort d'affichage, pas une condition de lecture.
    const r = readBackup(fichier({ createdAt: undefined }));
    expect(r.ok && r.backup.createdAt).toBe('');
  });
});

describe('summarise', () => {
  const compte = (raw: unknown) => {
    const r = readBackup(raw);
    if (!r.ok) throw new Error('fichier refusé');
    return Object.fromEntries(summarise(r.backup).map((s) => [s.label, s.count]));
  };

  it('compte ce que le fichier contient vraiment', () => {
    expect(compte(fichier())).toEqual({
      'tracked titles': 2,
      lists: 2,
      'tier lists': 1,
      favourites: 2,
      'chosen posters': 1,
      'rated themes': 3,
      playlists: 1,
    });
  });

  it('rend zéro pour ce que le fichier n’a pas', () => {
    /* Une sauvegarde faite avant qu'une fonctionnalité existe n'a pas sa clé :
       zéro, et pas une erreur. */
    const r = compte(fichier({ items: { 'anilog:meta': {} } }));
    expect(r).toEqual({
      'tracked titles': 0,
      lists: 0,
      'tier lists': 0,
      favourites: 0,
      'chosen posters': 0,
      'rated themes': 0,
      playlists: 0,
    });
  });

  it('ne se casse pas sur une enveloppe abîmée', () => {
    const r = compte(
      fichier({ items: { 'anilog:lists': 'pas une enveloppe', 'anilog:favourites': null } }),
    );
    expect(r.lists).toBe(0);
    expect(r.favourites).toBe(0);
  });
});

describe('backupFilename', () => {
  it('nomme par la date, avec ses zéros', () => {
    expect(backupFilename(new Date(2026, 8, 9))).toBe('anilog-2026-09-09.json');
    expect(backupFilename(new Date(2026, 11, 25))).toBe('anilog-2026-12-25.json');
  });
});
