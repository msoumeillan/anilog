import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { SCHEMA_VERSION } from '../types/library';

describe('migrate', () => {
  it('repart de zéro quand il n’y a rien à lire', () => {
    for (const rien of [null, undefined, 'texte', 42]) {
      const r = migrate(rien);
      expect(r.data.version).toBe(SCHEMA_VERSION);
      expect(r.changed).toBe(true);
      expect(r.recoveredFrom).toBeTruthy();
    }
  });

  it('laisse intacte une sauvegarde plus récente que l’app', () => {
    /* Le cas important : l'utilisateur a ouvert une version plus récente
       ailleurs. Réécrire avec un schéma plus ancien perdrait des champs
       qu'on ne sait même pas lire. */
    const futur = { version: SCHEMA_VERSION + 1, user: { username: 'matts' }, inconnu: [1, 2] };
    const r = migrate(futur);
    expect(r.changed).toBe(false);
    expect(r.data).toBe(futur);
  });

  it('garde le pseudo quand aucun chemin de migration n’existe', () => {
    const r = migrate({ version: -1, user: { username: 'matts' } });
    expect(r.recoveredFrom).toContain('aucune migration');
    expect(r.data.user.username).toBe('matts');
    expect(r.data.version).toBe(SCHEMA_VERSION);
  });

  it('ne signale aucun changement sur une sauvegarde déjà à jour', () => {
    const r = migrate({ version: SCHEMA_VERSION, user: { username: 'x', joinedAt: 'z' } });
    expect(r.changed).toBe(false);
    expect(r.recoveredFrom).toBeUndefined();
  });
});
