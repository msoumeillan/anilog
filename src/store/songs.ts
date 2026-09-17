import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { envelope, readVersioned } from '../lib/versioned';
import { isSongKey, now, type SongKey } from '../lib/ids';
import type { PlayableSong } from './player';

/**
 * Ce qu'on pense des génériques.
 *
 * Store SÉPARÉ du catalogue — voir `store/themes`, qui est un cache. Celui-ci
 * est précieux : une note et un favori ne se redemandent à personne. Vider le
 * cache doit pouvoir se faire sans y penser, et ce fichier est la raison pour
 * laquelle on peut.
 *
 * C'est le même partage que `store/artwork` fait avec la bibliothèque : ce
 * qu'on a CHOISI ne vit pas au même endroit que ce qu'on a téléchargé.
 */

export const K_SONGS = 'anilog:songs';

/** Version du format persisté. Décision 3 — voir `lib/versioned`. */
const SONGS_VERSION = 1;

export interface SongJudgement {
  /** 1 à 10, comme partout ailleurs dans l'app. */
  score?: number;
  favourite?: boolean;
  updatedAt: string;
  /**
   * De quoi réafficher la chanson quand rien d'autre ne la connaît.
   *
   * Depuis que la recherche va chercher dans TOUT le catalogue, on peut noter
   * un générique d'une série qu'on ne suit pas : sans cette recopie, le favori
   * existerait sur le disque et l'écran n'aurait rien à en montrer. Même
   * raison, et même forme, que les instantanés des listes — voir `store/lists`.
   *
   * Le store la prend lui-même sur la chanson qu'on lui passe. Elle se passait
   * à part, et c'était pouvoir l'oublier — mesuré : l'étoile du lecteur
   * l'oubliait, et ses favoris restaient invisibles, « 0 starred » sur une
   * table qui en contenait. Ceux-là se réparent — voir `restoreSnapshots`.
   */
  snapshot?: Omit<PlayableSong, 'key'>;
}

type Table = Record<string, SongJudgement>;

interface SongsState {
  hydrated: boolean;
  songs: Table;

  hydrate: () => Promise<void>;
  setScore: (song: PlayableSong, score: number | undefined) => void;
  toggleFavourite: (song: PlayableSong) => void;
  /**
   * Donner leur instantané aux avis qui n'en ont pas.
   *
   * Pour les favoris posés avant que le store le prenne lui-même : on retrouve
   * la chanson au catalogue, et on la recopie. Ni la note, ni l'étoile, ni la
   * date ne bougent — réparer n'est pas juger.
   */
  restoreSnapshots: (songs: readonly PlayableSong[]) => void;
  judgement: (key: SongKey) => SongJudgement | undefined;
}

/**
 * L'instantané d'une chanson : ses champs de `PlayableSong`, et eux seuls.
 *
 * Recopiés un par un plutôt qu'étalés : ce qu'on reçoit est souvent une LIGNE,
 * avec sa note, son étoile et son affiche. Les étaler figerait dans
 * l'instantané une note que l'avis porte déjà — et qui divergerait à la
 * prochaine.
 */
function snapshotOf(song: PlayableSong): Omit<PlayableSong, 'key'> {
  return {
    anilistId: song.anilistId,
    slug: song.slug,
    kind: song.kind,
    title: song.title,
    artists: song.artists,
    anime: song.anime,
    link: song.link,
  };
}

export const useSongs = create<SongsState>((set, get) => {
  /**
   * Écrit une clé, et retire l'entrée quand elle ne dit plus rien.
   *
   * Sans ce nettoyage, retirer une note laisserait une ligne vide par chanson
   * touchée : la table grossirait de tout ce qu'on a seulement essayé.
   */
  const put = (key: SongKey, patch: Partial<SongJudgement>) => {
    const courant = get().songs[key];
    const suivant: SongJudgement = { ...courant, ...patch, updatedAt: now() };

    const vide = suivant.score === undefined && !suivant.favourite;
    const table = { ...get().songs };
    if (vide) delete table[key];
    else table[key] = suivant;

    set({ songs: table });
    queueWrite(K_SONGS, envelope(SONGS_VERSION, table));
  };

  return {
    hydrated: false,
    songs: {},

    async hydrate() {
      const raw = await storage.get<unknown>(K_SONGS);
      const { items, rewrite, recoveredFrom } = readVersioned<Table>({
        raw,
        version: SONGS_VERSION,
        empty: () => ({}),
        migrations: {},
      });
      if (recoveredFrom) console.warn(`[songs] repartie de zéro : ${recoveredFrom}`);

      /* Les clés du disque n'ont jamais été vérifiées par le compilateur : on
         écarte ce qui n'est pas une clé de chanson plutôt que de le traîner.
         C'est la leçon des favoris, dont une migration entière a servi à
         réparer des clés qu'on avait crues bonnes. */
      const propre: Table = {};
      for (const [key, valeur] of Object.entries(items)) {
        if (isSongKey(key) && valeur && typeof valeur === 'object') propre[key] = valeur;
      }

      set({ hydrated: true, songs: propre });
      if (rewrite || Object.keys(propre).length !== Object.keys(items).length) {
        queueWrite(K_SONGS, envelope(SONGS_VERSION, propre));
      }
    },

    setScore(song, score) {
      // Recliquer la même note l'enlève, comme sur la fenêtre de suivi.
      put(song.key, {
        score: score === get().songs[song.key]?.score ? undefined : score,
        /* L'instantané ne s'écrase pas : celui qu'on a déjà vient d'un moment
           où la chanson était sous les yeux, celui-ci aussi, et les deux se
           valent. Garder le premier évite une écriture pour rien. */
        snapshot: get().songs[song.key]?.snapshot ?? snapshotOf(song),
      });
    },

    toggleFavourite(song) {
      put(song.key, {
        favourite: !get().songs[song.key]?.favourite,
        snapshot: get().songs[song.key]?.snapshot ?? snapshotOf(song),
      });
    },

    restoreSnapshots(songs) {
      const table = { ...get().songs };
      let repare = false;
      for (const song of songs) {
        const avis = table[song.key];
        if (!avis || avis.snapshot) continue;
        table[song.key] = { ...avis, snapshot: snapshotOf(song) };
        repare = true;
      }
      if (!repare) return;
      set({ songs: table });
      queueWrite(K_SONGS, envelope(SONGS_VERSION, table));
    },

    judgement(key) {
      return get().songs[key];
    },
  };
});
