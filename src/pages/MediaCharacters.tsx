import { Link, useParams } from 'react-router-dom';
import {
  useAnimeDetail,
  useMangaDetail,
  type CharactersPage,
  type AnimeDetail,
  type MangaDetail,
} from '../api/anilist/hooks';
import { useMore } from '../api/anilist/useMore';
import { CHARACTERS_PAGE } from '../api/anilist/queries';
import { PersonCard, PersonGrid } from '../components/PersonCard';
import { AutoLoad } from '../components/AutoLoad';
import { ShowMore } from '../components/ShowMore';
import { BackButton } from '../components/BackButton';
import { displayTitle } from '../lib/title';
import { dedupeBy } from '../lib/dedupe';
import { seiyuu } from '../lib/voice';
import type { MediaType } from '../types/library';
import styles from './Entity.module.css';

/**
 * Tous les personnages d'une œuvre, anime ou manga.
 *
 * La fiche n'en montre plus que six ; le reste vit ici, en grille et en
 * défilement, comme les autres listes longues de l'app.
 *
 * La page se sert de la fiche elle-même : elle est déjà en cache quand on
 * arrive depuis l'aperçu, et elle porte à la fois le titre de l'en-tête et la
 * première page de personnages. Une requête dédiée n'aurait rien économisé.
 */
export default function MediaCharacters({ media }: { media: MediaType }) {
  const id = Number(useParams().id);
  /* Les deux fiches portent la même première page de personnages ; seul le
     média change la requête. Les appeler toutes les deux et n'en activer
     qu'une évite un composant par média pour une différence d'une ligne. */
  const anime = useAnimeDetail(media === 'anime' ? id : undefined);
  const manga = useMangaDetail(media === 'manga' ? id : undefined);
  const { data, isPending, error } = media === 'manga' ? manga : anime;

  if (error)
    return (
      <div className={`page ${styles.state}`}>
        <p className="muted">Couldn't load this title.</p>
      </div>
    );

  if (isPending || !data)
    return (
      <div className={`page ${styles.state}`}>
        <p className="faint">Loading…</p>
      </div>
    );

  return <Body id={id} media={media} data={data} />;
}

function Body({
  id,
  media,
  data,
}: {
  id: number;
  media: MediaType;
  data: AnimeDetail | MangaDetail;
}) {
  const more = useMore({
    queryKey: [media, id, 'characters'],
    query: CHARACTERS_PAGE,
    variables: { id },
    connection: (d: CharactersPage) => d.Media.characters,
    hasMoreInitially: data.characters.pageInfo?.hasNextPage ?? false,
    // Seule section de la page : rien en dessous qu'elle repousserait.
    auto: true,
  });

  const edges = dedupeBy([...data.characters.edges, ...more.extra], (e) => e.node.id);

  return (
    <div className={`page ${styles.wrap}`}>
      <BackButton />

      <header className={`${styles.head} ${styles.headWide}`}>
        <p className="label">
          <Link to={`/${media}/${id}`} className={styles.bioLink}>
            {displayTitle(data.title)}
          </Link>
        </p>
        <h1 className={styles.name}>Characters</h1>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className="label">{edges.length} loaded</p>
        </div>

        <PersonGrid>
          {edges.map((e) => {
            /* Un manga n'a pas de doubleurs : le champ n'existe pas dans sa
               requête, et la carte se passe alors de sa seconde ligne. */
            const va =
              'voiceActors' in e && Array.isArray(e.voiceActors) ? seiyuu(e.voiceActors) : null;
            return (
              <PersonCard
                key={e.node.id}
                to={`/character/${e.node.id}`}
                name={e.node.name.full}
                image={e.node.image.medium}
                role={e.role}
                link={va && { to: `/staff/${va.id}`, label: va.name }}
              />
            );
          })}
        </PersonGrid>

        <AutoLoad active={more.autoActive} onVisible={more.loadMore} />
        {more.loading && <p className="label">Loading…</p>}
        {more.needsClick && <ShowMore onClick={more.loadMore} loading={false} />}
      </section>
    </div>
  );
}
