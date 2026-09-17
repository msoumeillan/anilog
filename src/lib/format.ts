/**
 * Œuvre en une seule pièce ?
 *
 * Un film n'a pas d'épisodes, et proposer d'y « noter l'épisode 1 » n'a pas
 * de sens : c'est l'œuvre qu'on note. Le raisonnement vaut aussi pour un OVA
 * ou un ONA en un épisode — d'où une règle sur le NOMBRE d'unités plutôt
 * qu'une liste de formats à tenir à jour.
 *
 * `format` reste consulté parce qu'un film peut être annoncé sans compte
 * d'épisodes ; les deux signaux se complètent.
 */
export function isSingleUnit(
  format: string | null | undefined,
  units: number | null | undefined,
): boolean {
  return format === 'MOVIE' || units === 1;
}
