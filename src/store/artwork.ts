import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { envelope, readVersioned } from '../lib/versioned';
import { asMedia, entryKey } from '../lib/ids';
import { artUrl, type ArtSize } from '../lib/artwork';
import type { EntryKey, MediaType } from '../types/library';

/**
 * Les affiches et arrière-plans choisis à la main.
 *
 * Store SÉPARÉ de la bibliothèque, et c'est une décision, pas un hasard :
 * changer l'affiche d'un anime ne doit pas l'ajouter à sa liste. On peut
 * vouloir habiller une fiche qu'on ne suit pas — et l'inverse, ajouter une
 * entrée en fond parce qu'on a cliqué sur une image, serait un effet de bord
 * qu'aucun bouton n'a annoncé.
 *
 * Conséquence : `removeEntry` n'efface pas le choix d'image. Retirer un anime
 * de sa bibliothèque puis l'y remettre lui rend l'affiche qu'on lui avait
 * donnée, ce qui est le comportement qu'on attend d'un réglage d'apparence.
 *
 * On garde le CHEMIN TMDB, pas une URL : voir `ArtSize` dans `lib/artwork`.
 */

export const K_ART = 'anilog:artwork';

/**
 * Version du format persisté. Décision 3 — voir `lib/versioned`.
 *
 * 1 — enveloppe `{ version, items }`. Les clés ne bougent pas : elles
 * passaient déjà par `entryKey`, ce store-là n'a jamais eu le défaut
 * d'identité des favoris.
 */
const ART_VERSION = 1;

export interface Artwork {
  /** Chemin TMDB de l'affiche choisie. Absent = celle d'AniList. */
  poster?: string;
  /** Chemin TMDB de l'arrière-plan choisi. Absent = celui d'AniList. */
  backdrop?: string;
}

type Table = Record<string, Artwork>;

interface ArtworkState {
  hydrated: boolean;
  art: Table;

  hydrate: () => Promise<void>;
  setPoster: (key: EntryKey, path: string | undefined) => void;
  setBackdrop: (key: EntryKey, path: string | undefined) => void;
  /** Rend l'œuvre à ses images d'origine. */
  reset: (key: EntryKey) => void;
}

export const useArtwork = create<ArtworkState>((set, get) => {
  /**
   * Écrit une clé, et retire l'entrée quand elle ne dit plus rien.
   *
   * Sans ce nettoyage, revenir aux images d'origine laisserait un `{}` par
   * œuvre visitée : la table grossirait de tout ce qu'on a seulement regardé.
   */
  const patch = (key: EntryKey, change: Artwork) => {
    const next: Table = { ...get().art };
    const merged = { ...next[key], ...change };

    if (merged.poster || merged.backdrop) next[key] = merged;
    else delete next[key];

    set({ art: next });
    queueWrite(K_ART, envelope(ART_VERSION, next));
  };

  return {
    hydrated: false,
    art: {},

    async hydrate() {
      const { items, rewrite, recoveredFrom } = readVersioned<Table>({
        raw: await storage.get<unknown>(K_ART),
        version: ART_VERSION,
        empty: () => ({}),
        /* Rien à convertir : la version 0 est la même table, sans enveloppe. */
        migrations: { 0: (items) => items ?? {} },
      });
      if (recoveredFrom) console.warn(`[artwork] ${recoveredFrom}`);

      set({ hydrated: true, art: items });
      if (rewrite) queueWrite(K_ART, envelope(ART_VERSION, items), 0);
    },

    setPoster(key, path) {
      patch(key, { poster: path });
    },

    setBackdrop(key, path) {
      patch(key, { backdrop: path });
    },

    reset(key) {
      patch(key, { poster: undefined, backdrop: undefined });
    },
  };
});

/**
 * Les images choisies pour une œuvre, ou `undefined`.
 *
 * Passe par la clé préfixée — décision 2 : l'anime 21 et le manga 21 sont
 * deux œuvres, et rien ne dit qu'on veut la même affiche pour les deux.
 */
export function useArtworkFor(media: MediaType, id: number): Artwork | undefined {
  return useArtwork((s) => s.art[entryKey(media, id)]);
}

/**
 * Les images choisies pour une clé DÉJÀ CONSTRUITE.
 *
 * `useArtworkFor` reconstruit la clé depuis un média et un identifiant
 * AniList ; c'est faux partout où l'identifiant vient d'ailleurs — une œuvre
 * MangaBaka, un favori — et c'est ce qui faisait qu'une affiche choisie ne
 * s'affichait ni dans les listes ni dans les favoris, alors qu'elle
 * s'affichait sur les cartes du profil.
 *
 * Quand l'appelant TIENT la clé, il n'a rien à reconstruire.
 */
export function useArtworkKey(key: EntryKey | undefined): Artwork | undefined {
  return useArtwork((s) => (key ? s.art[key] : undefined));
}

/**
 * De quoi résoudre l'affiche de plusieurs œuvres d'un coup.
 *
 * Rend une fonction plutôt qu'une URL : une grille en affiche des dizaines, et
 * un hook ne s'appelle pas dans une boucle. Le repli reste l'image d'AniList,
 * si bien qu'un site d'affichage n'a pas à savoir qu'un choix existe.
 */
export function useResolvePoster(size: ArtSize = 'w342') {
  const art = useArtwork((s) => s.art);
  /* `string` et non `MediaType` : les sites d'appel tiennent le type brut
     d'AniList, en majuscules. `asMedia` le ramène une fois pour toutes. */
  return (type: string | null | undefined, id: number, fallback: string | null | undefined) => {
    const media = asMedia(type);
    return (media && artUrl(art[entryKey(media, id)]?.poster, size)) || fallback || undefined;
  };
}
