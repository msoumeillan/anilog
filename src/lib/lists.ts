import type { CustomList, EntryKey, LibraryEntry, TierList, WorkSnapshot } from '../types/library';

/**
 * Ce qu'il faut pour AFFICHER une liste.
 *
 * Les listes ne stockent que des clés — voir `store/lists`. Le titre et
 * l'affiche viennent donc de la bibliothèque au moment du rendu, ce qui les
 * garde justes : renommer une œuvre ou changer son affiche se voit partout,
 * sans avoir à parcourir les listes pour les corriger.
 */

export interface ListEntry {
  key: EntryKey;
  /** L'entrée de la bibliothèque, absente si l'œuvre n'y est pas suivie. */
  entry: LibraryEntry | undefined;
  /** Ce qu'on affiche : la bibliothèque d'abord, la copie de secours sinon. */
  title: string;
  cover: string | undefined;
  note?: string;
}

/**
 * Ce qu'on montre pour une clé.
 *
 * La bibliothèque PRIME sur la copie de secours : elle est vivante, alors que
 * la copie a été prise le jour de l'ajout. Une œuvre qu'on se met à suivre
 * reprend donc son titre courant sans qu'on ait à toucher aux listes.
 */
export function display(
  key: EntryKey,
  entries: Record<string, LibraryEntry>,
  snapshots: Record<string, WorkSnapshot> | undefined,
): { entry: LibraryEntry | undefined; title: string; cover: string | undefined } {
  const entry = entries[key];
  const copie = snapshots?.[key];
  return {
    entry,
    /* Ni l'un ni l'autre : on le DIT au lieu de faire disparaître la ligne —
       un classement qui se décale tout seul est pire qu'un manque visible. */
    title: entry?.title ?? copie?.title ?? 'Unknown title',
    cover: entry?.cover ?? copie?.cover,
  };
}

/**
 * Résout les clés d'une liste, DANS SON ORDRE.
 *
 * Une clé sans entrée n'est pas silencieusement jetée : elle sort avec
 * `entry: undefined`. Retirer une œuvre de sa bibliothèque ne doit pas
 * décaler un classement sans prévenir — l'écran montre un trou nommé, et on
 * décide soi-même de l'enlever.
 */
export function resolveList(liste: CustomList, entries: Record<string, LibraryEntry>): ListEntry[] {
  return liste.items.map((i) => ({
    key: i.key,
    ...display(i.key, entries, liste.snapshots),
    note: i.note,
  }));
}

/**
 * Les affiches d'une liste, pour sa vignette. Quatre au plus.
 *
 * Celles qui manquent sont sautées plutôt que remplacées par un cadre vide :
 * une mosaïque à trous ressemble à un bogue, alors qu'une mosaïque plus courte
 * ressemble à une liste plus courte.
 */
export function listCovers(
  liste: CustomList,
  entries: Record<string, LibraryEntry>,
  limit = 4,
): string[] {
  const out: string[] = [];
  for (const i of liste.items) {
    const cover = display(i.key, entries, liste.snapshots).cover;
    if (cover) out.push(cover);
    if (out.length === limit) break;
  }
  return out;
}

/** Toutes les clés placées dans une tier list, rangs et vivier confondus. */
export function tierKeys(liste: TierList): EntryKey[] {
  return [...liste.tiers.flatMap((t) => t.items), ...liste.unranked];
}

/**
 * Les œuvres suivies d'un média, triées par titre, moins celles déjà prises.
 *
 * Sert au sélecteur d'ajout. Le tri est alphabétique et non par date : on
 * cherche un titre précis dont on connaît le nom, pas le dernier ajouté.
 */
export function pickable(
  entries: Record<string, LibraryEntry>,
  media: string,
  deja: readonly EntryKey[],
  recherche = '',
): LibraryEntry[] {
  const pris = new Set(deja);
  const q = recherche.trim().toLowerCase();

  return Object.values(entries)
    .filter((e) => e.media === media && !pris.has(e.key))
    .filter((e) => !q || e.title.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * L'identifiant du VIVIER, le conteneur des non classés.
 *
 * Une constante et non `null` déguisé en chaîne : dnd-kit compare des
 * identifiants, et ce conteneur doit en avoir un comme les autres. Aucune
 * collision possible — les rangs portent des UUID, les œuvres des clés à
 * deux-points.
 */
export const VIVIER = 'unranked';

/**
 * Où tombe une carte lâchée sur `overId`.
 *
 * dnd-kit ne rend qu'un identifiant ; c'est à nous de savoir ce qu'il désigne.
 * Lâcher SUR UNE CARTE insère à sa place — c'est ce qui permet de viser un
 * rang précis dans une file — alors que lâcher sur le fond d'un conteneur
 * ajoute à la fin.
 *
 * `null` quand l'identifiant ne désigne rien de connu : mieux vaut ne rien
 * faire que deviner un rang.
 */
export function dropTarget(
  liste: TierList,
  overId: string,
): { tierId: string | null; index: number } | null {
  if (overId === VIVIER) return { tierId: null, index: liste.unranked.length };

  const rang = liste.tiers.find((t) => t.id === overId);
  if (rang) return { tierId: rang.id, index: rang.items.length };

  const dansVivier = liste.unranked.findIndex((k) => k === overId);
  if (dansVivier !== -1) return { tierId: null, index: dansVivier };

  for (const t of liste.tiers) {
    const i = t.items.findIndex((k) => k === overId);
    if (i !== -1) return { tierId: t.id, index: i };
  }
  return null;
}
