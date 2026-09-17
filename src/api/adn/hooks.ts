import { useQueries } from '@tanstack/react-query';
import { adn, AdnError, type AdnCalendar, type AdnVideo } from './client';

const MINUTE = 60_000;

/* Du REST, pas de texte de requête à empreindre : un compteur manuel, à
   incrémenter quand la forme consommée change. */
const SHAPE = 1;

/**
 * Les sorties françaises d'une semaine.
 *
 * SEPT requêtes, une par jour : leur point d'entrée ne prend qu'une date. C'est
 * le prix, et il est modeste — ~150 ms chacune, sérialisées par le créneau du
 * client, et chaque jour est mis en cache séparément. Changer de semaine ne
 * redemande donc que ce qu'on n'a pas encore vu.
 *
 * `useQueries` et non une requête unique qui bouclerait : un jour qui tombe
 * n'emporte pas les six autres, et la grille se remplit au fur et à mesure au
 * lieu d'attendre la dernière réponse.
 *
 * Une journée passée ne bouge plus ; une journée à venir peut voir une heure
 * changer. Une heure de cache couvre les deux sans insister.
 */
export function useAdnWeek(dayKeys: readonly string[], enabled: boolean) {
  return useQueries({
    queries: dayKeys.map((jour) => ({
      queryKey: ['adn', 'calendar', SHAPE, jour],
      enabled,
      staleTime: 60 * MINUTE,
      /* Leur API tombe comme les autres, et la grille se lit très bien sans la
         mention française : on n'insiste pas. Un 4xx ne se répare pas en
         réessayant — une date qu'ils refusent restera refusée. */
      retry: (count: number, error: Error) =>
        !(error instanceof AdnError && error.status >= 400 && error.status < 500) && count < 1,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<AdnVideo[]> =>
        (await adn<AdnCalendar>(`/video/calendar?date=${jour}`, signal)).videos ?? [],
    })),
    combine: (results) => ({
      videos: results.flatMap((r) => r.data ?? []),
      loading: results.some((r) => r.isLoading),
      /* Une journée en panne sur sept ne vaut pas un message d'erreur : la
         grille reste juste, il lui manque une mention. */
      failed: results.filter((r) => r.isError).length,
    }),
  });
}
