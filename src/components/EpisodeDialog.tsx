import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Repeat, X } from 'lucide-react';
import { useLibrary } from '../store/library';
import { formatWatchDate, isoFromInput, todayInput } from '../lib/dates';
import type { EntryKey, EpisodeRecord } from '../types/library';
import styles from './TrackDialog.module.css';
import own from './EpisodeDialog.module.css';

/**
 * Le suivi d'un épisode.
 *
 * Le calendrier n'est pas un ornement : on rattrape souvent une série des
 * jours après l'avoir vue, et une date d'enregistrement automatique serait
 * fausse. Il part sur aujourd'hui, ce qui couvre le cas courant sans
 * empêcher l'autre.
 *
 * Un revisionnage ajoute une date, il n'en remplace pas une — décision 4 du
 * modèle. C'est pour ça que la liste des dates est visible et que chacune se
 * retire séparément.
 *
 * La fenêtre se lit en DEUX COLONNES : à gauche ce qu'on regarde — vignette,
 * résumé, notes du public —, à droite ce qu'on renseigne. Tout tient ainsi
 * d'un seul regard. Empilée, la vignette 16/9 poussait « Mark as watched »
 * hors du champ : il fallait défiler pour faire la seule chose qu'on était
 * venu faire. Sans vignette ni résumé — cas de JJK saison 2, que TMDB ne
 * découpe pas —, il n'y a plus de colonne à remplir et la fenêtre se remet
 * d'une pièce.
 */
export function EpisodeDialog({
  entryKey: key,
  episode,
  record,
  image,
  synopsis,
  rating,
  votes,
  malScore,
  onPrev,
  onNext,
  onClose,
}: {
  entryKey: EntryKey;
  episode: number;
  record: EpisodeRecord | undefined;
  /** Vignette de l'épisode, quand une source en fournit une. */
  image?: string;
  /** Résumé de l'épisode, quand une source en fournit un. */
  synopsis?: string;
  /** Note du public TMDB, sur 10, et le nombre de votes qui la porte. */
  rating?: number;
  votes?: number;
  /** Note MyAnimeList, sur 5 — pas sur 10, d'où l'échelle affichée. */
  malScore?: number;
  /** Épisode précédent dans la liste affichée. Absent au premier. */
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const { logEpisodeWatch, unlogEpisodeWatch, rateEpisode, setEpisodeNote } = useLibrary((s) => s);

  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState(record?.note ?? '');

  const watches = record?.watchedAt ?? [];
  const watched = watches.length > 0;

  /* Ce sont la vignette et le résumé qui justifient une colonne à eux :
     assez hauts pour tenir en face du formulaire. Les notes ne pèsent qu'une
     ligne — seules à gauche, elles laisseraient une bande vide, alors elles
     suivent le formulaire et la fenêtre reprend toute sa largeur. */
  const aside = Boolean(image || synopsis);

  const log = () => {
    const iso = isoFromInput(date);
    if (!iso) return;
    logEpisodeWatch(key, episode, iso);
  };

  /* Les notes du public, avant les siennes : on les lit pour situer, pas pour
     se laisser influencer — d'où leur discrétion. */
  const ratings = (rating || malScore) && (
    <div className={own.ratings}>
      {rating && (
        <span className={own.rating}>
          <span className="label">TMDB</span>
          {rating.toFixed(1)}
          <span className="faint">/10</span>
          {votes && <span className="faint"> · {votes}</span>}
        </span>
      )}
      {malScore && (
        <span className={own.rating}>
          <span className="label">MAL</span>
          {malScore.toFixed(2)}
          <span className="faint">/5</span>
        </span>
      )}
    </div>
  );

  return (
    <>
      <div className={aside ? own.split : undefined}>
        {aside && (
          <div className={own.aside}>
            {/* `alt` vide : la vignette illustre un titre écrit juste au-dessus
                d'elle, le répéter ne ferait que doubler l'annonce. */}
            {image && <img className={own.still} src={image} alt="" />}
            {ratings}
            {synopsis && <p className={own.synopsis}>{synopsis}</p>}
          </div>
        )}

        <div className={own.main}>
          {!aside && ratings}

          {watched && (
            <div className={styles.field}>
              <span className="label">
                {watches.length > 1 ? `Watched ${watches.length} times` : 'Watched'}
              </span>
              <ul className={own.watches}>
                {watches.map((at, i) => (
                  <li key={`${at}-${i}`} className={own.watch}>
                    <Check size={14} strokeWidth={2.4} aria-hidden className={own.watchIcon} />
                    {formatWatchDate(at)}
                    <button
                      type="button"
                      className={own.watchRemove}
                      aria-label={`Remove the watch of ${formatWatchDate(at)}`}
                      onClick={() => unlogEpisodeWatch(key, episode, i)}
                    >
                      <X size={13} strokeWidth={2.4} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.field}>
            <label className="label" htmlFor={`watched-on-${episode}`}>
              {watched ? 'Rewatched on' : 'Watched on'}
            </label>
            <div className={own.logRow}>
              <input
                id={`watched-on-${episode}`}
                type="date"
                className={own.date}
                value={date}
                max={todayInput()}
                onChange={(e) => setDate(e.target.value)}
              />
              <button type="button" className="btn btn--accent" onClick={log}>
                {watched ? (
                  <>
                    <Repeat size={15} strokeWidth={2.2} aria-hidden />
                    Rewatch
                  </>
                ) : (
                  <>
                    <Check size={16} strokeWidth={2.4} aria-hidden />
                    Mark as watched
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Note et commentaire n'apparaissent qu'une fois l'épisode vu : on ne
              note pas ce qu'on n'a pas regardé. */}
          {watched && (
            <>
              <div className={styles.field}>
                <div className={styles.fieldHead}>
                  <span className="label">My score</span>
                  <span className={styles.count}>
                    {record?.score ? (
                      `${record.score} / 10`
                    ) : (
                      <span className="faint">not rated</span>
                    )}
                  </span>
                </div>
                <div className={styles.scores} role="group" aria-label="My score out of 10">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={styles.scoreBtn}
                      aria-pressed={typeof record?.score === 'number' && n <= record.score}
                      onClick={() => rateEpisode(key, episode, record?.score === n ? undefined : n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label className="label" htmlFor={`note-${episode}`}>
                  My comment
                </label>
                <textarea
                  id={`note-${episode}`}
                  className={styles.review}
                  rows={3}
                  placeholder="Anything worth remembering?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => setEpisodeNote(key, episode, note)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Enchaîner les épisodes sans repasser par la liste : c'est le geste
          d'un rattrapage, où l'on en note plusieurs d'affilée. */}
      <div className={own.nav}>
        <button
          type="button"
          className="btn btn--quiet"
          aria-label="Previous episode"
          disabled={!onPrev}
          onClick={onPrev}
        >
          <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
        </button>

        <button type="button" className={`btn btn--quiet ${own.done}`} onClick={onClose}>
          Done
        </button>

        <button
          type="button"
          className="btn btn--quiet"
          aria-label="Next episode"
          disabled={!onNext}
          onClick={onNext}
        >
          <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </>
  );
}
