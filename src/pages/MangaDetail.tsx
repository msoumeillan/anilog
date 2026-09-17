import { useParams, useLocation, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink, Globe, Share2 } from 'lucide-react';
import { useMangaDetail } from '../api/anilist/hooks';
import { useMangaBaka } from '../api/mangabaka/hooks';
import { useMalManga } from '../api/mal/hooks';
import { animeSpan, counts, publishers, ratings } from '../lib/mangabaka';
import { magazines } from '../lib/mal';
import { useLibrary } from '../store/library';
import { entryKey } from '../lib/ids';
import { altTitles, displayTitle } from '../lib/title';
import { dedupeBy } from '../lib/dedupe';
import { formatLabel } from '../lib/mediaOptions';
import { readHint } from '../lib/mediaHint';
import { Synopsis } from '../components/Synopsis';
import { relationRank } from '../lib/mangabakaCatalogue';
import { outOfTen } from '../lib/score';
import { useGoBack } from '../lib/useGoBack';
import { browseHref } from '../lib/routes';
import { TrackPanel } from '../components/TrackPanel';
import { FavouriteButton } from '../components/FavouriteButton';
import { MediaRow } from '../components/MediaRow';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { Tags } from '../components/Tags';
import { Trailer } from '../components/Trailer';
import { AnimeSpanSection, ElsewhereScores, PublishersSection } from '../components/MangaBakaFacts';
import { Magazines } from '../components/Magazines';
import styles from './AnimeDetail.module.css';

/**
 * Fiche manga.
 *
 * Elle emprunte la feuille de style de la fiche anime : c'est la même page,
 * avec d'autres champs. Dupliquer le CSS ferait diverger les deux au premier
 * ajustement — la v1 en est morte.
 *
 * Ce qui change vraiment tient en trois points :
 *
 *   - on compte des CHAPITRES et des TOMES, pas des épisodes ;
 *   - les auteurs remplacent le studio, et ils sont dans le staff ;
 *   - il n'y a ni saison, ni bande-annonce, ni liste d'épisodes.
 *
 * Ce qui manque encore, et qui viendra : les pages complètes personnages et
 * staff — ici seuls les six premiers sont montrés, sans porte de sortie.
 */

const LINK_GROUPS = [
  { type: 'INFO', label: 'Official site', Icon: Globe },
  { type: 'SOCIAL', label: 'Social', Icon: Share2 },
] as const;

const CHARACTER_TEASER = 6;
const STAFF_TEASER = 6;

/** `{ year, month, day }` → « Apr 27, 2005 ». Une année seule reste une année. */
function humanDate(d: { year: number | null; month: number | null; day: number | null }): string {
  if (!d.year) return '—';
  if (!d.month) return String(d.year);
  const at = new Date(d.year, d.month - 1, d.day ?? 1);
  return at.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    ...(d.day ? { day: 'numeric' } : {}),
  });
}

