import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { envelope, readVersioned } from '../lib/versioned';
import { isSongKey, newId, now, type SongKey } from '../lib/ids';
import type { PlayableSong } from './player';

/**
 * Les playlists : des génériques rangés à la main, dans l'ordre qu'on veut.
 *
 * Store SÉPARÉ, comme les notes et les favoris, et pour la même raison : c'est
 * ce qu'on a DÉCIDÉ, pas ce qu'on a téléchargé. Vider le cache des génériques
 * ne doit pas pouvoir emporter une playlist — et c'est pour ça qu'elle part
 * dans la sauvegarde, là où le cache n'y va pas. Voir `lib/backup`.
 *
 * Les pistes portent un INSTANTANÉ, et c'est l'inverse des listes d'œuvres —
 * voir `store/lists`. Une liste vit à côté de la bibliothèque, qui a déjà le
 * titre et l'affiche ; une playlist range des génériques trouvés n'importe où
 * dans le catalogue, et rien d'autre en local ne sait ce qu'est
 * « song:150672:OP1 ». Sans la copie, la playlist existerait sur le disque et
 * l'écran n'aurait rien à jouer. Même choix, et même forme, que les favoris —
 * voir `store/songs`.
 *
 * La note et l'étoile, elles, ne sont PAS recopiées : elles vivent dans les
 * jugements, et une playlist qui les figerait montrerait une note périmée dès
 * qu'on la change ailleurs.
 */

export const K_PLAYLISTS = 'anilog:playlists';

/**
 * Version du format persisté. À monter en AJOUTANT une migration, jamais en
 * éditant une existante — voir `lib/versioned`.
 *
 * 1 — première forme : `{ [id]: Playlist }`.
 */
const PLAYLISTS_VERSION = 1;

/** Ce qu'il faut pour afficher ET jouer un générique, sans rien redemander. */
export type TrackSnapshot = Omit<PlayableSong, 'key'> & {
  cover?: string | null;
  year?: number;
};

export interface PlaylistTrack {
  key: SongKey;
  addedAt: string;
  song: TrackSnapshot;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  /** Décision 1 — et ce qui range les playlists « récemment modifiées » en tête. */
  updatedAt: string;
  tracks: PlaylistTrack[];
}

type Table = Record<string, Playlist>;

/** Un nom vide ne se retrouve pas dans une liste de playlists. */
function nomPropre(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Untitled playlist';
}

/** Un indice ramené dans les bornes : hors limites, `splice` perdrait l'élément. */
function borne(index: number, longueur: number): number {
  return Math.max(0, Math.min(longueur - 1, index));
}

/**
 * Une piste lue du disque est-elle jouable ?
 *
 * Le disque n'a jamais été vérifié par le compilateur. Une piste sans clé de
 * chanson ou sans lien ne se jouera jamais : on l'écarte à la lecture plutôt
 * que de la traîner jusqu'à un lecteur qui se tairait.
 */
function pisteValide(t: PlaylistTrack | null | undefined): t is PlaylistTrack {
  return (
    Boolean(t) &&
    typeof t?.key === 'string' &&
    isSongKey(t.key) &&
    typeof t.song === 'object' &&
    t.song !== null &&
    typeof t.song.link === 'string' &&
    t.song.link.length > 0
  );
}

interface PlaylistsState {
  hydrated: boolean;
  playlists: Table;

  hydrate: () => Promise<void>;
  /** Crée une playlist — avec, si on la donne, sa première piste — et rend son identifiant. */
  create: (name: string, first?: { key: SongKey; song: TrackSnapshot }) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  /**
   * Ajoute la piste, ou la retire si elle y est déjà. Rend `true` si elle y est
   * APRÈS l'appel — c'est ce que la case à cocher doit afficher.
   */
  toggle: (id: string, key: SongKey, song: TrackSnapshot) => boolean;
  removeTrack: (id: string, key: SongKey) => void;
  /** Déplace une piste d'un rang à un autre. */
  move: (id: string, from: number, to: number) => void;
}

export const usePlaylists = create<PlaylistsState>((set, get) => {
  const write = (table: Table) => {
    set({ playlists: table });
    queueWrite(K_PLAYLISTS, envelope(PLAYLISTS_VERSION, table));
  };

  /** Réécrit UNE playlist, horodatée, et rien si elle n'existe pas. */
  const patch = (id: string, change: (p: Playlist) => Playlist) => {
    const courante = get().playlists[id];
    if (!courante) return;
    write({ ...get().playlists, [id]: { ...change(courante), updatedAt: now() } });
  };

  return {
    hydrated: false,
    playlists: {},

    async hydrate() {
      const raw = await storage.get<unknown>(K_PLAYLISTS);
      const { items, rewrite, recoveredFrom } = readVersioned<Table>({
        raw,
        version: PLAYLISTS_VERSION,
        empty: () => ({}),
        migrations: {},
      });
      if (recoveredFrom) console.warn(`[playlists] repartie de zéro : ${recoveredFrom}`);

      /* Ce qui n'a pas la forme d'une playlist est écarté ; une piste injouable
         aussi, sans emporter le reste de sa playlist — c'est ce qu'on a rangé à
         la main, et une piste abîmée ne vaut pas qu'on perde les vingt autres. */
      const propre: Table = {};
      let retouche = false;
      for (const [id, p] of Object.entries(items)) {
        if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !Array.isArray(p.tracks)) {
          retouche = true;
          continue;
        }
        const tracks = p.tracks.filter(pisteValide);
        if (tracks.length !== p.tracks.length) retouche = true;
        propre[id] = { ...p, id, tracks };
      }

      set({ hydrated: true, playlists: propre });
      if (rewrite || retouche) queueWrite(K_PLAYLISTS, envelope(PLAYLISTS_VERSION, propre), 0);
    },

    create(name, first) {
      const id = newId();
      const horodatage = now();
      write({
        ...get().playlists,
        [id]: {
          id,
          name: nomPropre(name),
          createdAt: horodatage,
          updatedAt: horodatage,
          tracks: first ? [{ key: first.key, addedAt: horodatage, song: first.song }] : [],
        },
      });
      return id;
    },

    rename(id, name) {
      patch(id, (p) => ({ ...p, name: nomPropre(name) }));
    },

    remove(id) {
      if (!get().playlists[id]) return;
      const table = { ...get().playlists };
      delete table[id];
      write(table);
    },

    toggle(id, key, song) {
      const p = get().playlists[id];
      if (!p) return false;
      /* Une piste n'y est qu'UNE fois : l'avoir deux fois est presque toujours
         un double clic, et le retirer alors en enlèverait une sur deux. */
      const dedans = p.tracks.some((t) => t.key === key);
      patch(id, (courante) => ({
        ...courante,
        tracks: dedans
          ? courante.tracks.filter((t) => t.key !== key)
          : [...courante.tracks, { key, addedAt: now(), song }],
      }));
      return !dedans;
    },

    removeTrack(id, key) {
      patch(id, (p) => ({ ...p, tracks: p.tracks.filter((t) => t.key !== key) }));
    },

    move(id, from, to) {
      patch(id, (p) => {
        if (p.tracks.length === 0) return p;
        const depart = borne(from, p.tracks.length);
        const arrivee = borne(to, p.tracks.length);
        if (depart === arrivee) return p;
        const tracks = [...p.tracks];
        const [piste] = tracks.splice(depart, 1);
        if (piste) tracks.splice(arrivee, 0, piste);
        return { ...p, tracks };
      });
    },
  };
});
