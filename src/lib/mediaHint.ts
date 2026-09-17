/**
 * Le peu qu'on sait déjà d'une œuvre avant de l'avoir demandée.
 *
 * L'API GraphQL d'AniList met 2 à 3 secondes à répondre — mesuré, et
 * incompressible : elle met déjà 865 ms à renvoyer `{id}` seul, contre 161 ms
 * pour TMDB et 25 ms pour son propre CDN d'images. Ce n'est ni la taille de la
 * requête ni la connexion, c'est leur serveur.
 *
 * Mais quand on clique sur une carte, son titre et son affiche sont sous les
 * yeux : les redemander pour les réafficher trois secondes plus tard n'a aucun
 * sens. La carte les emporte donc dans l'état de navigation, et la fiche les
 * peint tout de suite.
 *
 * Zéro requête de plus, et le budget d'AniList — 30 par minute — est intact.
 */

export interface MediaHint {
  title: string;
  cover?: string;
}

/**
 * Lit un indice depuis `history.state`, qui n'est pas de confiance.
 *
 * L'utilisateur peut arriver par une URL collée, un rechargement, un retour
 * arrière, ou une entrée d'historique écrite par une ANCIENNE version de
 * l'app. On valide donc au lieu de caster : un indice mal formé doit se
 * comporter comme un indice absent, jamais faire tomber la page.
 */
export function readHint(state: unknown): MediaHint | null {
  if (typeof state !== 'object' || state === null) return null;

  /* L'opérateur `in` plutôt qu'un cast : il fait le rétrécissement de type
     ET la vérification à l'exécution d'un seul geste, là où un
     `as Record<string, unknown>` ne ferait que faire taire le compilateur sur
     une valeur dont on ne sait justement rien. */
  if (!('title' in state)) return null;
  const title = state.title;
  if (typeof title !== 'string' || !title.trim()) return null;

  const cover = 'cover' in state ? state.cover : undefined;
  return { title, cover: typeof cover === 'string' && cover ? cover : undefined };
}
