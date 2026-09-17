/**
 * La saison d'animation en cours.
 *
 * Le découpage d'AniList est fixe et par trimestre : janvier–mars WINTER,
 * avril–juin SPRING, juillet–septembre SUMMER, octobre–décembre FALL. Rien
 * d'astronomique là-dedans, c'est une convention de l'industrie.
 *
 * Petit calcul, mais à frontières : les quatre bascules et le passage d'année
 * sont exactement ce qui se rate en écrivant `Math.floor(mois / 3)` de tête.
 * D'où les tests.
 */

import { seasonLabel } from './mediaOptions';

export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

/** Dans l'ordre des trimestres, l'index vaut le trimestre. */
const ORDER: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

/**
 * Une valeur venue de l'URL est-elle une saison ? `null` sinon.
 *
 * L'adresse se tape et se bricole. `?season=BANANA` partait jusque-là tel quel
 * dans les variables GraphQL — un `as Season` promettait au compilateur ce que
 * personne n'avait vérifié, et AniList répondait par une erreur qu'on lisait
 * comme une panne. On valide ici, une fois.
 */
export function asSeason(value: string | null | undefined): Season | null {
  return ORDER.find((s) => s === value) ?? null;
}

export interface SeasonPoint {
  season: Season;
  year: number;
}

export function currentSeason(now: Date = new Date()): SeasonPoint {
  /* `getMonth` compte à partir de zéro : janvier vaut 0, donc le trimestre
     s'obtient directement, sans le décalage qu'un mois en base 1 imposerait. */
  const quarter = Math.floor(now.getMonth() / 3);
  return { season: ORDER[quarter] ?? 'WINTER', year: now.getFullYear() };
}

/** « SUMMER » + 2026 → « Summer 2026 ». */
export function seasonTitle({ season, year }: SeasonPoint): string {
  return `${seasonLabel(season)} ${year}`;
}

// ─────────────────────────────────────────────────────────────
//  Les œuvres qu'AniList ne range dans aucune saison
// ─────────────────────────────────────────────────────────────

/**
 * AniList laisse `season` et `seasonYear` VIDES sur les donghua.
 *
 * Mesuré sur l'été 2026 : les 100 fiches rangées dans la saison sont toutes
 * japonaises, sans exception. « False Memory (2026) » — ONA chinois, diffusé
 * depuis le 2 août 2026 — a bien sa date de début mais aucune saison. Aucun
 * filtre par saison ne peut donc le trouver. Ce n'est pas un défaut de l'app,
 * c'est une donnée absente en amont. MyAnimeList, lui, attribue une saison
 * éditorialement à tout, d'où la différence.
 *
 * La parade tient en une phrase : ON FAIT CONFIANCE À LA SAISON QUAND ELLE
 * EXISTE, ET ON RETOMBE SUR LA DATE DE DÉBUT QUAND ELLE MANQUE.
 *
 * Le test porte sur l'absence de saison, pas sur le pays. Les deux coïncident
 * sur les données mesurées, mais c'est l'absence qui est la CAUSE du problème :
 * une fiche japonaise oubliée par les curateurs serait rattrapée, et un
 * donghua correctement rangé serait cru sur parole.
 */

/**
 * Une saison d'animation ne commence pas le 1er du trimestre.
 *
 * Deux semaines d'avance aux deux bouts. Mesuré sur l'été 2026 : six séries
 * rangées en été démarrent entre le 24 et le 30 juin, et les séries d'automne
 * commencent fin septembre. Une fenêtre calée sur le trimestre civil perdrait
 * les premières et attraperait les secondes.
 *
 * Le décalage étant le même aux deux bornes, les quatre fenêtres se pavent
 * exactement : l'été finit le 16 septembre, l'automne commence le 17. Ni trou
 * ni recouvrement — une œuvre sans saison tombe dans une fenêtre et une seule.
 */
const AVANCE_JOURS = 14;

/** Un entier `AAAAMMJJ`, la forme que veut AniList pour comparer des dates. */
export type FuzzyDateInt = number;

const toInt = (d: Date): FuzzyDateInt =>
  d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

const decale = (d: Date, jours: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + jours);

/**
 * La fenêtre de dates d'une saison, décalée de deux semaines.
 *
 * L'hiver franchit l'année : sa fenêtre s'ouvre à la mi-décembre PRÉCÉDENTE.
 * `Date` gère le passage tout seul dès qu'on lui donne un jour hors bornes,
 * ce qu'un calcul à la main sur les mois raterait.
 */
