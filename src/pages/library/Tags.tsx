import { useSearchParams } from 'react-router-dom';
import { useLibrary } from '../../store/library';
import { MediaCard } from '../../components/MediaCard';
import { Grid } from '../../components/Grid';
import { entryCard } from '../../lib/routes';
import { entriesWithTag, tagCounts } from '../../lib/personalTags';
import { statusLabel } from '../../lib/trackStatus';
import { sortLibrary } from '../../lib/libraryOrder';
import styles from './Library.module.css';
/* La pastille d'etiquette vit deja la, et la collection s'en sert : deux
   copies divergeraient. Ce fichier sert de fourre-tout partage depuis
   longtemps — c'est un defaut connu, pas une raison d'en creer une copie. */
import chips from '../Studio.module.css';

/**
 * Mes étiquettes — les miennes, pas celles d'AniList.
 *
 * Les deux médias ensemble, contrairement aux collections : on range « comfort
 * watch » ou « à relire » sans penser au média, et retrouver ce qu'on a rangé
 * ne doit pas demander de deviner dans quel onglet on l'avait mis.
 *
 * L'étiquette choisie vit dans l'URL : un lien mène directement à ce qu'on a
 * rangé dessous.
 */

export default function LibraryTags() {
  const entries = useLibrary((s) => s.entries);
  const hydrated = useLibrary((s) => s.hydrated);
  const [params, setParams] = useSearchParams();
  const choisie = params.get('tag') ?? '';

  if (!hydrated) return <p className="faint">Loading…</p>;

  const toutes = Object.values(entries);
  const tags = tagCounts(toutes);

  if (tags.length === 0)
    return (
      <div className={styles.soon}>
        <h2 className="label">Tags</h2>
        <p className="muted">
          No tag yet. Open a tracked title and add one from the tracking panel — “comfort watch”,
          “rewatch someday”, whatever you like.
        </p>
      </div>
    );

  /* Par titre : une etiquette est un rayon ou l'on cherche un nom, pas un
     journal. Sans tri du tout — ce qui etait le cas — l'ordre etait celui de
     la table, c'est-a-dire aucun. */
  const montrees = choisie ? sortLibrary(entriesWithTag(toutes, choisie), 'title') : [];

  const choisir = (tag: string) => {
    const next = new URLSearchParams(params);
    /* Recliquer celle qui est posée l'enlève : sans ça, on ne pourrait plus
       revenir à la vue d'ensemble sans passer par la barre d'adresse. */
    if (tag.toLowerCase() === choisie.toLowerCase()) next.delete('tag');
    else next.set('tag', tag);
    setParams(next);
  };

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className="label">My tags</h2>
          <p className="label">{tags.length}</p>
        </div>

        {/* Par fréquence : ce qu'on range le plus se trouve en premier. */}
        <div className={styles.tagCloud}>
          {tags.map((t) => (
            <button
              key={t.tag}
              type="button"
              className={chips.tagChip}
              aria-pressed={t.tag.toLowerCase() === choisie.toLowerCase()}
              onClick={() => choisir(t.tag)}
            >
              {t.tag}
              <span className={styles.segmentCount}>{t.count}</span>
            </button>
          ))}
        </div>
      </section>

      {choisie && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className="label">{choisie}</h2>
            <p className="label">{montrees.length}</p>
          </div>

          <Grid>
            {montrees.map((e) => (
              <MediaCard
                key={e.key}
                media={e.media}
                libraryKey={e.key}
                {...entryCard(e)}
                title={e.title}
                cover={e.cover ?? null}
                score={e.score ? e.score * 10 : null}
                meta={statusLabel(e.status, e.media)}
              />
            ))}
          </Grid>
        </section>
      )}
    </>
  );
}
