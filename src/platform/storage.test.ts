import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFlushOnHide, queueWrite, storage } from './storage';

/*
 * En environnement `node`, ni IndexedDB ni localStorage : la couche retombe sur
 * sa version MÉMOIRE. C'est elle que ces tests exercent d'abord — et c'est
 * déjà, sans le dire, celle de tous les tests de stores.
 */

describe('la couche de stockage', () => {
  it('retombe sur la mémoire quand le navigateur n’offre rien', () => {
    expect(storage.backend).toBe('memory');
  });

  it('lit, écrit, efface, et rend `null` pour une clé absente', async () => {
    await storage.set('essai:a', { n: 1 });
    expect(await storage.get('essai:a')).toEqual({ n: 1 });
    await storage.del('essai:a');
    expect(await storage.get('essai:a')).toBeNull();
  });

  it('liste par préfixe, et par lui seul', async () => {
    await storage.set('prefixe:un', 1);
    await storage.set('prefixe:deux', 2);
    await storage.set('autre:trois', 3);
    expect(Object.fromEntries(await storage.byPrefix<number>('prefixe:'))).toEqual({
      'prefixe:un': 1,
      'prefixe:deux': 2,
    });
  });
});

describe('queueWrite : l’écriture différée', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    /* Rien ne doit rester en attente d'un test à l'autre : la file est un
       état du module, partagé par tout le fichier. */
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fusionne les écritures rapprochées sur une clé : seule la dernière part', async () => {
    /* C'est la correction du `saveData()` de la v1, qui réécrivait toute la
       bibliothèque à chaque clic : cinq cases cochées, une seule écriture. */
    const set = vi.spyOn(storage, 'set');
    queueWrite('file:x', 1);
    queueWrite('file:x', 2);
    queueWrite('file:x', 3);
    expect(set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(set).toHaveBeenCalledTimes(1);
    expect(await storage.get('file:x')).toBe(3);
  });

  it('écrit toutes les clés en attente, pas seulement la dernière touchée', async () => {
    queueWrite('file:a', 'A');
    queueWrite('file:b', 'B');
    await vi.advanceTimersByTimeAsync(400);
    expect(await storage.get('file:a')).toBe('A');
    expect(await storage.get('file:b')).toBe('B');
  });

  it('écrit tout de suite quand la page se cache, sans attendre le délai', async () => {
    /* Un onglet fermé pendant les 400 ms de délai perdrait la dernière
       modification : c'est tout le rôle de `installFlushOnHide`. */
    const page = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
    try {
      const retirer = installFlushOnHide();
      queueWrite('file:fermeture', 'dernier clic');
      page.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(await storage.get('file:fermeture')).toBe('dernier clic');
      retirer();
    } finally {
      Reflect.deleteProperty(globalThis, 'document');
    }
  });
});

describe('le repli localStorage', () => {
  it('sérialise en JSON, et rend `null` sur une valeur abîmée', async () => {
    const memoire = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memoire.get(k) ?? null,
        setItem: (k: string, v: string) => void memoire.set(k, String(v)),
        removeItem: (k: string) => void memoire.delete(k),
        key: (i: number) => [...memoire.keys()][i] ?? null,
        get length() {
          return memoire.size;
        },
      },
    });

    try {
      /* Le choix du moteur se fait au CHARGEMENT du module : il faut le
         recharger pour qu'il voie ce localStorage-là. */
      vi.resetModules();
      const { storage: repli } = await import('./storage');
      expect(repli.backend).toBe('localstorage');

      await repli.set('anilog:x', { a: 1 });
      expect(memoire.get('anilog:x')).toBe('{"a":1}');
      expect(await repli.get('anilog:x')).toEqual({ a: 1 });

      memoire.set('anilog:abime', '{pas du json');
      expect(await repli.get('anilog:abime')).toBeNull();
      /* Une valeur illisible ne sort pas non plus par préfixe. */
      expect((await repli.byPrefix('anilog:')).map(([k]) => k)).toEqual(['anilog:x']);
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
