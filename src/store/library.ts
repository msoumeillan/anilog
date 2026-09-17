import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { migrate } from '../lib/migrate';
import { entryKey, mbEntryKey, now } from '../lib/ids';
import {
  SCHEMA_VERSION,
  type EntryKey,
  type EpisodeRecord,
  type ExternalIds,
  type LibraryEntry,
  type MediaType,
  type TrackStatus,
  type UserProfile,
} from '../types/library';

/**
 * Le store de la bibliothèque.
 *
 * En mémoire, tout est là. Sur disque, chaque entrée a sa propre clé :
 * modifier un anime n'écrit que cet anime. C'est ce qui permet d'encaisser
 * les milliers d'enregistrements par épisode sans geler l'interface.
 */

/* Exportees pour la sauvegarde — voir `lib/backup`, qui a besoin de savoir OU
   les choses sont ecrites sans avoir a redeclarer leurs noms. */
export const K_META = 'anilog:meta';
export const K_ENTRY = 'anilog:entry:';

interface Meta {
  version: number;
  user: UserProfile;
}

interface LibraryState {
  hydrated: boolean;
  user: UserProfile;
  entries: Record<EntryKey, LibraryEntry>;

  hydrate: () => Promise<void>;
  setUsername: (username: string) => void;
  /** Photo de profil et bannière, choisies parmi les jaquettes suivies. */
  setProfileImage: (champ: 'avatar' | 'backdrop', url: string | undefined) => void;

  /** Crée l'entrée si absente, sinon fusionne. Écrit `updatedAt` — décision 1. */
  upsertEntry: (
    media: MediaType,
    anilistId: number,
    patch: Partial<Omit<LibraryEntry, 'key' | 'media' | 'addedAt'>>,
  ) => LibraryEntry;

  /**
   * Ajoute ou complète une œuvre absente d'AniList, par son identifiant
   * MangaBaka. Voir `mbEntryKey` : les deux espaces ne se confondent pas.
   */
  upsertMbEntry: (
    mangaBakaId: number,
    patch: Partial<Omit<LibraryEntry, 'key' | 'media' | 'addedAt'>>,
  ) => LibraryEntry;

  /**
   * Recopie ce qu'il faut pour afficher l'œuvre hors ligne, SANS toucher à
   * `updatedAt`.
   *
   * Rafraîchir ce cache n'est pas un geste de l'utilisateur : ouvrir une fiche
   * ne veut pas dire qu'on y a touché. Or `updatedAt` classe « Last completed »
   * et « Last updated » — le bouger ici faisait remonter en tête une œuvre
   * qu'on avait seulement REGARDÉE.
   *
   * Ne crée rien : on ne suit pas une œuvre en ouvrant sa fiche.
   */
  refreshCache: (key: EntryKey, cache: DisplayCache) => void;

  /**
   * Ecrit plusieurs entrees D'UN COUP. Reservee a l'import.
   *
   * `upsertEntry` en boucle ferait un rendu par oeuvre : sur une liste de mille
   * titres, l'ecran se fige. Ici, un seul `set` et une ecriture differee par
   * entree — la file les fusionne deja par cle.
   *
   * `remplacer` dit quoi faire d'une oeuvre DEJA suivie. Faux par defaut :
   * ecraser une note qu'on a mise ici avec celle d'un export vieux de six mois
   * est une perte que rien n'annonce.
   */
  importEntries: (
    rows: { media: MediaType; anilistId: number; patch: Partial<LibraryEntry> }[],
    remplacer: boolean,
  ) => { ajoutees: number; misesAJour: number; ignorees: number };

  setStatus: (key: EntryKey, status: TrackStatus) => void;
  /** Note de l'œuvre entière, 1 à 10. `undefined` efface la note. */
  setScore: (key: EntryKey, score: number | undefined) => void;
  setReview: (key: EntryKey, review: string) => void;
  /** Remplace les étiquettes personnelles. Déjà normalisées par l'appelant. */
  setTags: (key: EntryKey, tags: string[]) => void;
  /** Déplace la progression au repère donné, sans toucher aux épisodes détaillés. */
  setProgress: (key: EntryKey, units: number) => void;
  /**
   * Les tomes lus, pour le manga seulement.
   *
   * Séparé des chapitres et pas déduit d'eux : on suit souvent les deux à des
   * rythmes différents — les chapitres en ligne, les tomes en volume relié —
   * et un tome n'a pas de nombre de chapitres fixe. Décision 5.
   */
  setVolumes: (key: EntryKey, volumes: number) => void;
  /**
   * Avance ou recule la progression d'un pas, en lisant l'état courant.
   * À préférer à `setProgress(valeurLue + 1)` depuis un composant : plusieurs
   * clics rapides liraient tous la même valeur de rendu et n'en compteraient qu'un.
   */
  bumpProgress: (key: EntryKey, delta: number) => void;
  removeEntry: (key: EntryKey) => void;

