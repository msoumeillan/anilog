import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useBrowseInfinite, type BrowseVars } from '../api/anilist/hooks';
import { asSeason, type SeasonFilter } from '../lib/season';
import { useSeasonExtras } from '../api/anilist/useSeasonExtras';
import { anilistType, readMode } from '../lib/mediaMode';
import { mergeBySort } from '../lib/browseSort';
import { MediaCard } from '../components/MediaCard';
import { Grid, GridSkeleton } from '../components/Grid';
import { displayTitle } from '../lib/title';
import { mainStudio } from '../lib/mediaTip';
import { Select } from '../components/Select';
import { COUNTRIES, GENRES, SEASONS, STATUSES, YEARS, formatsFor } from '../lib/mediaOptions';
import { readLastFilters, saveLastFilters } from '../lib/lastFilters';
import styles from './Browse.module.css';
import { AUTO_PAGES } from '../lib/paging';

/**
 * Parcourir — la page qui remplace Top + Saison + Genres + Recherche.
 *
 * Une grille, une barre de filtres. Chaque filtre est une variable de la
 * même requête GraphQL : c'est ce qui permet à quatre pages de la v1
 * de tenir dans un seul composant.
 *
 * Les filtres vivent dans l'URL, la recherche aussi. C'est ce qui permet aux
 * fiches d'y renvoyer — « WINTER 2015 » ouvre Browse déjà filtré — et rend
 * chaque vue partageable.
 *
 * La recherche est longtemps restée locale, de peur d'ajouter une entrée
 * d'historique par frappe. Elle se perdait alors au retour d'une fiche :
 * « gundam » effacé, les plus populaires à sa place, et la page replacée à
 * 900 px dans cette autre liste. Les liens qui cherchaient ici — les titres
 * introuvables d'un import — tombaient sur la même grille. Elle entre donc
 * dans l'adresse en REMPLAÇANT l'entrée, après une pause dans la frappe : voir
 * `DELAI_MS`.
 */

const SORTS = [
  { value: 'POPULARITY_DESC', label: 'Popular' },
  { value: 'SCORE_DESC', label: 'Top rated' },
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'START_DATE_DESC', label: 'Newest' },
  { value: 'FAVOURITES_DESC', label: 'Favourites' },
] as const;

/**
 * Le temps de frappe laissé avant de chercher.
 *
 * Chaque recherche est une requête AniList, sur un quota de 30 par minute :
 * « vinland saga » tapé lettre à lettre en coûtait onze, mesuré. Le même délai
 * que la recherche de l'en-tête, qui interroge la même API.
 */
const DELAI_MS = 300;

/**
 * Ce qu'on peut honnêtement annoncer sur le nombre de résultats.
 *
 * Pas grand-chose : `pageInfo.total` n'est PAS un compte. Sur la première
 * page AniList renvoie 5 000 quoi qu'il arrive — filtré ou non, « winter 2015 »
 * comme « tous les animes ». Le vrai nombre n'apparaît qu'en atteignant la
 * dernière page. On affichait donc « More than 5,000 results » sur une saison
 * qui en compte deux cents.
 *
 * Alors on dit ce qu'on sait vraiment : combien sont chargés, et s'il en
 * reste. Quand il n'en reste plus, le nombre chargé EST le total.
 */
