import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Minus, Plus, Trash2, X } from 'lucide-react';
import { useLibrary } from '../store/library';
import { addTag, normalizeTag, removeTag } from '../lib/personalTags';
import type { LibraryEntry, MediaType, TrackStatus } from '../types/library';
import styles from './TrackDialog.module.css';

/**
 * Le contenu de la fenêtre de suivi.
 *
 * Deux statuts ne font pas qu'enregistrer un état, ils agissent :
 *
 *   « Completed » pousse la progression au maximum — cocher « terminé » puis
 *   devoir avancer le compteur à la main serait absurde ;
 *   « Watching » emmène à la liste d'épisodes, à celui qu'on s'apprête à voir.
 *
 * Les deux ne valent que pour l'anime : un manga n'a pas de page d'épisodes.
 *
 * Et pas pour un film non plus — voir `singleUnit`. Une œuvre en une pièce se
 * note, elle ne se suit pas : ni compteur, ni renvoi vers une liste qui
 * n'existe pas. Son statut suffit à dire si elle a été vue.
 */

const STATUSES: { value: TrackStatus; anime: string; manga: string }[] = [
  { value: 'current', anime: 'Watching', manga: 'Reading' },
  { value: 'completed', anime: 'Completed', manga: 'Read' },
  { value: 'planned', anime: 'Plan to watch', manga: 'Plan to read' },
  { value: 'paused', anime: 'On hold', manga: 'On hold' },
  { value: 'dropped', anime: 'Dropped', manga: 'Dropped' },
];

