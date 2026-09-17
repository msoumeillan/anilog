import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMagazine } from '../api/magazine/hooks';
import { MediaCard } from '../components/MediaCard';
import { Grid, GridSkeleton } from '../components/Grid';
import { ShowMore } from '../components/ShowMore';
import { Select } from '../components/Select';
import { BackButton } from '../components/BackButton';
import { displayTitle } from '../lib/title';
import { mainStudio } from '../lib/mediaTip';
import { dedupeBy } from '../lib/dedupe';
import { formatLabel, YEARS } from '../lib/mediaOptions';
import {
  activeCount,
  NO_FILTERS,
  SORTS,
  STATUS,
  TYPES,
  type MagazineFilters,
} from '../lib/magazineFilters';
import entity from './Entity.module.css';
import styles from './Studio.module.css';
import { AUTO_PAGES } from '../lib/paging';

/**
 * Tout ce qu'un magazine prépublie, dans son classement.
 *
 * Tri et filtres partent au SERVEUR, comme sur un genre et contrairement à un
 * studio. Un magazine compte jusqu'à 1 918 titres — KakaoPage — quand une page
 * n'en charge que 25 : filtrer ce qui est chargé annoncerait « 3 titres » là
 * où il y en a 40, les 37 autres n'étant pas encore arrivés.
 *
 * Le tri par défaut reste la popularité selon MyAnimeList : c'est la seule
 * chose qu'AniList ne sait pas reproduire, et donc la raison d'être de la page.
 */

export default function Magazine() {
  const id = Number(useParams().id);
  /* Le nom voyage dans l'URL plutôt que dans l'état du routeur : MyAnimeList
     n'expose pas de `/magazines/{id}`, et une adresse partagée doit pouvoir
     s'afficher sans deviner. L'identifiant seul suffit à la liste. */
  const name = useSearchParams()[0].get('name')?.trim() || 'Magazine';

  const [filters, setFilters] = useState<MagazineFilters>(NO_FILTERS);
  const set = (patch: Partial<MagazineFilters>) => setFilters({ ...filters, ...patch });

  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useMagazine(
    id,
    filters,
  );

  const pages = data?.pages ?? [];
  /* Une œuvre publiée deux fois dans le même magazine — série puis reprise —
     revient deux fois dans la liste de MyAnimeList. */
  const items = dedupeBy(
    pages.flatMap((p) => p.media),
    (m) => m.id,
  );
  const total = pages[0]?.total ?? 0;
  const autoLoad = pages.length < AUTO_PAGES;

  /* Sentinelle de fin de page : on ne charge qu'une fois le bas atteint. */
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
    <div className={`page ${entity.wrap}`}>
      <BackButton />

      <header className={`${entity.head} ${entity.headWide}`}>
        <p className="label">Magazine</p>
        <h1 className={entity.name}>{name}</h1>
        {total > 0 && <p className="label">{total.toLocaleString('en-US')} titles</p>}
      </header>

      <div className={styles.bar}>
        <Select label="Sort" value={filters.sort} onChange={(sort) => set({ sort })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

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

        {/* « From » et non « Year » : MyAnimeList ne sait borner que le début
            de parution, jamais une année seule. Voir `magazinePath`. */}
        <Select label="From" value={filters.from} onChange={(from) => set({ from })}>
          <option value="">Any year</option>
          {YEARS.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>

        {activeCount(filters) > 0 && (
          <button
            type="button"
            className={`btn btn--quiet ${styles.clear}`}
            onClick={() => setFilters(NO_FILTERS)}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <p className="muted">
          Couldn't load this magazine. The list comes from MyAnimeList, which didn't respond.
        </p>
      )}

      {isPending && <GridSkeleton count={12} />}

      {!isPending && !error && items.length === 0 && (
        <p className="muted">
          {activeCount(filters) > 0
            ? 'No title matches these filters.'
            : 'No title on AniList for this magazine.'}
        </p>
      )}

      {items.length > 0 && (
        <Grid>
          {items.map((m) => (
            <MediaCard
              key={m.id}
              media="manga"
              id={m.id}
              title={displayTitle(m.title)}
              cover={m.coverImage.large}
              score={m.averageScore}
              meta={[m.format && formatLabel(m.format), m.startDate?.year]
                .filter(Boolean)
                .join(' · ')}
              tip={{
                season: m.season,
                year: m.seasonYear ?? m.startDate?.year,
                studio: mainStudio(m.studios),
                format: m.format,
                episodes: m.episodes,
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
