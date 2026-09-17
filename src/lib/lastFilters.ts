/**
 * Mémoire des derniers filtres de Browse.
 *
 * Le retour arrière restitue déjà les filtres, puisqu'ils vivent dans l'URL.
 * Ceci couvre l'autre chemin : revenir sur Browse par le menu, ou après un
 * rechargement. Sans ça, poser un filtre puis naviguer ailleurs le perd.
 *
 * `sessionStorage` et non la couche `platform/storage` : ce n'est pas une
 * donnée de bibliothèque. Elle ne doit ni survivre à la fermeture de l'onglet,
 * ni être synchronisée, ni migrer — et il la faut de façon synchrone, avant le
 * premier rendu.
 */

const KEY = 'anilog:browse:filters';

/**
 * Ce qui se retient d'une adresse de Browse : ses filtres et son tri.
 *
 * `media` n'est PAS un filtre de Browse : c'est une autre page.
 *
 * Le manga se parcourt sur `/mangabaka`, et `/browse?media=manga` y renvoie.
 * Un `media=manga` retenu ici rendait donc le Browse anime INATTEIGNABLE :
 * on cliquait « Anime », on arrivait sur `/browse` vide, la memoire y
 * reinjectait `media=manga`, et le renvoi ramenait au catalogue manga. Une
 * boucle, sans la moindre erreur pour la signaler.
 *
 * `search` non plus : la recherche vit dans l'adresse pour survivre au retour
 * arrière, pas pour suivre d'une visite à l'autre. Revenir sur Browse par le
 * menu rouvrirait sinon « gundam » à qui venait parcourir une saison.
 *
 * On les retire des deux cotes : a l'ecriture pour ne plus les retenir, et a
 * la lecture pour desamorcer les memoires deja enregistrees.
 */
function memorisable(query: string): string {
  const p = new URLSearchParams(query);
  p.delete('media');
  p.delete('search');
  return p.toString();
}

/** La chaîne de requête retenue, ou `null`. Vide = filtres effacés exprès. */
export function readLastFilters(): string | null {
  try {
    return memorisable(sessionStorage.getItem(KEY) ?? '') || null;
  } catch {
    // Navigation privée, stockage refusé : on se passe de mémoire.
    return null;
  }
}

export function saveLastFilters(query: string): void {
  try {
    sessionStorage.setItem(KEY, memorisable(query));
  } catch {
    /* Sans effet : la mémoire des filtres n'est pas une fonctionnalité
       critique, et échouer ici ne doit rien casser. */
  }
}
