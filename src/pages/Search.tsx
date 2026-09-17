import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, ChevronRight } from 'lucide-react';
import {
  useSearchResults,
  type BrowsePage,
  type CharacterSearchPage,
  type StaffSearchPage,
  type StudioSearchPage,
} from '../api/anilist/hooks';
import {
  BROWSE,
  CHARACTER_SEARCH_PAGE,
  STAFF_SEARCH_PAGE,
  STUDIO_SEARCH_PAGE,
} from '../api/anilist/queries';
import { useMore } from '../api/anilist/useMore';
import { useMbQuickSearch } from '../api/mangabaka/hooks';
import { Grid, GridSkeleton } from '../components/Grid';
import { MediaCard } from '../components/MediaCard';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { ShowMore } from '../components/ShowMore';
import { dedupeBy } from '../lib/dedupe';
import { counts } from '../lib/mangabaka';
import {
  coverUrl,
  mbCataloguePath,
  mbSeriesHref,
  statusLabel,
  typeLabel,
} from '../lib/mangabakaCatalogue';
import { formatLabel } from '../lib/mediaOptions';
import { mainStudio } from '../lib/mediaTip';
import {
  characterItem,
  mangaBakaThenAniList,
  mbItem,
  mediaItem,
  relevantMedia,
  relevantSeries,
  searchTerm,
  staffItem,
  studioItem,
  type SearchItem,
} from '../lib/quickSearch';
import { mediaHref } from '../lib/routes';
import { useRecentResults } from '../store/recentResults';
import { displayTitle } from '../lib/title';
import styles from './Search.module.css';

/** Autant que `SEARCH_RESULTS` en demande par catégorie : la page 2 doit suivre la 1. */
const PAR_PAGE = 18;

type Media = BrowsePage['media'][number];

/**
 * Tous les résultats d'une recherche — la suite du panneau de l'en-tête.
 *
 * Les mêmes catégories dans le même ordre, sans plafond : chacune montre sa
 * première page et charge la suivante à la demande. Un bouton plutôt que le
 * défilement : cinq listes l'une sous l'autre, et une qui s'allonge seule
 * repousserait indéfiniment les suivantes.
 *
 * Le terme vit dans l'adresse (`?q=`) : la page se partage, se met en
 * favori, et le retour arrière y ramène.
 */
export default function Search() {
  const [params] = useSearchParams();
  const term = searchTerm(params.get('q') ?? '');

  return (
    <div className={`page ${styles.page}`}>
      {term ? (
        /* Une clé par terme : les compteurs de pages repartent de zéro. Sans
           elle, la page 2 déjà ouverte d'une recherche se chargeait d'office
           pour la suivante. */
        <Resultats key={term} term={term} />
      ) : (
        <>
          <h1 className="title">Search</h1>
          <p className="muted">Type at least two characters in the search bar.</p>
        </>
      )}
    </div>
  );
}