export function seasonWindow({ season, year }: SeasonPoint): {
  from: FuzzyDateInt;
  to: FuzzyDateInt;
} {
  const quarter = ORDER.indexOf(season);
  const debut = new Date(year, quarter * 3, 1);
  /* Jour 0 du mois suivant = dernier jour de celui-ci, sans table de 28/30/31
     ni cas particulier pour février. */
  const fin = new Date(year, quarter * 3 + 3, 0);
  return { from: toInt(decale(debut, -AVANCE_JOURS)), to: toInt(decale(fin, -AVANCE_JOURS)) };
}

/**
 * Un filtre de catalogue tel que Browse le pose : une saison, une année, ou
 * les deux. Chacune des trois formes se traite différemment, et c'est de ne
 * pas les avoir distinguées que venaient les résultats vides.
 */
export interface SeasonFilter {
  season?: Season | null;
  year?: number | null;
}

/**
 * Les bornes de date à DEMANDER au serveur, ou `null` quand aucune ne s'impose.
 *
 * Elles ne servent qu'à la requête d'appoint, celle qui va chercher ce
 * qu'AniList n'a rangé nulle part. Elles sont volontairement plus larges que
 * ce qu'on affichera : le tri fin se fait ensuite, au client, dans `inSeason`.
 *
 *   saison + année → le trimestre, un mois de marge de chaque côté. L'écart
 *                    mesuré sur l'été 2026 est d'une semaine au plus (24 juin
 *                    au plus tôt, 25 septembre au plus tard).
 *   année seule    → l'année entière.
 *   saison seule   → RIEN. « Tous les printemps » ne se borne pas ; on
 *                    demande alors sans contrainte de date et on trie après.
 */
export function queryBounds(f: SeasonFilter): { from: FuzzyDateInt; to: FuzzyDateInt } | null {
  if (f.season && f.year) {
    const quarter = ORDER.indexOf(f.season);
    return {
      from: toInt(new Date(f.year, quarter * 3 - 1, 1)),
      to: toInt(new Date(f.year, quarter * 3 + 4, 0)),
    };
  }
  if (f.year) return { from: f.year * 10000 + 101, to: f.year * 10000 + 1231 };
  return null;
}

/** Le strict nécessaire pour trancher — voir `inSeason`. */
export interface SeasonCandidate {
  season?: string | null;
  seasonYear?: number | null;
  startDate?: { year: number | null; month: number | null; day: number | null } | null;
}

/**
 * Cette œuvre passe-t-elle le filtre ?
 *
 * Deux chemins, et l'ordre compte : LA SAISON D'ANILIST FAIT FOI QUAND ELLE
 * EXISTE — c'est elle qui range une série de fin juin dans l'été, et une série
 * de fin septembre dans l'automne. La date ne sert qu'aux fiches qu'AniList n'a
 * rangées nulle part, les donghua pour l'essentiel.
 */
export function inSeason(media: SeasonCandidate, f: SeasonFilter): boolean {
  if (media.season) {
    if (f.season && media.season !== f.season) return false;
    if (f.year && media.seasonYear !== f.year) return false;
    return true;
  }

  const d = media.startDate;
  /* Une date sans mois ne situe rien dans un trimestre : mieux vaut ne pas
     l'afficher que la ranger au hasard. */
  if (!d?.year || !d.month) return false;
  const at = d.year * 10000 + d.month * 100 + (d.day ?? 1);

  if (f.season && f.year) {
    /* La fenêtre porte déjà l'année, y compris le débordement de l'hiver sur
       décembre précédent : on ne compare donc PAS `d.year` à `f.year`, ce qui
       rejetterait une œuvre du 20 décembre rangée dans l'hiver suivant. */
    const w = seasonWindow({ season: f.season, year: f.year });
    return at >= w.from && at <= w.to;
  }

  if (f.year) return d.year === f.year;

  if (f.season) {
    /* Recopiée dans une constante : le rétrécissement de `f.season` ne survit
       pas à l'entrée dans la fonction ci-dessous, et c'est ce qui justifiait
       le `as Season` qui traînait ici. Une constante, elle, se capture déjà
       rétrécie — sans rien promettre au compilateur. */
    const season = f.season;
    /* Sans année, la fenêtre se calcule sur celle de l'œuvre — et sur la
       suivante aussi, parce que l'hiver commence en décembre : le 20 décembre
       2025 appartient à l'hiver 2026, pas à l'hiver 2025. */
    return [d.year, d.year + 1].some((year) => {
      const w = seasonWindow({ season, year });
      return at >= w.from && at <= w.to;
    });
  }

  return true;
}
