import { describe, expect, it } from 'vitest';
import { formatWatchDate, inputFromIso, isoFromInput, todayInput } from './dates';

describe('isoFromInput', () => {
  it('fait l’aller-retour sans décaler d’un jour', () => {
    /* Le piège : `new Date('2026-08-28')` est minuit UTC, soit le 27 au soir
       pour qui vit à l'ouest de Greenwich. Midi local l'évite des deux côtés. */
    for (const jour of ['2026-08-28', '2026-01-01', '2026-12-31', '2024-02-29']) {
      expect(inputFromIso(isoFromInput(jour)!), jour).toBe(jour);
    }
  });

  it('vise midi local', () => {
    const date = new Date(isoFromInput('2026-08-28')!);
    expect(date.getHours()).toBe(12);
    expect(date.getDate()).toBe(28);
  });

  it('rejette ce qui n’est pas une date', () => {
    for (const mauvais of ['', 'demain', '2026-8-28', '28/08/2026', '2026-13-01']) {
      expect(isoFromInput(mauvais), mauvais).toBeNull();
    }
  });

  it('rejette un jour qui n’existe pas plutôt que de le décaler', () => {
    // Sans garde, le 31 février deviendrait le 3 mars en silence.
    expect(isoFromInput('2026-02-31')).toBeNull();
    expect(isoFromInput('2025-02-29')).toBeNull();
  });
});

describe('inputFromIso', () => {
  it('renvoie une chaîne vide plutôt que « Invalid Date »', () => {
    expect(inputFromIso(undefined)).toBe('');
    expect(inputFromIso('pas une date')).toBe('');
  });
});

describe('todayInput', () => {
  it('a la forme attendue par un champ date', () => {
    expect(todayInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('correspond bien à aujourd’hui en heure locale', () => {
    expect(inputFromIso(isoFromInput(todayInput())!)).toBe(todayInput());
  });
});

describe('formatWatchDate', () => {
  it('rend une date lisible', () => {
    expect(formatWatchDate(isoFromInput('2026-08-28')!)).toBe('Aug 28, 2026');
  });

  it('ne casse pas sur une valeur illisible', () => {
    expect(formatWatchDate('n’importe quoi')).toBe('');
  });
});