function resultLabel(loaded: number, hasMore: boolean): string {
  if (loaded === 0) return '';
  if (hasMore) return `${loaded.toLocaleString('en-US')} loaded`;
  return `${loaded.toLocaleString('en-US')} result${loaded > 1 ? 's' : ''}`;
}

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const search = (params.get('search') ?? '').trim();

  /* Le champ garde sa propre valeur : l'adresse ne reçoit la recherche
     qu'après le délai, et le champ ne peut pas l'attendre pour afficher ce
     qu'on tape. */
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    const q = draft.trim();
    if (q === search) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (q) next.set('search', q);
      else next.delete('search');
      // `replace`, comme les filtres : taper n'est pas naviguer.
      setParams(next, { replace: true });
    }, DELAI_MS);
    return () => clearTimeout(t);
  }, [draft, search, params, setParams]);

  /* L'adresse change aussi sans le champ : « Browse » recliqué dans le menu,
     le retour arrière entre deux recherches. Le champ la suit alors. Ses
     propres écritures, elles, REMPLACENT l'entrée — c'est à ça qu'on les
     reconnaît : y recopier l'adresse effacerait ce qu'on a tapé depuis. */
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const [entree, setEntree] = useState(key);
  if (entree !== key) {
    setEntree(key);
    if (navigationType !== 'REPLACE') setDraft(search);
  }

  const sort = params.get('sort') || 'POPULARITY_DESC';
  const season = params.get('season') ?? '';
  const year = params.get('year') ?? '';
  const genre = params.get('genre') ?? '';
  const format = params.get('format') ?? '';
  const status = params.get('status') ?? '';
  const country = params.get('country') ?? '';
  /* Le mode global — décision 6, il vit dans l'URL. Tout ce qui suit en
     dépend : le type demandé, les formats proposés, et l'existence même des
     filtres de saison. */
  const media = readMode(params);

  /* `replace` : changer un filtre n'est pas une navigation. Sans ça, un aller
     et retour entre deux genres remplirait l'historique et le bouton retour
     ne ramènerait plus à la fiche d'où l'on vient. */
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    saveLastFilters(next.toString());
  };

  /* Au premier affichage seulement : sans filtre dans l'URL, on remet ceux de
     la dernière fois. Avec, ce sont eux qu'on retient — on arrive alors d'un
     lien de fiche, « WINTER 2015 » par exemple. */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const current = params.toString();
    if (current) {
      saveLastFilters(current);
      return;
    }
    const saved = readLastFilters();
    if (saved) setParams(new URLSearchParams(saved), { replace: true });
  }, [params, setParams]);

  /**
   * Ce que l'utilisateur a demandé côté calendrier : une saison, une année, ou
   * les deux. Les TROIS formes ont besoin de l'appoint par date — c'est de
   * n'avoir traité que la troisième que venaient les résultats presque vides
   * sur « 2026 » seul ou « Spring » seul, où les donghua disparaissaient faute
   * de `seasonYear` et de `season`.
   */
  const filtre: SeasonFilter | null = useMemo(
    () =>
      media === 'anime' && (season || year)
        ? { season: asSeason(season), year: year ? Number(year) : null }
        : null,
    [media, season, year],
  );

  const vars: BrowseVars = useMemo(
    () => ({
      type: anilistType(media),
      // 50 plutôt que 30 : moitié moins de requêtes pour le même défilement.
      perPage: 50,
      // Une recherche textuelle impose son propre tri de pertinence.
      sort: search ? ['SEARCH_MATCH'] : [sort],
      search: search || undefined,
      season: asSeason(season) ?? undefined,
      seasonYear: year ? Number(year) : undefined,
      genres: genre ? [genre] : undefined,
      formats: format ? [format] : undefined,
      status: status || undefined,
      country: country || undefined,
    }),
    [media, search, sort, season, year, genre, format, status, country],
  );

  const { data, isPending, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, error } =
    useBrowseInfinite(vars);

  /* Ce qu'AniList ne range dans aucune saison, à rabattre dans la liste
     principale. Toute la logique vit dans le hook — voir pourquoi là-bas. */
  const sansSaison = useSeasonExtras(filtre, vars);

  /* `data.pages` et non un tableau reconstruit : `?? []` en fabriquerait un
     neuf à chaque rendu, et la fusion — qui insère un à un dans une liste de
     plusieurs centaines — se referait pour rien. */
  const items = useMemo(() => {
    const principaux = (data?.pages ?? []).flatMap((p) => p.media);
    return mergeBySort(principaux, sansSaison, sort);
  }, [data?.pages, sansSaison, sort]);

  const autoLoad = (data?.pages.length ?? 0) < AUTO_PAGES;

  /* Sentinelle : on ne charge que lorsque le bas est réellement atteint.
     Un écouteur de scroll se déclencherait à chaque pixel pour rien. */
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

  const active = [season, year, genre, format, status, country].filter(Boolean).length;
  const reset = () => {
    // La recherche reste : le bouton annonce des filtres, et les compte sans elle.
    setParams(new URLSearchParams(search ? { search } : {}), { replace: true });
    // Effacer est un choix : il doit tenir au retour sur la page.
    saveLastFilters('');
  };

  return (
    <div className={`page ${styles.wrap}`}>
      <h1 className="title">Browse</h1>

      <div className={styles.bar}>
        <div className={styles.searchBox}>
          <Search size={16} strokeWidth={1.8} aria-hidden className={styles.searchIcon} />
          <input
            className={styles.search}
            type="search"
            placeholder={`Search ${media === 'anime' ? 'an' : 'a'} ${media}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>

        <div className={styles.filters}>
          <Select
            label="Sort"
            value={sort}
            disabled={Boolean(search)}
            onChange={(v) => setParam('sort', v)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>

          {/* Un manga n'a pas de saison. Le filtre disparaît plutôt que de
              rester là, inerte, à proposer une question sans réponse. */}
          {media === 'anime' && (
            <Select label="Season" value={season} onChange={(v) => setParam('season', v)}>
              <option value="">Any</option>
              {SEASONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}

          <Select label="Year" value={year} onChange={(v) => setParam('year', v)}>
            <option value="">Any</option>
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </Select>

          <Select label="Genre" value={genre} onChange={(v) => setParam('genre', v)}>
            <option value="">Any</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>

          <Select label="Type" value={format} onChange={(v) => setParam('format', v)}>
            <option value="">Any</option>
            {formatsFor(media).map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>

          <Select label="Status" value={status} onChange={(v) => setParam('status', v)}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>

          {/* Le pays de production : de quoi isoler les donghua, ou les
              écarter. AniList les laisse hors saison — voir `lib/season` —
              donc les voir seuls demande de pouvoir le demander. */}
          <Select label="Country" value={country} onChange={(v) => setParam('country', v)}>
            <option value="">Any</option>
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
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
              ? 'AniList is unreachable'
              : resultLabel(items.length, Boolean(hasNextPage))}
          {isFetching && !isPending && !isFetchingNextPage && ' · refreshing'}
        </p>
        {active > 0 && (
          <button type="button" className={`btn btn--quiet ${styles.reset}`} onClick={reset}>
            <X size={14} strokeWidth={2} aria-hidden />
            Reset {active} filter{active > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {isPending && <GridSkeleton count={24} />}

      {error && (
        <p className="muted">
          Couldn't load results. AniList allows 30 requests per minute — try again in a moment.
        </p>
      )}

      {!isPending && items.length === 0 && !error && (
        <p className="muted">No results. Loosen the filters or change the search.</p>
      )}

      {items.length > 0 && (
        <>
          <Grid>
            {items.map((m) => (
              <MediaCard
                key={m.id}
                media={media}
                id={m.id}
                title={displayTitle(m.title)}
                cover={m.coverImage.large}
                score={m.averageScore}
                meta={[m.format, m.seasonYear].filter(Boolean).join(' · ')}
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

          {/* Cible de l'observateur : invisible, seulement là pour être atteinte. */}
          <div ref={sentinel} aria-hidden />

          {isFetchingNextPage && <GridSkeleton count={10} />}

          {hasNextPage && !autoLoad && !isFetchingNextPage && (
            <button type="button" className={`btn ${styles.more}`} onClick={() => fetchNextPage()}>
              Load 50 more
            </button>
          )}

          {!hasNextPage && <p className={`label ${styles.end}`}>End of results</p>}
        </>
      )}
    </div>
  );
}
