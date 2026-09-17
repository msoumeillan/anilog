import { describe, expect, it } from 'vitest';
import { envelope, readVersioned } from './versioned';

/**
 * Ces tests protègent des données qu'on ne peut pas reconstruire. Une erreur
 * ici ne casse pas un affichage : elle vide la bibliothèque de quelqu'un.
 */

const lire = (raw: unknown, migrations: Record<number, (i: unknown) => unknown> = {}) =>
  readVersioned<Record<string, unknown>>({ raw, version: 2, empty: () => ({}), migrations });

const montre = {
  0: (i: unknown) => ({ ...(i as object), passeEn1: true }),
  1: (i: unknown) => ({ ...(i as object), passeEn2: true }),
};

describe('readVersioned', () => {
  it('rend une table vide quand il n’y a rien, sans réécrire', () => {
    /* Première ouverture de l'app : ce n'est pas une perte, il n'y a rien à
       sauver, et réécrire donnerait un fichier pour un store jamais utilisé. */
    expect(lire(null)).toEqual({ items: {}, rewrite: false });
    expect(lire(undefined)).toEqual({ items: {}, rewrite: false });
  });

  it('traite une sauvegarde SANS enveloppe comme une version 0', () => {
    /* Le cas réel : tout ce qui a été écrit avant l'existence de ce fichier.
       L'objet lui-même EST la table, il n'y a pas de champ `items`. */
    const r = lire({ 'anime:21': { n: 1 } }, montre);
    expect(r.items).toEqual({ 'anime:21': { n: 1 }, passeEn1: true, passeEn2: true });
    expect(r.rewrite).toBe(true);
  });

  it('enchaîne les migrations une version à la fois', () => {
    const r = lire(envelope(0, { a: 1 }), montre);
    expect(r.items).toEqual({ a: 1, passeEn1: true, passeEn2: true });
    expect(r.rewrite).toBe(true);
  });

  it('ne touche à rien quand la version est déjà la bonne', () => {
    const r = lire(envelope(2, { a: 1 }), montre);
    expect(r).toEqual({ items: { a: 1 }, rewrite: false });
  });

  it('n’écrase PAS un schéma plus récent que le sien', () => {
    /* Un autre onglet, ou l'app mise à jour ailleurs. Rétrograder effacerait
       des champs que ce code ne connaît pas — on lit, on ne réécrit pas. */
    const r = lire(envelope(9, { venuDuFutur: true }), montre);
    expect(r.items).toEqual({ venuDuFutur: true });
    expect(r.rewrite).toBe(false);
    expect(r.recoveredFrom).toBeTruthy();
  });

  it('repart de zéro plutôt que de deviner, quand une marche manque', () => {
    /* Sans la migration 1 → 2, personne ne sait à quoi ressemble la donnée.
       L'inventer serait pire que de la perdre : elle se propagerait. */
    const r = lire(envelope(0, { a: 1 }), { 0: montre[0] });
    expect(r.items).toEqual({});
    expect(r.recoveredFrom).toContain('1 → 2');
    expect(r.rewrite).toBe(true);
  });

  it('encaisse une valeur qui n’est pas un objet', () => {
    expect(lire('vandalisme', montre).items).toEqual({});
    expect(lire(42, montre).recoveredFrom).toBeTruthy();
  });
});

describe('envelope', () => {
  it('n’oublie jamais la version', () => {
    expect(envelope(3, { a: 1 })).toEqual({ version: 3, items: { a: 1 } });
  });
});
