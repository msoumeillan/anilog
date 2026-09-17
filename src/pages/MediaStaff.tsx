import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  useAnimeDetail,
  useMangaDetail,
  type AnimeDetail,
  type MangaDetail,
  type StaffPage,
} from '../api/anilist/hooks';
import { useMore } from '../api/anilist/useMore';
import { STAFF_PAGE } from '../api/anilist/queries';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { AutoLoad } from '../components/AutoLoad';
import { ShowMore } from '../components/ShowMore';
import { Select } from '../components/Select';
import { BackButton } from '../components/BackButton';
import { displayTitle } from '../lib/title';
import { FAMILY_LABELS, filterByFamily, isFamilyKey, staffFamilies } from '../lib/staff';
import type { MediaType } from '../types/library';
import entity from './Entity.module.css';
import styles from './Studio.module.css';

/**
 * Tout le staff d'un anime.
 *
 * La fiche n'en montre plus que six ; le reste vit ici, avec un filtre par
 * famille de métier. Sans ce filtre la page serait illisible : Attack on
 * Titan dépasse 500 crédits pour 168 intitulés distincts, dont une
 * quarantaine de « Key Animation (ep N) ».
 *
 * Le filtre vit dans l'URL (`?role=`), ce qui rend chaque département
 * partageable et défaisable par le retour arrière. Pour les feuilles
 * d'animation clé sérieuses, la fiche renvoie vers keyframe-staff-list :
 * AniList n'a que ce que ses contributeurs ont saisi.
 */

/**
 * Plafond de pages chargées d'un coup.
 *
 * Il ne suffit pas toujours, et c'est assumé : Attack on Titan annonce plus de
 * 500 crédits, soit vingt pages et les deux tiers du quota d'une minute pour
 * une seule fiche. On s'arrête à 325 crédits et on le DIT — une liste tronquée
 * en silence est pire qu'une liste courte.
 */
const MAX_PAGES = 12;

export default function MediaStaff({ media }: { media: MediaType }) {
  const id = Number(useParams().id);
  /* Les deux fiches portent la même première page de crédits ; seule la
     requête change. Une seule des deux est activée. */
  const anime = useAnimeDetail(media === 'anime' ? id : undefined);
  const manga = useMangaDetail(media === 'manga' ? id : undefined);
  const { data, isPending, error } = media === 'manga' ? manga : anime;

  if (error)
    return (
      <div className={`page ${entity.state}`}>
        <p className="muted">Couldn't load this title.</p>
      </div>
    );

  if (isPending || !data)
    return (
      <div className={`page ${entity.state}`}>
        <p className="faint">Loading…</p>
      </div>
    );

  return <Body id={id} media={media} data={data} />;
}

type StaffEdge = (AnimeDetail | MangaDetail)['staff']['edges'][number];

function Body({
  id,
  media,
  data,
}: {
  id: number;
  media: MediaType;
  data: AnimeDetail | MangaDetail;
}) {
  /* Le filtre vit dans l'URL : le lien « Key animation » de la fiche est donc
     un lien ordinaire, partageable, et le retour arrière le défait. */
  const [params, setParams] = useSearchParams();
  const asked = params.get('role') ?? '';
  const family = isFamilyKey(asked) ? asked : '';

  const more = useMore({
    queryKey: [media, id, 'staff'],
    query: STAFF_PAGE,
    variables: { id },
    connection: (d: StaffPage) => d.Media.staff,
    hasMoreInitially: data.staff.pageInfo?.hasNextPage ?? false,
    auto: true,
  });

  const { loadMore, loading, hasMore, failed, pagesLoaded } = more;

  /* Même règle que sur la fiche studio : un filtre qui ne voit que la première
     page ment. L'animation clé est justement en fin de liste — filtrer sur les
     25 premiers crédits ne trouverait rien. `failed` arrête la chaîne, sinon
     une requête en échec serait rappelée sans fin. */
  const completing = Boolean(family) && hasMore && !failed && pagesLoaded < MAX_PAGES;
  useEffect(() => {
    if (completing && !loading) loadMore();
  }, [completing, loading, loadMore]);

  /** Arrêté par le plafond, pas par la fin de la liste. */
  const capped = Boolean(family) && hasMore && !failed && pagesLoaded >= MAX_PAGES;

  const credits: StaffEdge[] = [...data.staff.edges, ...more.extra];
  const families = staffFamilies(credits);
  const shown = filterByFamily(credits, family);

  const setFamily = (next: string) => {
    if (next) setParams({ role: next });
    else setParams({});
  };

  return (
    <div className={`page ${entity.wrap}`}>
      <BackButton />

      <header className={`${entity.head} ${entity.headWide}`}>
        <p className="label">
          <Link to={`/${media}/${id}`} className={entity.bioLink}>
            {displayTitle(data.title)}
          </Link>
        </p>
        <h1 className={entity.name}>Staff</h1>
      </header>

      <div className={styles.bar}>
        <Select label="Department" value={family} onChange={setFamily}>
          <option value="">All departments</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {FAMILY_LABELS[f]}
            </option>
          ))}
        </Select>
      </div>

      <section className={entity.section}>
        <div className={entity.sectionHead}>
          <h2 className="label">{family ? FAMILY_LABELS[family] : 'All credits'}</h2>
          <p className="label">
            {family ? `${shown.length} of ${credits.length}` : `${credits.length} credits`}
          </p>
        </div>

        {completing && <p className="faint">Loading the rest of the credits…</p>}
        {capped && (
          <p className="muted">
            Stopped at {credits.length} credits. AniList lists more, but loading them would use most
            of the 30 requests a minute it allows.
          </p>
        )}
        {family && failed && (
          <p className="muted">
            Couldn't load every credit — AniList allows 30 requests a minute. This covers the{' '}
            {credits.length} loaded so far.
          </p>
        )}

        {shown.length === 0 && !completing && (
          <p className="muted">
            {family === 'key'
              ? "AniList doesn't list key animation credits for this title."
              : 'No credit in this department.'}
          </p>
        )}

        <PersonGrid>
          {shown.map((e, i) => (
            <PersonCard
              key={`${e.node.id}-${e.role}-${i}`}
              to={`/staff/${e.node.id}`}
              name={e.node.name.full}
              image={e.node.image.medium}
              role={e.role}
            />
          ))}
        </PersonGrid>

        {/* Sans filtre, défilement ordinaire ; avec, c'est l'effet qui enchaîne. */}
        <AutoLoad active={!family && more.autoActive} onVisible={loadMore} />
        {!family && loading && <p className="label">Loading…</p>}
        {!family && more.needsClick && <ShowMore onClick={loadMore} loading={false} />}
      </section>
    </div>
  );
}
