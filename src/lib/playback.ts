/**
 * Le lecteur, ce qu'il affiche et ce qu'il retient : l'heure écrite sous la
 * vidéo, et le volume d'une chanson à l'autre.
 */

/**
 * « 1:30 », « 12:05 », « 1:02:03 » — l'écriture de tous les lecteurs : pas de
 * zéro devant les minutes, des heures seulement quand il y en a.
 *
 * Arrondi à la seconde INFÉRIEURE : à 89,97 s d'un générique de 90,03 s, on
 * affiche « 1:29 / 1:30 ». Arrondir au plus proche afficherait la fin atteinte
 * alors que la vidéo joue encore.
 *
 * Une durée inconnue — pas encore lue, ou infinie pour un flux — s'écrit
 * « 0:00 » plutôt que « NaN:NaN ».
 */
export function clock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const heures = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secondes = String(total % 60).padStart(2, '0');
  return heures > 0
    ? `${heures}:${String(minutes).padStart(2, '0')}:${secondes}`
    : `${minutes}:${secondes}`;
}

/**
 * Une position dans la vidéo, bornée à sa durée quand elle est déjà connue.
 *
 * Tant que la durée n'est pas lue — `NaN` au chargement —, seul le zéro borne :
 * reculer avant le début n'a jamais de sens, avancer au-delà d'une fin qu'on
 * ignore encore n'est pas une erreur qu'on puisse déjà voir.
 */
export function clampTime(t: number, duration: number): number {
  return Math.max(0, Number.isFinite(duration) ? Math.min(duration, t) : t);
}

// ─────────────────────────────────────────────────────────────
//  Le volume
// ─────────────────────────────────────────────────────────────

/*
 * `localStorage` et non la couche `platform/storage` : le volume n'est pas une
 * donnée de bibliothèque. Il appartient à l'APPAREIL — des écouteurs ici, des
 * enceintes là —, il n'a donc rien à faire dans une sauvegarde ni dans une
 * synchro. Et il le faut de façon synchrone : lu en différé, la première
 * vidéo partirait à plein volume le temps que la lecture revienne.
 */
const KEY = 'anilog:player:volume';

export interface Volume {
  /** De 0 à 1, comme `HTMLMediaElement.volume`. */
  level: number;
  /** Coupé sans perdre le niveau : on le retrouve en remettant le son. */
  muted: boolean;
}

const PLEIN: Volume = { level: 1, muted: false };

/** Le niveau rendu quand on remet le son d'un curseur descendu à zéro. */
const REPRISE = 0.5;

function borne(level: number): number {
  return Math.min(1, Math.max(0, level));
}

/** Le volume retenu. Rien, ou rien de lisible : plein volume. */
export function readVolume(): Volume {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return PLEIN;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return PLEIN;
    if (!('level' in data) || !('muted' in data)) return PLEIN;
    const { level, muted } = data;
    if (typeof level !== 'number' || !Number.isFinite(level) || typeof muted !== 'boolean') {
      return PLEIN;
    }
    return { level: borne(level), muted };
  } catch {
    // Navigation privée, stockage refusé, JSON abîmé : on repart du défaut.
    return PLEIN;
  }
}

export function saveVolume(volume: Volume): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(volume));
  } catch {
    /* Sans effet : le volume vaudra pour cette visite, et un stockage refusé
       ne doit pas empêcher de le régler. */
  }
}

/**
 * Le niveau qu'on vient de choisir au curseur.
 *
 * Toucher au curseur REMET le son : le déplacer sur un lecteur coupé et ne
 * rien entendre, c'est croire qu'il est en panne.
 */
export function withLevel(level: number): Volume {
  return { level: borne(level), muted: false };
}

/**
 * Couper, ou remettre le son.
 *
 * Un curseur descendu à zéro compte comme coupé : le bouton affiche alors le
 * haut-parleur barré, et le presser doit rendre du son. Sans niveau à
 * retrouver, on repart à mi-course plutôt qu'à plein volume.
 */
export function toggleMute(volume: Volume): Volume {
  if (volume.muted || volume.level === 0) {
    return { level: volume.level === 0 ? REPRISE : volume.level, muted: false };
  }
  return { level: volume.level, muted: true };
}
