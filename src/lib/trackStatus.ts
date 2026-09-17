import type { MediaType, TrackStatus } from '../types/library';

/**
 * Les cinq statuts de suivi, nommés dans la langue du média.
 *
 * On regarde un anime et on lit un manga : « Plan to watch » sur un manga est
 * une faute, et c'est ce que la bibliothèque affichait avant d'avoir des
 * onglets par média. Un seul endroit pour ces mots, puisque le panneau de
 * suivi et la collection doivent dire les mêmes.
 */

const LABELS: Record<TrackStatus, { anime: string; manga: string }> = {
  current: { anime: 'Watching', manga: 'Reading' },
  completed: { anime: 'Completed', manga: 'Read' },
  planned: { anime: 'Plan to watch', manga: 'Plan to read' },
  paused: { anime: 'On hold', manga: 'On hold' },
  dropped: { anime: 'Dropped', manga: 'Dropped' },
};

/** L'ordre dans lequel on les propose : du plus courant au plus rare. */
export const STATUS_ORDER: TrackStatus[] = ['current', 'completed', 'planned', 'paused', 'dropped'];

export function statusLabel(status: TrackStatus, media: MediaType): string {
  return LABELS[status][media];
}

/**
 * Une valeur venue de l'URL est-elle un statut ? `null` sinon.
 *
 * L'adresse se tape et se bricole. Un `as TrackStatus` aurait promis au
 * compilateur ce que personne n'a verifie, et `?status=BANANA` aurait filtre
 * sur rien du tout — une collection vide sans un mot d'explication.
 */
export function asTrackStatus(value: string | null | undefined): TrackStatus | null {
  return STATUS_ORDER.find((s) => s === value) ?? null;
}
