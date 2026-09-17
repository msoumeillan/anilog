import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Images,
  Play,
  Share2,
} from 'lucide-react';
import { useAnimeDetail, type StaffPage } from '../api/anilist/hooks';
import { useMore } from '../api/anilist/useMore';
import { STAFF_PAGE } from '../api/anilist/queries';
import { useLibrary } from '../store/library';
import { useArtworkFor } from '../store/artwork';
import { artUrl } from '../lib/artwork';
import { isoDate } from '../lib/dates';
import { tmdbEnabled } from '../api/tmdb/client';
import { entryKey } from '../lib/ids';
import { altTitles, displayTitle } from '../lib/title';
import { dedupeBy } from '../lib/dedupe';
import { TrackPanel } from '../components/TrackPanel';
import { ThemeList } from '../components/Themes';
import { useAnimeThemes } from '../api/animethemes/hooks';
import { FavouriteButton } from '../components/FavouriteButton';
import { MediaRow } from '../components/MediaRow';
import { browseHref } from '../lib/routes';
import { useGoBack } from '../lib/useGoBack';
import { Trailer } from '../components/Trailer';
import { Modal } from '../components/Modal';
import { ArtworkDialog } from '../components/ArtworkDialog';
import { Lightbox } from '../components/Lightbox';
import { Tags } from '../components/Tags';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { seiyuu } from '../lib/voice';
import { missingMainRoles, priorityStaff } from '../lib/staff';
import { keyframeStaffListUrl } from '../lib/external';
import { isSingleUnit } from '../lib/format';
import { readHint } from '../lib/mediaHint';
import { Synopsis } from '../components/Synopsis';
import { outOfTen } from '../lib/score';
import styles from './AnimeDetail.module.css';

/**
 * Fiche anime.
 *
 * Ton bloc de suivi reste juste sous le titre — c'est un journal personnel,
 * les scores AniList ne sont que des métadonnées.
 *
 * Manque encore : la vraie liste d'épisodes (titres, dates, filler — donnée Jikan)
 * et les musiques (AnimeThemes). Les deux demandent une intégration séparée.
 */

/* Les trois familles de liens qu'AniList distingue, dans l'ordre demandé :
   le site officiel d'abord, les réseaux ensuite, le streaming en dernier. */
const LINK_GROUPS = [
  { type: 'INFO', label: 'Official site', Icon: Globe },
  { type: 'SOCIAL', label: 'Social', Icon: Share2 },
  { type: 'STREAMING', label: 'Where to watch', Icon: Play },
] as const;

/** Personnages et crédits montrés en aperçu ; le reste vit sur sa propre page. */
const CHARACTER_TEASER = 6;
const STAFF_TEASER = 6;

/**
 * Pages de credits supplementaires qu'on s'autorise a demander pour trouver
 * les quatre roles principaux.
 *
 * Meme trie par pertinence, AniList laisse parfois le compositeur juste
 * derriere la frontiere des 25 : 26e sur Attack on Titan, 33e sur Demon
 * Slayer. Une page de plus suffit dans les deux cas ; deux donnent de la
 * marge sans jamais devenir couteux, puisqu'on s'arrete des qu'ils sont la.
 */
const STAFF_LOOKAHEAD = 2;

