import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './Rail.module.css';

/**
 * Un bandeau : une rangée qui file sur le côté.
 *
 * La barre de défilement native est masquée. Elle avait été retirée des
 * personnages pour la même raison : posée sous une rangée d'affiches, elle
 * coupe la page en deux et ne ressemble à rien. Le défilement, lui, reste —
 * à la molette, au doigt, à la flèche.
 *
 * Les flèches n'apparaissent que quand il y a quelque part où aller, et
 * seulement à la souris : au doigt on pousse, et deux boutons posés sur les
 * affiches ne feraient que masquer ce qu'on est venu voir.
 *
 * `scroll-snap` aligne l'arrêt sur une carte : une affiche coupée en deux au
 * bord de l'écran donne l'impression d'un défilement raté.
 */
export function Rail({ children }: { children: ReactNode }) {
  const piste = useRef<HTMLDivElement>(null);
  /* Mesuré à chaque défilement plutôt que deviné : le nombre de cartes
     visibles dépend de la largeur, qui change avec la fenêtre. */
  const [bornes, setBornes] = useState({ debut: true, fin: false });

  const mesurer = (el: HTMLDivElement) => {
    const reste = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setBornes({ debut: el.scrollLeft <= 1, fin: reste <= 1 });
  };

  const pousser = (sens: 1 | -1) => {
    const el = piste.current;
    if (!el) return;
    /* 80 % de la largeur visible : il reste une carte de l'écran précédent,
       de quoi savoir d'où l'on vient. */
    el.scrollBy({ left: sens * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className={styles.wrap}>
      <div
        ref={piste}
        className={styles.track}
        onScroll={(e) => mesurer(e.currentTarget)}
        /* La piste défile aussi au clavier ; sans quoi les cartes hors champ
           ne seraient atteignables qu'à la tabulation aveugle. */
        tabIndex={0}
      >
        {children}
      </div>

      <button
        type="button"
        className={`${styles.arrow} ${styles.left}`}
        aria-label="Scroll left"
        hidden={bornes.debut}
        onClick={() => pousser(-1)}
      >
        <ChevronLeft size={20} strokeWidth={2.2} aria-hidden />
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.right}`}
        aria-label="Scroll right"
        hidden={bornes.fin}
        onClick={() => pousser(1)}
      >
        <ChevronRight size={20} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}
