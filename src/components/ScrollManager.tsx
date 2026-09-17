import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { asksScrollToTop } from '../lib/routes';

/**
 * Position de défilement à la navigation.
 *
 * Une application classique fait ça toute seule ; une SPA non — on change de
 * page sans que le document bouge, et on arrive donc au milieu de la nouvelle,
 * à la hauteur où on avait laissé la précédente.
 *
 * Trois cas, et ce sont les distinctions qui comptent :
 *
 *   changement de CHEMIN      → on remonte en haut
 *   retour arrière (POP)      → on restaure la position quittée
 *   même chemin, autre QUERY  → on ne touche à rien
 *
 * … sauf quand la navigation demande le haut — `SCROLL_TO_TOP`, dans
 * `lib/routes` : une recherche relancée garde le chemin `/search`, mais c'est
 * une autre page.
 *
 * Le dernier est celui qui manquait, et il se voyait : régler un filtre écrit
 * dans l'adresse — un statut dans la bibliothèque, une saison sur Browse, une
 * étiquette — et l'app renvoyait en haut de page à chaque clic. On juge un
 * filtre sur ce qu'il change SOUS LES YEUX ; remonter oblige à redescendre
 * pour voir le résultat, et à recommencer au bouton suivant.
 *
 * Une `query` qui bouge n'est donc pas une navigation, même quand le routeur
 * en fait une entrée d'historique : c'est un réglage de la page où l'on est.
 *
 * Le retour arrière reste indispensable : revenir de la fiche vers Browse
 * après avoir chargé cent cartes ramènerait tout en haut, ce qui est
 * précisément le reproche fait au défilement infini.
 *
 * Les positions vivent en mémoire, indexées par la clé d'entrée d'historique :
 * elles sont propres à la session, ce qui est le bon périmètre.
 */

const positions = new Map<string, number>();

export function ScrollManager() {
  const { key, pathname, state } = useLocation();
  const navigationType = useNavigationType();

  /* Le chemin du rendu précédent. C'est lui, et non la clé d'historique, qui
     dit si on a change de PAGE : le routeur donne une clé neuve a chaque
     navigation, y compris quand seule la query bouge. */
  const chemin = useRef<string | null>(null);

  // Suit la position de la page courante, et la fige en la quittant.
  useEffect(() => {
    const remember = () => positions.set(key, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      remember();
      window.removeEventListener('scroll', remember);
    };
  }, [key]);

  useLayoutEffect(() => {
    const memePage = chemin.current === pathname;
    chemin.current = pathname;

    /* Un filtre changé sur place : on laisse la page exactement où elle est.
       Sauf si la navigation demande le haut — une recherche relancée. */
    if (memePage && navigationType !== 'POP' && !asksScrollToTop(state)) return;

    const target = navigationType === 'POP' ? (positions.get(key) ?? 0) : 0;
    window.scrollTo(0, target);

    /* Au retour, le contenu revient du cache mais sa hauteur n'est pas
       toujours acquise au premier rendu — images, polices, sections qui
       s'étendent. On réessaie sur les frames suivantes tant que le document
       est trop court pour atteindre la position visée. */
    if (target === 0) return;
    let frames = 0;
    let raf = 0;
    const retry = () => {
      if (Math.abs(window.scrollY - target) > 2 && frames < 12) {
        window.scrollTo(0, target);
        frames++;
        raf = requestAnimationFrame(retry);
      }
    };
    raf = requestAnimationFrame(retry);
    return () => cancelAnimationFrame(raf);
  }, [key, pathname, navigationType, state]);

  return null;
}
