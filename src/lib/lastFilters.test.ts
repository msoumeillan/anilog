import { beforeEach, describe, expect, it } from 'vitest';
import { readLastFilters, saveLastFilters } from './lastFilters';

/*
 * Les tests tournent en environnement `node` : pas de `sessionStorage`. On en
 * pose un en mémoire plutôt que d'ajouter jsdom pour cinq assertions — ce
 * qu'on vérifie ici est notre logique, pas celle du navigateur.
 */
const memoire = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memoire.get(k) ?? null,
    setItem: (k: string, v: string) => void memoire.set(k, v),
  },
});

describe('mémoire des filtres de Browse', () => {
  beforeEach(() => memoire.clear());

  it('retient les filtres posés', () => {
    saveLastFilters('sort=SCORE_DESC&year=2019');
    expect(readLastFilters()).toBe('sort=SCORE_DESC&year=2019');
  });

  it('ne retient PAS le média : c’est une autre page', () => {
    /* Le manga se parcourt sur `/mangabaka`, et `/browse?media=manga` y
       renvoie. Un `media=manga` retenu ici rendait le Browse anime
       inatteignable : on cliquait « Anime », la mémoire réinjectait le
       paramètre, et le renvoi ramenait au catalogue manga. Une boucle. */
    saveLastFilters('media=manga&year=2019');
    expect(readLastFilters()).toBe('year=2019');
  });

  it('désamorce une mémoire déjà enregistrée', () => {
    // Écrite avant le correctif, elle ne doit plus refermer la boucle.
    memoire.set('anilog:browse:filters', 'media=manga');
    expect(readLastFilters()).toBeNull();
  });

  it('ne retient PAS la recherche : elle vit dans l’adresse, pour le retour arrière', () => {
    /* Revenir sur Browse par le menu rouvrirait sinon « gundam » à qui venait
       parcourir une saison. */
    saveLastFilters('search=gundam&year=2019');
    expect(readLastFilters()).toBe('year=2019');

    // Celle qu'un lien de l'import y écrivait avant le correctif non plus.
    memoire.set('anilog:browse:filters', 'search=Frieren');
    expect(readLastFilters()).toBeNull();
  });

  it('rend `null` quand rien n’a été retenu', () => {
    expect(readLastFilters()).toBeNull();
  });

  it('distingue « rien retenu » de « filtres effacés exprès »', () => {
    saveLastFilters('');
    expect(readLastFilters()).toBeNull();
  });
});
