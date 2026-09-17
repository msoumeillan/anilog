import type { LibraryEntry, MediaType } from '../types/library';

/**
 * Dans quel ordre une collection s'affiche.
 *
 * Il n'y avait qu'un ordre, la date de modification, et il suffisait tant que
 * la bibliothèque se remplissait titre par titre. Un import la remplit d'un
 * coup : tout partage la même seconde, et l'écran devient un tas.
 *
 * Le tri se fait ICI et non côté serveur : la bibliothèque tient en mémoire et
 * ne demande rien au réseau, c'est tout l'intérêt de la copie locale.
 */

export type LibrarySort = 'updated' | 'added' | 'title' | 'score' | 'released' | 'finished';

/**
 * Tous les tris, dans l'ordre ou on les propose.
 *
 * Une LISTE et non `Object.keys` : celui-ci rend des chaines nues, et le
 * ramener au bon type demanderait un cast — une promesse de plus que personne
 * ne verifie. Ici le compilateur tient les deux bouts.
 */
const ORDRE: LibrarySort[] = ['updated', 'added', 'title', 'score', 'released', 'finished'];

const LABELS: Record<LibrarySort, string> = {
  updated: 'Last updated',
  added: 'Recently added',
  title: 'Title A–Z',
  score: 'My rating',
  released: 'Release year',
  finished: 'Recently finished',
};

/**
 * Les tris proposés pour un média.
 *
 * « Release year » ne sort QUE pour l'anime : la saison et l'année viennent du
 * calendrier de diffusion, qu'AniList ne renseigne pas pour le manga. L'offrir
 * quand même donnerait un tri qui range tout dans le même sac, ce qui ressemble
 * à une panne.
 */
export function librarySorts(media: MediaType): { value: LibrarySort; label: string }[] {
  return ORDRE.filter((k) => media === 'anime' || k !== 'released').map((value) => ({
    value,
    label: LABELS[value],
  }));
}

/** Une valeur venue de l'URL est-elle un tri connu ? `null` sinon. */
export function asLibrarySort(value: string | null | undefined): LibrarySort | null {
  return ORDRE.find((k) => k === value) ?? null;
}

/**
 * Compare deux textes comme le ferait un dictionnaire.
 *
 * `localeCompare` et non `<` : sans lui, « Émilie » passe après « Zoé » parce
 * qu'on comparerait des points de code. Une bibliothèque contient des titres
 * accentués, des japonais et des chiffres.
 */
const parTitre = (a: LibraryEntry, b: LibraryEntry) =>
  a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Les entrées triées.
 *
 * Deux règles valent pour tous les ordres :
 *
 *   à ÉGALITÉ, on départage par titre. Sans ça, deux œuvres notées 8 changent
 *   de place d'un affichage à l'autre selon l'ordre de la table, et la grille
 *   semble bouger toute seule ;
 *
 *   ce qui n'a PAS la valeur — pas de note, pas d'année, jamais terminé — va
 *   à la FIN, quel que soit le sens. Mélanger « sans note » aux mauvaises
 *   notes ferait lire un vide comme un jugement.
 */
export function sortLibrary(entries: readonly LibraryEntry[], tri: LibrarySort): LibraryEntry[] {
  const copie = [...entries];

  /** Range les absents en dernier, puis applique la comparaison demandée. */
  const avecAbsents = <T>(
    valeur: (e: LibraryEntry) => T | undefined | null,
    compare: (a: T, b: T) => number,
  ) =>
    copie.sort((x, y) => {
      const a = valeur(x);
      const b = valeur(y);
      const aVide = a === undefined || a === null;
      const bVide = b === undefined || b === null;
      if (aVide && bVide) return parTitre(x, y);
      if (aVide) return 1;
      if (bVide) return -1;
      return compare(a, b) || parTitre(x, y);
    });

  switch (tri) {
    case 'title':
      return copie.sort(parTitre);

    case 'score':
      return avecAbsents(
        (e) => e.score,
        (a, b) => b - a,
      );

    case 'released':
      return avecAbsents(
        (e) => e.seasonYear,
        (a, b) => b - a,
      );

    case 'finished':
      return avecAbsents(
        (e) => e.finishedAt,
        (a, b) => b.localeCompare(a),
      );

    case 'added':
      return avecAbsents(
        (e) => e.addedAt,
        (a, b) => b.localeCompare(a),
      );

    case 'updated':
    default:
      return avecAbsents(
        (e) => e.updatedAt,
        (a, b) => b.localeCompare(a),
      );
  }
}
