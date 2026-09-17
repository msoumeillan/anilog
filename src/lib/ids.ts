import type { EntryKey, MediaType } from '../types/library';

/** `entryKey('anime', 16498)` → `'anime:16498'` */
export function entryKey(media: MediaType, anilistId: number): EntryKey {
  return `${media}:${anilistId}`;
}

/**
 * La clé d'une œuvre qu'AniList ne connaît pas : `manga:mb84351`.
 *
 * Le préfixe `mb` n'est pas décoratif, il rend les deux espaces impossibles à
 * confondre. Sans lui, la série 3397 de MangaBaka — Solo Leveling — et le
 * manga 3397 d'AniList porteraient la même clé, et suivre l'une marquerait
 * l'autre comme suivie.
 *
 * Toujours du manga : MangaBaka ne catalogue rien d'autre.
 */
export function mbEntryKey(mangaBakaId: number): EntryKey {
  return `manga:mb${mangaBakaId}`;
}

/** Ce qu'une clé désigne, et d'où vient son identifiant. */
export type ParsedKey =
  | { media: MediaType; source: 'anilist'; anilistId: number }
  | { media: MediaType; source: 'mangabaka'; mangaBakaId: number };

/** Inverse de `entryKey` et `mbEntryKey`. Renvoie `null` si la clé est malformée. */
export function parseEntryKey(key: string): ParsedKey | null {
  const [media, raw] = key.split(':');
  if ((media !== 'anime' && media !== 'manga') || !raw) return null;

  if (raw.startsWith('mb')) {
    const mangaBakaId = Number(raw.slice(2));
    if (!Number.isInteger(mangaBakaId) || mangaBakaId <= 0) return null;
    /* Un `anime:mb…` n'a aucun sens : MangaBaka ne catalogue que du manga.
       Le refuser ici évite d'avoir à s'en méfier partout ailleurs. */
    if (media !== 'manga') return null;
    return { media, source: 'mangabaka', mangaBakaId };
  }

  const anilistId = Number(raw);
  if (!Number.isInteger(anilistId) || anilistId <= 0) return null;
  return { media, source: 'anilist', anilistId };
}

/**
 * Cette chaîne est-elle une clé d'œuvre ?
 *
 * Un PRÉDICAT plutôt qu'un `as EntryKey` : le compilateur rétrécit parce que
 * la vérification a lieu, au lieu de nous croire sur parole. Sert là où une
 * bibliothèque tierce rend un identifiant nu — dnd-kit, par exemple, qui ne
 * connaît que `string | number`.
 */
export function isEntryKey(value: string): value is EntryKey {
  return parseEntryKey(value) !== null;
}

/**
 * Le type de média d'AniList ramené au nôtre. `null` si ce n'en est pas un.
 *
 * AniList écrit `ANIME` en majuscules là où nos clés sont en minuscules — et
 * un `as MediaType` fabriquerait des clés `ANIME:21` qui ne correspondraient
 * à rien, sans que rien ne le signale. C'est une conversion, pas une
 * promesse : elle doit donc s'écrire une fois, ici.
 */
export function asMedia(type: string | null | undefined): MediaType | null {
  const value = type?.toLowerCase();
  return value === 'anime' || value === 'manga' ? value : null;
}

/** Horodatage ISO — un seul endroit, pour que `updatedAt` soit toujours écrit pareil. */
/**
 * L'identifiant d'une chose créée à la main — une liste, une playlist.
 *
 * `crypto.randomUUID` quand il existe — il n'existe pas hors contexte sûr, et
 * le repli doit rester unique : deux listes créées dans la même milliseconde
 * partageraient sinon leur identifiant, donc leur contenu.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function now(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────
//  Personnages, staff, studios
// ─────────────────────────────────────────────────────────────

/** Ce qui n'est pas une œuvre. Toujours d'AniList : lui seul les catalogue. */
export type PersonKind = 'character' | 'staff' | 'studio';

/** `character:17`, `staff:95269`, `studio:561`. */
export type PersonKey = `${PersonKind}:${number}`;

export function personKey(kind: PersonKind, anilistId: number): PersonKey {
  return `${kind}:${anilistId}`;
}

/**
 * L'identité d'un favori.
 *
 * Une œuvre reprend la clé de la bibliothèque — donc `manga:mb1677` pour ce
 * qu'AniList ignore — et le reste vit dans les espaces d'AniList. C'est
 * DÉLIBÉRÉMENT le même type que `EntryKey` : un favori et une entrée suivie
 * désignent la même œuvre, et deux façons de la nommer finiraient par ne plus
 * se correspondre.
 */
export type FavouriteKey = EntryKey | PersonKey;

/** Ce qu'un favori désigne. `null` si la clé est malformée. */
export function favouriteKindOf(key: string): MediaType | PersonKind | null {
  const [kind, raw] = key.split(':');
  if (kind === 'character' || kind === 'staff' || kind === 'studio') {
    /* Même exigence que `parseEntryKey` : un identifiant vide, nul ou négatif
       ne désigne rien, et l'accepter ferait entrer dans la table une case
       qu'aucun bouton ne pourrait plus retrouver pour l'enlever. */
    const id = Number(raw);
    return raw && Number.isInteger(id) && id > 0 ? kind : null;
  }
  return parseEntryKey(key)?.media ?? null;
}

// ─────────────────────────────────────────────────────────────
//  Chansons
// ─────────────────────────────────────────────────────────────

/**
 * L'identité d'un générique. `song:20755:OP1`.
 *
 * L'anime PUIS son slug chez AnimeThemes, et pas l'identifiant interne de la
 * chanson : le même titre peut servir d'opening à deux séries, et deux séries
 * peuvent partager une chanson sans que ce soit la même entrée pour nous. Ce
 * qu'on note, c'est « l'opening 1 de cet anime-là ».
 *
 * Conséquence assumée, écrite ici pour qu'on ne la découvre pas plus tard : si
 * AnimeThemes renommait un slug — un `OP1` devenu `OP1-TV` —, la note se
 * retrouverait orpheline. Le slug est stable dans les faits, et l'alternative
 * — leur identifiant numérique — casserait au premier remaniement de leur base.
 */
export type SongKey = `song:${number}:${string}`;

export function songKey(anilistId: number, slug: string): SongKey {
  return `song:${anilistId}:${slug}`;
}

/**
 * Relit une clé de chanson. `null` si elle est malformée.
 *
 * Longtemps interne, faute d'appelant. Exportée depuis que la réparation des
 * favoris sans instantané doit retrouver l'anime d'une clé — voir
 * `orphanFavourites`.
 */
export function parseSongKey(key: string): { anilistId: number; slug: string } | null {
  const m = /^song:(\d+):(.+)$/.exec(key);
  if (!m) return null;
  const anilistId = Number(m[1]);
  const slug = m[2];
  if (!Number.isInteger(anilistId) || anilistId <= 0 || !slug) return null;
  return { anilistId, slug };
}

/** Une chaîne quelconque est-elle une clé de chanson ? Prédicat, pas cast. */
export function isSongKey(value: string): value is SongKey {
  return parseSongKey(value) !== null;
}
