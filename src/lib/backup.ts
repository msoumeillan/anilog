import { storage } from '../platform/storage';
import { K_ENTRY, K_META } from '../store/library';
import { K_ART } from '../store/artwork';
import { K_FAV } from '../store/favourites';
import { K_LISTS } from '../store/lists';
import { K_PLAYLISTS } from '../store/playlists';
import { K_SONGS } from '../store/songs';

/**
 * La sauvegarde, et sa relecture.
 *
 * Le code se synchronise par git ; le JOURNAL, non. Tout ce qui fait la valeur
 * de l'app — ce qu'on suit, ce qu'on a noté, ses listes, ses affiches choisies —
 * vit dans IndexedDB, donc dans UN navigateur sur UNE machine. Ce fichier est
 * ce qui permet de changer d'ordinateur, et ce qui protège d'un vidage de cache.
 *
 * La sauvegarde recopie les valeurs BRUTES du stockage, clé par clé. C'est
 * délibéré : chaque store a déjà son enveloppe `{ version, items }` et sa chaîne
 * de migrations — décision 3. En les recopiant telles quelles, une sauvegarde
 * faite aujourd'hui et relue dans six mois passera par les migrations de
 * chacun, sans que ce fichier-ci ait jamais eu à connaître leurs formes. Le
 * jour où le schéma d'un store change, il n'y a rien à faire ici.
 */

/** Version du FICHIER de sauvegarde. Rien à voir avec celle des stores. */
export const BACKUP_VERSION = 1;

/** Ce qui permet de reconnaître un fichier qui vient bien d'ici. */
const APP = 'anilog';

export interface Backup {
  app: typeof APP;
  version: number;
  createdAt: string;
  /** Les paires du stockage, telles quelles. */
  items: Record<string, unknown>;
}

/**
 * Les clés d'un seul tenant. Le cache des génériques n'en est PAS : il se
 * redemande à AnimeThemes, il pèse, et une sauvegarde doit contenir ce qui ne
 * se retrouve nulle part ailleurs — voir `store/themes`, qui explique la
 * différence entre un cache et ce qu'on a décidé.
 */
const BACKUP_KEYS = [K_META, K_ART, K_FAV, K_LISTS, K_SONGS, K_PLAYLISTS] as const;

/** Le préfixe des œuvres suivies, une clé par entrée. */
const BACKUP_PREFIX = K_ENTRY;

export type BackupRead = { ok: true; backup: Backup } | { ok: false; raison: string };

/**
 * Relit un fichier déposé.
 *
 * On vérifie l'en-tête plutôt que de faire confiance à l'extension : un `.json`
 * quelconque déposé par erreur doit être refusé AVANT d'effacer quoi que ce
 * soit, pas après.
 */
export function readBackup(raw: unknown): BackupRead {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, raison: 'This file isn’t an AniLog backup.' };
  }

  const b = raw as Partial<Backup>;
  if (b.app !== APP) {
    return { ok: false, raison: 'This file isn’t an AniLog backup.' };
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    return {
      ok: false,
      raison: `Backup written in version ${String(b.version)}; this app reads up to ${BACKUP_VERSION}. Update the app.`,
    };
  }
  if (typeof b.items !== 'object' || b.items === null) {
    return { ok: false, raison: 'Unreadable backup — there is nothing to restore in it.' };
  }

  return {
    ok: true,
    backup: {
      app: APP,
      version: b.version,
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : '',
      items: b.items,
    },
  };
}

export interface Section {
  label: string;
  count: number;
}

/**
 * Ce que le fichier contient, en clair.
 *
 * Montré AVANT de restaurer, et c'est tout l'intérêt : une restauration
 * remplace, et il n'y a pas d'annulation dans une bibliothèque. Même règle que
 * l'import MyAnimeList — on lit, on montre, on écrit seulement après un clic.
 */
