import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useBrowseInfinite, type BrowseVars } from '../api/anilist/hooks';
import { MediaCard } from '../components/MediaCard';
import { Grid, GridSkeleton } from '../components/Grid';
import { Select } from '../components/Select';
import { ShowMore } from '../components/ShowMore';
import { BackButton } from '../components/BackButton';
import { displayTitle } from '../lib/title';
import { anilistType, readMode } from '../lib/mediaMode';
import { mainStudio } from '../lib/mediaTip';
import { dedupeBy } from '../lib/dedupe';
import { BY_DATE, groupByYear, MEDIA_SORT, SORT_OPTIONS, type SortKey } from '../lib/catalogue';
import { FORMATS, MANGA_TYPES, SEASONS, YEARS, mangaTypeVars } from '../lib/mediaOptions';
import { asSeason } from '../lib/season';
import entity from './Entity.module.css';
import styles from './Studio.module.css';
import { AUTO_PAGES } from '../lib/paging';

/**
 * Tous les animes d'un genre ou d'un tag.
 *
 * Une seule page pour les deux : AniList les traite pareil, ce sont deux
 * arguments de la même requête.
 *
 * Contrairement à la fiche studio, tout se passe au SERVEUR. `Page.media`
 * accepte `genre`, `tag`, `sort`, `format`, `season` et `seasonYear` — et il
 * le faut, parce qu'un genre compte des milliers de titres : les charger pour
 * les trier ici est hors de question. Le découpage par année reste juste,
 * puisque c'est le serveur qui a ordonné.
 */

export default function Collection({ kind }: { kind: 'genre' | 'tag' }) {
  const raw = useParams().name ?? '';
  /* Le mode suit le lien d'où l'on vient : un tag cliqué sur une fiche manga
     doit ouvrir des mangas. Sans ça, « Seinen » depuis Vinland Saga ramenait
     des animes — la page avait l'air de ne pas écouter. */
  const media = readMode(useSearchParams()[0]);
  const name = decodeURIComponent(raw);

  const [sort, setSort] = useState<SortKey>('members');
  /* En manga, ce champ ne porte pas un format mais un TYPE — manga, manhwa,
     manhua, light novel, one shot — qui se traduit en deux filtres. */
  const [format, setFormat] = useState('');
  const [year, setYear] = useState('');
  const [season, setSeason] = useState('');

  /*
   * Le type, RAMENÉ au vocabulaire du média courant.
   *
   * Les deux listes sont disjointes : rester sur « Light novel » en repassant
   * à l'anime envoyait `format_in: ["novel"]`, absent de l'énumération
   * d'AniList — trois réponses 400 et une liste vide, sans que rien à l'écran
   * ne l'explique. La page ne se remonte pas quand seul le paramètre change,
   * donc l'état survit à la bascule.
   *
   * Dérivé plutôt que remis à zéro dans un effet : un effet qui appelle
   * `setState` relance un rendu pour rien, et laisse passer la mauvaise valeur
   * entre les deux.
   */
  const choix = media === 'manga' ? MANGA_TYPES : FORMATS;
  const type = choix.some((c) => c.value === format) ? format : '';

  const typeManga = media === 'manga' ? mangaTypeVars(type) : null;

  const vars: BrowseVars = {
    type: anilistType(media),
    // 50 plutôt que 25 : moitié moins de requêtes pour le même défilement.
    perPage: 50,
    sort: [MEDIA_SORT[sort]],
    genres: kind === 'genre' ? [name] : undefined,
    tags: kind === 'tag' ? [name] : undefined,
    formats: typeManga
      ? typeManga.format
        ? [typeManga.format]
        : undefined
      : type
        ? [type]
        : undefined,
    country: typeManga?.country,
    /* Un manga n'a pas de saison : ni le filtre, ni l'année qui l'accompagne
       ne partent en manga — `seasonYear` ne veut rien dire sans elle. */
    seasonYear: media === 'anime' && year ? Number(year) : undefined,
    season: media === 'anime' ? (asSeason(season) ?? undefined) : undefined,
  };

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, error } =
    useBrowseInfinite(vars);

  const pages = data?.pages ?? [];
  /* AniList renvoie parfois deux fois la même œuvre entre deux pages : sans
     ce dédoublonnage, React signale des clés dupliquées. */
  const items = dedupeBy(
    pages.flatMap((p) => p.media),
    (m) => m.id,
  );
  const autoLoad = pages.length < AUTO_PAGES;
  const groups = BY_DATE.has(sort) ? groupByYear(items) : null;

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

  /* `type` et non `format` : un type hérité de l'autre média ne filtre rien,
     il ne doit donc pas se compter comme un filtre actif. La saison et l'année
     ne comptent qu'en anime, où elles partent vraiment. */
  const active = [type, media === 'anime' && year, media === 'anime' && season].filter(
    Boolean,
  ).length;
  const reset = () => {
    setFormat('');
    setYear('');
    setSeason('');
  };

  const card = (m: (typeof items)[number], withYear: boolean) => (
    <MediaCard
      key={m.id}
      media={media}
      id={m.id}
      title={displayTitle(m.title)}
      cover={m.coverImage.large}
      score={m.averageScore}
      meta={[m.format, withYear && m.seasonYear].filter(Boolean).join(' · ')}
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
        <p className="label">{kind === 'genre' ? 'Genre' : 'Tag'}</p>
        <h1 className={entity.name}>{name}</h1>
      </header>

      <div className={styles.bar}>
        <Select label="Sort" value={sort} onChange={setSort}>
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select label="Type" value={type} onChange={setFormat}>
          <option value="">Any</option>
          {choix.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>

        <Select label="Year" value={year} onChange={setYear}>
          <option value="">Any</option>
          {YEARS.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>

        {/* Un manga n'a pas de saison : le filtre disparaît plutôt que de
            rester là, inerte, à poser une question sans réponse. */}
        {media === 'anime' && (
          <Select label="Season" value={season} onChange={setSeason}>
            <option value="">Any</option>
            {SEASONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        )}

        {active > 0 && (
          <button type="button" className={`btn btn--quiet ${styles.clear}`} onClick={reset}>
            Clear filters
          </button>
        )}
      </div>

      <section className={entity.section}>
        <div className={entity.sectionHead}>
          <h2 className="label">{media === 'manga' ? 'Manga' : 'Anime'}</h2>
          <p className="label">{items.length} loaded</p>
        </div>

        {error && <p className="muted">Couldn't load this list.</p>}
        {isPending && <GridSkeleton count={12} />}

        {!isPending && items.length === 0 && !error && (
          <p className="muted">Nothing matches these filters.</p>
        )}

        {groups
          ? groups.map((g) => (
              <div key={String(g.year)} className={styles.yearBlock}>
                <h3 className={styles.year}>{g.year ?? 'TBA'}</h3>
                <Grid>{g.items.map((m) => card(m, false))}</Grid>
              </div>
            ))
          : items.length > 0 && <Grid>{items.map((m) => card(m, true))}</Grid>}

        <div ref={sentinel} aria-hidden />
        {isFetchingNextPage && <p className="label">Loading…</p>}
        {hasNextPage && !autoLoad && !isFetchingNextPage && (
          <ShowMore onClick={() => void fetchNextPage()} loading={false} />
        )}
      </section>
    </div>
  );
}
