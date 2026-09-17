import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Heart } from 'lucide-react';
import { useStaff, type StaffDetail, type StaffMediaPage } from '../api/anilist/hooks';
import { useMore } from '../api/anilist/useMore';
import { STAFF_MEDIA_PAGE } from '../api/anilist/queries';
import { ShowMore } from '../components/ShowMore';
import { FavouriteButton } from '../components/FavouriteButton';
import { AutoLoad } from '../components/AutoLoad';
import { MediaCard } from '../components/MediaCard';
import { Grid } from '../components/Grid';
import { Bio } from '../components/Bio';
import { BackButton } from '../components/BackButton';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { personKey } from '../lib/ids';
import { displayTitle } from '../lib/title';
import { mainStudio } from '../lib/mediaTip';
import { dedupeBy } from '../lib/dedupe';
import styles from './Entity.module.css';

/**
 * Fiche staff — réalisateurs, compositeurs, seiyuu.
 *
 * AniList sépare deux choses qu'il ne faut pas confondre : `staffMedia` liste
 * les postes techniques, `characters` les rôles de doublage. Un seiyuu
 * prolifique peut n'avoir que cinq crédits et seize personnages — c'est le cas
 * de Yuuto Uemura. D'où l'ordre des sections, qui suit le métier.
 */
export default function Staff() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useStaff(id);

  if (error)
    return (
      <div className={`page ${styles.state}`}>
        <p className="muted">Couldn't load this person.</p>
      </div>
    );

  if (isPending || !data)
    return (
      <div className={`page ${styles.state}`}>
        <p className="faint">Loading…</p>
      </div>
    );

  return <StaffBody data={data} />;
}

/** Rôles montrés en aperçu ; le reste vit sur sa propre page. */
const ROLE_TEASER = 6;

function StaffBody({ data }: { data: StaffDetail }) {
  /* L'ordre des sections dépend du métier, et seule la DERNIÈRE peut se
     charger au défilement : au-dessus, elle repousserait l'autre hors de
     portée. */
  const isVoiceActor = data.primaryOccupations.some((o) => /voice/i.test(o));

  const moreCredits = useMore({
    queryKey: ['staff', data.id, 'media'],
    query: STAFF_MEDIA_PAGE,
    variables: { id: data.id },
    connection: (d: StaffMediaPage) => d.Staff.staffMedia,
    hasMoreInitially: data.staffMedia.pageInfo.hasNextPage,
    auto: isVoiceActor,
  });

  const credits = [...data.staffMedia.edges, ...moreCredits.extra];
  const roles = dedupeBy(data.characters.nodes, (c) => c.id).slice(0, ROLE_TEASER);

  const years = data.yearsActive?.length
    ? data.yearsActive.length > 1
      ? `${data.yearsActive[0]}–${data.yearsActive[1]}`
      : `since ${data.yearsActive[0]}`
    : null;

  const facts = [
    ['Age', data.age ? String(data.age) : null],
    ['Gender', data.gender],
    ['From', data.homeTown],
    ['Active', years],
  ].filter(([, v]) => v) as [string, string][];

  const rolesSection = roles.length > 0 && (
    <section className={styles.section}>
      {/* Six rôles en aperçu ; le titre mène à la liste complète. Pas de
          total affiché : AniList plafonne celui des connexions imbriquées à
          500, ce qui donnait « 16 of 500 » pour un seiyuu qui n'a pas 500
          rôles. */}
      <Link to={`/staff/${data.id}/characters`} className={styles.sectionLink}>
        <h2 className="label">Voice roles</h2>
        <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
      </Link>
      <PersonGrid teaser>
        {roles.map((c) => (
          <PersonCard
            key={c.id}
            to={`/character/${c.id}`}
            name={c.name.full}
            image={c.image.medium}
          />
        ))}
      </PersonGrid>
    </section>
  );

  const creditsSection = credits.length > 0 && (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className="label">Credits</h2>
        <p className="label">{credits.length} loaded</p>
      </div>
      <Grid>
        {credits.map((e, i) => (
          <MediaCard
            key={`${e.node.id}-${e.staffRole}-${i}`}
            media={e.node.type === 'MANGA' ? 'manga' : 'anime'}
            id={e.node.id}
            title={displayTitle(e.node.title)}
            cover={e.node.coverImage.large}
            meta={e.staffRole}
            tip={{
              season: e.node.season,
              year: e.node.seasonYear,
              studio: mainStudio(e.node.studios),
              format: e.node.format,
              episodes: e.node.episodes,
            }}
          />
        ))}
      </Grid>
      <AutoLoad active={moreCredits.autoActive} onVisible={moreCredits.loadMore} />
      {moreCredits.loading && <p className="label">Loading…</p>}
      {moreCredits.needsClick && <ShowMore onClick={moreCredits.loadMore} loading={false} />}
    </section>
  );

  return (
    <div className={`page ${styles.wrap}`}>
      <BackButton />

      <header className={styles.head}>
        <div className={styles.portrait}>
          {data.image.large && <img src={data.image.large} alt="" />}
        </div>

        <div className={styles.headText}>
          <h1 className={styles.name}>{data.name.full}</h1>
          <FavouriteButton
            favKey={personKey('staff', data.id)}
            id={data.id}
            name={data.name.full}
            image={data.image.large}
          />
          {data.name.native && <p className="muted">{data.name.native}</p>}
          {data.primaryOccupations.length > 0 && (
            <p className="label">{data.primaryOccupations.join(' · ')}</p>
          )}

          <div className={styles.facts}>
            {facts.map(([k, v]) => (
              <span key={k} className={styles.fact}>
                <span className="label">{k}</span>
                {v}
              </span>
            ))}
            {typeof data.favourites === 'number' && (
              <span className={styles.fact}>
                <Heart size={13} strokeWidth={2} aria-hidden />
                {data.favourites.toLocaleString('en-US')}
              </span>
            )}
          </div>

          <Bio text={data.description} />
        </div>
      </header>

      {isVoiceActor ? (
        <>
          {rolesSection}
          {creditsSection}
        </>
      ) : (
        <>
          {creditsSection}
          {rolesSection}
        </>
      )}
    </div>
  );
}
