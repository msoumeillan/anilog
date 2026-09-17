import { create } from 'zustand';

/**
 * Le mot de confirmation — « Idol was added to “Soirée idols” ».
 *
 * Un geste qui ne change rien À L'ÉCRAN mérite qu'on dise qu'il a eu lieu :
 * cocher une playlist dans une fenêtre, retirer une piste d'une liste qui se
 * contente de raccourcir. Sans ce mot, on reclique pour vérifier — et un second
 * clic sur une case la décoche.
 *
 * UN message à la fois, et le suivant remplace le précédent : ranger la même
 * chanson dans trois playlists d'affilée doit dire la dernière chose faite, pas
 * empiler trois bandeaux qui s'effacent en décalé.
 *
 * Pas persisté : un accusé de réception ne survit pas à ce qu'il accuse.
 */

export interface ToastMessage {
  /** Change à chaque message, même identique : c'est ce qui relance son minuteur. */
  id: number;
  text: string;
}

interface ToastState {
  message: ToastMessage | null;
  show: (text: string) => void;
  /** Efface CE message — et rien, s'il a déjà été remplacé. */
  dismiss: (id: number) => void;
}

let compteur = 0;

export const useToast = create<ToastState>((set, get) => ({
  message: null,

  show(text) {
    compteur += 1;
    set({ message: { id: compteur, text } });
  },

  dismiss(id) {
    /* Par identifiant : le minuteur d'un ancien message ne doit pas effacer le
       nouveau qui l'a remplacé entre-temps. Sans ce garde, cocher deux cases à
       deux secondes d'écart ferait disparaître la seconde confirmation une
       seconde après son apparition. */
    if (get().message?.id === id) set({ message: null });
  },
}));
