import { Link, useParams } from 'react-router-dom';
import { useStaff, type StaffCharactersPage, type StaffDetail } from '../api/anilist/hooks';
import { useMore } from '../api/anilist/useMore';
import { STAFF_CHARACTERS_PAGE } from '../api/anilist/queries';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { AutoLoad } from '../components/AutoLoad';
import { ShowMore } from '../components/ShowMore';
import { BackButton } from '../components/BackButton';
import { dedupeBy } from '../lib/dedupe';
import styles from './Entity.module.css';

/** Tous les rôles de doublage d'un seiyuu — pendant de la page anime. */
export default function StaffCharacters() {
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

  return <Body id={id} data={data} />;
}

function Body({ id, data }: { id: number; data: StaffDetail }) {
  const more = useMore({
    queryKey: ['staff', id, 'characters'],
    query: STAFF_CHARACTERS_PAGE,
    variables: { id },
    connection: (d: StaffCharactersPage) => d.Staff.characters,
    hasMoreInitially: data.characters.pageInfo.hasNextPage,
    auto: true,
  });

  const roles = dedupeBy([...data.characters.nodes, ...more.extra], (c) => c.id);

  return (
    <div className={`page ${styles.wrap}`}>
      <BackButton />

      <header className={`${styles.head} ${styles.headWide}`}>
        <p className="label">
          <Link to={`/staff/${id}`} className={styles.bioLink}>
            {data.name.full}
          </Link>
        </p>
        <h1 className={styles.name}>Voice roles</h1>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className="label">{roles.length} loaded</p>
        </div>

        <PersonGrid>
          {roles.map((c) => (
            <PersonCard
              key={c.id}
              to={`/character/${c.id}`}
              name={c.name.full}
              image={c.image.medium}
            />
          ))}
        </PersonGrid>

        <AutoLoad active={more.autoActive} onVisible={more.loadMore} />
        {more.loading && <p className="label">Loading…</p>}
        {more.needsClick && <ShowMore onClick={more.loadMore} loading={false} />}
      </section>
    </div>
  );
}
