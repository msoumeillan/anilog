/**
 * Fusionner deux listes venues du serveur sous le même tri.
 *
 * Une saison se demande en DEUX requêtes, et il n'y a pas moyen de faire
 * autrement : AniList ne sait pas poser un « ou » entre un filtre par saison
 * et un filtre par date.
 *
 *   - ce qu'AniList a rangé  → filtre par saison, la source qui fait foi
 *   - ce qu'il n'a pas rangé → filtre par date, pour les donghua
 *
 * Le serveur trie chaque liste, jamais leur union. Il faut donc les rabattre
 * l'une dans l'autre ici — quand on a de quoi le faire.
 */

/** Le peu qu'il faut connaître d'une œuvre pour la classer. */
export interface Sortable {
  popularity?: number | null;
  averageScore?: number | null;
  startDate?: { year: number | null; month: number | null; day: number | null } | null;
}

const nombre = (v: number | null | undefined) => v ?? -1;

const dateInt = (d: Sortable['startDate']) =>
  d?.year ? d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0) : -1;

/**
 * Le champ qui porte chaque tri, quand la réponse le contient.
 *
 * `null` marque un tri qu'on ne sait PAS reproduire : « Trending » et
 * « Favourites » se calculent chez AniList à partir de données qui ne sont pas
 * dans la réponse. Inventer un ordre approchant serait pire que d'assumer —
 * dans ces deux cas les œuvres non rangées vont à la fin, et c'est tout.
 */
const PAR_TRI: Record<string, ((a: Sortable, b: Sortable) => number) | null> = {
  POPULARITY_DESC: (a, b) => nombre(b.popularity) - nombre(a.popularity),
  SCORE_DESC: (a, b) => nombre(b.averageScore) - nombre(a.averageScore),
  START_DATE_DESC: (a, b) => dateInt(b.startDate) - dateInt(a.startDate),
  TRENDING_DESC: null,
  FAVOURITES_DESC: null,
};

/**
 * Les deux listes en une seule, dans l'ordre du tri demandé.
 *
 * `main` est déjà trié par le serveur et le reste : on ne le réordonne pas,
 * on y INSÈRE. Sans quoi la liste se réarrangerait sous les yeux à chaque page
 * chargée, et l'affiche qu'on venait de repérer changerait de place.
 */
export function mergeBySort<T extends Sortable>(main: T[], extras: T[], sort: string): T[] {
  if (extras.length === 0) return main;

  const compare = PAR_TRI[sort];
  if (!compare) return [...main, ...extras];

  const out = [...main];
  for (const extra of [...extras].sort(compare)) {
    /* La première position où l'extra passe devant. `findIndex` suffit :
       `main` est trié, donc le premier qui cède est le bon. */
    const at = out.findIndex((m) => compare(extra, m) < 0);
    if (at === -1) out.push(extra);
    else out.splice(at, 0, extra);
  }
  return out;
}
