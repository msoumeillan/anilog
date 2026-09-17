import { describe, expect, it } from 'vitest';
import { mergeBySort, type Sortable } from './browseSort';

/* Une seule forme pour tout le fichier : `mergeBySort` exige que les deux
   listes soient du même type, ce qu'elles sont dans l'app — les deux viennent
   de la même requête. */
interface Item extends Sortable {
  nom: string;
}

const pop = (nom: string, popularity: number): Item => ({ nom, popularity });
const note = (nom: string, averageScore: number): Item => ({ nom, averageScore });
const sortie = (nom: string, year: number, month: number, day: number): Item => ({
  nom,
  startDate: { year, month, day },
});

const noms = (l: Item[]) => l.map((x) => x.nom);

describe('mergeBySort', () => {
  it('rend la liste telle quelle quand il n’y a rien à insérer', () => {
    const main = [pop('a', 9), pop('b', 5)];
    expect(mergeBySort(main, [], 'POPULARITY_DESC')).toBe(main);
  });

  it('insère à la bonne place par popularité', () => {
    const main = [pop('a', 900), pop('b', 500), pop('c', 100)];
    const extras = [pop('donghua', 300)];
    expect(noms(mergeBySort(main, extras, 'POPULARITY_DESC'))).toEqual(['a', 'b', 'donghua', 'c']);
  });

  it('place en tête ce qui dépasse tout le reste', () => {
    expect(noms(mergeBySort([pop('a', 100)], [pop('extra', 999)], 'POPULARITY_DESC'))).toEqual([
      'extra',
      'a',
    ]);
  });

  it('place en queue ce qui ne dépasse rien', () => {
    expect(noms(mergeBySort([pop('a', 100)], [pop('extra', 1)], 'POPULARITY_DESC'))).toEqual([
      'a',
      'extra',
    ]);
  });

  it('insère plusieurs extras chacun à sa place', () => {
    const main = [pop('a', 900), pop('b', 500), pop('c', 100)];
    const extras = [pop('x', 50), pop('y', 700), pop('z', 300)];
    expect(noms(mergeBySort(main, extras, 'POPULARITY_DESC'))).toEqual([
      'a',
      'y',
      'b',
      'z',
      'c',
      'x',
    ]);
  });

  it('ne réordonne JAMAIS la liste principale', () => {
    /* Elle vient triée du serveur et le reste : la réordonner ferait bouger
       sous les yeux une affiche qu'on venait de repérer. Ici `main` est dans
       un ordre que le comparateur désapprouve — il doit survivre. */
    const main = [pop('premier', 10), pop('second', 900)];
    const sortie2 = mergeBySort(main, [pop('extra', 500)], 'POPULARITY_DESC');
    const sansExtra = noms(sortie2).filter((n) => n !== 'extra');
    expect(sansExtra).toEqual(['premier', 'second']);
  });

  it('classe par note sur « Top rated »', () => {
    const main = [note('a', 90), note('b', 70)];
    expect(noms(mergeBySort(main, [note('extra', 80)], 'SCORE_DESC'))).toEqual(['a', 'extra', 'b']);
  });

  it('classe par date sur « Newest »', () => {
    const main = [sortie('recent', 2026, 9, 1), sortie('vieux', 2026, 1, 1)];
    expect(noms(mergeBySort(main, [sortie('extra', 2026, 5, 1)], 'START_DATE_DESC'))).toEqual([
      'recent',
      'extra',
      'vieux',
    ]);
  });

  describe('les tris qu’on ne sait pas reproduire', () => {
    /* « Trending » et « Favourites » se calculent chez AniList a partir de
       donnees absentes de la reponse. On assume plutot que d'inventer. */
    it.each(['TRENDING_DESC', 'FAVOURITES_DESC'])('met les extras à la fin sur %s', (tri) => {
      const main = [pop('a', 1), pop('b', 2)];
      expect(noms(mergeBySort(main, [pop('extra', 999)], tri))).toEqual(['a', 'b', 'extra']);
    });

    it('fait de même sur un tri inconnu', () => {
      expect(noms(mergeBySort([pop('a', 1)], [pop('extra', 9)], 'AUTRE'))).toEqual(['a', 'extra']);
    });
  });

  describe('valeurs manquantes', () => {
    it('range une popularité absente derrière un zéro', () => {
      expect(noms(mergeBySort([pop('zero', 0)], [{ nom: 'sans' }], 'POPULARITY_DESC'))).toEqual([
        'zero',
        'sans',
      ]);
    });

    it('range une date absente en dernier sur « Newest »', () => {
      const sans: Item = { nom: 'sans', startDate: null };
      expect(noms(mergeBySort([sortie('date', 2020, 1, 1)], [sans], 'START_DATE_DESC'))).toEqual([
        'date',
        'sans',
      ]);
    });
  });
});