export default function AnimeDetail() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useAnimeDetail(id);

  /* Les openings et endings vivent dans leur propre requete : AnimeThemes
     repond entre 0,7 et 10 secondes selon l'heure, et la fiche n'a pas a
     l'attendre. Elle s'affiche, la section arrive apres. */
  const themes = useAnimeThemes(id);

  const [artOpen, setArtOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  /* Les images choisies à la main. Elles priment sur celles d'AniList ici,
     comme sur toutes les cartes de l'app — voir `store/artwork`. */
  const art = useArtworkFor('anime', id);

  /* Ces credits ne sont pas tires a l'ouverture : le hook ne part qu'a la
     demande de l'effet ci-dessous, et seulement s'il manque un role. */
  const moreStaff = useMore({
    queryKey: ['anime', id, 'staff'],
    query: STAFF_PAGE,
    variables: { id },
    connection: (d: StaffPage) => d.Media.staff,
    hasMoreInitially: data?.staff.pageInfo?.hasNextPage ?? false,
  });

  const staffPool = [...(data?.staff.edges ?? []), ...moreStaff.extra];

  /* On ne demande une page de plus que tant qu'un des quatre roles manque, et
     jamais au-dela du plafond. La plupart des fiches n'en demandent aucune. */
  const seekingStaff =
    staffPool.length > 0 &&
    missingMainRoles(staffPool).length > 0 &&
    moreStaff.hasMore &&
    !moreStaff.failed &&
    moreStaff.pagesLoaded < STAFF_LOOKAHEAD;

  const { loadMore: loadMoreStaff, loading: loadingStaff } = moreStaff;
  useEffect(() => {
    if (seekingStaff && !loadingStaff) loadMoreStaff();
  }, [seekingStaff, loadingStaff, loadMoreStaff]);

  const goBack = useGoBack();
  const key = entryKey('anime', id);
  const entry = useLibrary((s) => s.entries[key]);
  /* Ce qu'on sait deja : la carte d'ou l'on vient l'a emporte, sinon l'entree
     de bibliotheque en garde une copie pour l'affichage hors ligne. */
  const hint = readHint(useLocation().state) ?? (entry?.title ? entry : null);
  const setEpisodeWatched = useLibrary((s) => s.setEpisodeWatched);

  if (error)
    return (
      <div className={`page ${styles.state}`}>
        <p className="muted">Couldn't load this title. AniList didn't respond.</p>
      </div>
    );

  /* Squelette plutot qu'un « Loading… » centre : l'API d'AniList met 2 a 3 s a
     repondre — elle met deja 865 ms pour `{id}` seul — et pendant ce temps le
     titre et l'affiche sont deja connus. On pose donc la page tout de suite et
     on la remplit ensuite, au lieu de faire attendre devant du vide.

     Cette branche ne s'execute QUE sans donnees : ce qui s'affiche une fois la
     reponse arrivee est inchange. */
  if (isPending || !data)
    return (
      <article aria-busy="true">
        <div className={styles.hero}>
          {hint?.cover ? (
            <img className={`${styles.heroImg} ${styles.heroBlur}`} src={hint.cover} alt="" />
          ) : (
            <div className={`${styles.heroImg} placeholder`} />
          )}
          <div className={styles.heroVeil} />

          <div className={`page ${styles.heroTop}`}>
            <button type="button" className={`btn btn--quiet ${styles.back}`} onClick={goBack}>
              <ChevronLeft size={18} strokeWidth={2} aria-hidden />
              Back
            </button>
          </div>

          <div className={`page ${styles.heroText}`}>
            {hint ? (
              <h1 className="display">{hint.title}</h1>
            ) : (
              <span className={`${styles.skelTitle} placeholder`} />
            )}
          </div>
        </div>

        <div className={`page ${styles.body}`}>
          <div className={styles.rail}>
            <div className="poster">
              {hint?.cover && <img className={styles.cover} src={hint.cover} alt="" />}
            </div>
          </div>
          <div className={styles.main}>
            <p className="faint">Loading…</p>
          </div>
        </div>
      </article>
    );

  /* Le choix de l'utilisateur d'abord, l'image d'AniList en repli. Deux
     définitions différentes parce que les deux usages le sont : une affiche
     de 200 px de large sur un écran dense, un bandeau qui traverse la page. */
  const poster = artUrl(art?.poster, 'w500') ?? data.coverImage.extraLarge;
  const backdrop = artUrl(art?.backdrop, 'w1280') ?? data.bannerImage;
  /* La version a regarder, pas celle a poser dans la page : `w500` suffit dans
     une colonne de 200 px, pas plein ecran. `extraLarge` est deja la plus
     grande qu'AniList serve. */
  const posterBig = artUrl(art?.poster, 'w780') ?? data.coverImage.extraLarge;

  const total = data.episodes ?? 0;
  /* Un film ne se suit pas épisode par épisode : on le note, c'est tout. */
  const piece = isSingleUnit(data.format, data.episodes);
  const studio = data.studios.edges.find((e) => e.isMain)?.node;
  const progress = entry?.progress.kind === 'anime' ? entry.progress.episodes : 0;

  /* Chaque donnée de catalogue est une porte vers les titres qui la partagent.
     La saison et l'année partent ensemble : « Winter 2015 » est une seule
     idée, pas deux filtres qu'on poserait séparément. */
  const airedLabel = [data.season, data.seasonYear].filter(Boolean).join(' ');
  const airedHref = airedLabel ? browseHref({ season: data.season, year: data.seasonYear }) : null;

  const filterLink = (label: string | null, href: string | null) =>
    label && href ? (
      <Link to={href} className={styles.inlineLink}>
        {label}
      </Link>
    ) : null;

  /* Un studio peut revenir deux fois dans la connexion — mesuré sur Oshi no
     Ko : Doga Kobo, une fois studio principal, une fois parmi les autres
     crédités. Affiché deux fois, et React protestait sur la clé en double. Le
     premier gardé est le principal : c'est l'ordre d'AniList. */
  const studios = dedupeBy(data.studios.edges, (e) => e.node.id);
  const studioLinks =
    studios.length > 0 ? (
      <span className={styles.studioList}>
        {studios.map((e, i) => (
          <span key={e.node.id}>
            {i > 0 && ', '}
            <Link to={`/studio/${e.node.id}`} className={styles.inlineLink}>
              {e.node.name}
            </Link>
          </span>
        ))}
      </span>
    ) : null;

  const infos: [string, React.ReactNode][] = (
    [
      ['Studio', studioLinks],
      ['Format', filterLink(data.format, data.format && browseHref({ format: data.format }))],
      ['Episodes', total ? String(total) : '—'],
      ['Duration', data.duration ? `${data.duration} min` : '—'],
      ['Aired', filterLink(airedLabel, airedHref)],
      ['Status', filterLink(data.status, data.status && browseHref({ status: data.status }))],
      ['Favourites', data.favourites?.toLocaleString('en-US') ?? '—'],
    ] satisfies [string, React.ReactNode][]
  ).filter(([, v]) => v && v !== '—');

  const relations = data.relations.edges.filter((e) => e.node.title?.romaji);
  const characters = dedupeBy(data.characters.edges, (c) => c.node.id).slice(0, CHARACTER_TEASER);
  /* Pas les six premiers d'AniList : les six qu'on cherche en arrivant —
     auteur, réalisateur, chara-design, compositeur. */
  const staff = priorityStaff(staffPool, STAFF_TEASER);
  const keyframeUrl = keyframeStaffListUrl(data.title.romaji);

  return (
    <article>
      <div className={styles.hero}>
        {backdrop ? (
          <img className={styles.heroImg} src={backdrop} alt="" />
        ) : (
          <div className={`${styles.heroImg} placeholder`} />
        )}
        <div className={styles.heroVeil} />

        <div className={`page ${styles.heroTop}`}>
          {/* Un lien en dur vers /browse jetait les filtres qu'on venait
              de poser, et renvoyait ailleurs qui arrivait d'un studio. */}
          <button type="button" className={`btn btn--quiet ${styles.back}`} onClick={goBack}>
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
            Back
          </button>

          {/* Sans clé TMDB il n'y a aucune image de rechange à proposer : le
              bouton ne s'affiche pas plutôt que de décevoir à chaque clic. */}
          {tmdbEnabled && (
            <button
              type="button"
              className={`btn btn--quiet ${styles.back}`}
              onClick={() => setArtOpen(true)}
            >
              <Images size={17} strokeWidth={2} aria-hidden />
              Artwork
            </button>
          )}
        </div>

        <div className={`page ${styles.heroText}`}>
          <p className="label">
            {filterLink(airedLabel, airedHref)}
            {airedLabel && studio && ' · '}
            {studio && (
              <Link to={`/studio/${studio.id}`} className={styles.inlineLink}>
                {studio.name}
              </Link>
            )}
          </p>
          <h1 className="display">{displayTitle(data.title)}</h1>
          <p className="muted">
            {/* « 1 episodes » sur un film ne veut rien dire : c'est sa durée
                qu'on cherche à cet endroit. */}
            {[
              ...altTitles(data.title),
              data.format,
              piece ? data.duration && `${data.duration} min` : total && `${total} episodes`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className={`page ${styles.body}`}>
        <div className={styles.rail}>
          <div className="poster">
            {poster && (
              <button
                type="button"
                className={styles.coverBtn}
                aria-label="View the poster larger"
                onClick={() => setZoom(true)}
              >
                <img className={styles.cover} src={poster} alt="" />
              </button>
            )}
          </div>

          <TrackPanel
            key={key}
            media="anime"
            anilistId={id}
            malId={data.idMal}
            title={displayTitle(data.title)}
            cover={data.coverImage.large}
            total={data.episodes}
            /* Recopie dans l'entree pour la bulle de survol de la
               bibliotheque, qui n'a pas de reseau a interroger. */
            format={data.format}
            season={data.season}
            seasonYear={data.seasonYear}
            studio={studio?.name}
            genres={data.genres}
            duration={data.duration}
            singleUnit={piece}
          />

          <FavouriteButton
            favKey={entryKey('anime', id)}
            id={id}
            name={displayTitle(data.title)}
            image={data.coverImage.large}
            href={`/anime/${id}`}
          />

          {LINK_GROUPS.map(({ type, label, Icon }) => {
            const links = data.externalLinks.filter((l) => l.type === type);
            if (links.length === 0) return null;
            return (
              <div key={type} className={styles.links}>
                <p className="label">{label}</p>
                {links.map((l) => (
                  <a
                    key={l.url}
                    className={styles.link}
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                  >
                    <Icon size={13} strokeWidth={2} aria-hidden />
                    {l.site}
                    <ExternalLink
                      size={12}
                      strokeWidth={1.8}
                      aria-hidden
                      className={styles.linkOut}
                    />
                  </a>
                ))}
              </div>
            );
          })}
        </div>

        <div className={styles.main}>
          <div className={styles.scores}>
            <div>
              <p className="label">AniList score</p>
              <p className={styles.big}>
                {data.averageScore}
                <span className="faint">/100</span>
              </p>
            </div>
            <div>
              <p className="label">Members</p>
              <p className={styles.big}>{data.popularity?.toLocaleString('en-US')}</p>
            </div>
            <div className={styles.chips}>
              {data.genres.map((g) => (
                <Link key={g} to={`/genre/${encodeURIComponent(g)}`} className={styles.chip}>
                  {g}
                </Link>
              ))}
            </div>
          </div>

          <hr className="rule" />

          <section className={styles.section}>
            <Synopsis text={data.description} />
            <Tags tags={data.tags} />
          </section>

          {data.trailer?.id && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <h2 className="label">Trailer</h2>
                <Trailer
                  id={data.trailer.id}
                  site={data.trailer.site}
                  thumbnail={data.trailer.thumbnail}
                  title={displayTitle(data.title)}
                />
              </section>
            </>
          )}

          {/* Juste apres la bande-annonce, et avant les episodes : c'est la meme
              famille — ce qu'on REGARDE de l'oeuvre, avant ce qu'on en suit.
              La section n'existe pas quand AnimeThemes ne connait pas le titre,
              plutot que d'annoncer un vide. */}
          {themes.data && themes.data.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className="label">Openings &amp; endings</h2>
                  <p className="label">{themes.data.length}</p>
                </div>
                <ThemeList
                  themes={themes.data}
                  anime={{
                    anilistId: id,
                    title: displayTitle(data.title),
                    year: data.seasonYear,
                    cover: data.coverImage.large,
                  }}
                />
              </section>
            </>
          )}

          {!piece && (
            <>
              <hr className="rule" />

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className="label">Episodes</h2>
                  <p className="label">
                    {progress} / {total || '?'}
                  </p>
                </div>
                <Link to={`/anime/${id}/episodes`} className={styles.epsLink}>
                  <div className={styles.epsText}>
                    <span className={styles.epsNext}>
                      {total && progress >= total
                        ? 'All episodes watched'
                        : `Up next — episode ${progress + 1}`}
                    </span>
                    <span className="label">
                      Full list with air dates, filler flags and spoiler masking
                    </span>
                  </div>
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </Link>

                {entry && (!total || progress < total) && (
                  <button
                    type="button"
                    className="btn btn--accent"
                    onClick={() => setEpisodeWatched(key, progress + 1, true)}
                  >
                    <Check size={16} strokeWidth={2.4} aria-hidden />
                    Mark episode {progress + 1} watched
                  </button>
                )}
              </section>
            </>
          )}

          <hr className="rule" />
          <section className={styles.section}>
            <h2 className="label">Information</h2>
            <dl className={styles.infos}>
              {infos.map(([k, v]) => (
                <div key={k} className={styles.info}>
                  <dt className="label">{k}</dt>
                  <dd className={styles.infoValue}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {relations.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <h2 className="label">Relations</h2>
                <MediaRow
                  items={relations.map((r) => ({
                    ...r.node,
                    above: `${r.relationType} · ${r.node.type}`,
                  }))}
                />
              </section>
            </>
          )}

          {characters.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                {/* Le titre est la porte de sortie : six personnages ici,
                    tous les autres sur leur propre page. */}
                <Link to={`/anime/${id}/characters`} className={styles.sectionLink}>
                  <h2 className="label">Characters</h2>
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                </Link>
                <PersonGrid teaser>
                  {characters.map((c) => {
                    const va = seiyuu(c.voiceActors);
                    return (
                      <PersonCard
                        key={c.node.id}
                        to={`/character/${c.node.id}`}
                        name={c.node.name.full}
                        image={c.node.image.medium}
                        link={va && { to: `/staff/${va.id}`, label: va.name }}
                      />
                    );
                  })}
                </PersonGrid>
              </section>
            </>
          )}

          {staff.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <Link to={`/anime/${id}/staff`} className={styles.sectionLink}>
                  <h2 className="label">Staff</h2>
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                </Link>
                <PersonGrid teaser>
                  {staff.map((s) => (
                    <PersonCard
                      key={`${s.node.id}-${s.role}`}
                      to={`/staff/${s.node.id}`}
                      name={s.node.name.full}
                      image={s.node.image.medium}
                      role={s.role}
                    />
                  ))}
                </PersonGrid>
                {/* AniList ne recense pas les feuilles d'animation clé ;
                    keyframe-staff-list les tient à jour. */}
                {keyframeUrl && (
                  <a className={styles.subLink} href={keyframeUrl} target="_blank" rel="noopener">
                    Key frame staff list
                    <ExternalLink size={12} strokeWidth={1.8} aria-hidden />
                  </a>
                )}
              </section>
            </>
          )}

          {data.recommendations.edges.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <h2 className="label">If you liked this</h2>
                <MediaRow
                  items={data.recommendations.edges
                    .map((r) => r.node.mediaRecommendation)
                    .filter((m) => m !== null)
                    .map((m) => ({ ...m, below: outOfTen(m.averageScore) ?? '—' }))}
                />
              </section>
            </>
          )}
        </div>
      </div>

      <Lightbox
        open={zoom}
        onOpenChange={setZoom}
        src={posterBig ?? undefined}
        title={displayTitle(data.title)}
      />

      <Modal open={artOpen} onOpenChange={setArtOpen} title="Artwork" wide>
        {/* Monté seulement à l'ouverture : deux requêtes pour une centaine
            d'images n'ont rien à faire au chargement de la fiche. */}
        {artOpen && (
          <ArtworkDialog
            media="anime"
            anilistId={id}
            /* Les mêmes indices que la page d'épisodes : c'est ce qui garantit
               qu'on propose les affiches de LA saison affichée. */
            hints={{
              titles: [data.title.english, data.title.romaji, data.title.native],
              year: data.startDate?.year ?? data.seasonYear,
              start: isoDate(data.startDate),
              movie: data.format === 'MOVIE',
            }}
            defaultPoster={data.coverImage.extraLarge}
            defaultBackdrop={data.bannerImage}
          />
        )}
      </Modal>
    </article>
  );
}
