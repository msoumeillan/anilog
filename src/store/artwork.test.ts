import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryKey } from '../lib/ids';
import { storage } from '../platform/storage';
import { K_ART, useArtwork } from './artwork';

const anime21 = entryKey('anime', 21);
const manga21 = entryKey('manga', 21);
const table = () => useArtwork.getState().art;

describe('store des images choisies', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useArtwork.setState({ art: {}, hydrated: false });
  });
  afterEach(async () => {
    /* Les écritures différées d'un test ne doivent pas atterrir dans le
       suivant — voir `queueWrite`. */
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retient une affiche et un arrière-plan, l’un sans effacer l’autre', () => {
    useArtwork.getState().setPoster(anime21, '/affiche.jpg');
    useArtwork.getState().setBackdrop(anime21, '/fond.jpg');
    expect(table()[anime21]).toEqual({ poster: '/affiche.jpg', backdrop: '/fond.jpg' });
  });

  it('retire l’œuvre quand plus rien n’est choisi', () => {
    /* Sans ce nettoyage, revenir aux images d'origine laisserait un `{}` par
       œuvre visitée. */
    useArtwork.getState().setPoster(anime21, '/affiche.jpg');
    useArtwork.getState().setPoster(anime21, undefined);
    expect(table()).toEqual({});
  });

  it('reset rend les deux images d’origine d’un coup', () => {
    useArtwork.getState().setPoster(anime21, '/affiche.jpg');
    useArtwork.getState().setBackdrop(anime21, '/fond.jpg');
    useArtwork.getState().reset(anime21);
    expect(table()).toEqual({});
  });

  it('ne confond pas l’anime et le manga de même identifiant', () => {
    /* Décision 2 : l'anime 21 et le manga 21 sont deux œuvres. */
    useArtwork.getState().setPoster(anime21, '/anime.jpg');
    useArtwork.getState().setPoster(manga21, '/manga.jpg');
    expect(table()[anime21]?.poster).toBe('/anime.jpg');
    expect(table()[manga21]?.poster).toBe('/manga.jpg');
  });

  it('écrit une enveloppe versionnée', async () => {
    useArtwork.getState().setPoster(anime21, '/affiche.jpg');
    await vi.advanceTimersByTimeAsync(400);
    expect(await storage.get(K_ART)).toEqual({
      version: 1,
      items: { [anime21]: { poster: '/affiche.jpg' } },
    });
  });

  describe('hydrate', () => {
    it('lit une enveloppe à jour sans la réécrire', async () => {
      await storage.set(K_ART, { version: 1, items: { [anime21]: { poster: '/a.jpg' } } });
      const set = vi.spyOn(storage, 'set');
      await useArtwork.getState().hydrate();
      await vi.advanceTimersByTimeAsync(400);
      expect(table()).toEqual({ [anime21]: { poster: '/a.jpg' } });
      expect(useArtwork.getState().hydrated).toBe(true);
      expect(set).not.toHaveBeenCalled();
    });

    it('monte une sauvegarde nue — la version 0 — et la réécrit enveloppée', async () => {
      await storage.set(K_ART, { [anime21]: { backdrop: '/f.jpg' } });
      await useArtwork.getState().hydrate();
      expect(table()).toEqual({ [anime21]: { backdrop: '/f.jpg' } });

      await vi.advanceTimersByTimeAsync(0);
      expect(await storage.get(K_ART)).toEqual({
        version: 1,
        items: { [anime21]: { backdrop: '/f.jpg' } },
      });
    });

    it('repart de zéro sur une valeur illisible, et le dit', async () => {
      await storage.set(K_ART, 'abîmé');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await useArtwork.getState().hydrate();
      expect(table()).toEqual({});
      expect(warn).toHaveBeenCalledOnce();
    });
  });
});
