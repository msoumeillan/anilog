import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useMbCatalogue } from '../api/mangabaka/hooks';
import { MediaCard } from '../components/MediaCard';
import { Grid, GridSkeleton } from '../components/Grid';
import { ShowMore } from '../components/ShowMore';
import { Select } from '../components/Select';
import { dedupeBy } from '../lib/dedupe';
import { counts } from '../lib/mangabaka';
import {
  activeCount,
  coverUrl,
  mbSeriesHref,
  genreLabel,
  statusLabel,
  GENRES,
  NO_FILTERS,
  SORTS,
  STATUS,
  TYPES,
  type CatalogueFilters,
} from '../lib/mangabakaCatalogue';
import styles from './Browse.module.css';
import { AUTO_PAGES } from '../lib/paging';

/**
 * ESSAI — le catalogue MangaBaka, a cote de celui d'AniList.
 *
 * Il est la pour etre COMPARE, pas encore pour remplacer : rien ici ne touche
 * au schema de la bibliotheque, et aucune de ces series n'est suivable. On
 * regarde ce qu'on gagne — plus de 300 000 series, romans web compris, la ou AniList
 * n'en a aucun sur les douze titres mesures — et ce qu'on perd : ni
 * personnages, ni staff detaille, ni trailers, et un service dont l'app
 * officielle embarque un disjoncteur.
 */

export default function MbCatalogue() {
  /* Les filtres vivent dans l'URL, comme ceux de Browse. C'est ce qui rend
     une pastille de genre cliquable depuis une fiche, et ce qui rend une
     recherche partageable et defaisable par le retour arriere. */
  const [params, setParams] = useSearchParams();
  const filters: CatalogueFilters = {
    q: params.get('q') ?? '',
    sort: params.get('sort') ?? NO_FILTERS.sort,
    type: params.get('type') ?? '',
    status: params.get('status') ?? '',
    genre: params.get('genre') ?? '',
    tag: params.get('tag') ?? '',
    staff: params.get('staff') ?? '',
    publisher: params.get('publisher') ?? '',
  };

  const set = (patch: Partial<CatalogueFilters>) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      /* Le tri par defaut ne s'ecrit pas : `?sort=popularity_asc` encombrerait
         la barre d'adresse sans rien dire de plus. */
      if (v && !(k === 'sort' && v === NO_FILTERS.sort)) p.set(k, v);
    }
    setParams(p);
  };

  const [draft, setDraft] = useState(filters.q);

  /* Recherche au fil de la frappe, temporisee comme celle de Browse — un peu
     plus : MangaBaka m'a renvoye des 429 en mesurant, et « Lord of Mysteries »
     fait dix-sept frappes. */
  useEffect(() => {
    const t = setTimeout(() => {
      const q = draft.trim();
      setParams(
        (prev) => {
          if ((prev.get('q') ?? '') === q) return prev;
          const p = new URLSearchParams(prev);
          if (q) p.set('q', q);
          else p.delete('q');
          return p;
        },
        { replace: true },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [draft, setParams]);

  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMbCatalogue(filters);

  const pages = data?.pages ?? [];
  const items = dedupeBy(
    pages.flatMap((p) => p.series),
    (s) => s.id,
  );
  const total = pages[0]?.total ?? 0;
  const autoLoad = pages.length < AUTO_PAGES;

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || !autoLoad) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, autoLoad, fetchNextPage, items.length]);

  return (
    <div className={`page ${styles.wrap}`}>
      <h1 className="title">Browse</h1>

      <div className={styles.bar}>
        <div className={styles.searchBox}>
          <Search size={16} strokeWidth={1.8} aria-hidden className={styles.searchIcon} />
          <input
            className={styles.search}
            type="search"
            placeholder="Search a manga"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>

        <div className={styles.filters}>
          {!filters.q && (
            <Select label="Sort" value={filters.sort} onChange={(sort) => set({ sort })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}

          <Select label="Type" value={filters.type} onChange={(type) => set({ type })}>
            <option value="">Any</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>

          <Select label="Status" value={filters.status} onChange={(status) => set({ status })}>
            <option value="">Any</option>
            {STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>

          <Select label="Genre" value={filters.genre} onChange={(genre) => set({ genre })}>
            <option value="">Any</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {genreLabel(g)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className={styles.status}>
        <p className="label">
          {isPending
            ? 'Loading…'
            : error
              ? 'MangaBaka is unreachable'
              : `${total.toLocaleString('en-US')} series`}
          {/* Ces trois-là ne viennent pas de la barre mais d'un lien posé sur
              une fiche : sans les nommer, la grille se restreindrait sans dire
              pourquoi. */}
          {(
            [
              ['Tag', filters.tag],
              ['Staff', filters.staff],
              ['Publisher', filters.publisher],
            ] as const
          )
            .filter(([, v]) => v)
            .map(([nom, v]) => ` · ${nom} : ${v}`)}
        </p>

        {(activeCount(filters) > 0 || filters.q) && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setDraft('');
              setParams(new URLSearchParams());
            }}
          >
            Clear
          </button>
        )}
      </div>

      {isPending && <GridSkeleton count={12} />}

      {!isPending && !error && items.length === 0 && <p className="muted">Nothing matches.</p>}

      {items.length > 0 && (
        <Grid>
          {items.map((s) => (
            <MediaCard
              key={s.id}
              media="manga"
              id={s.id}
              /* Vers la fiche AniList quand il connait l'oeuvre : une seule
                 fiche par oeuvre, pas deux adresses pour Chainsaw Man. */
              href={mbSeriesHref(s) ?? undefined}
              title={s.title ?? 'Untitled'}
              cover={coverUrl(s, 'x350')}
              score={typeof s.rating === 'number' && s.rating > 0 ? Math.round(s.rating) : null}
              meta={[s.type, s.year].filter(Boolean).join(' · ')}
              tip={{
                year: s.year,
                status: statusLabel(s.status),
                format: s.type,
                chapters: counts(s).chapters,
              }}
            />
          ))}
        </Grid>
      )}

      <div ref={sentinel} />
      {isFetchingNextPage && <p className="label">Loading…</p>}
      {hasNextPage && !autoLoad && !isFetchingNextPage && (
        <ShowMore onClick={() => void fetchNextPage()} loading={false} />
      )}
    </div>
  );
}
