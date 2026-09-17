import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../../store/library';
import { ShowMore } from '../../components/ShowMore';
import { byMonth, dayOf, diaryEvents, monthLabel, type DiaryEvent } from '../../lib/diary';
import { entryCard } from '../../lib/routes';
import { unitLabel } from '../../lib/mediaMode';
import styles from './Library.module.css';

/**
 * Le journal, en deux registres — un seul à l'écran à la fois.
 *
 * Ils ne se lisent pas de la même façon. La progression est un RYTHME, ce
 * qu'on a avancé cette semaine ; les jalons sont des ÉVÈNEMENTS, ce qu'on a
 * commencé et fini. Empilés, les seconds se noyaient dans les premiers : une
 * série suivie épisode par épisode produit des centaines de lignes.
 *
 * Le registre choisi vit dans l'URL, comme les onglets au-dessus : un lien
 * envoyé pointe sur le bon, et le retour arrière ramène au précédent.
 *
 * Rien n'est inventé : seules les dates que la bibliothèque porte vraiment.
 * Voir `lib/diary`.
 */

/**
 * Combien de lignes d'un coup.
 *
 * Une série suivie épisode par épisode en produit des centaines : tout rendre
 * d'un bloc ferait un DOM énorme pour un écran qu'on parcourt du regard.
 */
const PAGE = 40;

const REGISTRES = [
  { value: 'progress', label: 'Progress' },
  { value: 'milestones', label: 'Started & completed' },
] as const;

export default function LibraryDiary() {
  const entries = useLibrary((s) => s.entries);
  const hydrated = useLibrary((s) => s.hydrated);
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE);

  const registre = params.get('log') === 'milestones' ? 'milestones' : 'progress';

  if (!hydrated) return <p className="faint">Loading…</p>;

  const tous = diaryEvents(Object.values(entries));
  const progres = tous.filter((e) => e.kind === 'episode');
  const jalons = tous.filter((e) => e.kind !== 'episode');
  const events = registre === 'milestones' ? jalons : progres;

  if (tous.length === 0)
    return (
      <div className={styles.soon}>
        <h2 className="label">Diary</h2>
        <p className="muted">
          Nothing dated yet. Start or finish a title, tick an episode: every move leaves its date
          here.
        </p>
      </div>
    );

  const choisir = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'progress') next.delete('log');
    else next.set('log', value);
    /* Sans `replace` : changer de registre est une navigation deliberee, le
       retour arriere doit la defaire. Il n'y a que deux valeurs, l'historique
       ne s'encombre pas. */
    setParams(next);
    /* Repartir du haut de la pagination : les deux registres n'ont ni la même
       longueur ni le même rythme, et garder le compteur ferait apparaître un
       registre court déjà « déroulé ». */
    setShown(PAGE);
  };

  return (
    <>
      <div className={styles.segmented} role="group" aria-label="Diary register">
        {REGISTRES.map((r) => (
          <button
            key={r.value}
            type="button"
            className={`${styles.segment} ${registre === r.value ? styles.segmentOn : ''}`}
            aria-pressed={registre === r.value}
            onClick={() => choisir(r.value)}
          >
            {r.label}
            <span className={styles.segmentCount}>
              {(r.value === 'milestones' ? jalons : progres).length}
            </span>
          </button>
        ))}
      </div>

      {events.length === 0 && (
        <p className="muted">
          {registre === 'milestones'
            ? 'Nothing started or finished yet.'
            : 'Tick an episode and it shows up here.'}
        </p>
      )}

      {byMonth(events.slice(0, shown)).map((m) => (
        <section key={m.key} className={styles.month}>
          <h2 className={styles.monthTitle}>
            {monthLabel(m.key)}
            <span className="label">{m.events.length}</span>
          </h2>
          <ol className={styles.diary}>
            {m.events.map((e) => (
              <Row key={`${e.entry.key}-${e.kind}-${e.episode ?? ''}-${e.at}`} event={e} />
            ))}
          </ol>
        </section>
      ))}

      {shown < events.length && (
        <ShowMore onClick={() => setShown((n) => n + PAGE)} loading={false} />
      )}
    </>
  );
}

function Row({ event }: { event: DiaryEvent }) {
  const { entry } = event;
  const href = entryCard(entry).href ?? `/${entry.media}/${entry.ids.anilist ?? ''}`;

  /* Ce qui s'est passé, dit dans la langue du média : on termine un anime, on
     lit un chapitre. Le mot « épisode » sur un manga serait une faute. */
  const quoi =
    event.kind === 'started'
      ? 'Started'
      : event.kind === 'completed'
        ? 'Completed'
        : `${unitLabel(entry.media, false).replace(/^./, (c) => c.toUpperCase())} ${event.episode}`;

  return (
    <li>
      {/* La ligne ENTIÈRE est le lien : viser un titre de deux mots à la
          souris est plus pénible que viser une bande de cinquante pixels. */}
      <Link to={href} className={styles.row}>
        <span className={styles.day}>{dayOf(event.at)}</span>

        <span className={`poster ${styles.rowArt}`}>
          {entry.cover && <img src={entry.cover} alt="" loading="lazy" />}
        </span>

        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{entry.title}</span>
          <span className={styles.rowWhat}>
            {quoi}
            {event.rewatch && <span className={styles.rewatch}>rewatch {event.rewatch}</span>}
          </span>
        </span>

        {typeof entry.score === 'number' && <span className={styles.rowScore}>{entry.score}</span>}
      </Link>
    </li>
  );
}
