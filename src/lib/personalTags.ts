import type { LibraryEntry } from '../types/library';

/**
 * Étiquettes personnelles.
 *
 * Rien à voir avec les tags d'AniList : ce sont les siennes, saisies à la
 * main, et elles n'existent que dans la bibliothèque locale. D'où le
 * dédoublonnage insensible à la casse — « Comfort » et « comfort » sont la
 * même intention, et se retrouver avec les deux dans sa liste est agaçant.
 */

/** Espaces réduits, bords nettoyés. La casse saisie est conservée. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Ajoute une étiquette si elle est nouvelle. Renvoie la liste inchangée sinon,
 * pour que l'appelant puisse détecter qu'il n'y a rien à écrire.
 */
export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (!tag) return tags;
  const exists = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
  return exists ? tags : [...tags, tag];
}

export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
}

export function hasTag(entry: LibraryEntry, tag: string): boolean {
  const wanted = tag.toLowerCase();
  return (entry.tags ?? []).some((t) => t.toLowerCase() === wanted);
}

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Toutes les étiquettes utilisées, de la plus fréquente à la moins fréquente.
 *
 * La graphie retenue est celle vue en premier : si l'entrée la plus ancienne
 * dit « Comfort », c'est ce qui s'affiche, même si une autre a « comfort ».
 */
export function tagCounts(entries: LibraryEntry[]): TagCount[] {
  const seen = new Map<string, TagCount>();

  for (const entry of entries) {
    for (const raw of entry.tags ?? []) {
      const key = raw.toLowerCase();
      const found = seen.get(key);
      if (found) found.count += 1;
      else seen.set(key, { tag: raw, count: 1 });
    }
  }

  return [...seen.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Les entrées portant cette étiquette, les plus récemment modifiées d'abord. */
export function entriesWithTag(entries: LibraryEntry[], tag: string): LibraryEntry[] {
  return entries
    .filter((e) => hasTag(e, tag))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
