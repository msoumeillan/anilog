import { useQuery } from '@tanstack/react-query';
import { mal, MalError, type MalEpisode, type MalManga, type MalPagination } from './client';

const MINUTE = 60_000;

/* Côté AniList la clé porte l'empreinte du texte de la requête. Ici c'est du
   REST : pas de texte à empreindre, donc un compteur manuel, à incrémenter
   quand la forme de la réponse consommée change. Passé à 3 en ajoutant la
   vignette, le synopsis et la durée que Tenrai apporte — un cache de 24 h
   aurait sinon servi des réponses sans eux. */
const SHAPE = 3;

/**
 * Les deux sources paginent les épisodes par 100 et n'offre aucun moyen d'en demander plus.
 * Une seule page couvrait moins de la moitié de Naruto — et ratait donc la
 * quasi-totalité de ses fillers, qui commencent à l'épisode 136.
 *
 * On boucle donc jusqu'au bout, borné : 12 pages couvrent 1 200 épisodes,
 * soit One Piece avec de la marge. À 300 ms par page chez Tenrai, c'est moins
 * d'une seconde pour une série de 220 épisodes, et le résultat tient 24 h en
 * cache.
 */
const MAX_PAGES = 12;

const keys = {
  episodes: (malId: number) => ['mal', SHAPE, 'episodes', malId] as const,
  manga: (malId: number) => ['mal', SHAPE, 'manga', malId] as const,
};

interface EpisodesPage {
  data: MalEpisode[];
  pagination: MalPagination;
}

export interface EpisodesResult {
  episodes: MalEpisode[];
  /** Vrai si on a arrêté à la limite : la fin de la liste manque. */
  truncated: boolean;
}

export function useMalEpisodes(malId: number | null | undefined) {
  return useQuery({
    queryKey: keys.episodes(malId ?? 0),
    enabled: typeof malId === 'number' && malId > 0,
    staleTime: 24 * 60 * MINUTE,
    /* Un 504 veut dire que la source n'atteint pas MAL — parfois pendant des
       jours chez Jikan. Le client a déjà essayé les deux sources : insister
       ne ferait que retarder l'aveu. */
    retry: (count, error) => {
      if (error instanceof MalError && error.upstreamDown) return false;
      return count < 1;
    },
    queryFn: async ({ signal }): Promise<EpisodesResult> => {
      const episodes: MalEpisode[] = [];
      let page = 1;
      let hasNext = true;

      while (hasNext && page <= MAX_PAGES) {
        try {
          const res = await mal<EpisodesPage>(`/anime/${malId}/episodes?page=${page}`, signal);
          episodes.push(...res.data);
          hasNext = res.pagination?.has_next_page ?? false;
          page++;
        } catch (error) {
          /* Une page qui tombe ne doit pas emporter les précédentes. Jikan
             servait les huit premières pages de One Piece puis répondait 504
             sur la neuvième, de façon persistante : sans ça, 800 épisodes déjà
             obtenus étaient jetés et la page restait vide. */
          if (signal?.aborted || episodes.length === 0) throw error;
          return { episodes, truncated: true };
        }
      }

      return { episodes, truncated: hasNext };
    },
  });
}

/**
 * La fiche manga de MyAnimeList, pour le magazine de prépublication.
 *
 * Une œuvre ne change pas de magazine souvent, et jamais entre deux visites :
 * le cache tient une journée comme celui des épisodes.
 */
export function useMalManga(malId: number | null | undefined) {
  return useQuery({
    queryKey: keys.manga(malId ?? 0),
    enabled: typeof malId === 'number' && malId > 0,
    staleTime: 24 * 60 * MINUTE,
    retry: (count, error) => {
      if (error instanceof MalError && error.upstreamDown) return false;
      return count < 1;
    },
    queryFn: async ({ signal }) => (await mal<{ data: MalManga }>(`/manga/${malId}`, signal)).data,
  });
}
