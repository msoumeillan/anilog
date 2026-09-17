import type { RawLcAnime, RawLcRelease, RawLcSchedule } from '../api/livechart/client';
import { mergeReleases, slugTitle, toIso, unionLangues, type Langue, type Slot } from './calendar';

/**
 * Ce que LiveChart dit des sorties françaises, ramené au calendrier.
 *
 * Pur, donc testé : c'est ici que se décide quelle sortie est française, et à
 * quel épisode elle appartient — deux erreurs qui ne se verraient pas à l'œil,
 * seulement comme une heure fausse sur une carte.
 */

/** Une sortie française, telle que le cache la garde. */
export interface LcRelease {
  /** Premier épisode de la sortie, numéroté comme chez AniList — vérifié sur quatre séries. */
  episode: number;
  /** Combien d'épisodes d'un coup : 1, ou toute une saison sur Netflix. */
  size: number;
  /** ISO, au format de `toIso`. */
  at: string;
  platform: string;
  languages: Langue[];
  approx: boolean;
}

/** `https://anilist.co/anime/21` → 21. Accepte ce qui suit l'identifiant. */
export function anilistIdOf(url: string | null | undefined): number | null {
  const m = /anilist\.co\/anime\/(\d+)/.exec(url ?? '');
  return m?.[1] ? Number(m[1]) : null;
}

/**
 * L'identifiant LiveChart d'une série AniList, parmi les résultats d'une
 * recherche par titre.
 *
 * La recherche PROPOSE, le lien AniList TRANCHE. Jamais le premier résultat :
 * « One Piece » rend aussi ses films et son remake, et un calendrier qui
 * afficherait les horaires du remake n'aurait l'air faux à personne. Mesuré :
 * 99 séries sur 106 retrouvées ainsi — les sept autres sont un film, un clip
 * et cinq formats de quelques minutes.
 */
export function pickLiveChartId(
  nodes: readonly RawLcAnime[] | null | undefined,
  anilistId: number,
): string | null {
  for (const n of nodes ?? []) {
    if (n.databaseId && anilistIdOf(n.anilistUrl) === anilistId) return n.databaseId;
  }
  return null;
}

/** Le nom qu'on lit sur une carte de 150 px. */
export function platformName(name: string | null | undefined): string {
  const nom = (name ?? '').trim();
  if (!nom) return 'TV';
  return nom === 'Animation Digital Network' ? 'ADN' : nom;
}

/** Une plateforme chez AniList : son icône, blanche, et la couleur sur laquelle la poser. */
export interface PlatformIcon {
  icon: string;
  color: string | null;
}

/**
 * Les noms que LiveChart et AniList écrivent différemment. Tout le reste
 * s'écrit pareil chez les deux — Crunchyroll, Netflix, Prime Video, HIDIVE.
 */
const NOM_ANILIST: Record<string, string> = {
  'Disney+': 'Disney Plus',
};

/**
 * Le logo d'ADN, que le catalogue d'AniList n'a pas.
 *
 * Le tracé est celui de LiveChart — `u.livechart.me/icon/19/mask_image/…svg`,
 * 19 étant l'identifiant d'ADN chez eux —, repeint en blanc comme les
 * pictogrammes d'AniList, et posé sur la couleur que leur API donne à ADN
 * (`accentColorOnDark`, #0095FF). EMBARQUÉ plutôt que chargé : ce serveur est
 * derrière le même Cloudflare que leur API, en défi « interactif » — mesuré le
 * 11 septembre 2026 —, et un navigateur signalé une fois perdrait le logo.
 * `viewBox` ajouté : sans lui, un SVG affiché plus petit que sa taille se
 * rogne au lieu de se réduire.
 */
