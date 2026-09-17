import type { AdnVideo } from '../api/adn/client';

/**
 * La semaine, et ce qui y tombe.
 *
 * Deux choses vivent ici, et ce sont les deux qu'on écrit de travers :
 * l'arithmétique des dates, et le rapprochement entre deux catalogues qui ne
 * partagent aucun identifiant. Pur, donc testable — le fuseau horaire ne se
 * vérifie pas à l'œil.
 */

export interface Slot {
  /** L'identifiant AniList de la série. */
  mediaId: number;
  episode: number;
  /** Horodatage UNIX, en secondes, de la première diffusion, dans le pays d'origine. */
  airingAt: number;
  /**
   * Ce pays, selon AniList — `JP`, `CN`, `KR`. C'est lui qui dit de QUELLE
   * diffusion parle `airingAt` : celle d'un donghua est une sortie chinoise,
   * et l'étiqueter « JP » serait faux.
   */
  origin: string | null;
  title: string;
  cover: string | null;
  format: string | null;
  /** Les plateformes déclarées par AniList. Sans langue : elle n'y est jamais. */
  streams: { site: string; url: string }[];
  /**
   * Les sorties françaises de CET épisode, de la plus tôt à la plus tardive.
   * LiveChart en donne la plupart, ADN les siennes — voir `mergeReleases`.
   */
  fr: FrenchRelease[];
}

export type Langue = 'vostf' | 'vf';

export interface FrenchRelease {
  /** ISO, heure de mise en ligne en France — toujours au format de `toIso`. */
  at: string;
  /** « ADN », « Crunchyroll », « Netflix »… */
  platform: string;
  /** Dans cet ordre : VOSTF, puis VF. Vide quand la source ne le dit pas. */
  languages: Langue[];
  /** L'heure est une estimation de la source, pas une annonce. */
  approx: boolean;
}

/** `vostf`, `vf` — ce qu'ADN écrit, et ce que l'écran sait montrer. */
function isLangue(s: string): s is Langue {
  return s === 'vostf' || s === 'vf';
}

/** Les langues de deux annonces d'une même sortie, sans doublon, VOSTF d'abord. */
export function unionLangues(a: readonly Langue[], b: readonly Langue[]): Langue[] {
  return (['vostf', 'vf'] as const).filter((l) => a.includes(l) || b.includes(l));
}

/**
 * Une date ramenée à UNE écriture ISO, ou rien.
 *
 * Deux sources qui annoncent la même sortie doivent produire la même chaîne,
 * sinon elles ne se reconnaissent pas : ADN écrit `…T18:00:00Z`, LiveChart
 * `…T18:00:00.000000000Z`. Les nanosecondes sont coupées à trois chiffres
 * AVANT d'analyser — au-delà, la norme n'impose rien aux navigateurs.
 */
export function toIso(date: string | null | undefined): string | null {
  if (!date) return null;
  const t = Date.parse(date.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Réunit les sorties d'un épisode venues de plusieurs sources.
 *
 * Même plateforme à la même minute = même sortie : ADN annoncé par ADN et par
 * LiveChart, ou la VOSTF et la VF d'un simulcast qui sortent ensemble. Leurs
 * langues s'additionnent. Une estimation qui rencontre une annonce devient une
 * annonce.
 */
export function mergeReleases(releases: readonly FrenchRelease[]): FrenchRelease[] {
  const par = new Map<string, FrenchRelease>();

  for (const r of releases) {
    const cle = `${r.platform}|${r.at}`;
    const deja = par.get(cle);
    par.set(
      cle,
      deja
        ? {
            ...deja,
            languages: unionLangues(deja.languages, r.languages),
            approx: deja.approx && r.approx,
          }
        : r,
    );
  }

  return [...par.values()].sort(
    (a, b) => a.at.localeCompare(b.at) || a.platform.localeCompare(b.platform),
  );
}

/**
 * Le moment qui compte pour cet épisode, en millisecondes : la PREMIÈRE sortie
 * française quand on la connaît, la diffusion japonaise sinon.
 *
 * C'est lui qui place la carte dans la semaine. Un épisode diffusé au Japon le
 * dimanche et mis en ligne ici le lundi se regarde le lundi.
 */
export function mainAt(slot: Slot): number {
  const premiere = slot.fr[0];
  return premiere ? Date.parse(premiere.at) : slot.airingAt * 1000;
}

/**
 * Le lundi de la semaine d'une date, à minuit, dans le fuseau du navigateur.
 *
 * Lundi et non dimanche : c'est la semaine d'ici, et une grille qui commence un
 * dimanche se lit de travers en France. `setDate` fait le report de mois et
 * d'année tout seul, y compris au 1er janvier.
 */
export function weekStart(d: Date): Date {
  const jour = d.getDay();
  /* `getDay` rend 0 pour dimanche : sans ce décalage, le dimanche renverrait au
     lundi SUIVANT, et la semaine sauterait. */
  const recul = jour === 0 ? 6 : jour - 1;
  const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate() - recul);
  lundi.setHours(0, 0, 0, 0);
  return lundi;
}

/** Les sept jours d'une semaine, à partir de son lundi. */
export function weekDays(start: Date): Date[] {
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

/** Décale d'un nombre de semaines. Le signe donne le sens. */
export function shiftWeeks(start: Date, weeks: number): Date {
  return weekStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + weeks * 7));
}

