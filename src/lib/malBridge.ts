import { anilist } from '../api/anilist/client';
import { MAL_BRIDGE } from '../api/anilist/queries';
import { displayTitle } from './title';
import { mainStudio } from './mediaTip';
import type { LibraryEntry, MediaType } from '../types/library';
import type { MalEntry } from './malImport';

/**
 * Le pont : des identifiants MyAnimeList vers les nôtres.
 *
 * MAL ne connaît que ses propres numéros. AniList sait les traduire —
 * `idMal_in` — mais cinquante à la fois, sur un quota de trente requêtes par
 * minute. Une liste de mille titres, c'est donc vingt appels et près d'une
 * minute : l'écran doit le dire au lieu de faire semblant d'être bloqué.
 *
 * Ce fichier ne touche ni au store ni au DOM. Il traduit, il rend ce qu'il a
 * trouvé et ce qu'il n'a pas trouvé, et l'écran décide.
 */

/** Le maximum d'une page AniList. Au-delà, la requête est refusée. */
const PAR_LOT = 50;

/**
 * Pause entre deux lots.
 *
 * Le quota est de trente requêtes par minute, soit une toutes les deux
 * secondes. On reste juste en dessous : le client sait rattraper un 429 en
 * lisant `Retry-After`, mais un import qui s'y cogne à chaque lot mettrait
 * trois fois plus de temps pour le même résultat.
 */
const PAUSE_MS = 2100;

interface MediaTrouve {
  id: number;
  idMal: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { large: string | null };
  format: string | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  chapters: number | null;
  studios: { edges: { isMain: boolean; node: { id: number; name: string } }[] };
  genres: string[] | null;
  duration: number | null;
}

export interface Traduction {
  /** Ce qui a trouvé son équivalent, prêt pour la bibliothèque. */
  rows: { media: MediaType; anilistId: number; patch: Partial<LibraryEntry> }[];
  /** Ce qu'AniList ne connaît pas. Nommé, pour qu'on sache quoi. */
  perdus: MalEntry[];
}

export interface Avancement {
  /** Lots traités et lots au total : de quoi dessiner une barre honnête. */
  fait: number;
  total: number;
}

/**
 * Traduit un export, lot par lot.
 *
 * `onProgress` est appelé après chaque lot. `signal` interrompt : un import
 * d'une minute doit pouvoir s'arrêter, et sans lui la page continue de tirer
 * des requêtes après qu'on a quitté l'écran.
 */
export async function traduire(
  entries: readonly MalEntry[],
  media: MediaType,
  opts: { signal?: AbortSignal; onProgress?: (a: Avancement) => void } = {},
): Promise<Traduction> {
  const lots: MalEntry[][] = [];
  for (let i = 0; i < entries.length; i += PAR_LOT) lots.push(entries.slice(i, i + PAR_LOT));

  const rows: Traduction['rows'] = [];
  const perdus: MalEntry[] = [];

  for (const [i, lot] of lots.entries()) {
    if (opts.signal?.aborted) break;

    const d = await anilist<{ Page: { media: MediaTrouve[] } }>(
      MAL_BRIDGE,
      { type: media === 'manga' ? 'MANGA' : 'ANIME', idMal: lot.map((e) => e.malId) },
      opts.signal,
    );

    /* Indexé par identifiant MAL : AniList rend les œuvres dans SON ordre, pas
       dans celui qu'on a demandé, et les apparier par position perdrait tout
       dès qu'une seule manque. */
    const parMal = new Map<number, MediaTrouve>();
    for (const m of d.Page.media) if (typeof m.idMal === 'number') parMal.set(m.idMal, m);

    for (const e of lot) {
      const trouve = parMal.get(e.malId);
      if (!trouve) {
        perdus.push(e);
        continue;
      }
      rows.push({ media, anilistId: trouve.id, patch: versEntree(e, trouve, media) });
    }

    opts.onProgress?.({ fait: i + 1, total: lots.length });

    /* Pas de pause après le dernier : elle ne servirait qu'à faire attendre. */
    if (i < lots.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  return { rows, perdus };
}

/**
 * Une ligne de MAL et sa fiche AniList, fondues en une entrée.
 *
 * MAL apporte le SUIVI — statut, note, progression, dates, commentaire — et
 * AniList l'IDENTITÉ : titre, affiche, format, saison. Chacun ce qu'il sait.
 */
function versEntree(e: MalEntry, m: MediaTrouve, media: MediaType): Partial<LibraryEntry> {
  const total = media === 'manga' ? (m.chapters ?? e.total) : (m.episodes ?? e.total);

  return {
    ids: { anilist: m.id, mal: e.malId },
    title: displayTitle(m.title),
    cover: m.coverImage.large ?? undefined,
    totalUnits: total ?? undefined,
    format: m.format ?? undefined,
    season: m.season ?? undefined,
    seasonYear: m.seasonYear ?? undefined,
    studio: mainStudio(m.studios) ?? undefined,
    /* Recopies pour les statistiques : un import remplit la bibliotheque d'un
       coup, et sans eux la page ne saurait rien dire de mille titres avant
       qu'on soit alle ouvrir mille fiches. */
    genres: m.genres && m.genres.length > 0 ? m.genres : undefined,
    duration: m.duration ?? undefined,

    status: e.status,
    score: e.score,
    progress:
      media === 'anime'
        ? { kind: 'anime', episodes: e.episodes ?? 0 }
        : { kind: 'manga', chapters: e.chapters ?? 0, volumes: e.volumes ?? 0 },
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    /* Le commentaire de MAL EST une critique : c'est le même geste, et le
       laisser de côté ferait perdre ce que les gens ont écrit de plus long. */
    review: e.comments,
    tags: e.tags.length > 0 ? e.tags : undefined,
  };
}
