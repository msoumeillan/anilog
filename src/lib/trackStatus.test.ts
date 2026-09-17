import { describe, expect, it } from 'vitest';
import { asTrackStatus, statusLabel, STATUS_ORDER } from './trackStatus';

describe('statusLabel', () => {
  it('parle la langue du média', () => {
    /* « Plan to watch » sur un manga est une faute, et c'est ce que la
       bibliothèque affichait avant d'avoir des onglets par média. */
    expect(statusLabel('current', 'anime')).toBe('Watching');
    expect(statusLabel('current', 'manga')).toBe('Reading');
    expect(statusLabel('planned', 'anime')).toBe('Plan to watch');
    expect(statusLabel('planned', 'manga')).toBe('Plan to read');
  });

  it('nomme les cinq statuts dans les deux médias', () => {
    for (const s of STATUS_ORDER) {
      expect(statusLabel(s, 'anime'), s).toBeTruthy();
      expect(statusLabel(s, 'manga'), s).toBeTruthy();
    }
  });
});

describe('asTrackStatus', () => {
  it('accepte les statuts connus', () => {
    for (const s of STATUS_ORDER) expect(asTrackStatus(s)).toBe(s);
  });

  it('refuse tout le reste plutôt que de filtrer sur rien', () => {
    /* L'adresse se tape et se bricole. Un cast aurait laissé passer
       `?status=BANANA`, qui vidait la collection sans un mot. */
    for (const bad of ['', 'BANANA', 'Current', 'watching', null, undefined]) {
      expect(asTrackStatus(bad), String(bad)).toBeNull();
    }
  });
});
