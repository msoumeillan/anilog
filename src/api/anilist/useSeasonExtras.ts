import { useMemo } from 'react';
import { useBrowseInfinite, type BrowseVars, type BrowsePage } from './hooks';
import { inSeason, queryBounds, type SeasonFilter } from '../../lib/season';

/**
 * Les œuvres qu'AniList ne range dans aucune saison.
 *
 * Une saison se demande en DEUX requêtes, et il n'y a pas moyen de faire
 * autrement : AniList ne sait pas poser un « ou » entre un filtre par saison
 * et un filtre par date. Le filtre par saison reste la source qui fait foi —
 * lui seul connaît les fiches rangées sans date exploitable — et cette
 * requête-ci ne va chercher que ce qu'il laisse de côté, les donghua pour
 * l'essentiel.
 *
 * Un hook plutôt que deux copies : la règle a changé trois fois de suite, et
 * Browse et l'accueil devaient être corrigés de concert à chaque fois. La
 * troisième correction n'a d'ailleurs été trouvée que parce que le bug
 * survivait sur la page qu'on avait oubliée.
 */
export function useSeasonExtras(
  filter: SeasonFilter | null,
  vars: BrowseVars,
): BrowsePage['media'] {
  const bounds = filter ? queryBounds(filter) : null;

  const query = useBrowseInfinite(
    {
      ...vars,
      season: undefined,
      seasonYear: undefined,
      startFrom: bounds?.from,
      startTo: bounds?.to,
      /* Le Japon écarté, et c'est ce qui rend une seule page suffisante :
         sans cette exclusion, la fenêtre se remplit de fiches japonaises
         datées à l'année seule — inexploitables pour un trimestre — qui
         repoussent les donghua hors de la première page. Mesuré sur l'automne
         2026 : 50 fiches ramenées, zéro donghua ; avec l'exclusion, 14 fiches
         et rien que des CN et KR.

         Sauf si un pays est demandé, auquel cas c'est lui qui commande. */
      countryNotIn: vars.country ? undefined : ['JP'],
    },
    /* Rien à compléter sans filtre de calendrier : la requête ne part pas. */
    filter !== null,
  );

  /* Mémoïsé : sans ça le `.filter` rend un tableau neuf à chaque rendu, et la
     fusion côté appelant — qui insère un à un dans une liste de plusieurs
     centaines — se referait pour rien. */
  return useMemo(() => {
    if (!filter) return [];
    /* `!m.season` écarte tout ce qu'AniList a rangé : ces fiches-là sont déjà
       dans la liste principale, et mieux rangées. C'est aussi ce qui garantit
       l'absence de doublon entre les deux sources. */
    return (query.data?.pages[0]?.media ?? []).filter((m) => !m.season && inSeason(m, filter));
  }, [query.data?.pages, filter]);
}
