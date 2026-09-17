import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ExternalLink, Globe, Share2, ShoppingBag, BookOpen } from 'lucide-react';
import { useMbRelations, useMbSeries } from '../api/mangabaka/hooks';
import { useMangaDetail } from '../api/anilist/hooks';
import { useMalManga } from '../api/mal/hooks';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { FavouriteButton } from '../components/FavouriteButton';
import { Trailer } from '../components/Trailer';
import { AnimeSpanSection, ElsewhereScores, PublishersSection } from '../components/MangaBakaFacts';
import { Tags } from '../components/Tags';
import { Magazines } from '../components/Magazines';
import { MediaRow } from '../components/MediaRow';
import { TrackPanel } from '../components/TrackPanel';
import { useGoBack } from '../lib/useGoBack';
import { mbEntryKey } from '../lib/ids';
import { magazines } from '../lib/mal';
import { aggregate, animeSpan, counts, numericId, publishers, ratings } from '../lib/mangabaka';
import {
  altTitles,
  countryOf,
  coverUrl,
  genreLabel,
  relationRank,
  statusLabel,
  linkGroups,
  mbSeriesHref,
  publishedRange,
  relations,
} from '../lib/mangabakaCatalogue';
import { Synopsis } from '../components/Synopsis';
import { formatLabel } from '../lib/mediaOptions';
import { outOfTen } from '../lib/score';
import { browseHref } from '../lib/routes';
import styles from './AnimeDetail.module.css';

/**
 * ESSAI — une fiche dont le CATALOGUE vient de MangaBaka.
 *
 * MangaBaka donne l'identité, le catalogue, les chapitres parus, les sept
 * notes et les éditeurs ; AniList rend ce qu'il est seul à avoir —
 * personnages, staff, tags, trailer, et surtout les ADAPTATIONS EN ANIME, que
 * MangaBaka ne peut pas connaître puisqu'il ne catalogue que du manga.
 *
 * Quand ce pont manque, la fiche reste entière et le dit. C'est le cas des
 * romans web, que MangaBaka a et qu'AniList n'a pas : zéro sur douze titres
 * mesurés.
 *
 * Elle reprend la charpente de la fiche manga, section pour section et filet
 * pour filet. Emprunter les classes sans la structure donnait une page en
 * vrac — c'est ce qu'elle était.
 */

/** Les mêmes groupes que sur MangaBaka, et dans le même ordre. */
const ICONES: Record<string, typeof Globe> = {
  'Read officially': BookOpen,
  Publisher: ShoppingBag,
  Info: Globe,
  Social: Share2,
};

