import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useStudio, type StudioDetail, type StudioMediaPage } from '../api/anilist/hooks';
import { useMore } from '../api/anilist/useMore';
import { STUDIO_MEDIA_PAGE } from '../api/anilist/queries';
import { ShowMore } from '../components/ShowMore';
import { FavouriteButton } from '../components/FavouriteButton';
import { AutoLoad } from '../components/AutoLoad';
import { MediaCard } from '../components/MediaCard';
import { Grid } from '../components/Grid';
import { Select } from '../components/Select';
import { BackButton } from '../components/BackButton';
import { personKey } from '../lib/ids';
import { displayTitle } from '../lib/title';
import { mainStudio } from '../lib/mediaTip';
import { dedupeBy } from '../lib/dedupe';
import { formatLabel, seasonLabel } from '../lib/mediaOptions';
import {
  activeFilterCount,
  applyFilters,
  catalogueOptions,
  groupByYear,
  sortCatalogue,
  BY_DATE,
  NO_FILTERS,
  SORT_OPTIONS,
  type CatalogueFilters,
  type SortKey,
} from '../lib/catalogue';
import entity from './Entity.module.css';
import styles from './Studio.module.css';

/**
 * Fiche studio — catalogue trié, filtré et découpé par année.
 *
 * Tout se passe au client, et c'est l'API qui l'impose :
 *
 *   - `Studio.media` n'accepte aucun filtre (ni format, ni saison, ni année,
 *     ni genre), et `Page.media`, qui sait tout filtrer, n'a pas d'argument
 *     `studio`. Il n'existe donc pas de version serveur de ces filtres.
 *   - `Studio.media` sait trier, mais chaque tri est un cache séparé : trier
 *     au serveur voudrait dire recharger tout le catalogue à chaque
 *     changement. Seize requêtes pour MADHOUSE, sur un quota de trente par
 *     minute.
 *
 * Donc : on charge une fois, puis tri et filtres sont instantanés et gratuits.
 *
 * Mais pas d'emblée. Le serveur renvoie déjà l'ordre du plus récent au plus
 * vieux, qui est le tri par défaut : tant qu'on s'y tient, une vue partielle
 * est exacte et le défilement suffit. Le catalogue ne se complète que pour ce
 * qui l'exige — voir `needsAll`. Charger systématiquement coûtait trente
 * requêtes et trente secondes sur MADHOUSE, même pour un simple coup d'œil.
 */

/**
 * Garde-fou du chargement en chaîne. Le plus gros catalogue mesuré, celui de
 * MADHOUSE, tient en 16 pages ; au-delà de 20, c'est que quelque chose ne va pas.
 */
const MAX_PAGES = 20;

export default function Studio() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useStudio(id);

  if (error)
    return (
      <div className={`page ${entity.state}`}>
        <p className="muted">Couldn't load this studio.</p>
      </div>
    );

  if (isPending || !data)
    return (
      <div className={`page ${entity.state}`}>
        <p className="faint">Loading…</p>
      </div>
    );

  /* Remonté quand on passe d'un studio à l'autre : sans cette clé, React
     Router garde le composant en place — seul le paramètre change — et le
     filtre posé sur un studio se retrouve appliqué au suivant. */
  return <StudioBody key={data.id} data={data} />;
}

/* Le corps est un composant à part : les hooks de pagination ne peuvent pas
   vivre après les retours anticipés de chargement et d'erreur. */
