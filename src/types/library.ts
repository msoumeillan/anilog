/**
 * Modèle de données AniLog.
 *
 * Ce fichier porte les six décisions structurantes prises avant l'écriture du code.
 * Chacune est coûteuse — voire impossible — à rattraper après coup, parce qu'elle
 * touche des données qu'on ne peut pas reconstruire :
 *
 *   1. `updatedAt` sur chaque entité       → sans lui, aucune synchro possible plus tard
 *   2. clés préfixées par le média         → l'anime 21 et le manga 21 sont deux œuvres
 *   3. `version` + migrations              → sinon le premier changement de schéma casse tout
 *   4. `watchedAt` est une LISTE de dates  → les revisionnages sont des entrées en plus
 *   5. progression polymorphe              → épisodes ≠ chapitres + tomes
 *   6. anime et manga strictement séparés  → une liste appartient à un média et un seul
 */

export const SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────
//  Média et identité
// ─────────────────────────────────────────────────────────────

export type MediaType = 'anime' | 'manga';

/**
 * Clé d'une œuvre dans la bibliothèque : `anime:16498`, `manga:642`.
 * Décision 2 — un identifiant nu serait ambigu entre les deux médias.
 *
 * L'identifiant est celui d'AniList, notre source principale… sauf quand
 * AniList ne connaît pas l'œuvre. Il ne référence AUCUN roman web — mesuré,
 * zéro sur douze titres connus — alors que MangaBaka les a. Ces œuvres-là
 * prennent donc une clé `manga:mb84351`, préfixée par la source.
 *
 * Le type s'élargit de `number` à `string` pour les accueillir. C'est une
 * RELAXATION, pas une migration : toute sauvegarde existante reste valide
 * telle quelle, et `SCHEMA_VERSION` ne bouge donc pas. Le contraire aurait
 * exigé un chemin de migration, et sans lui la bibliothèque se viderait.
 */
export type EntryKey = `${MediaType}:${string}`;

/**
 * Identifiants sur les autres bases. On garde la place même vide :
 * retrouver la correspondance après coup est pénible.
 */
export interface ExternalIds {
  /**
   * AniList — source principale.
   *
   * Absent pour ce qu'AniList ne connaît pas : les romans web, entre autres.
   * Sans lui, pas de personnages ni de staff — c'est lui qui ouvre ce pont.
   */
  anilist?: number;
  /** MangaBaka — porte les œuvres absentes d'AniList, et le pont vers lui. */
  mangaBaka?: number;
  /** MyAnimeList — Jikan (liste d'épisodes, filler, import MAL). */
  mal?: number;
  /** MangaUpdates — plus tard, quand un backend ou une app native lèvera le blocage CORS. */
  mangaUpdates?: number;
}

// ─────────────────────────────────────────────────────────────
//  Suivi
// ─────────────────────────────────────────────────────────────

/**
 * Statuts communs aux deux médias. Seuls les libellés changent à l'affichage :
 * « En cours » / « En lecture », « À voir » / « À lire ».
 */
export type TrackStatus = 'current' | 'completed' | 'planned' | 'paused' | 'dropped';

/** Décision 5 — la progression n'a pas la même forme selon le média. */
export type Progress =
  { kind: 'anime'; episodes: number } | { kind: 'manga'; chapters: number; volumes: number };

/**
 * Suivi d'un épisode. Décision 4 et 6.
 * Un enregistrement n'existe que si l'utilisateur a fait quelque chose avec cet épisode.
 */
export interface EpisodeRecord {
  /**
   * Dates ISO, une par visionnage. Le premier élément est le premier visionnage,
   * les suivants sont les revisionnages. Jamais une date seule : impossible
   * d'ajouter les revisionnages après coup sans perdre l'historique.
   */
  watchedAt: string[];
  /** 1 à 10. */
  score?: number;
  /** Commentaire personnel sur cet épisode. */
  note?: string;
  /** « Épisode marquant » — distinct de la note. */
  favorite?: boolean;
  updatedAt: string;
}

/** Une œuvre suivie. */
export interface LibraryEntry {
  key: EntryKey;
  media: MediaType;
  ids: ExternalIds;

  /**
   * Copie locale de ce qu'il faut pour afficher l'entrée sans réseau.
   * Rafraîchie à chaque fois qu'on voit l'œuvre passer dans une réponse d'API —
   * c'est ce qui remplace l'ancien `loadMissingListImages` et ses N requêtes.
   */
  title: string;
  cover?: string;
  /** Nombre total d'épisodes ou de chapitres, quand il est connu. */
  totalUnits?: number;

  /**
   * De quoi remplir la bulle de survol sans réseau — voir `lib/mediaTip`.
   *
   * Champs optionnels ajoutés après coup, donc SANS changement de version,
   * comme `tags` : une sauvegarde qui ne les a pas se lit telle quelle, et
   * `TrackPanel` les complète à la première visite de la fiche.
   */
  format?: string;
  season?: string;
  seasonYear?: number;
  /** Le studio principal, son nom seul : la bulle n'affiche pas de lien. */
  studio?: string;

