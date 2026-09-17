import { sortLibrary } from './libraryOrder';
import { statusLabel, STATUS_ORDER } from './trackStatus';
import type { LibraryEntry, MediaType } from '../types/library';

/**
 * Ce que la bibliothèque sait dire d'elle-même.
 *
 * Tout se calcule sur la copie locale : aucune requête, et les chiffres
 * s'affichent hors ligne comme le reste de la bibliothèque.
 */

/**
 * Les entrées d'un média, du plus récemment terminé au plus ancien.
 *
 * `finishedAt` SEUL, et c'est tout le sujet de cette section. Elle retombait
 * avant sur `updatedAt` quand la date de fin manquait, en se disant qu'une
 * entrée terminée avant l'existence du champ n'avait pas à disparaître du
 * classement. Sauf qu'`updatedAt` avance au moindre geste : ajouter une
 * étiquette à un titre fini il y a six mois le remettait en tête de « ce que
 * je viens de terminer ». Une date de modification n'est pas une date de fin,
 * et cette section-ci parle de la seconde.
 *
 * Ce qui n'a pas de date de fin reste affiché, mais à la FIN — voir
 * `sortLibrary`, qui range les absents en dernier et départage par titre.
 * Ne pas savoir quand une œuvre a été terminée n'est pas une raison de la
 * cacher, ce n'en est pas une non plus de la faire passer devant.
 */
export function lastCompleted(
  entries: readonly LibraryEntry[],
  media: MediaType,
  limit = 5,
): LibraryEntry[] {
  const finies = entries.filter((e) => e.media === media && e.status === 'completed');
  return sortLibrary(finies, 'finished').slice(0, limit);
}

export interface MediaStats {
  /** Tout ce qui est suivi, quel que soit le statut. */
  tracked: number;
  completed: number;
  /** Combien portent une note — la moyenne ne vaut que sur celles-là. */
  rated: number;
  /** Sur 10, une décimale. `null` quand rien n'est noté. */
  mean: number | null;
  /**
   * Combien d'œuvres par note, de 1 à 10. Dix cases, toujours.
   *
   * Une courbe a besoin de ses creux : sauter les notes jamais données
   * tasserait l'axe et ferait mentir la forme.
   */
  distribution: number[];
  /** Episodes vus ou chapitres lus, additionnés. */
  units: number;
}

export function mediaStats(entries: readonly LibraryEntry[], media: MediaType): MediaStats {
  const shelf = entries.filter((e) => e.media === media);
  const distribution = Array.from({ length: 10 }, () => 0);
  let total = 0;
  let rated = 0;
  let units = 0;

  for (const e of shelf) {
    units += e.progress.kind === 'anime' ? e.progress.episodes : e.progress.chapters;

    /* Une note va de 1 à 10 ; tout le reste est une entrée non notée, pas un
       zéro. Les compter comme des zéros écraserait la moyenne. */
    const note = e.score;
    if (typeof note !== 'number' || note < 1 || note > 10) continue;
    const rang = Math.round(note) - 1;
    distribution[rang] = (distribution[rang] ?? 0) + 1;
    total += note;
    rated += 1;
  }

  return {
    tracked: shelf.length,
    completed: shelf.filter((e) => e.status === 'completed').length,
    rated,
    mean: rated > 0 ? Math.round((total / rated) * 10) / 10 : null,
    distribution,
    units,
  };
}

/**
 * Une répartition : une valeur, combien de fois.
 *
 * Le même objet pour les statuts, les formats, les années, les studios — un
 * seul dessin de barre les affiche tous, au lieu d'un composant par question.
 */
export interface Part {
  label: string;
  count: number;
  /**
   * Une précision affichée entre la barre et le compte — la note moyenne d'un
   * genre, par exemple. Facultative : la plupart des répartitions n'ont qu'un
   * compte à montrer.
   */
  hint?: string;
}

/**
 * Compte les entrées par valeur, de la plus fréquente à la plus rare.
 *
 * À égalité, l'ordre alphabétique : sans lui, deux formats à trois œuvres
 * changeraient de place d'un affichage à l'autre selon l'ordre de la table.
 * Les entrées sans valeur ne sont pas comptées — « sans format » n'est pas un
 * format, et une barre pour lui ferait croire à une catégorie.
 */