function Resultats({ term }: { term: string }) {
  const { data, isPending, error } = useSearchResults(term);
  const mb = useMbQuickSearch(term, { limit: 30, keepPrevious: false });

  /* Ce qu'on ouvre d'ici rejoint les derniers résultats, comme depuis le
     panneau : une même liste, quelle que soit la porte empruntée. */
  const retenir = useRecentResults((s) => s.remember);

  const vars = { search: term };
  const page = <T,>(pageInfo: { hasNextPage: boolean }, nodes: T[]) => ({ pageInfo, nodes });

  const plusAnime = useMore({
    queryKey: ['search', 'anime', term],
    query: BROWSE,
    variables: { ...vars, type: 'ANIME', sort: ['SEARCH_MATCH'], perPage: PAR_PAGE },
    connection: (d: { Page: BrowsePage }) => page(d.Page.pageInfo, d.Page.media),
    hasMoreInitially: Boolean(data?.anime.pageInfo.hasNextPage),
  });
  const plusManga = useMore({
    queryKey: ['search', 'manga', term],
    query: BROWSE,
    variables: { ...vars, type: 'MANGA', sort: ['SEARCH_MATCH'], perPage: PAR_PAGE },
    connection: (d: { Page: BrowsePage }) => page(d.Page.pageInfo, d.Page.media),
    hasMoreInitially: Boolean(data?.manga.pageInfo.hasNextPage),
  });
  const plusPersonnages = useMore({
    queryKey: ['search', 'characters', term],
    query: CHARACTER_SEARCH_PAGE,
    variables: vars,
    connection: (d: CharacterSearchPage) => page(d.Page.pageInfo, d.Page.characters),
    hasMoreInitially: Boolean(data?.characters.pageInfo.hasNextPage),
  });
  const plusStaff = useMore({
    queryKey: ['search', 'staff', term],
    query: STAFF_SEARCH_PAGE,
    variables: vars,
    connection: (d: StaffSearchPage) => page(d.Page.pageInfo, d.Page.staff),
    hasMoreInitially: Boolean(data?.staff.pageInfo.hasNextPage),
  });
  const plusStudios = useMore({
    queryKey: ['search', 'studios', term],
    query: STUDIO_SEARCH_PAGE,
    variables: vars,
    connection: (d: StudioSearchPage) => page(d.Page.pageInfo, d.Page.studios),
    hasMoreInitially: Boolean(data?.studios.pageInfo.hasNextPage),
  });

  const titre = <h1 className="title">Results for “{term}”</h1>;

  if (error) {
    return (
      <>
        {titre}
        <p className="muted">
          Couldn’t reach AniList. It allows 30 requests per minute — try again in a moment.
        </p>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        {titre}
        <GridSkeleton count={12} />
      </>
    );
  }

  /* Une page d'AniList peut en chevaucher une autre quand le classement bouge
     entre deux appels : une œuvre vue deux fois donnerait deux clés égales. */
  const animes = dedupeBy([...data.anime.media, ...plusAnime.extra], (m) => m.id);
  const personnages = dedupeBy(
    [...data.characters.characters, ...plusPersonnages.extra],
    (c) => c.id,
  );
  const staff = dedupeBy([...data.staff.staff, ...plusStaff.extra], (s) => s.id);
  const studios = dedupeBy([...data.studios.studios, ...plusStudios.extra], (s) => s.id);

  /* Les mangas attendent MangaBaka : ses résultats passent devant, et une
     grille qui se réordonne sous les yeux fait cliquer à côté. Sans réponse de
     sa part, AniList seul. Ceux d'AniList ne sont PAS filtrés ici, contrairement
     au panneau : c'est la page de TOUS les résultats, et son classement met le
     bruit à la fin. Le filtre sert seulement à reconnaître, parmi ceux de la
     page 1, les séries de MangaBaka trouvées par un synonyme — « snk ». */
  const mangas = mb.isPending
    ? null
    : mangaBakaThenAniList(
        mb.data
          ? relevantSeries(mb.data.series, mb.data.term, relevantMedia(data.manga.media, term))
          : [],
        dedupeBy([...data.manga.media, ...plusManga.extra], (m) => m.id),
      );

  const rien =
    mangas !== null &&
    [animes, mangas, personnages, staff, studios].every((liste) => liste.length === 0);

  return (
    <>
      {titre}

      {rien && <p className="muted">No results for “{term}”.</p>}

      {animes.length > 0 && (
        <Section titre="Anime" plus={plusAnime}>
          <Grid>
            {animes.map((m) => (
              <OeuvreCard key={m.id} media="anime" m={m} onOpen={retenir} />
            ))}
          </Grid>
        </Section>
      )}

      {mangas === null ? (
        <Section titre="Manga">
          <GridSkeleton count={6} />
        </Section>
      ) : (
        mangas.length > 0 && (
          <Section
            titre="Manga"
            plus={plusManga}
            lien={{ to: mbCataloguePath(term), label: 'MangaBaka catalogue' }}
          >
            <Grid>
              {mangas.map((h) =>
                h.from === 'mangabaka' ? (
                  <MediaCard
                    key={`mb${h.series.id}`}
                    media="manga"
                    id={h.series.id}
                    href={mbSeriesHref(h.series) ?? undefined}
                    title={h.series.title ?? 'Untitled'}
                    cover={coverUrl(h.series, 'x350')}
                    score={
                      typeof h.series.rating === 'number' && h.series.rating > 0
                        ? Math.round(h.series.rating)
                        : null
                    }
                    meta={[typeLabel(h.series.type), h.series.year].filter(Boolean).join(' · ')}
                    tip={{
                      year: h.series.year,
                      status: statusLabel(h.series.status),
                      format: h.series.type,
                      chapters: counts(h.series).chapters,
                    }}
                    onOpen={() => retenir(mbItem(h.series))}
                  />
                ) : (
                  <OeuvreCard key={h.media.id} media="manga" m={h.media} onOpen={retenir} />
                ),
              )}
            </Grid>
          </Section>
        )
      )}

      {personnages.length > 0 && (
        <Section titre="Characters" plus={plusPersonnages}>
          <PersonGrid>
            {personnages.map((c) => {
              const oeuvre = c.media.nodes[0];
              const href = oeuvre ? mediaHref(oeuvre.type, oeuvre.id) : null;
              return (
                <PersonCard
                  key={c.id}
                  to={`/character/${c.id}`}
                  name={c.name.full}
                  image={c.image.medium}
                  link={oeuvre && href ? { to: href, label: displayTitle(oeuvre.title) } : null}
                  onOpen={() => retenir(characterItem(c))}
                />
              );
            })}
          </PersonGrid>
        </Section>
      )}

      {staff.length > 0 && (
        <Section titre="Staff" plus={plusStaff}>
          <PersonGrid>
            {staff.map((s) => (
              <PersonCard
                key={s.id}
                to={`/staff/${s.id}`}
                name={s.name.full}
                image={s.image.medium}
                role={s.primaryOccupations.slice(0, 2).join(' · ') || null}
                onOpen={() => retenir(staffItem(s))}
              />
            ))}
          </PersonGrid>
        </Section>
      )}

      {studios.length > 0 && (
        <Section titre="Studios" plus={plusStudios}>
          <ul className={styles.studios}>
            {studios.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/studio/${s.id}`}
                  className={styles.studio}
                  onClick={() => retenir(studioItem(s))}
                >
                  <span className={styles.pictogramme} aria-hidden>
                    <Building2 size={16} strokeWidth={1.8} />
                  </span>
                  <span className={styles.texte}>
                    <span className={styles.nom}>{s.name}</span>
                    <span className={styles.meta}>
                      {s.isAnimationStudio ? 'Animation studio' : 'Producer'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/**
 * Une œuvre d'AniList, comme dans Browse — mais le format en toutes lettres,
 * comme sur la page studio : dans la grille des mangas, « ONE_SHOT » côtoierait
 * sinon les « Manhwa » écrits par MangaBaka.
 */
function OeuvreCard({
  media,
  m,
  onOpen,
}: {
  media: 'anime' | 'manga';
  m: Media;
  onOpen: (item: SearchItem) => void;
}) {
  return (
    <MediaCard
      media={media}
      id={m.id}
      onOpen={() => onOpen(mediaItem(media, m))}
      title={displayTitle(m.title)}
      cover={m.coverImage.large}
      score={m.averageScore}
      meta={[m.format && formatLabel(m.format), m.seasonYear ?? m.startDate?.year]
        .filter(Boolean)
        .join(' · ')}
      tip={{
        season: m.season,
        year: m.seasonYear ?? m.startDate?.year,
        studio: mainStudio(m.studios),
        format: m.format,
        /* Des épisodes d'un côté, des chapitres de l'autre — voir `TipFacts`. */
        episodes: media === 'anime' ? m.episodes : null,
        chapters: media === 'manga' ? m.chapters : null,
      }}
    />
  );
}

function Section({
  titre,
  plus,
  lien,
  children,
}: {
  titre: string;
  plus?: { hasMore: boolean; loading: boolean; loadMore: () => void };
  lien?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.tete}>
        <h2 className="label">{titre}</h2>
        {lien && (
          <Link to={lien.to} className={styles.lien}>
            {lien.label}
            <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
          </Link>
        )}
      </div>
      {children}
      {plus?.hasMore && <ShowMore onClick={plus.loadMore} loading={plus.loading} />}
    </section>
  );
}
