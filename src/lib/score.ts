/**
 * Les notes, sur l'echelle que tout le monde lit.
 *
 * AniList et MangaBaka comptent tous deux sur 100 ; MyAnimeList, Kitsu et la
 * plupart des lecteurs comptent sur 10. Une carte affiche donc 8,6 et non 86 :
 * une decimale dit la meme chose, en moins abrupt, et surtout dans l'unite ou
 * l'on a l'habitude de juger une oeuvre.
 *
 * Un seul endroit pour la conversion — la grille, les bandeaux, les rangees de
 * recommandations et la fiche doivent dire le meme nombre.
 */
export function outOfTen(score: number | null | undefined): string | null {
  return typeof score === 'number' && score > 0 ? (score / 10).toFixed(1) : null;
}
