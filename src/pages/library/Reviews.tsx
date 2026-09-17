import { Link } from 'react-router-dom';
import { useLibrary } from '../../store/library';
import { entryCard } from '../../lib/routes';
import { statusLabel } from '../../lib/trackStatus';
import type { LibraryEntry } from '../../types/library';
import styles from './Library.module.css';

/**
 * Mes critiques, rassemblées.
 *
 * Elles s'écrivent depuis le panneau de suivi d'une œuvre — c'est là qu'on a
 * l'envie — et cette page les relit toutes d'affilée, ce qu'aucune fiche ne
 * permet. Les deux médias ensemble : une critique est une critique, et les
 * séparer obligerait à chercher dans deux onglets ce qu'on a écrit un soir.
 *
 * Classées de la plus récemment touchée à la plus ancienne. `updatedAt` ici
 * plutôt qu'une date de lecture : c'est la date du TEXTE qu'on cherche, pas
 * celle de l'œuvre.
 */

export default function LibraryReviews() {
  const entries = useLibrary((s) => s.entries);
  const hydrated = useLibrary((s) => s.hydrated);

  if (!hydrated) return <p className="faint">Loading…</p>;

  const critiques = Object.values(entries)
    .filter((e) => e.review?.trim())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (critiques.length === 0)
    return (
      <div className={styles.soon}>
        <h2 className="label">Reviews</h2>
        <p className="muted">
          No review yet. Open a tracked title, then “My review” in the tracking panel: whatever you
          write ends up here.
        </p>
      </div>
    );

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className="label">Reviews</h2>
        <p className="label">{critiques.length}</p>
      </div>

      <div className={styles.reviews}>
        {critiques.map((e) => (
          <Review key={e.key} entry={e} />
        ))}
      </div>
    </section>
  );
}

function Review({ entry }: { entry: LibraryEntry }) {
  const href = entryCard(entry).href ?? `/${entry.media}/${entry.ids.anilist ?? ''}`;

  return (
    <article className={styles.review}>
      <Link to={href} className={`poster ${styles.reviewArt}`}>
        {entry.cover && <img src={entry.cover} alt="" loading="lazy" />}
      </Link>

      <div className={styles.reviewBody}>
        <div className={styles.reviewHead}>
          <Link to={href} className={styles.rowTitle}>
            {entry.title}
          </Link>
          {typeof entry.score === 'number' && (
            <span className={styles.rowScore}>{entry.score}</span>
          )}
        </div>

        <p className="label">
          {entry.media} · {statusLabel(entry.status, entry.media)}
        </p>

        {/* Le texte tel qu'il a été écrit : les retours à la ligne comptent
            dans une critique, et les écraser en collerait les paragraphes. */}
        <p className={styles.reviewText}>{entry.review}</p>
      </div>
    </article>
  );
}
