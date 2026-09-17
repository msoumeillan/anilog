import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useBrowseInfinite, useUpNext } from '../api/anilist/hooks';
import { useLibrary } from '../store/library';
import { MediaCard } from '../components/MediaCard';
import { Rail } from '../components/Rail';
import { upNextRows, type UpNextRow } from '../lib/upNext';
import { displayTitle } from '../lib/title';
import { mainStudio } from '../lib/mediaTip';
import { currentSeason, seasonTitle } from '../lib/season';
import { useSeasonExtras } from '../api/anilist/useSeasonExtras';
import { mergeBySort } from '../lib/browseSort';
import { sortLibrary } from '../lib/libraryOrder';
import { browseHref, entryCard } from '../lib/routes';
import type { LibraryEntry, MediaType } from '../types/library';
import styles from './Home.module.css';

/**
 * L'accueil.
 *
 * Deux bandeaux : ce qui sort en ce moment, et ce qu'on suit. Le premier
 * répond à « qu'est-ce qui commence ? », le second à « j'en étais où ? ».
 *
 * Le lien « Home » de la barre menait jusqu'ici à Browse — il promettait une
 * page qui n'existait pas.
 *
 * Trois requêtes : la saison, l'appoint qui va chercher ce qu'AniList ne range
 * dans aucune saison — voir `lib/season` — et l'état des séries suivies, qui
 * ne part que si la bibliothèque n'est pas vide.
 *
 * Le titre, l'affiche et la progression du second bandeau viennent du
 * stockage local : il s'affiche avant qu'AniList ait répondu, et resterait
 * lisible hors ligne. Ce qu'AniList ajoute, et que le stockage ne peut pas
 * savoir, c'est le nombre d'épisodes SORTIS — donc le retard : voir
 * `lib/upNext`.
 */

/** Assez pour remplir le bandeau au-delà du bord, pas assez pour peser. */
const RAIL = 20;

/**
 * Une rangée de ce qu'on suit, dans un média.
 *
 * Le même bloc sert aux animes en cours et aux mangas en cours de lecture.
 * Tout vient du stockage local : il s'affiche avant qu'AniList réponde et
 * resterait lisible hors ligne.
 */
function Shelf({
  title,
  media,
  entries,
}: {
  title: string;
  media: MediaType;
  entries: LibraryEntry[];
}) {
  const verbe = media === 'manga' ? 'reading' : 'watching';

  return (
    <>
      <hr className="rule" />
      <section className={styles.section}>
        <div className={styles.head}>
          <h2 className="title">{title}</h2>
          {/* La liste entière derrière la rangée : l'onglet du média, filtré sur
              ce qu'on suit. Le profil, où menait le lien, obligeait à la
              chercher. */}
          <Link className={styles.all} to={`/library/${media}?status=current`}>
            My library
            <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>

        {entries.length === 0 ? (
          <p className="muted">Nothing in progress. Start {verbe} a title and it shows up here.</p>
        ) : (
          <Rail>
            {entries.map((e) => {
              /* La progression se lit dans l'unité du média : des épisodes
                 d'un côté, des chapitres de l'autre. */
              const lu = e.progress.kind === 'anime' ? e.progress.episodes : e.progress.chapters;
              const total = e.totalUnits;
              return (
                <MediaCard
                  key={e.key}
                  media={media}
                  {...entryCard(e)}
                  title={e.title}
                  cover={e.cover ?? null}
                  meta={`${lu} / ${total ?? '?'}`}
                  tip={{
                    season: e.season,
                    year: e.seasonYear,
                    studio: e.studio,
                    format: e.format,
                    episodes: total,
                  }}
                />
              );
            })}
          </Rail>
        )}
      </section>
    </>
  );
}

/**
 * Ce que la carte dit sous le titre.
 *
 * Le RETARD quand il y en a — « EP13 · +3 », le dernier épisode vu et ce qui
 * attend derrière —, la progression sinon. Les deux ne se déduisent pas l'un
 * de l'autre : `13 / 19` peut vouloir dire « à jour » comme « six soirées de
 * retard », selon que la série diffuse encore. Voir `lib/upNext`.
 */
function avancement(r: UpNextRow): string {
  if (r.waiting !== null && r.waiting > 0) {
    return r.watched > 0 ? `EP${r.watched} · +${r.waiting}` : `+${r.waiting} to watch`;
  }
  return `${r.watched} / ${r.total ?? '?'}`;
}

