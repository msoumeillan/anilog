import { create } from 'zustand';
import type { SongKey } from '../lib/ids';
import type { ThemeKind } from '../lib/themes';
import { readVolume, saveVolume, type Volume } from '../lib/playback';

/**
 * Ce qui joue, et ce qui suit.
 *
 * PAS persisté, et c'est délibéré : une file de lecture est ce qu'on est en
 * train de faire, pas ce qu'on a décidé. La retrouver au rechargement
 * relancerait une vidéo que personne n'a redemandée — et une vidéo pèse
 * soixante méga-octets. Seul le volume survit, parce que c'est un réglage de
 * l'appareil, pas une écoute en cours.
 *
 * Le store ne garde NI « en lecture », NI la position. Ces deux-là vivent dans
 * l'élément `<video>`, qui en est la seule source de vérité : les dupliquer
 * ici donnerait deux réponses à la même question dès que l'élément change
 * d'état sans nous — une fin de fichier, une autolecture refusée. Le store dit
 * quoi jouer, l'élément dit où on en est.
 */

export interface PlayableSong {
  key: SongKey;
  anilistId: number;
  /** `OP1`, `ED2` — le repère qu'on cherche du regard. */
  slug: string;
  kind: ThemeKind;
  title: string;
  artists: string[];
  anime: string;
  /** L'adresse de la vidéo. Une chanson sans vidéo n'entre pas dans la file. */
  link: string;
}

interface PlayerState {
  queue: PlayableSong[];
  index: number;
  /** Grand lecteur plutôt que barre discrète. */
  expanded: boolean;
  /**
   * Le fichier choisi À LA MAIN, quand ce n'est pas celui qu'on aurait joué.
   *
   * AnimeThemes publie souvent deux fichiers par générique — la diffusion web
   * en 720p, le Blu-ray 1080p sans crédits — et parfois deux versions, l'une
   * remontée en cours de saison. Le choix appartient à CE qu'on écoute : il
   * s'efface dès qu'on change de chanson, sans quoi la piste suivante hériterait
   * d'un lien qui n'est pas le sien.
   */
  source: string | null;
  /**
   * Le volume, et c'est l'exception à la règle du dessus.
   *
   * Il ne peut pas vivre dans l'élément : chaque chanson monte un `<video>`
   * neuf — voir sa clé dans PlayerBar —, qui naît à plein volume. Mesuré avec
   * les commandes natives : réglé à 30 % sur une chanson, il était revenu à
   * 100 % sur la suivante. Le store le retient, le lecteur l'applique à chaque
   * élément qui arrive.
   */
  volume: Volume;

  /**
   * Lancer une file. Rend la copie que le store garde : c'est le ticket
   * qu'attend `extendQueue`.
   */
  play: (queue: readonly PlayableSong[], index: number) => readonly PlayableSong[];
  /**
   * Élargir la file autour de ce qui joue, sans l'interrompre.
   *
   * La table dépliée d'un anime lance SES génériques, qu'elle a sous la main,
   * puis ceux de toute la page arrivent : Oshi no Ko, sa saison 2, sa saison 3.
   * La chanson en cours garde sa place dans la nouvelle file — et le fichier
   * choisi pour elle, puisqu'elle ne change pas.
   *
   * `depuis` est la file que la réponse complète. Remplacée entre-temps — une
   * chanson lancée d'ailleurs, le lecteur fermé —, on ne touche à rien : la
   * réponse arrive trop tard pour la question qu'elle résout.
   */
  extendQueue: (depuis: readonly PlayableSong[], queue: readonly PlayableSong[]) => void;
  next: () => void;
  prev: () => void;
  close: () => void;
  toggleExpanded: () => void;
  setSource: (link: string | null) => void;
  setVolume: (volume: Volume) => void;
  current: () => PlayableSong | undefined;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  expanded: false,
  source: null,
  volume: readVolume(),

  play(queue, index) {
    const rangee = [...queue];
    set({
      queue: rangee,
      index: Math.max(0, Math.min(index, queue.length - 1)),
      source: null,
    });
    return rangee;
  },

  extendQueue(depuis, queue) {
    const { queue: actuelle, index } = get();
    if (actuelle !== depuis) return;
    const enCours = actuelle[index];
    const place = enCours ? queue.findIndex((s) => s.key === enCours.key) : -1;
    if (place < 0) return;
    set({ queue: [...queue], index: place });
  },

  /**
   * La suivante. En BOUCLE sur la fin de file.
   *
   * S'arrêter net après la dernière donnerait l'impression d'une panne ; on
   * revient au début, ce qu'un lecteur de liste fait partout ailleurs.
   */
  next() {
    const { queue, index } = get();
    if (queue.length === 0) return;
    set({ index: (index + 1) % queue.length, source: null });
  },

  /**
   * La précédente. SANS boucle : le début d'une liste est un début.
   *
   * Demandé à l'usage : reculer depuis Idol, premier résultat de « oshi no ko »,
   * menait à No Game No Life — le DERNIER résultat, sans rapport. Avancer boucle
   * parce que la lecture enchaîne toute seule ; reculer est un geste, et au
   * premier morceau il n'y a rien derrière. Le bouton le dit en se grisant.
   */
  prev() {
    const { index } = get();
    if (index === 0) return;
    set({ index: index - 1, source: null });
  },

  close() {
    set({ queue: [], index: 0, expanded: false, source: null });
  },

  toggleExpanded() {
    set({ expanded: !get().expanded });
  },

  setSource(link) {
    set({ source: link });
  },

  setVolume(volume) {
    set({ volume });
    saveVolume(volume);
  },

  current() {
    const { queue, index } = get();
    return queue[index];
  },
}));