export default function MbSeries() {
  const id = Number(useParams().id);
  const goBack = useGoBack();
  const { data, isPending, error } = useMbSeries(id);

  /* Le pont. Les hooks ne partent que si la série porte l'identifiant qu'il
     leur faut ; sinon ils dorment, et aucune requête n'est gaspillée. */
  const anilistId = numericId(data?.source?.anilist?.id);
  const al = useMangaDetail(typeof anilistId === 'number' ? anilistId : undefined);
  const malFiche = useMalManga(numericId(data?.source?.my_anime_list?.id));

  /* Une seule requête pour toutes les relations : ce point d'entrée embarque
     la série visée, titre et couverture compris. */
  const liees = useMbRelations(id);

  if (error)
    return (
      <div className={`page ${styles.state}`}>
        <p className="muted">MangaBaka didn&apos;t respond.</p>
      </div>
    );

  if (isPending || !data)
    return (
      <div className={`page ${styles.state}`}>
        <p className="faint">Loading…</p>
      </div>
    );

  const notes = ratings(data);
  const moyenne = aggregate(data);
  const span = animeSpan(data);
  const maisons = publishers(data);
  const parus = counts(data);
  const enCours = data.status === 'releasing';
  const personnages = (al.data?.characters.edges ?? []).slice(0, 6);
  const equipe = (al.data?.staff.edges ?? []).slice(0, 6);
  const couverture = coverUrl(data, 'x350');
  const autresTitres = altTitles(data);
  const groupes = linkGroups(data);
  const revues = magazines(malFiche.data);
  const motsCles = (data.tags ?? []).slice(0, 20);

  /* Hors du tableau : `infos` est une table de valeurs, pas une liste
     d'enfants, et du JSX écrit dans un littéral de tableau réveille la règle
     des clés — alors que la clé est posée par le `.map` qui le rend. */
  const magazineCell = revues.length > 0 ? <Magazines list={revues} /> : '—';

  /*
   * Les relations des DEUX sources, AniList devant.
   *
   * C'est lui qui porte les adaptations en anime. Ses relations sont aussi
   * plus riches et déjà triées ; celles de MangaBaka complètent avec ce qu'il
   * ignore — la suite d'un roman web, par exemple.
   */
  const relAniList = (al.data?.relations.edges ?? []).filter((e) => e.node.title?.romaji);
  const vus = new Set(relAniList.map((e) => e.node.id));
  const proches = relations(liees.data).filter((r) => {
    const idAl = numericId(r.series.source?.anilist?.id);
    return typeof idAl !== 'number' || !vus.has(idAl);
  });

  /* Prequelle, suite, puis adaptation, puis le reste — dans cet ordre quelle
     que soit la source. `sort` de JS est stable, donc l'ordre d'origine tient
     a l'interieur de chaque rang. */
  const relTriees = [
    ...relAniList.map((e) => ({
      cle: `al${e.node.id}`,
      relation: e.relationType,
      item: { ...e.node, above: `${e.relationType} · ${e.node.type}` },
    })),
    ...proches.map((r) => ({
      cle: `mb${r.series.id}`,
      relation: r.relation,
      item: {
        id: r.series.id,
        type: 'manga',
        title: { romaji: r.series.title ?? null, english: null, native: null },
        coverImage: { large: coverUrl(r.series, 'x250') },
        above: `${r.relation} · ${r.series.type ?? 'manga'}`,
        href: mbSeriesHref(r.series) ?? undefined,
      },
    })),
  ].sort((a, b) => relationRank(a.relation) - relationRank(b.relation));

  const recommandations = (al.data?.recommendations.edges ?? [])
    .map((r) => r.node.mediaRecommendation)
    .filter((m) => m !== null);

  /* Les auteurs d'AniList portent un identifiant, donc un lien vers leur
     fiche. Ceux de MangaBaka ne sont que des noms — ils restent du texte
     plutôt qu'un lien mort. */
  const auteursAl = (al.data?.staff.edges ?? [])
    .filter((s) => /story|art/i.test(s.role))
    .slice(0, 3);
  /* Dedoublonne : sur Chainsaw Man, Tatsuki Fujimoto est a la fois auteur et
     dessinateur, et son nom sortait deux fois — deux enfants avec la meme
     cle, ce que React refuse. */
  const auteursMb = [...new Set([...(data.authors ?? []), ...(data.artists ?? [])])].slice(0, 3);

  const infos: [string, React.ReactNode][] = [
    /* Capitalisé comme l'état juste dessous : MangaBaka écrit « manga » et
       « releasing » en minuscules, et les deux se lisent côte à côte. */
    ['Type', data.type ? formatLabel(data.type) : '—'],
    ['Status', statusLabel(data.status) ?? '—'],
    ['Chapters', parus.chapters ? `${parus.chapters}${enCours ? ' so far' : ''}` : '—'],
    ['Volumes', parus.volumes ? `${parus.volumes}${enCours ? ' so far' : ''}` : '—'],
    ['Magazine', magazineCell],
    ['Published', publishedRange(data)],
    ['Country', al.data?.countryOfOrigin ?? countryOf(data)],
    ['Licensed', data.is_licensed == null ? '—' : data.is_licensed ? 'Yes' : 'No'],
  ];

  return (
    <article>
      {/* La bannière d'AniList quand il connaît l'œuvre — MangaBaka n'en sert
          pas. Sinon la couverture, floutée, comme le squelette de la fiche
          manga : un fond vaut mieux qu'un bandeau vide. */}
      <div className={styles.hero}>
        {al.data?.bannerImage ? (
          <img className={styles.heroImg} src={al.data.bannerImage} alt="" />
        ) : couverture ? (
          <img className={`${styles.heroImg} ${styles.heroBlur}`} src={couverture} alt="" />
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
            {/* L'année mène à ce qui est sorti en même temps, comme sur la
                fiche manga — mais seulement quand AniList porte l'œuvre : son
                catalogue à lui ne sait pas filtrer par année. */}
            {data.year &&
              (anilistId ? (
                <Link
                  to={browseHref({ media: 'manga', year: data.year })}
                  className={styles.inlineLink}
                >
                  {data.year}
                </Link>
              ) : (
                data.year
              ))}
            {data.year && (auteursAl.length > 0 || auteursMb.length > 0) && ' · '}
            {auteursAl.length > 0
              ? auteursAl.map((a, i) => (
                  <span key={a.node.id}>
                    {i > 0 && ', '}
                    <Link to={`/staff/${a.node.id}`} className={styles.inlineLink}>
                      {a.node.name.full}
                    </Link>
                  </span>
                ))
              : auteursMb.map((nom, i) => (
                  <span key={nom}>
                    {i > 0 && ', '}
                    {/* Leur propre site rend l'auteur cliquable, et l'API
                        porte bien un filtre `staff` — vérifié, sept séries
                        pour « Cuttlefish that Loves Diving ». */}
                    <Link
                      to={`/mangabaka?staff=${encodeURIComponent(nom)}`}
                      className={styles.inlineLink}
                    >
                      {nom}
                    </Link>
                  </span>
                ))}
          </p>
          <h1 className="display">{data.title ?? 'Untitled'}</h1>
          <p className="muted">
            {[data.native_title, ...autresTitres, data.type, data.year].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className={`page ${styles.body}`}>
        <div className={styles.rail}>
          <div className="poster">
            {couverture && <img className={styles.cover} src={couverture} alt="" />}
          </div>

          {/* Suivable comme le reste. Quand l'œuvre existe chez AniList, la clé
              reste la sienne — c'est lui qui la nomme partout ailleurs. */}
          <TrackPanel
            key={anilistId ?? `mb${data.id}`}
            media="manga"
            anilistId={anilistId ?? undefined}
            mangaBakaId={anilistId ? undefined : data.id}
            title={data.title ?? ''}
            cover={couverture}
            total={parus.chapters}
            totalVolumes={parus.volumes}
            format={data.type ?? undefined}
            genres={data.genres}
          />

          {/* L'adresse est recopiee : cette oeuvre peut n'exister que chez
              MangaBaka, et le profil n'a pas a refaire ce raisonnement. */}
          <FavouriteButton
            favKey={mbEntryKey(data.id)}
            id={data.id}
            name={data.title ?? ''}
            image={couverture}
            href={`/mangabaka/${data.id}`}
          />

          {groupes.map(({ label, links }) => {
            const Icon = ICONES[label] ?? Globe;
            return (
              <div key={label} className={styles.links}>
                <p className="label">{label}</p>
                {links.map((l) => (
                  <a
                    key={l.label}
                    className={styles.link}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon size={15} strokeWidth={1.8} aria-hidden />
                    {l.label}
                    <ExternalLink
                      size={13}
                      strokeWidth={2}
                      aria-hidden
                      className={styles.linkOut}
                    />
                  </a>
                ))}
              </div>
            );
          })}

          <div className={styles.links}>
            <p className="label">Sources</p>
            <p className="faint">
              {anilistId
                ? `MangaBaka catalogue, filled out by AniList entry ${anilistId}.`
                : 'MangaBaka catalogue. Missing from AniList: no characters, no staff, no trailer.'}
            </p>
          </div>
        </div>

        <div className={styles.main}>
          <div className={styles.scores}>
            {/* La MOYENNE des sept bases, pas celle d'AniList : c'est ce que
                MangaBaka apporte, et une note qui repose sur sept sources vaut
                mieux qu'une seule. Sur 10, l'échelle que tout le monde lit —
                celle d'AniList reste lisible juste dessous, avec les autres. */}
            {outOfTen(moyenne) && (
              <div>
                <p className="label">Rating</p>
                <p className={styles.big}>
                  {outOfTen(moyenne)}
                  <span className="faint">/10</span>
                </p>
              </div>
            )}

            {al.data && (
              <div>
                <p className="label">Members</p>
                <p className={styles.big}>{(al.data.popularity ?? 0).toLocaleString('en-US')}</p>
              </div>
            )}

            {notes.length > 0 && <ElsewhereScores notes={notes} />}
          </div>

          {/* Elles mènent au catalogue MangaBaka, pas à `/genre/…` : le
              vocabulaire est le leur, et AniList ne connaît pas forcément le
              mot. */}
          {(data.genres ?? []).length > 0 && (
            <div className={styles.chips}>
              {(data.genres ?? []).map((g) => (
                <Link
                  key={g}
                  to={`/mangabaka?genre=${encodeURIComponent(g)}`}
                  className={styles.chip}
                >
                  {genreLabel(g)}
                </Link>
              ))}
            </div>
          )}

          {data.description && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <Synopsis text={data.description} />
                {al.data ? (
                  <Tags tags={al.data.tags} media="manga" />
                ) : (
                  <div className={styles.chips}>
                    {motsCles.map((t) => (
                      <Link
                        key={t}
                        to={`/mangabaka?tag=${encodeURIComponent(t)}`}
                        className={styles.chip}
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {al.data?.trailer?.id && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <h2 className="label">Trailer</h2>
                <Trailer
                  id={al.data.trailer.id}
                  site={al.data.trailer.site}
                  thumbnail={al.data.trailer.thumbnail}
                  title={data.title ?? ''}
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

          {(relAniList.length > 0 || proches.length > 0) && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <h2 className="label">Relations</h2>
                {/* Chaque vignette mène là où l'œuvre existe vraiment : la
                    fiche AniList quand il la connaît, la fiche MangaBaka
                    sinon. C'est ce qui fait du roman la porte d'entrée vers
                    ses manhua, et de là vers l'anime. */}
                <MediaRow items={relTriees.map((r) => r.item)} />
              </section>
            </>
          )}

          {personnages.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <Link to={`/manga/${anilistId}/characters`} className={styles.sectionLink}>
                  <h2 className="label">Characters · AniList</h2>
                </Link>
                <PersonGrid teaser>
                  {personnages.map((c) => (
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

          {equipe.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <Link to={`/manga/${anilistId}/staff`} className={styles.sectionLink}>
                  <h2 className="label">Staff · AniList</h2>
                </Link>
                <PersonGrid teaser>
                  {equipe.map((p) => (
                    <PersonCard
                      key={p.node.id}
                      to={`/staff/${p.node.id}`}
                      name={p.node.name.full}
                      image={p.node.image.medium}
                      role={p.role}
                    />
                  ))}
                </PersonGrid>
              </section>
            </>
          )}

          {/* En dernier, comme sur la fiche manga : ce qu'on propose ensuite
              n'a de sens qu'une fois l'œuvre lue en entier. */}
          {recommandations.length > 0 && (
            <>
              <hr className="rule" />
              <section className={styles.section}>
                <h2 className="label">If you liked this</h2>
                <MediaRow
                  items={recommandations.map((m) => ({
                    ...m,
                    below: outOfTen(m.averageScore) ?? '—',
                  }))}
                />
              </section>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