export default function MangaDetail() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useMangaDetail(id);

  /* Enrichissement, jamais identité : si MangaBaka ne répond pas, ces
     sections disparaissent et la fiche reste entière. */
  const mb = useMangaBaka(id);

  /* Le magazine de prépublication n'existe nulle part chez AniList — son
     schéma n'a aucun champ de sérialisation. Il vient donc de MyAnimeList. */
  const malFiche = useMalManga(data?.idMal);

  const goBack = useGoBack();
  const key = entryKey('manga', id);
  const entry = useLibrary((s) => s.entries[key]);
  const hint = readHint(useLocation().state) ?? (entry?.title ? entry : null);

  if (error)
    return (
      <div className={`page ${styles.state}`}>
        <p className="muted">Couldn't load this title. AniList didn't respond.</p>
      </div>
    );

  /* Même squelette que la fiche anime, et pour la même raison : AniList met
     2 à 3 secondes, alors que le titre et l'affiche sont déjà connus. */
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

  const characters = dedupeBy(data.characters.edges, (c) => c.node.id).slice(0, CHARACTER_TEASER);
  const staff = dedupeBy(data.staff.edges, (s) => s.node.id).slice(0, STAFF_TEASER);
  /* Dans l'ordre ou on les lit : prequelle, suite, adaptation, puis le reste.
     La fiche MangaBaka le fait depuis qu'on l'a demande ; celle-ci, servie
     seulement quand MangaBaka ignore l'oeuvre, avait ete oubliee — une page
     qu'on ne voit jamais ne signale pas qu'elle derive. `sort` recopie : celui
     de JavaScript modifie le tableau qu'on lui donne. */
  const relations = [...data.relations.edges]
    .filter((e) => e.node.title?.romaji)
    .sort((a, b) => relationRank(a.relationType) - relationRank(b.relationType));

  /* Les auteurs plutôt que le studio : chez AniList ils vivent dans le staff,
     sous des rôles qui varient — « Story & Art », « Story », « Art ». */
  const auteurs = dedupeBy(
    data.staff.edges.filter((s) => /story|art/i.test(s.role)),
    (s) => s.node.id,
  ).slice(0, 3);

  const notes = ratings(mb.data);
  const span = animeSpan(mb.data);
  const maisons = publishers(mb.data);

  /* AniList laisse `chapters` vide tant qu'une série n'est pas terminée —
     One Piece compris. MangaBaka compte les parutions et comble le trou ; il
     ne prend jamais la place d'un nombre qu'AniList donne déjà. */
  const parus = counts(mb.data);
  const enCours = data.chapters == null;
  const chapters = data.chapters ?? parus.chapters;
  const volumes = data.volumes ?? parus.volumes;
  /* « so far » et non un total sec : 1191 chapitres parus d'une série en cours
     n'est pas la même affirmation que 1191 chapitres d'une série achevée. */
  const chapterLine = chapters ? `${chapters} chapters${enCours ? ' so far' : ''}` : 'Ongoing';
  const revues = magazines(malFiche.data);
  /* Hors du tableau ci-dessous : `infos` est une table de valeurs, pas une
     liste d'enfants, et du JSX écrit dans un littéral de tableau réveille la
     règle des clés — alors que la clé est posée par le `.map` qui le rend. */
  const magazineCell = revues.length > 0 ? <Magazines list={revues} /> : '—';

  const infos: [string, React.ReactNode][] = [
    ['Format', data.format ? formatLabel(data.format) : '—'],
    ['Status', data.status ?? '—'],
    ['Chapters', chapterLine],
    ['Volumes', volumes ? `${volumes}${enCours ? ' so far' : ''}` : '—'],
    ['Magazine', magazineCell],
    ['Published', `${humanDate(data.startDate)} → ${humanDate(data.endDate)}`],
    ['Country', data.countryOfOrigin ?? '—'],
  ];

  return (
    <article>
      <div className={styles.hero}>
        {data.bannerImage ? (
          <img className={styles.heroImg} src={data.bannerImage} alt="" />
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
          <p className="label">
            {/* L'année de début tient le rôle que la saison joue sur un anime :
                c'est la porte vers ce qui est sorti en même temps. */}
            {data.startDate.year && (
              <Link
                to={browseHref({ media: 'manga', year: data.startDate.year })}
                className={styles.inlineLink}
              >
                {data.startDate.year}
              </Link>
            )}
            {data.startDate.year && auteurs.length > 0 && ' · '}
            {auteurs.map((a, i) => (
              <span key={a.node.id}>
                {i > 0 && ', '}
                <Link to={`/staff/${a.node.id}`} className={styles.inlineLink}>
                  {a.node.name.full}
                </Link>
              </span>
            ))}
          </p>
          <h1 className="display">{displayTitle(data.title)}</h1>
          <p className="muted">
            {[
              ...altTitles(data.title),
              data.format && formatLabel(data.format),
              chapterLine,
              volumes && `${volumes} volumes`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className={`page ${styles.body}`}>
        <div className={styles.rail}>
          <div className="poster">
            {data.coverImage.extraLarge && (
              <img className={styles.cover} src={data.coverImage.extraLarge} alt="" />
            )}
          </div>

          <TrackPanel
            key={key}
            media="manga"
            anilistId={id}
            malId={data.idMal}
            title={displayTitle(data.title)}
            cover={data.coverImage.large}
            total={chapters}
            totalVolumes={volumes}
            format={data.format}
            genres={data.genres}
          />

          <FavouriteButton
            favKey={entryKey('manga', id)}
            id={id}
            name={displayTitle(data.title)}
            image={data.coverImage.large}
            href={`/manga/${id}`}
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
                    rel="noopener noreferrer"
                  >
                    <Icon size={15} strokeWidth={1.9} aria-hidden />
                    {l.site}
                    <ExternalLink
                      size={13}
                      strokeWidth={1.9}
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
                {data.averageScore ?? '—'}
                <span className="faint">/100</span>
              </p>
            </div>
            <div>
              <p className="label">Members</p>
              <p className={styles.big}>{data.popularity?.toLocaleString('en-US')}</p>
            </div>
            {/* Les sept bases qu'agrège MangaBaka, ramenées sur 100 — elles
                ne notent pas toutes sur la même échelle, et les juxtaposer
                brutes ferait passer un 4,4 sur 5 pour une note médiocre. */}
            {notes.length > 0 && <ElsewhereScores notes={notes} />}

            <div className={styles.chips}>
              {data.genres.map((g) => (
                <Link
                  key={g}
                  to={`/genre/${encodeURIComponent(g)}?media=manga`}
                  className={styles.chip}
                >
                  {g}
                </Link>
              ))}
            </div>
          </div>

          <hr className="rule" />
          <section className={styles.section}>
            <Synopsis text={data.description} />
            <Tags tags={data.tags} media="manga" />
          </section>

          {/* Le trailer de l'adaptation. AniList le porte sur la fiche manga
              aussi, ce que l'app n'affichait que du côté anime — 24 des 30
              mangas les plus populaires en ont un. */}
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

          {span && (
            <>
              <hr className="rule" />
              <AnimeSpanSection span={span} />
            </>
          )}

          {maisons.length > 0 && (
            <>
              <hr className="rule" />
              <PublishersSection list={maisons} />
            </>
          )}

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
                {/* Le titre est la porte de sortie : six ici, tous les
                    autres sur leur propre page. */}
                <Link to={`/manga/${id}/characters`} className={styles.sectionLink}>
                  <h2 className="label">Characters</h2>
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                </Link>
                <PersonGrid teaser>
                  {characters.map((c) => (
                    <PersonCard
                      key={c.node.id}
                      to={`/character/${c.node.id}`}
                      name={c.node.name.full}
                      image={c.node.image.medium}
                    />
                  ))}
                </PersonGrid>
              </section>
            </>
          )}

          {staff.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <Link to={`/manga/${id}/staff`} className={styles.sectionLink}>
                  <h2 className="label">Staff</h2>
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                </Link>
                <PersonGrid teaser>
                  {staff.map((s) => (
                    <PersonCard
                      key={s.node.id}
                      to={`/staff/${s.node.id}`}
                      name={s.node.name.full}
                      image={s.node.image.medium}
                      role={s.role}
                    />
                  ))}
                </PersonGrid>
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
    </article>
  );
}
