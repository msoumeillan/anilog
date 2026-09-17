import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useLibrary } from '../store/library';
import { entryKey, mbEntryKey } from '../lib/ids';
import { statusLabel } from '../lib/trackStatus';
import { Modal } from './Modal';
import { TrackDialog } from './TrackDialog';
import type { MediaType } from '../types/library';
import styles from './TrackPanel.module.css';

/**
 * Le point d'entrée du suivi : un bouton, et rien d'autre.
 *
 * Tout le reste — statut, progression, note, étiquettes, critique — vit dans
 * une fenêtre par-dessus la page. La fiche n'a pas à porter un formulaire en
 * permanence pour une action qu'on fait une fois.
 */

export interface TrackPanelProps {
  media: MediaType;
  /**
   * L'identifiant AniList. Absent pour une œuvre qu'AniList ne connaît pas —
   * un roman web, le plus souvent : `mangaBakaId` prend alors le relais.
   */
  anilistId?: number;
  /** L'identifiant MangaBaka, quand l'œuvre n'existe que là. */
  mangaBakaId?: number;
  malId?: number | null;
  title: string;
  cover?: string | null;
  /** Total d'épisodes ou de chapitres. `null` quand l'œuvre est en cours. */
  total?: number | null;
  /** Manga seulement : les tomes se suivent à part des chapitres — décision 5. */
  totalVolumes?: number | null;
  /** Recopié dans l'entrée pour la bulle de survol de la bibliothèque, hors ligne. */
  format?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  studio?: string | null;
  /** Recopiés pour les statistiques — voir `LibraryEntry.genres`. */
  genres?: string[] | null;
  /** Anime : durée d'un épisode en minutes, pour compter le temps passé. */
  duration?: number | null;
  /** Film, OVA ou ONA en une pièce : pas de progression à suivre. */
  singleUnit?: boolean;
}

export function TrackPanel({
  media,
  anilistId,
  mangaBakaId,
  malId,
  title,
  cover,
  total,
  totalVolumes,
  format,
  season,
  seasonYear,
  studio,
  genres,
  duration,
  singleUnit,
}: TrackPanelProps) {
  const [open, setOpen] = useState(false);
  /* AniList d'abord : c'est lui qui nomme l'œuvre partout ailleurs dans
     l'app. MangaBaka ne sert de clé que pour ce qu'il est seul à avoir. */
  const key =
    typeof anilistId === 'number' ? entryKey(media, anilistId) : mbEntryKey(mangaBakaId ?? 0);
  const entry = useLibrary((s) => s.entries[key]);
  const upsertEntry = useLibrary((s) => s.upsertEntry);
  const upsertMbEntry = useLibrary((s) => s.upsertMbEntry);
  const refreshCache = useLibrary((s) => s.refreshCache);

  /** Crée ou complète l'entrée, du côté de l'espace de clés qui la porte. */
  const upsert = (patch: Parameters<typeof upsertEntry>[2]) =>
    typeof anilistId === 'number'
      ? upsertEntry(media, anilistId, patch)
      : upsertMbEntry(mangaBakaId ?? 0, patch);

  /** Ce que l'entrée garde pour s'afficher sans réseau. */
  const cache = {
    title,
    cover: cover ?? undefined,
    totalUnits: total ?? undefined,
    format: format ?? undefined,
    season: season ?? undefined,
    seasonYear: seasonYear ?? undefined,
    studio: studio ?? undefined,
    /* Une liste vide n'est pas une information : la garder ecraserait des
       genres deja connus par un tableau vide, et ferait croire a un changement
       a chaque visite. */
    genres: genres && genres.length > 0 ? genres : undefined,
    duration: duration ?? undefined,
  };

  /*
   * Rafraîchit la copie locale quand la fiche est ouverte.
   *
   * C'est ce qui complète les entrées ajoutées AVANT que ces champs existent :
   * elles n'ont pas de saison ni de studio, et les redemander au réseau pour
   * la bibliothèque serait absurde alors qu'on les a sous la main ici.
   *
   * `refreshCache` et non `upsert` : ouvrir une fiche n'est pas y toucher, donc
   * `updatedAt` ne bouge pas. Sinon un titre terminé il y a six mois remontait
   * en tête de « Last completed » pour l'avoir simplement regardé — et il
   * suffisait qu'une entrée importée n'ait pas de studio pour que ça arrive à
   * CHAQUE visite. Le store se charge aussi de ne rien écrire quand rien ne
   * change.
   */
  useEffect(() => {
    if (!entry) return;
    refreshCache(key, cache);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entry,
    media,
    anilistId,
    mangaBakaId,
    title,
    cover,
    total,
    format,
    season,
    seasonYear,
    studio,
    genres,
    duration,
  ]);

  const start = () => {
    upsert({
      /* Les deux identifiants sont recopiés quand on les a, même si un seul
         sert de clé : les retrouver après coup demanderait un aller-retour
         réseau par entrée. */
      ids: { anilist: anilistId, mangaBaka: mangaBakaId, mal: malId ?? undefined },
      ...cache,
      status: 'current',
    });
    setOpen(true);
  };

  const progress =
    entry?.progress.kind === 'anime' ? entry.progress.episodes : (entry?.progress.chapters ?? 0);

  return (
    <>
      {entry ? (
        <button type="button" className={`btn ${styles.open}`} onClick={() => setOpen(true)}>
          <Pencil size={15} strokeWidth={2} aria-hidden />
          <span className={styles.openLabel}>{statusLabel(entry.status, media)}</span>
          {!singleUnit && (
            <span className="faint">
              {progress}/{total ?? '?'}
            </span>
          )}
        </button>
      ) : (
        <button type="button" className="btn btn--accent" onClick={start}>
          <Plus size={16} strokeWidth={2.2} aria-hidden />
          Start tracking
        </button>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        subtitle={entry ? statusLabel(entry.status, media) : undefined}
      >
        {entry && (
          <TrackDialog
            entry={entry}
            media={media}
            anilistId={anilistId}
            total={total}
            totalVolumes={totalVolumes}
            singleUnit={singleUnit}
            onClose={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