const ADN: PlatformIcon = {
  icon: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<path fill="#fff" d="M18.872 10.345H5.128l2.874-7.638h7.996ZM23 21.293h-8.134l-.467-1.383H9.644l-.505 1.383H1l2.796-7.62h16.33ZM14.165 11.08c.496 0 .904.407.904.903a.907.907 0 0 1-.904.903.907.907 0 0 1-.903-.903.92.92 0 0 1 .903-.904Zm-4.659 0c.496 0 .903.407.903.903a.907.907 0 0 1-.903.903.907.907 0 0 1-.903-.903.92.92 0 0 1 .903-.904Z"/>' +
      '</svg>',
  )}`,
  color: '#0095FF',
};

/** Les logos que l'app porte elle-même, par nom de plateforme. */
const LOGOS_EMBARQUES: Record<string, PlatformIcon> = { ADN };

/**
 * L'icône d'une plateforme : embarquée pour ADN, sinon d'après le catalogue
 * d'AniList — voir `LINK_SOURCES`. Rien quand personne ne la connaît : la
 * carte écrit alors son nom.
 */
export function platformIcon(
  platform: string,
  sources: readonly { site: string; icon: string | null; color: string | null }[],
): PlatformIcon | null {
  const embarque = LOGOS_EMBARQUES[platform];
  if (embarque) return embarque;
  const cible = slugTitle(NOM_ANILIST[platform] ?? platform);
  const source = sources.find((s) => s.icon && slugTitle(s.site) === cible);
  return source?.icon ? { icon: source.icon, color: source.color } : null;
}

/**
 * Français de FRANCE. `fr-ca` n'en est pas : un sous-titrage québécois
 * accompagne un calendrier canadien, qu'on ne regarde pas d'ici.
 */
function francais(code: string | null | undefined): boolean {
  const c = (code ?? '').toLowerCase();
  return c === 'fr' || c === 'fr-fr';
}

/** VOSTF pour des sous-titres français, VF pour une piste audio française. */
export function frenchLanguages(tracks: RawLcSchedule['tracks']): Langue[] {
  const vostf = (tracks ?? []).some((t) => t.type === 'SUBTITLES' && francais(t.languageCode));
  const vf = (tracks ?? []).some((t) => t.type === 'AUDIO' && francais(t.languageCode));
  return [...(vostf ? (['vostf'] as const) : []), ...(vf ? (['vf'] as const) : [])];
}

function versSortie(
  r: RawLcRelease | null | undefined,
  platform: string,
  languages: Langue[],
): LcRelease | null {
  const at = toIso(r?.date);
  const episode = r?.numberRange?.minNumber;
  /* Sans numéro, une sortie ne se rattache à rien : c'est le cas d'un film ou
     d'un « à suivre » sans date. Mieux vaut ne rien dire que la coller au
     hasard. */
  if (!at || typeof episode !== 'number') return null;
  return {
    episode,
    size: Math.max(1, r?.numberRange?.size ?? 1),
    at,
    platform,
    languages,
    approx: r?.timeIsApproximate === true,
  };
}

/**
 * Les sorties françaises d'une série, à partir de ses calendriers.
 *
 * Deux filtres, et les deux comptent :
 *
 *   `applicableToViewer` — le calendrier est disponible LÀ OÙ L'ON EST. One
 *   Piece a un calendrier ADN en allemand, Ghost in the Shell cinq calendriers
 *   Prime Video identiques, un par pays : seuls ceux d'ici passent.
 *
 *   une piste française — sous-titres ou doublage. Un calendrier disponible en
 *   France mais sous-titré en anglais seulement n'est pas une sortie française.
 *
 * Le précédent ET le prochain épisode : c'est tout ce que LiveChart expose par
 * calendrier. Assez pour la semaine en cours ; au-delà, l'écran le dit.
 */
export function frenchReleases(nodes: readonly RawLcSchedule[] | null | undefined): LcRelease[] {
  const par = new Map<string, LcRelease>();

  for (const n of nodes ?? []) {
    if (n.applicableToViewer !== true) continue;
    const langues = frenchLanguages(n.tracks);
    if (langues.length === 0) continue;

    const platform = platformName(n.network?.name);
    for (const brut of [n.releaseState?.previousRelease, n.releaseState?.nextRelease]) {
      const s = versSortie(brut, platform, langues);
      if (!s) continue;

      /* L'ÉPISODE fait partie de la clé : la VOSTF du 16 et la VF du 13 de
         Re:Zero sortent à la même minute, et ce ne sont pas la même sortie. */
      const cle = `${s.platform}|${s.at}|${s.episode}`;
      const deja = par.get(cle);
      par.set(
        cle,
        deja
          ? {
              ...deja,
              languages: unionLangues(deja.languages, s.languages),
              approx: deja.approx && s.approx,
            }
          : s,
      );
    }
  }

  return [...par.values()].sort(
    (a, b) =>
      a.at.localeCompare(b.at) || a.platform.localeCompare(b.platform) || a.episode - b.episode,
  );
}

/**
 * Colle les sorties françaises sur les épisodes du calendrier.
 *
 * Par l'identifiant AniList — le cache est rangé ainsi — puis par le NUMÉRO :
 * une sortie couvre `size` épisodes à partir du sien, ce qui compte pour une
 * saison mise en ligne d'un bloc.
 */
export function attachLiveChart(
  slots: readonly Slot[],
  releasesOf: (anilistId: number) => readonly LcRelease[],
): Slot[] {
  return slots.map((s) => {
    const siennes = releasesOf(s.mediaId).filter(
      (r) => s.episode >= r.episode && s.episode < r.episode + r.size,
    );
    if (siennes.length === 0) return s;
    return {
      ...s,
      fr: mergeReleases([
        ...s.fr,
        ...siennes.map(({ at, platform, languages, approx }) => ({
          at,
          platform,
          languages,
          approx,
        })),
      ]),
    };
  });
}
