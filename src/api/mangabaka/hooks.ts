import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  mangaBaka,
  MangaBakaError,
  type MbRelation,
  type MbSearchPage,
  type MbSeries,
  type MbSourceLookup,
} from './client';
import { cataloguePath, displayable, type CatalogueFilters } from '../../lib/mangabakaCatalogue';
import { mbQuickSearchPath } from '../../lib/quickSearch';

/**
 * Le pas du catalogue. Leur recherche accepte jusqu'a 100 ; 30 suffit a une
 * grille.
 *
 * Le pas ne change PAS la profondeur atteignable : leur fenetre de resultats
 * s'arrete a 12 000 lignes quel que soit `limit` — 400 pages a 30, 120 a 100.
 * Au-dela, l'API rend 400 ; on ne l'y envoie jamais, le defilement s'arretant
 * sur le `next` nul que la derniere page renvoie.
 */
const PER_PAGE = 30;

const MINUTE = 60_000;

/* Du REST, pas de texte de requête à empreindre : un compteur manuel, à
   incrémenter quand la forme consommée change. */
const SHAPE = 1;

/**
 * La fiche MangaBaka correspondant à un manga d'AniList.
 *
 * Le pont est direct — `/v1/source/anilist/{id}` — et mesuré : 30 mangas
 * d'AniList sur 30 retrouvés, du plus populaire au plus obscur, en ~110 ms.
 * Rien à faire correspondre nous-mêmes.
 *
 * La réponse rend un TABLEAU : un identifiant source peut théoriquement
 * pointer vers plusieurs fiches. On prend la première et on ne s'invente pas
 * de règle d'arbitrage tant qu'un cas réel ne l'exige pas.
 */
export function useMangaBaka(anilistId: number | undefined) {
  return useQuery({
    queryKey: ['mangabaka', SHAPE, anilistId ?? 0],
    enabled: typeof anilistId === 'number' && anilistId > 0,
    // Notes et éditeurs ne bougent pas dans la journée.
    staleTime: 24 * 60 * MINUTE,
    /* Une fiche absente ne se répare pas en réessayant, et leur backend tombe
       assez souvent pour que leur propre app ait un disjoncteur : on n'insiste
       pas, la section disparaît. */
    retry: (count, error) =>
      !(error instanceof MangaBakaError && error.status === 404) && count < 1,
    queryFn: async ({ signal }): Promise<MbSeries | null> => {
      const res = await mangaBaka<MbSourceLookup>(`/source/anilist/${anilistId}`, signal);
      return res.data?.series?.[0] ?? null;
    },
  });
}

/**
 * Le catalogue MangaBaka, page par page.
 *
 * ESSAI : construit a cote d'AniList pour comparer, sans toucher au schema de
 * la bibliotheque. 303 967 series au 6 septembre 2026, la ou AniList n'a par
 * exemple AUCUN roman web — mesure sur douze titres connus, zero present.
 *
 * Ce nombre-ci est une mesure DATEE, pas une constante : il grandit. Celui que
 * l'ecran affiche vient de `pagination.count`, jamais d'un commentaire.
 */
export function useMbCatalogue(filters: CatalogueFilters) {
  return useInfiniteQuery({
    queryKey: ['mb-catalogue', filters],
    staleTime: 30 * MINUTE,
    initialPageParam: 1,
    retry: (count, error) =>
      !(error instanceof MangaBakaError && error.status === 404) && count < 1,
    queryFn: async ({ pageParam, signal }) => {
      const page = await mangaBaka<MbSearchPage>(
        cataloguePath(pageParam, PER_PAGE, filters),
        signal,
      );
      return {
        series: displayable(page.data),
        total: page.pagination?.count ?? 0,
        hasNext: Boolean(page.pagination?.next),
      };
    },
    getNextPageParam: (last, all) => (last.hasNext ? all.length + 1 : undefined),
  });
}

/**
 * La recherche de l'en-tête, côté manga — le reste passe par `QUICK_SEARCH`
 * chez AniList.
 *
 * Le terme revient AVEC les séries : pendant la frappe, `keepPreviousData`
 * garde les résultats du terme précédent, et c'est avec ce terme-là qu'ils se
 * filtrent — les filtrer avec le nouveau les viderait à chaque lettre.
 *
 * Aucun réessai : si MangaBaka ne répond pas, le panneau prend aussitôt les
 * mangas d'AniList plutôt que d'attendre une deuxième tentative.
 *
 * La page de tous les résultats en demande trente, et sans garder les
 * précédents : une autre recherche est une autre page, et y montrer un instant
 * ceux de la précédente ferait croire qu'ils répondent à la nouvelle.
 */
export function useMbQuickSearch(term: string, { limit = 10, keepPrevious = true } = {}) {
  return useQuery({
    queryKey: ['mb-quick-search', SHAPE, term, limit],
    enabled: term !== '',
    staleTime: 10 * MINUTE,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
    retry: false,
    queryFn: async ({ signal }) => ({
      term,
      series: (await mangaBaka<MbSearchPage>(mbQuickSearchPath(term, limit), signal)).data ?? [],
    }),
  });
}

/** Une fiche du catalogue. */
export function useMbSeries(id: number | undefined) {
  return useQuery({
    queryKey: ['mb-series', id ?? 0],
    enabled: typeof id === 'number' && id > 0,
    staleTime: 6 * 60 * MINUTE,
    retry: (count, error) =>
      !(error instanceof MangaBakaError && error.status === 404) && count < 1,
    queryFn: async ({ signal }) =>
      (await mangaBaka<{ data: MbSeries | null }>(`/series/${id}`, signal)).data,
  });
}

/**
 * Les suites, prequelles, spin-offs et adaptations d'une serie.
 *
 * Une seule requete : ce point d'entree embarque la serie visee, contrairement
 * au champ `relationships_v2` de la fiche, qui n'a que son identifiant.
 */
export function useMbRelations(id: number | undefined) {
  return useQuery({
    queryKey: ['mb-relations', id ?? 0],
    enabled: typeof id === 'number' && id > 0,
    staleTime: 6 * 60 * MINUTE,
    retry: (count, error) =>
      !(error instanceof MangaBakaError && error.status === 404) && count < 1,
    queryFn: async ({ signal }) =>
      (await mangaBaka<{ data: MbRelation[] | null }>(`/series/${id}/relationships`, signal)).data,
  });
}
