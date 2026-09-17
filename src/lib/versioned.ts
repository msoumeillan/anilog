/**
 * Le versionnage des petits stores persistés. Décision 3, appliquée ailleurs
 * que dans la bibliothèque.
 *
 * `library` a son `SCHEMA_VERSION` et sa chaîne de migrations depuis le
 * premier jour. Les stores écrits après — les favoris, les affiches — sont
 * partis sans, et le premier changement de forme aurait laissé leurs données
 * dans un état qu'aucun code n'aurait su lire. C'est exactement le défaut que
 * la décision 3 nomme.
 *
 * Plutôt que de recopier la machinerie de `lib/migrate` une fois par store —
 * et de la voir diverger — elle est écrite une fois ici. Un troisième store ne
 * doit pas avoir à la réinventer : c'est la raison d'être de ce fichier.
 *
 * La forme persistée est une ENVELOPPE, `{ version, items }`. Une sauvegarde
 * nue, écrite avant ce fichier, est donc une version 0 : elle se reconnaît à
 * l'absence d'enveloppe, et sa migration reçoit la table telle quelle.
 */

/** Ce qui est réellement écrit dans le stockage. */
export interface Envelope<T> {
  version: number;
  items: T;
}

/**
 * Une migration monte d'UNE version. `unknown` en entrée : ce qui vient du
 * disque n'a jamais été vérifié par le compilateur, et le prétendre est la
 * seule vraie erreur possible ici.
 */
export type Step = (items: unknown) => unknown;

export interface ReadResult<T> {
  items: T;
  /** Vrai s'il faut réécrire : migration passée, ou données reconstruites. */
  rewrite: boolean;
  /** Renseigné quand on est reparti de zéro, pour le dire dans la console. */
  recoveredFrom?: string;
}

export function readVersioned<T>(opts: {
  /** Ce que le stockage a rendu. */
  raw: unknown;
  /** La version que ce code sait lire. */
  version: number;
  /** Table vide, quand il n'y a rien ou plus rien de lisible. */
  empty: () => T;
  /** `{ 0: monteDe0Vers1, 1: … }`. On n'édite jamais une migration publiée. */
  migrations: Record<number, Step>;
}): ReadResult<T> {
  const { raw, version: cible, empty, migrations } = opts;

  if (raw === null || raw === undefined) return { items: empty(), rewrite: false };
  if (typeof raw !== 'object') {
    return { items: empty(), rewrite: true, recoveredFrom: 'données illisibles' };
  }

  const enveloppe = raw as Partial<Envelope<unknown>>;
  const versionnee = typeof enveloppe.version === 'number';
  /* Pas d'enveloppe : une sauvegarde d'avant le versionnage. Version 0, et la
     table est l'objet lui-même. */
  const origine = versionnee ? enveloppe.version! : 0;
  let depart = origine;
  let items: unknown = versionnee ? enveloppe.items : raw;

  if (depart > cible) {
    /* Une version plus récente a écrit ici — un autre onglet, une app mise à
       jour ailleurs. On lit sans réécrire : rétrograder effacerait des champs
       que ce code ne connaît pas. */
    return {
      items: items as T,
      rewrite: false,
      recoveredFrom: "schéma plus récent que cette version de l'app",
    };
  }

  while (depart < cible) {
    const step = migrations[depart];
    if (!step) {
      return {
        items: empty(),
        rewrite: true,
        recoveredFrom: `aucune migration ${depart} → ${depart + 1}`,
      };
    }
    items = step(items);
    depart += 1;
  }

  /* Reecrire si la forme sur le disque n'est plus celle qu'on vient de lire :
     enveloppe absente, ou migration passee. Sans ca, la meme migration se
     rejouerait a chaque ouverture. */
  return { items: items as T, rewrite: !versionnee || origine !== cible };
}

/** L'enveloppe à écrire. Toujours passer par ici : la version ne s'oublie pas. */
export function envelope<T>(version: number, items: T): Envelope<T> {
  return { version, items };
}
