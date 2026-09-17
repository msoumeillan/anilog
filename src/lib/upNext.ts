import type { LibraryEntry } from '../types/library';

/**
 * « J'en étais où, et combien m'attendent ? »
 *
 * L'accueil disait la progression — `7 / 12` — et rien du RETARD. Or les deux
 * ne se déduisent pas l'un de l'autre : le total est une promesse, le nombre
 * d'épisodes SORTIS est un fait, et c'est lui qui dit combien de soirées de
 * retard on a. Un 7/12 peut vouloir dire « à jour » comme « cinq épisodes en
 * attente », selon que la série est finie ou en cours.
 *
 * Pur, donc testé : ce calcul est une soustraction, et une soustraction fausse
 * affiche une dette qui n'existe pas.
 */

/** Ce qu'AniList sait de la diffusion — la forme utile de `UP_NEXT`. */
export interface AiringFacts {
  /** Le total annoncé. Une promesse, pas un compte. */
  episodes: number | null;
  /** `FINISHED`, `RELEASING`, `NOT_YET_RELEASED`… */
  status: string | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

export interface UpNextRow {
  entry: LibraryEntry;
  /** Épisodes cochés. */
  watched: number;
  /** Le total annoncé, du réseau si on l'a, de la copie locale sinon. */
  total: number | null;
  /** Épisodes sortis. `null` quand personne ne sait. */
  aired: number | null;
  /** Combien attendent : 0 = à jour, `null` = inconnu. */
  waiting: number | null;
  /** Le prochain à REGARDER, quand il est sorti. */
  next: number | null;
  /** Le prochain à SORTIR, quand il est annoncé. */
  upcoming: { episode: number; airingAt: number } | null;
  /**
   * Le groupe de la liste : ce qui attend maintenant, ce qui attend depuis un
   * mois, et ce qui n'attend pas. Chacun porte son intertitre a l'ecran, sinon
   * une serie a jour rangee sous « pas regardee depuis un moment » se lit comme
   * un reproche qu'elle ne merite pas.
   */
  group: 'now' | 'dormant' | 'clear';
}

/**
 * Au bout d'un mois sans rien cocher, une série passe dessous.
 *
 * Elle ne disparaît pas : c'est le propre d'une série mise de côté de revenir.
 * Mais elle n'a plus à occuper le haut de l'accueil, où l'on cherche ce qu'on
 * regarde EN CE MOMENT.
 */
const DORMANT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Combien d'épisodes sont SORTIS.
 *
 * Trois cas, et le troisième est celui qui compte :
 *
 *   - un prochain épisode annoncé : tout ce qui le précède est sorti, et c'est
 *     la seule mesure exacte ;
 *   - une série finie : son total est sorti ;
 *   - une série EN COURS sans prochain épisode annoncé — une pause, une grille
 *     non publiée — ne dit rien : son total reste une promesse. On répond
 *     `null` plutôt que d'inventer un retard.
 *
 * Sans fiche du tout — AniList n'a pas encore répondu, ou l'œuvre n'est pas
 * chez lui —, `null` aussi : la carte montrera la progression, pas une dette.
 */
export function airedCount(facts: AiringFacts | undefined): number | null {
  if (!facts) return null;
  if (facts.nextAiringEpisode) return Math.max(0, facts.nextAiringEpisode.episode - 1);
  if (facts.status === 'RELEASING' || facts.status === 'NOT_YET_RELEASED') return null;
  return facts.episodes;
}

/** Une entrée suivie, son retard et son prochain épisode. */
export function upNextRow(
  entry: LibraryEntry,
  facts: AiringFacts | undefined,
  now = Date.now(),
): UpNextRow {
  const watched =
    entry.progress.kind === 'anime' ? entry.progress.episodes : entry.progress.chapters;
  const aired = airedCount(facts);
  /* Jamais négatif : on peut avoir coché plus loin que ce qu'AniList annonce —
     une avant-première, un décalage de leur grille. « -1 en attente » n'aurait
     aucun sens. */
  const waiting = aired === null ? null : Math.max(0, aired - watched);

  /* En sommeil : plus rien de coché depuis un mois. Pas un champ de la
     ligne — il ne sert qu'à la ranger, et `group` le dit déjà. */
  const dormant = Date.parse(entry.updatedAt) < now - DORMANT_MS;
  const attend = (waiting ?? 0) > 0;

  return {
    entry,
    watched,
    total: facts?.episodes ?? entry.totalUnits ?? null,
    aired,
    waiting,
    next: attend ? watched + 1 : null,
    upcoming: facts?.nextAiringEpisode ?? null,
    group: attend ? (dormant ? 'dormant' : 'now') : 'clear',
  };
}

/**
 * L'ordre dans lequel on reprend.
 *
 *   1. ce qui attend, touché récemment — le dernier touché d'abord, c'est
 *      celui qu'on est en train de regarder ;
 *   2. ce qui attend mais dort depuis un mois ;
 *   3. ce qui n'attend pas — la prochaine sortie en premier, c'est elle qui
 *      redonnera quelque chose à voir, et ce dont on ne sait rien à la fin.
 */
const RANG: Record<UpNextRow['group'], number> = { now: 0, dormant: 1, clear: 2 };

function rang(r: UpNextRow): number {
  return RANG[r.group] * 2 + (r.group === 'clear' && r.waiting === null ? 1 : 0);
}

export function upNextRows(
  entries: readonly LibraryEntry[],
  factsOf: (entry: LibraryEntry) => AiringFacts | undefined,
  now = Date.now(),
): UpNextRow[] {
  return entries
    .map((e) => upNextRow(e, factsOf(e), now))
    .sort((a, b) => {
      const parRang = rang(a) - rang(b);
      if (parRang !== 0) return parRang;
      if (a.group === 'clear') {
        const da = a.upcoming?.airingAt ?? Number.POSITIVE_INFINITY;
        const db = b.upcoming?.airingAt ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
      }
      return b.entry.updatedAt.localeCompare(a.entry.updatedAt);
    });
}
