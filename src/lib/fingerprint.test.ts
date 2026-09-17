import { describe, expect, it } from 'vitest';
import { fingerprint } from './fingerprint';
import * as queries from '../api/anilist/queries';

describe('fingerprint', () => {
  it('est stable', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
  });

  it('change dès qu’un champ est ajouté — c’est tout son intérêt', () => {
    const avant = 'query { Media { id title } }';
    const apres = 'query { Media { id title episodes } }';
    expect(fingerprint(avant)).not.toBe(fingerprint(apres));
  });

  it('distingue deux textes très proches', () => {
    expect(fingerprint('perPage: 25')).not.toBe(fingerprint('perPage: 50'));
  });

  /* La garantie qui compte vraiment : deux requêtes ne doivent jamais
     partager une clé de cache, sinon l'une sert ses données à l'autre. */
  it('donne une empreinte distincte à chacune des requêtes du projet', () => {
    const textes = Object.entries(queries).filter(([, v]) => typeof v === 'string') as [
      string,
      string,
    ][];
    const vues = new Map<string, string>();
    for (const [nom, texte] of textes) {
      const f = fingerprint(texte);
      expect(vues.get(f), `${nom} entre en collision avec ${vues.get(f)}`).toBeUndefined();
      vues.set(f, nom);
    }
    expect(vues.size).toBe(textes.length);
    expect(textes.length).toBeGreaterThan(10);
  });
});