export function countBy(
  entries: readonly LibraryEntry[],
  valeur: (e: LibraryEntry) => string | undefined | null,
  limit?: number,
): Part[] {
  const compte = new Map<string, number>();
  for (const e of entries) {
    const v = valeur(e)?.trim();
    if (v) compte.set(v, (compte.get(v) ?? 0) + 1);
  }

  const parts = [...compte.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return limit === undefined ? parts : parts.slice(0, limit);
}

/**
 * Les statuts, TOUJOURS dans le même ordre et tous présents.
 *
 * Contrairement aux formats, on ne les trie pas par fréquence : ce sont cinq
 * cases fixes qu'on lit toujours au même endroit, et un zéro est une réponse.
 * Les voir changer de place selon ce qu'on a regardé rendrait la comparaison
 * entre deux médias impossible.
 */
export function byStatus(entries: readonly LibraryEntry[], media: MediaType): Part[] {
  const shelf = entries.filter((e) => e.media === media);
  return STATUS_ORDER.map((s) => ({
    label: statusLabel(s, media),
    count: shelf.filter((e) => e.status === s).length,
  }));
}

/**
 * Les années de sortie, SANS TROU.
 *
 * Une année vide compte : c'est une année où l'on n'a rien regardé, et la
 * sauter tasserait la frise en donnant l'illusion d'une activité continue.
 * `[]` quand aucune entrée n'a d'année — le manga, par exemple, dont AniList
 * ne renseigne pas le calendrier.
 */
export function byYear(entries: readonly LibraryEntry[]): Part[] {
  return parAnnee(
    entries.map((e) => e.seasonYear).filter((y): y is number => typeof y === 'number'),
  );
}

/**
 * Les années où l'on a TERMINÉ quelque chose, sans trou.
 *
 * À ne pas confondre avec l'année de sortie : celle-ci dit quand on a regardé,
 * l'autre quand l'œuvre est parue. Les deux ensemble racontent si l'on suit
 * l'actualité ou si l'on rattrape.
 *
 * Ne compte que ce qui porte une date de fin. Une entrée terminée sans date
 * n'appartient à aucune année, et lui en attribuer une — celle de la dernière
 * modification, par exemple — inventerait un passé.
 */
export function byFinishYear(entries: readonly LibraryEntry[], media: MediaType): Part[] {
  const annees: number[] = [];
  for (const e of entries) {
    if (e.media !== media) continue;
    const a = Number(e.finishedAt?.slice(0, 4));
    if (Number.isInteger(a) && a > 0) annees.push(a);
  }
  return parAnnee(annees);
}

/** Le remplissage des trous, commun aux deux frises d'années. */
function parAnnee(annees: number[]): Part[] {
  if (annees.length === 0) return [];

  const min = Math.min(...annees);
  const max = Math.max(...annees);

  /* Garde-fou : une année aberrante — saisie à la main, ou venue d'une fiche
     mal remplie — étirerait la frise sur des siècles de barres vides. */
  if (max - min > 120) return [];

  const out: Part[] = [];
  for (let a = min; a <= max; a += 1) {
    out.push({ label: String(a), count: annees.filter((y) => y === a).length });
  }
  return out;
}

/**
 * L'écart-type des notes, sur la même échelle qu'elles — de 1 à 10.
 *
 * La moyenne seule ne dit pas si l'on note tout 7 ou moitié 3 moitié 10. Deux
 * bibliothèques de moyenne 7 peuvent n'avoir rien en commun ; c'est l'écart
 * qui les sépare. AniList l'affiche pour cette raison, en tête de ses stats.
 *
 * Écart-type de POPULATION et non d'échantillon : on ne cherche pas à estimer
 * les notes d'une population plus large dont la bibliothèque serait un tirage,
 * on décrit exactement les notes qui sont là.
 *
 * `null` sous deux notes : l'écart d'une seule valeur vaut zéro, ce qui se lit
 * comme « il note toujours pareil » alors qu'il n'a noté qu'une fois.
 */
export function scoreSpread(entries: readonly LibraryEntry[], media: MediaType): number | null {
  const notes: number[] = [];
  for (const e of entries) {
    if (e.media !== media) continue;
    const n = e.score;
    if (typeof n === 'number' && n >= 1 && n <= 10) notes.push(n);
  }
  if (notes.length < 2) return null;

  const moyenne = notes.reduce((a, b) => a + b, 0) / notes.length;
  const variance = notes.reduce((a, n) => a + (n - moyenne) ** 2, 0) / notes.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/**
 * Les tranches de longueur, et leurs bornes.
 *
 * Les bornes ne sont pas régulières, et c'est voulu : l'écart entre 12 et 24
 * épisodes est celui d'une saison à deux, celui entre 300 et 312 n'est rien.
 * Un découpage en tranches égales mettrait la moitié de la bibliothèque dans
 * la première case.
 *
 * Deux échelles, parce que ce sont deux objets : un anime de cent épisodes est
 * un monument, un manga de cent chapitres est un format courant.
 */
const TRANCHES: Record<MediaType, { max: number; label: string }[]> = {
  anime: [
    { max: 1, label: '1' },
    { max: 6, label: '2–6' },
    { max: 16, label: '7–16' },
    { max: 28, label: '17–28' },
    { max: 55, label: '29–55' },
    { max: 100, label: '56–100' },
    { max: Infinity, label: '101+' },
  ],
  manga: [
    { max: 10, label: '1–10' },
    { max: 30, label: '11–30' },
    { max: 60, label: '31–60' },
    { max: 100, label: '61–100' },
    { max: 200, label: '101–200' },
    { max: 500, label: '201–500' },
    { max: Infinity, label: '501+' },
  ],
};

/**
 * La longueur des œuvres suivies : combien d'épisodes, combien de chapitres.
 *
 * Sur la longueur ANNONCÉE de l'œuvre, pas sur ce qu'on en a vu : la question
 * est « est-ce que je regarde des séries courtes ou des fleuves », pas « où
 * j'en suis ».
 *
 * Une tranche vide au MILIEU reste affichée — c'est un creux réel — mais les
 * tranches vides des deux bouts disparaissent : une bibliothèque sans rien
 * au-dessus de trente épisodes n'a pas à traîner trois cases à zéro.
 */
export function byLength(entries: readonly LibraryEntry[], media: MediaType): Part[] {
  const tranches = TRANCHES[media];
  const compte = tranches.map(() => 0);
  let inconnu = 0;

  for (const e of entries) {
    if (e.media !== media) continue;
    const n = e.totalUnits;
    /* Sans total annoncé — une série en cours, une entrée importée sans
       chiffre — l'œuvre n'entre dans aucune tranche. La ranger dans « 1 »
       ferait passer un fleuve en cours pour un court-métrage. */
    if (typeof n !== 'number' || n < 1) {
      inconnu += 1;
      continue;
    }
    const i = tranches.findIndex((t) => n <= t.max);
    if (i >= 0) compte[i] = (compte[i] ?? 0) + 1;
  }

  const parts: Part[] = tranches.map((t, i) => ({ label: t.label, count: compte[i] ?? 0 }));

  const debut = parts.findIndex((p) => p.count > 0);
  if (debut === -1) return inconnu > 0 ? [{ label: 'Unknown', count: inconnu }] : [];
  let fin = parts.length - 1;
  while (fin > debut && (parts[fin]?.count ?? 0) === 0) fin -= 1;

  const garde = parts.slice(debut, fin + 1);
  /* « Unknown » en dernier et seulement s'il existe : c'est une absence de
     réponse, pas la plus longue des tranches. */
  if (inconnu > 0) garde.push({ label: 'Unknown', count: inconnu });
  return garde;
}

export interface GenreCount {
  genre: string;
  count: number;
  /** La moyenne des notes DANS ce genre. `null` si rien n'y est noté. */
  mean: number | null;
}

/**
 * Les genres les plus présents, et la note qu'on y donne.
 *
 * Une œuvre compte dans CHACUN de ses genres : la somme des compteurs dépasse
 * donc le nombre d'œuvres, et c'est correct — la question est « combien de ce
 * que je regarde est de l'action », pas « comment mes titres se répartissent
 * en parts d'un tout ». C'est aussi pourquoi ce n'est pas un camembert.
 *
 * La moyenne par genre est ce qui rend la section intéressante : aimer un
 * genre et le regarder beaucoup sont deux choses différentes.
 */
export function topGenres(
  entries: readonly LibraryEntry[],
  media: MediaType,
  limit = 12,
): GenreCount[] {
  const compte = new Map<string, { count: number; total: number; notes: number }>();

  for (const e of entries) {
    if (e.media !== media) continue;
    for (const brut of e.genres ?? []) {
      const genre = brut.trim();
      if (!genre) continue;
      const acc = compte.get(genre) ?? { count: 0, total: 0, notes: 0 };
      acc.count += 1;
      if (typeof e.score === 'number' && e.score >= 1 && e.score <= 10) {
        acc.total += e.score;
        acc.notes += 1;
      }
      compte.set(genre, acc);
    }
  }

  return [...compte.entries()]
    .map(([genre, a]) => ({
      genre,
      count: a.count,
      mean: a.notes > 0 ? Math.round((a.total / a.notes) * 10) / 10 : null,
    }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, limit);
}

export interface TimeSpent {
  /** Minutes passées, d'après les durées ANNONCÉES. */
  minutes: number;
  /** Sur combien de titres ce total est calculé. */
  titles: number;
  /**
   * Titres commencés dont la durée d'épisode est inconnue : ils manquent au
   * total, et le taire donnerait un chiffre trop petit sans le dire.
   */
  unknown: number;
}

/**
 * Le temps passé devant des anime.
 *
 * Sur la durée que la fiche ANNONCE, multipliée par les épisodes vus. Ce n'est
 * pas exact — un épisode dure rarement sa durée moyenne, et le générique
 * compte — mais ce n'est pas inventé non plus : c'est le calcul d'AniList, à
 * partir du même chiffre. C'est ce qui sépare ce total du « 24 minutes par
 * épisode » que cette page refusait jusqu'ici d'afficher.
 *
 * Ce que le total ne contient PAS est renvoyé avec lui. Une entrée sans durée
 * ne peut pas être comptée, et l'écran doit pouvoir le dire au lieu d'afficher
 * un total silencieusement amputé.
 *
 * Rien pour le manga : on ne sait pas combien de temps se lit un chapitre, et
 * personne ne le sait.
 */
export function timeSpent(entries: readonly LibraryEntry[]): TimeSpent {
  let minutes = 0;
  let titles = 0;
  let unknown = 0;

  for (const e of entries) {
    if (e.media !== 'anime' || e.progress.kind !== 'anime') continue;
    const vus = e.progress.episodes;
    if (vus <= 0) continue;

    if (typeof e.duration === 'number' && e.duration > 0) {
      minutes += e.duration * vus;
      titles += 1;
    } else {
      unknown += 1;
    }
  }

  return { minutes, titles, unknown };
}

export interface MonthActivity {
  /** `2026-08`, pour la clé et le tri. */
  key: string;
  /** Œuvres terminées ce mois-là. */
  completed: number;
  /** Épisodes cochés ce mois-là. */
  episodes: number;
}

/**
 * Le rythme des derniers mois.
 *
 * Deux mesures et pas une : TERMINER est un évènement rare et marquant,
 * COCHER un épisode est le geste quotidien. Une seule courbe mélangerait un
 * rythme de fond et des jalons, et ne dirait ni l'un ni l'autre.
 *
 * Les mois sans rien sont présents. C'est même le plus intéressant à voir : un
 * trou de trois mois est une information, et le supprimer ferait croire à une
 * régularité qui n'a pas eu lieu.
 */
export function activity(
  entries: readonly LibraryEntry[],
  mois = 12,
  maintenant = new Date(),
): MonthActivity[] {
  const par = new Map<string, MonthActivity>();

  /* On part de MAINTENANT et on remonte : la frise doit finir au mois courant
     même si rien n'y a été fait, sinon elle semble s'arrêter toute seule. */
  for (let i = mois - 1; i >= 0; i -= 1) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    par.set(key, { key, completed: 0, episodes: 0 });
  }

  for (const e of entries) {
    const fin = e.finishedAt?.slice(0, 7);
    const m = fin ? par.get(fin) : undefined;
    if (m) m.completed += 1;

    for (const record of Object.values(e.episodes ?? {})) {
      for (const at of record.watchedAt) {
        const mm = par.get(at.slice(0, 7));
        if (mm) mm.episodes += 1;
      }
    }
  }

  return [...par.values()];
}

export interface StudioCount {
  studio: string;
  count: number;
}

/**
 * Les studios les plus présents dans la bibliothèque.
 *
 * Déduits des entrées elles-mêmes : chacune porte son studio principal,
 * recopié au moment du suivi pour la bulle de survol. Aucune donnée nouvelle à
 * demander, et rien à marquer à la main.
 *
 * L'anime seulement : un manga n'a pas de studio d'animation, et compter les
 * deux ensemble ferait un classement qui ne veut rien dire.
 */
export function topStudios(entries: readonly LibraryEntry[], limit = 8): StudioCount[] {
  const compte = new Map<string, number>();

  for (const e of entries) {
    const studio = e.media === 'anime' ? e.studio?.trim() : undefined;
    if (studio) compte.set(studio, (compte.get(studio) ?? 0) + 1);
  }

  return (
    [...compte.entries()]
      .map(([studio, count]) => ({ studio, count }))
      /* À égalité, l'ordre alphabétique : sans lui le classement changerait
         d'un affichage à l'autre selon l'ordre de la table. */
      .sort((a, b) => b.count - a.count || a.studio.localeCompare(b.studio))
      .slice(0, limit)
  );
}