function StudioBody({ data }: { data: StudioDetail }) {
  const [sort, setSort] = useState<SortKey>('newest');
  const [filters, setFilters] = useState<CatalogueFilters>(NO_FILTERS);

  const more = useMore({
    queryKey: ['studio', data.id, 'media'],
    query: STUDIO_MEDIA_PAGE,
    variables: { id: data.id },
    connection: (d: StudioMediaPage) => d.Studio.media,
    hasMoreInitially: data.media.pageInfo.hasNextPage,
    // Dernière section de la page : rien en dessous qu'elle repousserait.
    auto: true,
  });

  const { loadMore, loading, hasMore, failed, pagesLoaded } = more;
  const filtering = activeFilterCount(filters) > 0;

  /**
   * Faut-il le catalogue ENTIER ?
   *
   * Le serveur renvoie déjà les titres du plus récent au plus vieux : tant
   * qu'on est sur ce tri et sans filtre, une vue partielle est exacte, juste
   * incomplète — c'est du défilement ordinaire. Tout le reste est faux tant
   * que tout n'est pas là : « le mieux noté » calculé sur les 25 premiers
   * titres serait un mensonge.
   *
   * Charger systématiquement coûtait 30 requêtes et 29 secondes sur MADHOUSE
   * — tout le quota de la minute — même pour un simple coup d'œil.
   */
  const needsAll = sort !== 'newest' || filtering;

  /* Le catalogue se complète page après page, chaque appel attendant le
     retour du précédent : rien ne part en rafale. `failed` est la condition
     qui compte : TanStack abandonne après ses réessais mais laisse
     `hasNextPage` à vrai, et sans elle cette boucle rappellerait sans fin une
     requête en échec — quota atteint compris. */
  const completing = needsAll && hasMore && !failed && pagesLoaded < MAX_PAGES;
  useEffect(() => {
    if (completing && !loading) loadMore();
  }, [completing, loading, loadMore]);

  /** Arrêté par le plafond, pas par la fin du catalogue. À dire. */
  const capped = needsAll && hasMore && !failed && pagesLoaded >= MAX_PAGES;

  /* AniList renvoie deux fois la même œuvre quand le studio y est crédité
     deux fois — animation et production. Sans ce dédoublonnage, ufotable
     annonce 103 entrées pour 74 titres réels. */
  const loaded = dedupeBy([...data.media.nodes, ...more.extra], (m) => m.id);

  const options = catalogueOptions(loaded);
  const filtered = applyFilters(loaded, filters);
  const shown = sortCatalogue(filtered, sort, (m) => displayTitle(m.title));
  const groups = BY_DATE.has(sort) ? groupByYear(shown) : null;
  const set = (patch: Partial<CatalogueFilters>) => setFilters({ ...filters, ...patch });

  /* L'année est déjà dans le titre de section quand on groupe : la répéter
     sous chaque carte n'apprendrait rien. */
  const card = (m: (typeof loaded)[number], withYear: boolean) => (
    <MediaCard
      key={m.id}
      media={m.type === 'MANGA' ? 'manga' : 'anime'}
      id={m.id}
      title={displayTitle(m.title)}
      cover={m.coverImage.large}
      score={m.averageScore}
      meta={[m.format && formatLabel(m.format), withYear && m.seasonYear]
        .filter(Boolean)
        .join(' · ')}
      /* Le studio principal figure meme sur la page d'un studio : la fiche
         peut lister une oeuvre ou il n'etait que co-producteur. */
      tip={{
        season: m.season,
        year: m.seasonYear ?? m.startDate?.year,
        studio: mainStudio(m.studios),
        format: m.format,
        episodes: m.episodes,
      }}
    />
  );

  return (
    <div className={`page ${entity.wrap}`}>
      <BackButton />

      <header className={`${entity.head} ${entity.headWide}`}>
        <div className={entity.headText}>
          <h1 className={entity.name}>{data.name}</h1>
          <FavouriteButton
            favKey={personKey('studio', data.id)}
            id={data.id}
            name={data.name}
            href={`/studio/${data.id}`}
          />
          <div className={entity.facts}>
            <span className={entity.fact}>
              <span className="label">Type</span>
              {data.isAnimationStudio ? 'Animation studio' : 'Producer'}
            </span>
            {typeof data.favourites === 'number' && (
              <span className={entity.fact}>
                <Heart size={13} strokeWidth={2} aria-hidden />
                {data.favourites.toLocaleString('en-US')}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className={styles.bar}>
        <Select label="Sort" value={sort} onChange={setSort}>
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        {/* Les options sortent du catalogue lui-même : aucune ne renvoie zéro
            résultat, et un studio né en 2000 ne propose pas 1970. */}
        <Select label="Type" value={filters.format} onChange={(format) => set({ format })}>
          <option value="">Any</option>
          {options.formats.map((f) => (
            <option key={f} value={f}>
              {formatLabel(f)}
            </option>
          ))}
        </Select>

        <Select label="Year" value={filters.year} onChange={(year) => set({ year })}>
          <option value="">Any</option>
          {options.years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>

        <Select label="Season" value={filters.season} onChange={(season) => set({ season })}>
          <option value="">Any</option>
          {options.seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
            </option>
          ))}
        </Select>

        <Select label="Genre" value={filters.genre} onChange={(genre) => set({ genre })}>
          <option value="">Any</option>
          {options.genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>

        {filtering && (
          <button
            type="button"
            className={`btn btn--quiet ${styles.clear}`}
            onClick={() => setFilters(NO_FILTERS)}
          >
            Clear filters
          </button>
        )}
      </div>

      <section className={entity.section}>
        <div className={entity.sectionHead}>
          <h2 className="label">Productions</h2>
          <p className="label">
            {filtering ? `${shown.length} of ${loaded.length}` : `${loaded.length} titles`}
          </p>
        </div>

        {/* Dire où en est le catalogue, parce que tri et filtres ne valent que
            ce qu'il contient. */}
        {completing && <p className="faint">Loading the rest of the catalogue…</p>}
        {capped && (
          <p className="muted">
            Stopped at {loaded.length} titles. AniList lists more, but loading them would use most
            of the 30 requests a minute it allows — sorting and filtering cover what's here.
          </p>
        )}
        {needsAll && failed && (
          <p className="muted">
            Couldn't load the whole catalogue — AniList allows 30 requests a minute. Sorting and
            filtering cover the {loaded.length} titles loaded so far.
          </p>
        )}

        {shown.length === 0 && !completing && (
          <p className="muted">No title matches these filters.</p>
        )}

        {groups
          ? groups.map((g) => (
              <div key={String(g.year)} className={styles.yearBlock}>
                <h3 className={styles.year}>{g.year ?? 'TBA'}</h3>
                <Grid>{g.items.map((m) => card(m, false))}</Grid>
              </div>
            ))
          : shown.length > 0 && <Grid>{shown.map((m) => card(m, true))}</Grid>}

        {/* Vue par défaut : défilement ordinaire. Quand la complétion est en
            cours, c'est l'effet qui enchaîne — garder la sentinelle active en
            plus ne ferait que doubler les déclencheurs. */}
        <AutoLoad active={!needsAll && more.autoActive} onVisible={loadMore} />
        {!needsAll && loading && <p className="label">Loading…</p>}
        {!needsAll && more.needsClick && <ShowMore onClick={loadMore} loading={false} />}
      </section>
    </div>
  );
}
