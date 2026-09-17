import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useCharacter, type CharacterDetail, type CharacterMediaPage } from '../api/anilist/hooks';
import { useMore } from '../api/anilist/useMore';
import { CHARACTER_MEDIA_PAGE } from '../api/anilist/queries';
import { ShowMore } from '../components/ShowMore';
import { FavouriteButton } from '../components/FavouriteButton';
import { AutoLoad } from '../components/AutoLoad';
import { MediaCard } from '../components/MediaCard';
import { Grid } from '../components/Grid';
import { Bio } from '../components/Bio';
import { BackButton } from '../components/BackButton';
import { personKey } from '../lib/ids';
import { displayTitle } from '../lib/title';
import { mainStudio } from '../lib/mediaTip';
import { dedupeBy } from '../lib/dedupe';
import { JAPANESE, voicesByLanguage } from '../lib/voice';
import styles from './Entity.module.css';

/** Fiche personnage : qui il est, où il apparaît, et qui lui prête sa voix. */
export default function Character() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useCharacter(id);

  if (error)
    return (
      <div className={`page ${styles.state}`}>
        <p className="muted">Couldn't load this character.</p>
      </div>
    );

  if (isPending || !data)
    return (
      <div className={`page ${styles.state}`}>
        <p className="faint">Loading…</p>
      </div>
    );

  return <CharacterBody data={data} />;
}

type Appearance = CharacterDetail['media']['edges'][number];

function CharacterBody({ data }: { data: CharacterDetail }) {
  const more = useMore({
    queryKey: ['character', data.id, 'media'],
    query: CHARACTER_MEDIA_PAGE,
    variables: { id: data.id },
    connection: (d: CharacterMediaPage) => d.Character.media,
    hasMoreInitially: data.media.pageInfo.hasNextPage,
    // Dernière section de la page : rien en dessous à repousser.
    auto: true,
  });

  const [lang, setLang] = useState(JAPANESE);

  const edges = dedupeBy([...data.media.edges, ...more.extra], (e) => e.node.id);
  const birth = [data.dateOfBirth.day, data.dateOfBirth.month].filter(Boolean).join('/');

  const { languages, actorsIn } = voicesByLanguage(edges);

  /* Le choix est dérivé, pas stocké : de nouvelles langues apparaissent au fil
     des pages chargées, et la langue retenue peut ne pas encore exister. */
  const active = languages.includes(lang) ? lang : (languages[0] ?? JAPANESE);
  const actors = actorsIn(active);

  /* Anime et manga restent séparés partout dans l'app — deux médias, deux
     listes. Les pages arrivent mélangées, la partition se fait ici. */
  const anime = edges.filter((e) => e.node.type !== 'MANGA');
  const manga = edges.filter((e) => e.node.type === 'MANGA');

  const facts = [
    ['Role', data.media.edges[0]?.characterRole],
    ['Age', data.age],
    ['Gender', data.gender],
    ['Birthday', birth || null],
    ['Blood type', data.bloodType],
  ].filter(([, v]) => v) as [string, string][];

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
            favKey={personKey('character', data.id)}
            id={data.id}
            name={data.name.full}
            image={data.image.large}
          />
          {data.name.native && <p className="muted">{data.name.native}</p>}
          {data.name.alternative.filter(Boolean).length > 0 && (
            <p className="label">
              Also known as {data.name.alternative.filter(Boolean).join(' · ')}
            </p>
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

          {actors.length > 0 && (
            <div className={styles.voice}>
              <span className="label">Voiced by</span>

              {languages.length > 1 ? (
                <select
                  className={styles.lang}
                  value={active}
                  onChange={(e) => setLang(e.target.value)}
                  aria-label="Voice language"
                >
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="label">{active}</span>
              )}

              <span className={styles.actors}>
                {actors.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && ', '}
                    <Link to={`/staff/${a.id}`} className={styles.actorLink}>
                      {a.name}
                    </Link>
                  </span>
                ))}
              </span>
            </div>
          )}

          <Bio text={data.description} />
        </div>
      </header>

      {anime.length > 0 && <Appearances title="Anime" edges={anime} />}
      {manga.length > 0 && <Appearances title="Manga" edges={manga} />}

      <AutoLoad active={more.autoActive} onVisible={more.loadMore} />
      {more.loading && <p className="label">Loading…</p>}
      {more.needsClick && <ShowMore onClick={more.loadMore} loading={false} />}
    </div>
  );
}

/** Une grille d'apparitions pour un seul média. */
function Appearances({ title, edges }: { title: string; edges: Appearance[] }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className="label">{title}</h2>
        <p className="label">{edges.length} loaded</p>
      </div>

      <Grid>
        {edges.map((e) => (
          <MediaCard
            key={e.node.id}
            media={e.node.type === 'MANGA' ? 'manga' : 'anime'}
            id={e.node.id}
            title={displayTitle(e.node.title)}
            cover={e.node.coverImage.large}
            meta={[e.characterRole, e.node.seasonYear].filter(Boolean).join(' · ')}
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
    </section>
  );
}