export function summarise(backup: Backup): Section[] {
  const items = backup.items;

  /** Le contenu d'une enveloppe `{ version, items }`, ou rien. */
  const dedans = (cle: string): Record<string, unknown> | null => {
    const brut = items[cle];
    if (typeof brut !== 'object' || brut === null) return null;
    const enveloppe = brut as { items?: unknown };
    const dans = enveloppe.items;
    return typeof dans === 'object' && dans !== null ? (dans as Record<string, unknown>) : null;
  };

  const listes = dedans(K_LISTS);
  const compteDe = (table: unknown) =>
    typeof table === 'object' && table !== null ? Object.keys(table).length : 0;

  return [
    {
      label: 'tracked titles',
      count: Object.keys(items).filter((k) => k.startsWith(BACKUP_PREFIX)).length,
    },
    { label: 'lists', count: compteDe(listes?.lists) },
    { label: 'tier lists', count: compteDe(listes?.tierLists) },
    { label: 'favourites', count: Object.keys(dedans(K_FAV) ?? {}).length },
    { label: 'chosen posters', count: Object.keys(dedans(K_ART) ?? {}).length },
    { label: 'rated themes', count: Object.keys(dedans(K_SONGS) ?? {}).length },
    { label: 'playlists', count: Object.keys(dedans(K_PLAYLISTS) ?? {}).length },
  ];
}

/** `anilog-2026-09-09.json` — la date suffit à ranger des sauvegardes. */
export function backupFilename(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `anilog-${d.getFullYear()}-${mois}-${jour}.json`;
}

// ─────────────────────────────────────────────────────────────
//  Le disque. Tout ce qui suit touche au stockage.
// ─────────────────────────────────────────────────────────────

/** Ramasse tout ce qui mérite d'être sauvegardé. */
export async function collectBackup(now = new Date()): Promise<Backup> {
  const items: Record<string, unknown> = {};

  for (const cle of BACKUP_KEYS) {
    const valeur = await storage.get<unknown>(cle);
    /* Une clé jamais écrite — aucune liste, aucun favori — ne va pas dans le
       fichier : un `null` sauvegardé effacerait la table à la restauration. */
    if (valeur !== null && valeur !== undefined) items[cle] = valeur;
  }

  for (const [cle, valeur] of await storage.byPrefix<unknown>(BACKUP_PREFIX)) {
    items[cle] = valeur;
  }

  return { app: APP, version: BACKUP_VERSION, createdAt: now.toISOString(), items };
}

/**
 * Restaure. REMPLACE.
 *
 * Les œuvres absentes de la sauvegarde sont effacées, et c'est le sens du mot :
 * restaurer, c'est retrouver l'état du fichier, pas le mélanger à l'état
 * courant. Fusionner deux bibliothèques poserait une question à laquelle
 * personne ne sait répondre — que faire de deux notes différentes sur la même
 * œuvre ? L'import MyAnimeList, lui, est fait pour compléter ; c'est un autre
 * geste, et il a son propre écran.
 *
 * Écriture IMMÉDIATE — `storage.set` et non `queueWrite` : celui-ci diffère de
 * 400 ms pour absorber les rafales de l'usage courant, et le rechargement qui
 * suit une restauration ne doit pas courir plus vite que ce qu'on vient
 * d'écrire.
 */
export async function applyBackup(backup: Backup): Promise<void> {
  const existantes = await storage.byPrefix<unknown>(BACKUP_PREFIX);

  for (const [cle, valeur] of Object.entries(backup.items)) {
    await storage.set(cle, valeur);
  }

  for (const [cle] of existantes) {
    if (!(cle in backup.items)) await storage.del(cle);
  }

  /* Une clé de premier niveau que la sauvegarde ne porte pas est vidée elle
     aussi : garder les favoris d'avant après avoir restauré une sauvegarde qui
     n'en avait pas serait un mélange, pas une restauration. */
  for (const cle of BACKUP_KEYS) {
    if (!(cle in backup.items)) await storage.del(cle);
  }
}