  /**
   * Les genres, tels que la source les nomme.
   *
   * Recopiés pour les STATISTIQUES : sans eux, la page ne pouvait rien dire de
   * ce qu'on regarde, seulement de combien. Champ optionnel, donc AUCUNE
   * migration — une sauvegarde qui ne les a pas se lit telle quelle, et les
   * entrées se complètent à la visite de leur fiche.
   */
  genres?: string[];

  /**
   * Anime : la durée d'un épisode en minutes, telle qu'AniList l'annonce.
   *
   * C'est ce qui permet de compter le temps passé sans l'INVENTER. Absente,
   * l'entrée ne compte pas dans ce total et on le dit — voir `timeSpent`.
   */
  duration?: number;

  status: TrackStatus;
  /** Note globale de l'œuvre, 1 à 10. */
  score?: number;
  /** Critique personnelle de l'œuvre entière. */
  review?: string;
  /**
   * Étiquettes personnelles — les siennes, pas celles d'AniList.
   *
   * Champ optionnel ajouté après coup, donc SANS changement de version : une
   * sauvegarde qui ne l'a pas se lit telle quelle. Bumper `SCHEMA_VERSION`
   * sans écrire la migration correspondante viderait la bibliothèque, puisque
   * `migrate` repart de zéro faute de chemin.
   */
  tags?: string[];
  progress: Progress;

  /** Anime uniquement, indexé par numéro d'épisode. Absent tant que rien n'est noté. */
  episodes?: Record<number, EpisodeRecord>;

  startedAt?: string;
  finishedAt?: string;
  addedAt: string;
  /** Décision 1 — arbitre les conflits le jour où plusieurs appareils écrivent. */
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
//  Listes et tier lists
// ─────────────────────────────────────────────────────────────

/**
 * Décision 6 : `media` est fixé à la création et ne change jamais.
 * C'est ce qui rend la séparation stricte structurelle plutôt qu'une règle
 * à faire respecter à chaque ajout.
 */
export interface CustomList {
  id: string;
  media: MediaType;
  name: string;
  description?: string;
  /** Affiche un rang devant chaque entrée. */
  numbered: boolean;
  items: CustomListItem[];
  /** Copies de secours, par clé. Voir `WorkSnapshot`. */
  snapshots?: Record<string, WorkSnapshot>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomListItem {
  key: EntryKey;
  note?: string;
}

/**
 * Le titre et l'affiche d'une œuvre que la bibliothèque NE SUIT PAS.
 *
 * Une liste ne portait d'abord que des clés, et c'était juste tant qu'on n'y
 * rangeait que du suivi : la bibliothèque avait déjà tout, et recopier
 * revenait à se condamner à un titre périmé. On peut désormais y mettre
 * n'importe quelle œuvre du catalogue, suivie ou non — et une clé sans entrée
 * n'a alors rien à montrer.
 *
 * D'où cette copie de SECOURS, gardée par la liste : elle ne sert que
 * lorsqu'aucune entrée n'existe. Si l'œuvre est suivie un jour, c'est la
 * bibliothèque qui reprend la main, et le titre reste à jour.
 *
 * Champ optionnel ajouté après coup : une sauvegarde qui ne l'a pas se lit
 * telle quelle, sans migration.
 */
export interface WorkSnapshot {
  title: string;
  cover?: string;
}

export interface Tier {
  id: string;
  label: string;
  /** Couleur du bandeau, en hexadécimal. */
  color: string;
  items: EntryKey[];
}

export interface TierList {
  id: string;
  media: MediaType;
  name: string;
  tiers: Tier[];
  /** Le vivier non classé. */
  unranked: EntryKey[];
  /** Copies de secours, par clé. Voir `WorkSnapshot`. */
  snapshots?: Record<string, WorkSnapshot>;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
//  Racine
// ─────────────────────────────────────────────────────────────

export interface UserProfile {
  username: string;
  joinedAt: string;
  /**
   * Photo de profil et bannière — des URL d'images DÉJÀ dans la bibliothèque.
   *
   * On les choisit parmi ce qu'on suit plutôt que de les téléverser : pas de
   * fichier à stocker, pas de quota à surveiller, et l'image est déjà en
   * cache. Champs optionnels ajoutés après coup, donc SANS changement de
   * version — une sauvegarde qui ne les a pas se lit telle quelle.
   */
  avatar?: string;
  backdrop?: string;
}

/** Ce qui est persisté. Décision 3 — `version` pilote les migrations. */
export interface LibraryData {
  version: number;
  user: UserProfile;
  entries: Record<EntryKey, LibraryEntry>;
}

export function emptyLibrary(username = ''): LibraryData {
  return {
    version: SCHEMA_VERSION,
    user: { username, joinedAt: new Date().toISOString() },
    entries: {},
  };
}