export default function Home() {
  /* Stable d'un rendu à l'autre : `currentSeason()` rend un objet neuf à
     chaque appel, ce qui invaliderait les mémos qui en dépendent. */
  const point = useMemo(() => currentSeason(), []);

  /* Le filtre par saison fait foi : lui seul connaît les fiches qu'AniList a
     rangées sans leur donner de date exploitable. */
  const saison = useBrowseInfinite({
    type: 'ANIME',
    season: point.season,
    seasonYear: point.year,
    sort: ['POPULARITY_DESC'],
    perPage: RAIL,
  });

  /* Ce qu'AniList ne range dans aucune saison — les donghua. Même hook que
     Browse : la règle a trop changé pour vivre en deux exemplaires. */
  const sansSaison = useSeasonExtras(point, {
    type: 'ANIME',
    sort: ['POPULARITY_DESC'],
    perPage: RAIL,
  });

  const sortiesDuMoment = mergeBySort(
    saison.data?.pages[0]?.media ?? [],
    sansSaison,
    'POPULARITY_DESC',
  ).slice(0, RAIL);

  const entries = useLibrary((s) => s.entries);
  /* En cours seulement, le plus récemment touché en tête : c'est l'ordre dans
     lequel on reprend. À égalité, par titre — le tri « Last updated » de la
     bibliothèque, où mène « My library ». Trier sur la seule date laissait les
     égalités dans l'ordre du stockage : après un import, où tout partage la
     même date, l'accueil et la bibliothèque ne montraient plus le même ordre. */
  const suivis = useMemo(
    () =>
      sortLibrary(
        Object.values(entries).filter((e) => e.media === 'anime' && e.status === 'current'),
        'updated',
      ).slice(0, RAIL),
    [entries],
  );

  /* Ce qu'AniList sait et que la copie locale ignore : le total d'épisodes
     d'une série encore en diffusion, qui bouge chaque semaine. */
  /* Seules les entrées AniList : c'est lui qui connaît la diffusion, et une
     œuvre qu'il ignore n'a rien à demander. */
  const enCours = useUpNext(
    suivis.map((e) => e.ids.anilist).filter((id): id is number => typeof id === 'number'),
  );

  /* Les mangas en cours de lecture, dans le même ordre que `suivis`. Rien à
     demander au réseau : la copie locale porte déjà le titre, l'affiche et le
     total de chapitres, et `UP_NEXT` ne parle que d'anime — c'est un
     calendrier de diffusion. */
  const enLecture = useMemo(
    () =>
      sortLibrary(
        Object.values(entries).filter((e) => e.media === 'manga' && e.status === 'current'),
        'updated',
      ).slice(0, RAIL),
    [entries],
  );

  /* « Publishing now » tient lieu de saison : un manga n'en a pas, mais
     « ce qui paraît en ce moment » répond à la même question. */
  const mangas = useBrowseInfinite({
    type: 'MANGA',
    status: 'RELEASING',
    sort: ['POPULARITY_DESC'],
    perPage: RAIL,
  });
  /* Le retard se calcule ici : la bibliothèque sait ce qu'on a coché, AniList
     ce qui est sorti. Ni l'un ni l'autre ne suffit seul. */
  const aVoir = useMemo(
    () =>
      upNextRows(suivis, (e) => {
        const m = enCours.data?.find((x) => x.id === e.ids.anilist);
        return m
          ? { episodes: m.episodes, status: m.status, nextAiringEpisode: m.nextAiringEpisode }
          : undefined;
      }),
    [suivis, enCours.data],
  );

  return (
    <div className="page">
      {/* Le titre que le dessin n'affiche pas — voir `.sr-only`. */}
      <h1 className="sr-only">Home</h1>
      <section className={styles.section}>
        <div className={styles.head}>
          <h2 className="title">{seasonTitle(point)}</h2>
          <Link className={styles.all} to={browseHref({ season: point.season, year: point.year })}>
            See all
            <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>

        {saison.isPending && <p className="faint">Loading…</p>}
        {saison.error && <p className="muted">Couldn’t reach AniList.</p>}

        <Rail>
          {sortiesDuMoment.map((m) => (
            <MediaCard
              key={m.id}
              media="anime"
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
        </Rail>
      </section>

      <hr className="rule" />

      <section className={styles.section}>
        <div className={styles.head}>
          <h2 className="title">Watching</h2>
          {/* Comme pour les mangas en cours : voir `Shelf`. */}
          <Link className={styles.all} to="/library/anime?status=current">
            My library
            <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>

        {aVoir.length === 0 ? (
          <p className="muted">Nothing in progress. Start watching a title and it shows up here.</p>
        ) : (
          <Rail>
            {aVoir.map((r) => {
              const e = r.entry;
              const id = e.ids.anilist;
              return (
                <MediaCard
                  key={e.key}
                  media="anime"
                  {...entryCard(e)}
                  /* La carte mène à L'ÉPISODE À VOIR, pas à la fiche : c'est là
                     qu'on le coche, qu'on le note et qu'on lit son résumé. Rien
                     à voir, rien à ouvrir : on retombe alors sur la fiche, comme
                     avant. La clé de bibliothèque doit être donnée à la main —
                     sous `href`, la carte ne la déduit plus. */
                  href={id && r.next ? `/anime/${id}/episodes?ep=${r.next}` : undefined}
                  libraryKey={e.key}
                  title={e.title}
                  cover={e.cover ?? null}
                  meta={avancement(r)}
                  tip={{
                    season: e.season,
                    year: e.seasonYear,
                    studio: e.studio,
                    format: e.format,
                    episodes: r.total ?? undefined,
                  }}
                />
              );
            })}
          </Rail>
        )}
      </section>

      <hr className="rule" />

      <Shelf title="Reading" media="manga" entries={enLecture} />

      <hr className="rule" />

      <section className={styles.section}>
        <div className={styles.head}>
          <h2 className="title">
            <BookOpen size={20} strokeWidth={1.9} aria-hidden />
            Publishing now
          </h2>
          <Link className={styles.all} to="/browse?media=manga&status=RELEASING">
            See all
            <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>

        {mangas.isPending && <p className="faint">Loading…</p>}
        {mangas.error && <p className="muted">Couldn't reach AniList.</p>}

        <Rail>
          {(mangas.data?.pages[0]?.media ?? []).map((m) => (
            <MediaCard
              key={m.id}
              media="manga"
              id={m.id}
              title={displayTitle(m.title)}
              cover={m.coverImage.large}
              score={m.averageScore}
              meta={[m.format, m.startDate?.year].filter(Boolean).join(' · ')}
              tip={{ year: m.startDate?.year, format: m.format, episodes: m.chapters }}
            />
          ))}
        </Rail>
      </section>
    </div>
  );
}
