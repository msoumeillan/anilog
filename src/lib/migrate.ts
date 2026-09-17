import { SCHEMA_VERSION, emptyLibrary, type LibraryData } from '../types/library';

/**
 * Migrations du schéma persisté. Décision 3.
 *
 * Chaque migration monte d'une version et une seule. On les enchaîne :
 * une sauvegarde en v1 lue par une app en v4 passe par 1→2, 2→3, 3→4.
 *
 * Règle : on n'édite JAMAIS une migration déjà publiée. On en ajoute une
 * nouvelle. Sinon les données de quelqu'un qui a sauté une version se
 * retrouvent dans un état qu'aucun code n'a prévu.
 */
type Migration = (data: any) => any;

const MIGRATIONS: Record<number, Migration> = {
  // Exemple pour plus tard — laissé en commentaire tant qu'il n'y a rien à migrer.
  // 1: (d) => ({ ...d, version: 2, entries: mapValues(d.entries, addNewField) }),
};

export interface MigrationResult {
  data: LibraryData;
  /** Vrai si quelque chose a changé et qu'il faut réécrire le stockage. */
  changed: boolean;
  /** Renseigné quand les données étaient illisibles et qu'on est reparti de zéro. */
  recoveredFrom?: string;
}

export function migrate(raw: unknown): MigrationResult {
  if (raw === null || typeof raw !== 'object') {
    return { data: emptyLibrary(), changed: true, recoveredFrom: 'données absentes ou illisibles' };
  }

  let data = raw as any;
  const from = typeof data.version === 'number' ? data.version : 0;

  if (from > SCHEMA_VERSION) {
    // L'utilisateur a ouvert une version plus récente ailleurs. On ne touche à rien :
    // écraser avec un schéma plus ancien perdrait des champs qu'on ne connaît pas.
    return {
      data: data as LibraryData,
      changed: false,
      recoveredFrom: "schéma plus récent que cette version de l'app",
    };
  }

  let version = from;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      return {
        data: emptyLibrary(data?.user?.username ?? ''),
        changed: true,
        recoveredFrom: `aucune migration ${version} → ${version + 1}`,
      };
    }
    data = step(data);
    version = data.version;
  }

  return { data: data as LibraryData, changed: from !== version };
}
