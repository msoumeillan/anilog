/**
 * Le classement d'un magazine, préservé.
 *
 * MyAnimeList sait ranger les œuvres d'un magazine par popularité ; AniList
 * sait ouvrir une fiche. La liste vient donc du premier et les fiches du
 * second, et il faut recoller les deux — `idMal_in` rend ce qu'il trouve dans
 * SON ordre, pas dans celui qu'on a demandé.
 */

/**
 * Les œuvres remises dans l'ordre de MyAnimeList.
 *
 * Ce qu'AniList ne connaît pas disparaît, faute d'adresse où l'envoyer : une
 * carte sans fiche ne mène nulle part. Mesuré sur trois magazines, dont 75
 * titres de la Weekly Shounen Jump — 100 % retrouvés, la perte est donc
 * théorique, mais la page ne doit pas trouer le classement le jour où elle
 * survient.
 */
export function inMalOrder<T extends { idMal?: number | null }>(
  media: readonly T[],
  malIds: readonly number[],
): T[] {
  const byMal = new Map<number, T>();
  for (const m of media) {
    if (typeof m.idMal === 'number') byMal.set(m.idMal, m);
  }

  const out: T[] = [];
  for (const id of malIds) {
    const found = byMal.get(id);
    if (found) out.push(found);
  }
  return out;
}
