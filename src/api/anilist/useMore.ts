import { useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { anilist } from './client';
import { fingerprint } from '../../lib/fingerprint';
import { AUTO_PAGES } from '../../lib/paging';

/**
 * Charge la suite d'une connexion imbriquée AniList.
 *
 * Ces connexions plafonnent à 25 éléments par page. Les fiches embarquent
 * déjà la page 1 dans leur requête principale ; ce hook ne sert qu'à la
 * suite, à partir de la page 2.
 *
 * Ne pas fusionner ces requêtes dans la requête principale est délibéré :
 * avec un quota de 30 requêtes par minute, trois appels par fiche au lieu
 * d'un ferait tomber de 30 à 10 le nombre de fiches consultables.
 *
 * Le hook ne s'occupe que de la donnée. Le déclenchement au défilement est
 * le travail du composant `AutoLoad`, à poser après la liste — et seulement
 * en fin de page.
 */

/**
 * Une connexion paginée AniList.
 *
 * `edges` ou `nodes` selon la requête — AniList expose les deux formes, et
 * le hook accepte l'une ou l'autre plutôt que d'imposer un adaptateur à
 * chaque appelant.
 */
export interface Connection<T> {
  pageInfo: { hasNextPage: boolean };
  edges?: T[];
  nodes?: T[];
}

export function useMore<Resp, T>(opts: {
  /** Partie sémantique de la clé. L'empreinte de la requête y est ajoutée ici. */
  queryKey: readonly unknown[];
  query: string;
  variables: Record<string, unknown>;
  /**
   * Chemin vers la connexion dans la réponse.
   *
   * Annoter le paramètre — `(d: AnimeCharactersPage) => d.Media.characters` —
   * suffit à inférer les deux types. C'est ce qui remplace le `as` qui traînait
   * ici : un cast est une promesse que personne ne vérifie, et c'est
   * exactement ainsi qu'un changement de requête devenait un plantage à
   * l'exécution plutôt qu'une erreur de compilation.
   */
  connection: (data: Resp) => Connection<T>;
  /** `hasNextPage` de la page 1, déjà présente dans la fiche. */
  hasMoreInitially: boolean;
  /** La section est-elle en fin de page ? Sinon, bouton uniquement. */
  auto?: boolean;
}) {
  const [started, setStarted] = useState(false);

  const q = useInfiniteQuery({
    /* L'empreinte de la requête fait partie de la clé : modifier la requête
       invalide le cache sans que personne ait à y penser. */
    queryKey: ['anilist', 'pages', fingerprint(opts.query), ...opts.queryKey],
    enabled: started,
    staleTime: 6 * 60 * 60_000,
    initialPageParam: 2,
    queryFn: async ({ pageParam, signal }) => {
      const data = await anilist<Resp>(opts.query, { ...opts.variables, page: pageParam }, signal);
      const c = opts.connection(data);
      return { hasNextPage: c.pageInfo.hasNextPage, items: c.edges ?? c.nodes ?? [] };
    },
    getNextPageParam: (last, all) => (last.hasNextPage ? all.length + 2 : undefined),
  });

  const { fetchNextPage } = q;

  /* Identité stable : `AutoLoad` met cette fonction dans les dépendances de
     son effet, une nouvelle référence à chaque rendu recréerait l'observateur
     en boucle. */
  const loadMore = useCallback(() => {
    setStarted((s) => {
      if (!s) return true;
      /* `cancelRefetch: false` : par défaut, un appel pendant qu'une page est
         déjà en vol ANNULE celle-ci et repart de zéro. Sur un chargement en
         chaîne, ça doublait le nombre de requêtes — 29 au lieu de 15 pour un
         gros catalogue, sur un quota de 30 par minute. On veut l'inverse :
         qu'un appel de trop soit ignoré. */
      void fetchNextPage({ cancelRefetch: false });
      return s;
    });
  }, [fetchNextPage]);

  const pagesLoaded = q.data?.pages.length ?? 0;
  const extra = (q.data?.pages ?? []).flatMap((p) => p.items);
  const hasMore = started ? Boolean(q.data?.pages.at(-1)?.hasNextPage) : opts.hasMoreInitially;

  /** Le défilement peut-il encore déclencher un chargement ? */
  const autoActive = Boolean(opts.auto) && hasMore && pagesLoaded < AUTO_PAGES && !q.isFetching;

  return {
    /** Éléments au-delà de la page 1, à concaténer à ceux de la fiche. */
    extra,
    loading: q.isFetching,
    hasMore,
    autoActive,
    /** Vrai quand il reste des éléments mais que le défilement ne suffit plus. */
    needsClick: hasMore && !q.isFetching && !autoActive,
    /** Pages tirées au-delà de la première. Sert de garde-fou aux chargements en chaîne. */
    pagesLoaded,
    /**
     * Vrai après un échec définitif — quota atteint, réseau coupé.
     *
     * Indispensable à qui enchaîne les pages : TanStack abandonne après ses
     * réessais mais laisse `hasNextPage` à vrai, et sans ce drapeau une boucle
     * de chargement rappelle la même requête en échec sans jamais s'arrêter.
     */
    failed: q.isError,
    loadMore,
  };
}