export function TrackDialog({
  entry,
  media,
  anilistId,
  total,
  totalVolumes,
  singleUnit,
  onClose,
}: {
  entry: LibraryEntry;
  media: MediaType;
  /**
   * L'identifiant AniList. Il ne sert qu'à ouvrir la liste des épisodes, donc
   * uniquement côté anime — une œuvre absente d'AniList n'en a pas, et n'en a
   * pas besoin.
   */
  anilistId?: number;
  total?: number | null;
  /** Manga seulement : le total de tomes, quand il est connu. */
  totalVolumes?: number | null;
  /** Film ou œuvre en un épisode : on la note, on ne la suit pas. */
  singleUnit?: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const key = entry.key;

  const {
    setStatus,
    setScore,
    setReview,
    setTags,
    setProgress,
    setVolumes,
    bumpProgress,
    removeEntry,
  } = useLibrary((s) => s);

  /* Brouillons locaux : pendant la frappe, c'est l'utilisateur la source de
     vérité, pas le store. Écrits à la perte du focus. */
  const [review, setReviewDraft] = useState(entry.review ?? '');
  const [tagDraft, setTagDraft] = useState('');
  /* `null` = pas en cours de saisie, donc on affiche la valeur du store. Le
     champ se resynchronise ainsi tout seul quand +/− la font bouger, et une
     saisie invalide disparaît au lieu de rester à l'écran. */
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<string | null>(null);

  /* Ce qui est enregistre est deja rogne — voir `setReview` — donc on compare
     le brouillon rogne, sinon un espace en fin de ligne suffirait a afficher
     « Not saved yet » pour un texte identique. */
  const reviewDirty = review.trim() !== (entry.review ?? '');

  const unit = media === 'anime' ? 'Episode' : 'Chapter';
  const progress =
    entry.progress.kind === 'anime' ? entry.progress.episodes : entry.progress.chapters;
  const tags = entry.tags ?? [];

  const pickStatus = (status: TrackStatus) => {
    setStatus(key, status);

    if (media !== 'anime') return;

    if (status === 'completed' && total) {
      setProgress(key, total);
      return;
    }

    /* Un film n'a pas de liste d'épisodes où envoyer qui que ce soit. */
    if (status === 'current' && !singleUnit && typeof anilistId === 'number') {
      /* L'épisode qu'on s'apprête à voir, pas le premier : revenir à
         « Watching » à mi-parcours ne doit pas renvoyer au début. */
      const next = Math.min(progress + 1, total ?? progress + 1);
      onClose();
      navigate(`/anime/${anilistId}/episodes?ep=${next}`);
    }
  };

  const clamp = (n: number) =>
    Math.max(0, Math.min(Math.round(n), total ?? Number.MAX_SAFE_INTEGER));

  /** L'épisode qu'on vient d'atteindre, sur sa propre page. */
  const goToEpisode = (n: number) => {
    if (media !== 'anime' || n < 1 || typeof anilistId !== 'number') return;
    onClose();
    navigate(`/anime/${anilistId}/episodes?ep=${n}`);
  };

  const step = (delta: number) => {
    const next = clamp(progress + delta);
    bumpProgress(key, delta);
    // Avancer mène à l'épisode ; reculer est une correction, on reste.
    if (delta > 0) goToEpisode(next);
  };

  const commitCount = () => {
    if (countDraft !== null && countDraft.trim()) {
      const n = Number(countDraft);
      if (Number.isFinite(n)) setProgress(key, clamp(n));
    }
    setCountDraft(null);
  };

  const commitVolumes = () => {
    if (volumeDraft !== null && volumeDraft.trim()) {
      const n = Number(volumeDraft);
      if (Number.isFinite(n)) setVolumes(key, Math.min(Math.max(0, n), totalVolumes ?? n));
    }
    setVolumeDraft(null);
  };

  const commitTag = () => {
    const next = addTag(tags, tagDraft);
    if (next !== tags) setTags(key, next);
    setTagDraft('');
  };

  return (
    <>
      <div className={styles.field}>
        <span className="label">Status</span>
        <div className={styles.statuses} role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={styles.status}
              aria-pressed={entry.status === s.value}
              onClick={() => pickStatus(s.value)}
            >
              {media === 'anime' ? s.anime : s.manga}
            </button>
          ))}
        </div>
      </div>

      {/* Un film n'a pas de progression : « vu » ou « pas vu », et c'est le
          statut qui le dit. Un compteur 0/1 avec deux flèches serait une
          machine à ne rien exprimer. */}
      {!singleUnit && (
        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <span className="label">{unit}</span>
            {/* Saisie directe : mille épisodes ne se comptent pas au clic. */}
            <span className={styles.count}>
              <input
                type="number"
                className={styles.countInput}
                aria-label={`${unit} reached`}
                min={0}
                max={total ?? undefined}
                value={countDraft ?? String(progress)}
                onChange={(e) => setCountDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={commitCount}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    /* Valider ici plutôt que de compter sur le `blur` : dans une
                     modale à piège de focus, rendre la main ne suffit pas à
                     déclencher `onBlur`, et la saisie restait sans effet. */
                    e.preventDefault();
                    commitCount();
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    setCountDraft(null);
                  }
                }}
              />
              <span className="faint"> / {total ?? '?'}</span>
            </span>
          </div>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.step}
              aria-label={`Previous ${unit.toLowerCase()}`}
              disabled={progress <= 0}
              onClick={() => step(-1)}
            >
              <Minus size={16} strokeWidth={2.2} aria-hidden />
            </button>
            <div className={styles.bar}>
              <div
                className={styles.barFill}
                style={{ inlineSize: `${Math.min(100, (progress / (total || 1)) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              className={styles.step}
              aria-label={`Next ${unit.toLowerCase()}`}
              disabled={typeof total === 'number' && progress >= total}
              onClick={() => step(1)}
            >
              <Plus size={16} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* Les tomes, pour le manga seulement.
          Un compteur à part et non déduit des chapitres : on suit souvent les
          deux à des rythmes différents — les chapitres en ligne dès la sortie,
          les tomes reliés des mois après — et un tome n'a pas un nombre de
          chapitres fixe. Décision 5. */}
      {media === 'manga' && entry.progress.kind === 'manga' && (
        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <span className="label">Volume</span>
            <span className={styles.count}>
              <input
                type="number"
                className={styles.countInput}
                aria-label="Volume reached"
                min={0}
                max={totalVolumes ?? undefined}
                value={volumeDraft ?? String(entry.progress.volumes)}
                onChange={(e) => setVolumeDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={commitVolumes}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitVolumes();
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    setVolumeDraft(null);
                  }
                }}
              />
              <span className="faint"> / {totalVolumes ?? '?'}</span>
            </span>
          </div>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.step}
              aria-label="Previous volume"
              disabled={entry.progress.volumes <= 0}
              onClick={() =>
                setVolumes(key, entry.progress.kind === 'manga' ? entry.progress.volumes - 1 : 0)
              }
            >
              <Minus size={16} strokeWidth={2.2} aria-hidden />
            </button>
            <div className={styles.bar}>
              <div
                className={styles.barFill}
                style={{
                  inlineSize: `${Math.min(100, (entry.progress.volumes / (totalVolumes || 1)) * 100)}%`,
                }}
              />
            </div>
            <button
              type="button"
              className={styles.step}
              aria-label="Next volume"
              disabled={typeof totalVolumes === 'number' && entry.progress.volumes >= totalVolumes}
              onClick={() =>
                setVolumes(key, entry.progress.kind === 'manga' ? entry.progress.volumes + 1 : 1)
              }
            >
              <Plus size={16} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <span className="label">My score</span>
          <span className={styles.count}>
            {entry.score ? `${entry.score} / 10` : <span className="faint">not rated</span>}
          </span>
        </div>
        <div className={styles.scores} role="group" aria-label="My score out of 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={styles.scoreBtn}
              aria-pressed={typeof entry.score === 'number' && n <= entry.score}
              onClick={() => setScore(key, entry.score === n ? undefined : n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className="label" htmlFor={`tag-${key}`}>
          My tags
        </label>
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map((t) => (
              <span key={t} className={styles.tag}>
                <Link to={`/library?tag=${encodeURIComponent(t)}`} className={styles.tagLink}>
                  {t}
                </Link>
                <button
                  type="button"
                  className={styles.tagRemove}
                  aria-label={`Remove tag ${t}`}
                  onClick={() => setTags(key, removeTag(tags, t))}
                >
                  <X size={12} strokeWidth={2.4} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          id={`tag-${key}`}
          className={styles.input}
          placeholder="Comfort watch, peak fiction…"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onBlur={commitTag}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // Sans ça, Entrée fermerait la fenêtre au lieu d'ajouter l'étiquette.
            e.preventDefault();
            commitTag();
          }}
        />
        <p className="faint">
          {normalizeTag(tagDraft)
            ? 'Press Enter to add'
            : 'Your own labels — find them again later'}
        </p>
      </div>

      {/* La critique s'enregistre sur CONFIRMATION, pas a la perte du focus.
          Deux raisons. Une critique se relit avant d'etre posee, contrairement
          a une note ou a un statut, qui sont un clic et une valeur. Et surtout
          l'enregistrement automatique ecrivait a chaque passage dans le champ,
          meme sans une lettre de changee.

          Le prix a payer est reel : fermer la fenetre sans confirmer perd ce
          qui est tape. C'est ce que le repere « Not saved yet » rend visible —
          un bouton grise ne suffirait pas a le dire. */}
      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label className="label" htmlFor={`review-${key}`}>
            My review
          </label>
          {reviewDirty && <span className={styles.unsaved}>Not saved yet</span>}
        </div>
        <textarea
          id={`review-${key}`}
          className={styles.review}
          rows={4}
          placeholder="What did you think?"
          value={review}
          onChange={(e) => setReviewDraft(e.target.value)}
        />
        <button
          type="button"
          className={`btn ${reviewDirty ? 'btn--accent' : ''} ${styles.saveReview}`}
          disabled={!reviewDirty}
          onClick={() => setReview(key, review)}
        >
          <Check size={15} strokeWidth={2.2} aria-hidden />
          Save review
        </button>
      </div>

      <button
        type="button"
        className={`btn btn--quiet ${styles.remove}`}
        onClick={() => {
          removeEntry(key);
          onClose();
        }}
      >
        <Trash2 size={15} strokeWidth={1.9} aria-hidden />
        Remove from library
      </button>
    </>
  );
}