/** Bornes UNIX d'une semaine, pour la requête. */
export function weekBounds(start: Date): { from: number; to: number } {
  const fin = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { from: Math.floor(start.getTime() / 1000), to: Math.floor(fin.getTime() / 1000) };
}

/** `2026-09-08`, dans le fuseau d'ici — pas celui d'UTC. */
export function dayKey(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/**
 * Range les épisodes par JOUR LOCAL, celui de `mainAt`.
 *
 * `airingAt` est japonais : un épisode diffusé le vendredi à 1 h du matin à
 * Tokyo tombe le jeudi soir en France, et c'est le jeudi qu'il faut l'afficher.
 * Passer par `Date` fait la conversion ; regrouper sur la date UTC la raterait.
 * Et quand la sortie française est connue, c'est SON jour qui compte.
 */
export function byDay(slots: readonly Slot[]): Map<string, Slot[]> {
  const par = new Map<string, Slot[]>();

  for (const s of slots) {
    const cle = dayKey(new Date(mainAt(s)));
    const liste = par.get(cle);
    if (liste) liste.push(s);
    else par.set(cle, [s]);
  }

  for (const liste of par.values()) liste.sort((a, b) => mainAt(a) - mainAt(b));
  return par;
}

/**
 * Réduit un titre à ce qui reste quand on enlève la ponctuation, les accents et
 * la casse.
 *
 * `NFKD` sépare les accents de leurs lettres pour que le filtre les emporte :
 * « Pokémon » et « Pokemon » sont le même titre, et deux catalogues ne les
 * écrivent jamais pareil.
 */
export function slugTitle(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Rapproche les mises en ligne d'ADN des diffusions d'AniList.
 *
 * Par le TITRE, parce qu'il n'y a rien d'autre : ADN ne porte ni identifiant
 * AniList, ni MAL, ni AniDB. C'est le genre de rapprochement approximatif que
 * ce projet évite partout ailleurs — et il est acceptable ICI, et seulement
 * ici, parce qu'un ratage n'enlève rien : LiveChart, rapproché lui par
 * identifiant, donne la même sortie — voir `lib/livechart`. Ce qu'ADN apporte
 * en propre, c'est une heure française quand LiveChart ne répond pas.
 *
 * Mesuré sur une semaine : 7 séries ADN sur 9 retrouvées. Les deux manquantes
 * ne diffusaient pas cette saison.
 *
 * Le NUMÉRO d'épisode doit correspondre aussi. Sans cette condition, un
 * rattrapage — ADN publie parfois sept épisodes d'un coup — collerait la sortie
 * de l'épisode 1 sur la diffusion de l'épisode 11.
 */
export function attachAdn(slots: readonly Slot[], videos: readonly AdnVideo[]): Slot[] {
  const par = new Map<string, AdnVideo>();

  for (const v of videos) {
    const numero = Number(v.shortNumber);
    if (!Number.isFinite(numero)) continue;
    for (const nom of [v.show?.title, v.show?.shortTitle, v.show?.originalTitle]) {
      const cle = slugTitle(nom);
      if (cle) par.set(`${cle}#${numero}`, v);
    }
  }

  return slots.map((s) => {
    const v = par.get(`${slugTitle(s.title)}#${s.episode}`);
    const at = toIso(v?.releaseDate);
    if (!v || !at) return s;
    return {
      ...s,
      fr: mergeReleases([
        ...s.fr,
        {
          at,
          platform: 'ADN',
          // Dans l'ordre de l'écran, VOSTF d'abord, quel que soit celui d'ADN.
          languages: unionLangues((v.languages ?? []).filter(isLangue), []),
          approx: false,
        },
      ]),
    };
  });
}

/**
 * L'heure, telle qu'on la lit ici.
 *
 * `Intl` et non un formatage à la main : l'heure d'été change deux fois par an
 * et personne ne veut la calculer. En anglais comme le reste de l'app, mais
 * sur 24 heures — `h23` et non `hour12: false`, qui écrit « 24:30 » pour une
 * demi-heure après minuit sur certains moteurs.
 */
export function localTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/**
 * Le temps qui reste, en gros.
 *
 * « in 2d » et non « in 2 days 4 hours 12 minutes » : la précision d'un compte
 * à rebours n'intéresse que la dernière heure, et la donner partout ailleurs
 * fait du bruit. Rien du tout pour ce qui est passé — la date suffit.
 */
export function countdown(unixSeconds: number, now = Date.now()): string | null {
  const restant = unixSeconds * 1000 - now;
  if (restant <= 0) return null;

  const minutes = Math.floor(restant / 60_000);
  if (minutes < 60) return `in ${minutes}m`;

  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `in ${heures}h`;

  return `in ${Math.floor(heures / 24)}d`;
}
