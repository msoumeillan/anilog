import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clampTime, clock, readVolume, saveVolume, toggleMute, withLevel } from './playback';

/*
 * Les tests tournent en environnement `node` : pas de `localStorage`. On en
 * pose un en mémoire, retiré à la fin — la couche de stockage regarde s'il
 * existe au chargement, et un faux laissé derrière soi changerait le terrain
 * d'un autre fichier.
 */
const memoire = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memoire.get(k) ?? null,
    setItem: (k: string, v: string) => void memoire.set(k, v),
  },
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('l’heure affichée', () => {
  it('écrit minutes et secondes, sans zéro devant les minutes', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(9)).toBe('0:09');
    expect(clock(90)).toBe('1:30');
    expect(clock(725)).toBe('12:05');
  });

  it('arrondit à la seconde inférieure : la fin n’est affichée qu’atteinte', () => {
    expect(clock(89.97)).toBe('1:29');
    expect(clock(90.03)).toBe('1:30');
  });

  it('passe aux heures quand il y en a', () => {
    expect(clock(3600)).toBe('1:00:00');
    expect(clock(3723)).toBe('1:02:03');
  });

  it('écrit « 0:00 » pour une durée pas encore lue, infinie ou négative', () => {
    expect(clock(Number.NaN)).toBe('0:00');
    expect(clock(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(clock(-4)).toBe('0:00');
  });
});

describe('clampTime : où la frise peut envoyer la vidéo', () => {
  it('borne entre le début et la fin', () => {
    expect(clampTime(-5, 90)).toBe(0);
    expect(clampTime(45, 90)).toBe(45);
    expect(clampTime(95, 90)).toBe(90);
  });

  it('ne borne que le début tant que la durée n’est pas lue', () => {
    /* Au chargement, la durée vaut `NaN` : les flèches ne doivent ni tout
       ramener à zéro, ni rester bloquées. */
    expect(clampTime(12, Number.NaN)).toBe(12);
    expect(clampTime(-3, Number.NaN)).toBe(0);
  });
});

describe('le volume retenu', () => {
  beforeEach(() => memoire.clear());

  it('part à plein volume quand rien n’a été retenu', () => {
    expect(readVolume()).toEqual({ level: 1, muted: false });
  });

  it('retrouve ce qui a été réglé, coupure comprise', () => {
    saveVolume({ level: 0.3, muted: true });
    expect(readVolume()).toEqual({ level: 0.3, muted: true });
  });

  it('ignore une valeur illisible plutôt que de jouer à un volume inventé', () => {
    for (const abime of ['{', '"fort"', '[]', 'null', '{"level":"0.3","muted":false}']) {
      memoire.set('anilog:player:volume', abime);
      expect(readVolume()).toEqual({ level: 1, muted: false });
    }
    memoire.set('anilog:player:volume', '{"level":0.4}');
    expect(readVolume()).toEqual({ level: 1, muted: false });
  });

  it('ramène un niveau hors bornes entre 0 et 1', () => {
    memoire.set('anilog:player:volume', '{"level":7,"muted":false}');
    expect(readVolume()).toEqual({ level: 1, muted: false });
    memoire.set('anilog:player:volume', '{"level":-1,"muted":false}');
    expect(readVolume()).toEqual({ level: 0, muted: false });
  });
});

describe('régler le volume', () => {
  it('toucher au curseur remet le son', () => {
    expect(withLevel(0.6)).toEqual({ level: 0.6, muted: false });
    expect(withLevel(1.4)).toEqual({ level: 1, muted: false });
  });

  it('couper garde le niveau, et remettre le son le rend', () => {
    const coupe = toggleMute({ level: 0.7, muted: false });
    expect(coupe).toEqual({ level: 0.7, muted: true });
    expect(toggleMute(coupe)).toEqual({ level: 0.7, muted: false });
  });

  it('un curseur à zéro compte comme coupé, et remettre le son rend du son', () => {
    expect(toggleMute({ level: 0, muted: false })).toEqual({ level: 0.5, muted: false });
    expect(toggleMute({ level: 0, muted: true })).toEqual({ level: 0.5, muted: false });
  });
});