  /**
   * Coche ou décoche un épisode.
   * Cocher un épisode déjà vu ajoute une date : c'est un revisionnage — décision 4.
   */
  setEpisodeWatched: (key: EntryKey, episode: number, watched: boolean) => void;
  /**
   * Enregistre un visionnage à la date donnée — aujourd'hui par défaut.
   * Rappelé pour un revisionnage : les dates s'empilent, décision 4.
   */
  logEpisodeWatch: (key: EntryKey, episode: number, at?: string) => void;
  /** Retire un visionnage. Le dernier par défaut. */
  unlogEpisodeWatch: (key: EntryKey, episode: number, index?: number) => void;
  rateEpisode: (key: EntryKey, episode: number, score: number | undefined) => void;
  setEpisodeNote: (key: EntryKey, episode: number, note: string) => void;
  toggleEpisodeFavorite: (key: EntryKey, episode: number) => void;
}

/**
 * Ce qu'une fiche ouverte peut recopier dans l'entrée pour qu'elle s'affiche
 * hors ligne. Tout est optionnel : une fiche ne connaît pas toujours tout.
 */
export interface DisplayCache {
  title?: string;
  cover?: string;
  totalUnits?: number;
  format?: string;
  season?: string;
  seasonYear?: number;
  studio?: string;
  genres?: string[];
  duration?: number;
}

/**
 * Fusionne un correctif dans une entrée, SANS effacer ce qu'il ne porte pas.
 *
 * `{ ...base, ...patch }` ne suffit pas : un champ à `undefined` dans le
 * correctif écrase la valeur d'en dessous. Un import de remplacement dont la
 * source ignore le studio effaçait donc un studio qu'on avait — mesuré, un
 * « Bones » disparu.
 *
 * Un correctif COMPLÈTE : ce qu'il ne dit pas, il ne le dément pas.
 *
 * `Reflect.set` plutôt qu'un `as` : les valeurs viennent déjà d'un
 * `Partial<LibraryEntry>`, elles sont donc du bon type par construction, et
 * l'audit refuse à juste titre qu'on le REPROMETTE avec une conversion.
 */
function fusionner(base: LibraryEntry, patch: Partial<LibraryEntry>): LibraryEntry {
  const defini: Partial<LibraryEntry> = {};
  for (const [champ, valeur] of Object.entries(patch)) {
    if (valeur !== undefined) Reflect.set(defini, champ, valeur);
  }
  return { ...base, ...defini };
}

/**
 * Deux entrées portent-elles exactement la même chose ?
 *
 * `JSON.stringify` et non une comparaison champ par champ : une entrée EST ce
 * qu'on écrit sur le disque, donc du JSON, et une liste de champs à comparer
 * serait un double du type — celui qu'on oublie de mettre à jour en ajoutant
 * un champ. `updatedAt` n'entre pas dans le calcul : il est posé par `commit`,
 * donc après.
 *
 * Les deux objets viennent du même `{ ...e }` : l'ordre des clés est le même,
 * et une clé ajoutée à `undefined` disparaît des deux côtés.
 */
function identique(a: LibraryEntry, b: LibraryEntry): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function blankEntry(media: MediaType, key: EntryKey, ids: ExternalIds): LibraryEntry {
  const ts = now();
  return {
    key,
    media,
    ids,
    title: '',
    status: 'planned',
    progress:
      media === 'anime'
        ? { kind: 'anime', episodes: 0 }
        : { kind: 'manga', chapters: 0, volumes: 0 },
    addedAt: ts,
    updatedAt: ts,
  };
}

