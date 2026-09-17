import { useInfiniteQuery } from '@tanstack/react-query';
import { mal, MalError, type MalMangaPage } from '../mal/client';
import { anilist } from '../anilist/client';
import { MAGAZINE_MEDIA } from '../anilist/queries';
import type { BrowsePage } from '../anilist/hooks';
import { inMalOrder } from '../../lib/magazine';
import { magazinePath, type MagazineFilters } from '../../lib/magazineFilters';

/**
 * Les œuvres d'un magazine de prépublication.
 *
 * Le seul hook de l'app qui interroge DEUX sources pour une seule liste, et
 * c'est le sujet qui l'impose : AniList n'a aucune notion de sérialisation —
 * vérifié par introspection du type `Media` — quand MyAnimeList sait ranger
 * les 823 titres de la Weekly Shounen Jump, de les trier et de les filtrer.
 * L'un a le classement, l'autre a les fiches.
 *
 * Deux requêtes par page, donc, enchaînées : la liste, puis les fiches
 * correspondantes en UN appel grâce à `idMal_in`. Mesuré : 100 % des titres
 * retrouvés sur trois magazines, dont 75 d'affilée sur la Shounen Jump.
 */

const MINUTE = 60_000;

/**
 * Le pas de MyAnimeList. Il plafonne à 25 par page, et c'est aussi ce
 * qu'AniList accepte de recevoir sans broncher dans un `idMal_in`.
 */
const PER_PAGE = 25;

/** Un magazine ne change pas de catalogue dans la journée. */
const STALE = 6 * 60 * MINUTE;

/** Ce que la page consomme : les mêmes champs que Browse, sans la diffusion. */
export type MagazineMedia = Omit<BrowsePage['media'][number], 'nextAiringEpisode'>;

export interface MagazineSlice {
  media: MagazineMedia[];
  hasNext: boolean;
  /** Ce que MyAnimeList compte pour ce magazine, tous titres confondus. */
  total: number;
}

export function useMagazine(malId: number | undefined, filters: MagazineFilters) {
  return useInfiniteQuery({
    /* Les filtres entrent dans la clé : ils partent au serveur, donc changer
       l'un d'eux demande une autre liste, pas un autre affichage de la même. */
    queryKey: ['magazine', malId ?? 0, filters],
    enabled: typeof malId === 'number' && malId > 0,
    staleTime: STALE,
    initialPageParam: 1,
    retry: (count, error) => {
      if (error instanceof MalError && error.upstreamDown) return false;
      return count < 1;
    },
    queryFn: async ({ pageParam, signal }): Promise<MagazineSlice> => {
      const list = await mal<MalMangaPage>(
        magazinePath(malId ?? 0, pageParam, PER_PAGE, filters),
        signal,
      );

      const ids = list.data.map((m) => m.mal_id).filter((id) => typeof id === 'number');
      const total = list.pagination.items?.total ?? 0;

      /* Une page vide arrête la pagination ici : demander la suivante ne
         ramènerait rien de plus. */
      if (ids.length === 0) return { media: [], hasNext: false, total };

      const d = await anilist<{ Page: { media: MagazineMedia[] } }>(
        MAGAZINE_MEDIA,
        { idMal: ids },
        signal,
      );

      return {
        media: inMalOrder(d.Page.media, ids),
        hasNext: list.pagination.has_next_page,
        total,
      };
    },
    getNextPageParam: (last, all) => (last.hasNext ? all.length + 1 : undefined),
  });
}
