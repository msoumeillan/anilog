import type { LibraryEntry } from '../types/library';

/**
 * Le journal : tout ce que la bibliothèque sait dater.
 *
 * Trois sortes d'événements, et pas une de plus inventée. On ne fabrique pas
 * de date à partir de `updatedAt` : il bouge au moindre changement — une note
 * corrigée, une étiquette ajoutée — et le prendre pour une date de lecture
 * remplirait le journal de faux souvenirs.
 */

export type DiaryKind = 'started' | 'completed' | 'episode';

export interface DiaryEvent {
  /** Date ISO. C'est elle qui classe. */
  at: string;
  kind: DiaryKind;
  entry: LibraryEntry;
  /** Pour un épisode : son numéro. */
  episode?: number;
  /** Pour un revisionnage : le rang, à partir de 2. */
  rewatch?: number;
}

/**
 * Les événements, du plus récent au plus ancien.
 *
 * Les épisodes en font partie : c'est là qu'un journal devient un journal,
 * une ligne par séance. `watchedAt` est une LISTE — décision 4 — donc un
 * revisionnage ajoute sa propre ligne au lieu d'écraser la première.
 */
export function diaryEvents(entries: readonly LibraryEntry[]): DiaryEvent[] {
  const out: DiaryEvent[] = [];

  for (const entry of entries) {
    if (entry.startedAt) out.push({ at: entry.startedAt, kind: 'started', entry });
    if (entry.finishedAt) out.push({ at: entry.finishedAt, kind: 'completed', entry });

    for (const [numero, record] of Object.entries(entry.episodes ?? {})) {
      record.watchedAt.forEach((at, i) => {
        out.push({
          at,
          kind: 'episode',
          entry,
          episode: Number(numero),
          /* Le premier visionnage n'est pas un revisionnage : le rang ne
             commence qu'au deuxième. */
          rewatch: i > 0 ? i + 1 : undefined,
        });
      });
    }
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export interface DiaryMonth {
  /** `2026-08`, pour la clé et le tri. */
  key: string;
  events: DiaryEvent[];
}

/**
 * Les événements groupés par mois.
 *
 * Un journal se lit par périodes, pas en une coulée : sans les mois, cinq
 * cents lignes n'ont plus de repères.
 */
export function byMonth(events: readonly DiaryEvent[]): DiaryMonth[] {
  const mois = new Map<string, DiaryEvent[]>();

  for (const e of events) {
    const key = e.at.slice(0, 7);
    const liste = mois.get(key);
    if (liste) liste.push(e);
    else mois.set(key, [e]);
  }

  /* La Map garde l'ordre d'insertion, et les événements arrivent déjà triés :
     les mois sortent donc du plus récent au plus ancien sans nouveau tri. */
  return [...mois.entries()].map(([key, events]) => ({ key, events }));
}

/** `2026-08` → « August 2026 ». Une date sans mois ne se lit pas. */
export function monthLabel(key: string): string {
  const [annee, mois] = key.split('-');
  const date = new Date(Number(annee), Number(mois) - 1, 1);
  return Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** `2026-08-20T…` → « 20 ». Le mois est déjà dans le titre du groupe. */
export function dayOf(at: string): string {
  return String(Number(at.slice(8, 10)) || '');
}
