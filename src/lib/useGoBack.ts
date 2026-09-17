import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Revenir d'où l'on vient, avec un repli.
 *
 * `navigate(-1)` plutôt qu'un lien vers une route fixe : on arrive sur une
 * fiche depuis Browse, un studio, un genre, une fiche personnage… Un lien en
 * dur vers `/browse` casse le fil, et jette au passage les filtres qu'on
 * venait de poser.
 *
 * Le repli sert au cas où il n'y a rien derrière : lien partagé ouvert dans
 * un onglet neuf, ou premier écran de la session. React Router numérote ses
 * entrées d'historique dans `history.state.idx` ; à zéro, il n'y a pas de
 * précédent et reculer ne ferait rien du tout.
 */
export function useGoBack(fallback = '/browse') {
  const navigate = useNavigate();

  return useCallback(() => {
    const index = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof index === 'number' && index > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