export const useLibrary = create<LibraryState>((set, get) => {
  /** Enregistre une entrée en mémoire ET programme son écriture disque. */
  const commit = (entry: LibraryEntry) => {
    const next = { ...entry, updatedAt: now() };
    set((s) => ({ entries: { ...s.entries, [next.key]: next } }));
    queueWrite(K_ENTRY + next.key, next);
    return next;
  };

  /**
   * Applique une transformation à une entrée existante. Ignore si absente.
   *
   * Et n'écrit RIEN quand la transformation ne change rien. Sans cette garde,
   * confirmer une critique qu'on n'a pas touchée repoussait `updatedAt`, et
   * l'œuvre remontait en tête de « Last completed » sans que personne n'ait
   * rien fait. Une écriture doit correspondre à un changement — c'est aussi ce
   * qui évite d'écrire sur le disque pour rien.
   */
  const patchEntry = (key: EntryKey, fn: (e: LibraryEntry) => LibraryEntry) => {
    const current = get().entries[key];
    if (!current) return;
    const suivant = fn(current);
    if (identique(current, suivant)) return;
    commit(suivant);
  };

  /**
   * Déplace le repère de progression après un changement sur un épisode.
   *
   * La progression est un repère, pas un décompte : elle peut avancer avec les
   * boutons +/− sans qu'aucun épisode soit détaillé. Cocher ne fait donc que
   * la tirer vers le haut ; décocher ne la recule que si c'était justement le
   * dernier épisode atteint.
   */
  const moveProgress = (key: EntryKey, episode: number, watched: boolean) => {
    patchEntry(key, (e) => {
      if (e.progress.kind !== 'anime') return e;
      const current = e.progress.episodes;
      const next = watched
        ? Math.max(current, episode)
        : current === episode
          ? episode - 1
          : current;
      return { ...e, progress: { kind: 'anime', episodes: next } };
    });
  };

  /** Modifie l'enregistrement d'un épisode, en le créant au besoin. */
  const patchEpisode = (
    key: EntryKey,
    episode: number,
    fn: (r: EpisodeRecord) => EpisodeRecord,
  ) => {
    patchEntry(key, (e) => {
      const previous: EpisodeRecord = e.episodes?.[episode] ?? { watchedAt: [], updatedAt: now() };
      const record = { ...fn(previous), updatedAt: now() };
      return { ...e, episodes: { ...e.episodes, [episode]: record } };
    });
  };

  return {
    hydrated: false,
    user: { username: '', joinedAt: now() },
    entries: {},

    async hydrate() {
      const rawMeta = await storage.get<Meta>(K_META);
      const { data, changed, recoveredFrom } = migrate(
        rawMeta ? { ...rawMeta, entries: {} } : null,
      );
      if (recoveredFrom) console.warn(`[library] repartie de zéro : ${recoveredFrom}`);

      const stored = await storage.byPrefix<LibraryEntry>(K_ENTRY);
      const entries: Record<EntryKey, LibraryEntry> = {};
      for (const [, entry] of stored) entries[entry.key] = entry;

      set({ hydrated: true, user: data.user, entries });
      if (changed || !rawMeta) {
        queueWrite<Meta>(K_META, { version: SCHEMA_VERSION, user: data.user }, 0);
      }
    },

    setUsername(username) {
      const user = { ...get().user, username };
      set({ user });
      queueWrite<Meta>(K_META, { version: SCHEMA_VERSION, user });
    },

    setProfileImage(champ, url) {
      const user = { ...get().user, [champ]: url };
      set({ user });
      queueWrite<Meta>(K_META, { version: SCHEMA_VERSION, user });
    },

    upsertEntry(media, anilistId, patch) {
      const key = entryKey(media, anilistId);
      const base = get().entries[key] ?? blankEntry(media, key, { anilist: anilistId });
      return commit({ ...fusionner(base, patch), key, media, ids: { ...base.ids, ...patch.ids } });
    },

    upsertMbEntry(mangaBakaId, patch) {
      /* Une œuvre qu'AniList ne connaît pas — un roman web, le plus souvent.
         Toujours du manga : MangaBaka ne catalogue rien d'autre. */
      const key = mbEntryKey(mangaBakaId);
      const base = get().entries[key] ?? blankEntry('manga', key, { mangaBaka: mangaBakaId });
      return commit({
        ...fusionner(base, patch),
        key,
        media: 'manga',
        ids: { ...base.ids, ...patch.ids },
      });
    },

    refreshCache(key, cache) {
      const courante = get().entries[key];
      if (!courante) return;

      /* Champ par champ, et `??` partout : un cache COMPLÈTE ce qu'on sait, il
         ne l'efface jamais. Un `{ ...courante, ...cache }` remettrait à
         `undefined` tout ce que la fiche ouverte ne porte pas — le studio d'un
         manga, la saison d'un film — alors qu'on l'avait. */
      const suivante: LibraryEntry = {
        ...courante,
        title: cache.title ?? courante.title,
        cover: cache.cover ?? courante.cover,
        totalUnits: cache.totalUnits ?? courante.totalUnits,
        format: cache.format ?? courante.format,
        season: cache.season ?? courante.season,
        seasonYear: cache.seasonYear ?? courante.seasonYear,
        studio: cache.studio ?? courante.studio,
        /* Les genres arrivent en bloc ou pas du tout : une fiche les donne
           tous. Pas de fusion des deux listes, qui melangerait le vocabulaire
           d'AniList et celui de MangaBaka dans la meme entree. */
        genres: cache.genres ?? courante.genres,
        duration: cache.duration ?? courante.duration,
      };

      if (identique(courante, suivante)) return;

      /* Volontairement PAS `commit` : lui pose `updatedAt`, et c'est tout ce
         qu'on veut éviter ici. */
      set((s) => ({ entries: { ...s.entries, [key]: suivante } }));
      queueWrite(K_ENTRY + key, suivante);
    },

    importEntries(rows, remplacer) {
      const courant = get().entries;
      const suivant: Record<EntryKey, LibraryEntry> = { ...courant };
      const aEcrire: LibraryEntry[] = [];
      let ajoutees = 0;
      let misesAJour = 0;
      let ignorees = 0;

      for (const row of rows) {
        const key = entryKey(row.media, row.anilistId);
        const existante = courant[key];

        if (existante && !remplacer) {
          ignorees += 1;
          continue;
        }

        const base = existante ?? blankEntry(row.media, key, { anilist: row.anilistId });
        const entree: LibraryEntry = {
          ...fusionner(base, row.patch),
          key,
          media: row.media,
          ids: { ...base.ids, ...row.patch.ids },
          updatedAt: now(),
        };

        suivant[key] = entree;
        aEcrire.push(entree);
        if (existante) misesAJour += 1;
        else ajoutees += 1;
      }

      set({ entries: suivant });
      for (const e of aEcrire) queueWrite(K_ENTRY + e.key, e);

      return { ajoutees, misesAJour, ignorees };
    },

    setStatus(key, status) {
      patchEntry(key, (e) => ({
        ...e,
        status,
        startedAt: status === 'current' && !e.startedAt ? now() : e.startedAt,
        finishedAt: status === 'completed' ? (e.finishedAt ?? now()) : e.finishedAt,
      }));
    },

    setScore(key, score) {
      patchEntry(key, (e) => ({ ...e, score }));
    },

    setReview(key, review) {
      patchEntry(key, (e) => ({ ...e, review: review.trim() || undefined }));
    },

    setTags(key, tags) {
      patchEntry(key, (e) => ({ ...e, tags: tags.length ? tags : undefined }));
    },

    setProgress(key, units) {
      patchEntry(key, (e) => {
        const n = Math.max(0, Math.round(units));
        return {
          ...e,
          progress:
            e.progress.kind === 'anime'
              ? { kind: 'anime', episodes: n }
              : { ...e.progress, chapters: n },
        };
      });
    },

    setVolumes(key, volumes) {
      patchEntry(key, (e) =>
        e.progress.kind === 'manga'
          ? { ...e, progress: { ...e.progress, volumes: Math.max(0, Math.round(volumes)) } }
          : e,
      );
    },

    bumpProgress(key, delta) {
      patchEntry(key, (e) => {
        const current = e.progress.kind === 'anime' ? e.progress.episodes : e.progress.chapters;
        const n = Math.max(0, current + delta);
        return {
          ...e,
          progress:
            e.progress.kind === 'anime'
              ? { kind: 'anime', episodes: n }
              : { ...e.progress, chapters: n },
        };
      });
    },

    removeEntry(key) {
      set((s) => {
        const next = { ...s.entries };
        delete next[key];
        return { entries: next };
      });
      void storage.del(K_ENTRY + key);
    },

    setEpisodeWatched(key, episode, watched) {
      if (watched) get().logEpisodeWatch(key, episode);
      else get().unlogEpisodeWatch(key, episode);
    },

    logEpisodeWatch(key, episode, at) {
      /* Les dates restent triées : un visionnage saisi après coup avec une
         date ancienne n'a pas à passer pour le dernier. */
      patchEpisode(key, episode, (r) => ({
        ...r,
        watchedAt: [...r.watchedAt, at ?? now()].sort(),
      }));
      moveProgress(key, episode, true);
    },

    unlogEpisodeWatch(key, episode, index) {
      let reste = 0;
      patchEpisode(key, episode, (r) => {
        const at = index ?? r.watchedAt.length - 1;
        const watchedAt = r.watchedAt.filter((_, i) => i !== at);
        reste = watchedAt.length;
        return { ...r, watchedAt };
      });
      // La progression ne recule que si l'épisode n'est plus vu du tout.
      if (reste === 0) moveProgress(key, episode, false);
    },

    rateEpisode(key, episode, score) {
      patchEpisode(key, episode, (r) => ({ ...r, score }));
    },

    setEpisodeNote(key, episode, note) {
      patchEpisode(key, episode, (r) => ({ ...r, note: note.trim() || undefined }));
    },

    toggleEpisodeFavorite(key, episode) {
      patchEpisode(key, episode, (r) => ({ ...r, favorite: !r.favorite }));
    },
  };
});

/** Nombre d'épisodes réellement vus (revisionnages non comptés deux fois). */
export function watchedCount(entry: LibraryEntry | undefined): number {
  if (!entry?.episodes) return 0;
  return Object.values(entry.episodes).filter((r) => r.watchedAt.length > 0).length;
}
