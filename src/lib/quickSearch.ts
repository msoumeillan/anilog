import type { QuickSearchAnswer, QuickSearchMedia, QuickSearchResult } from '../api/anilist/hooks';
import type { MbSeries } from '../api/mangabaka/client';
import type { EntryKey } from '../types/library';
import { entryKey, mbEntryKey } from './ids';
import { numericId } from './mangabaka';
import { coverUrl, displayable, HIDDEN_RATING, typeLabel } from './mangabakaCatalogue';
import { formatLabel } from './mediaOptions';
import { displayTitle, type TitleSet } from './title';

/**
 * La recherche de l'en-tête : ce qu'on envoie, et comment on range la réponse.
 *
 * Tout ce qui DÉCIDE vit ici, testé ; le composant ne fait qu'afficher et
 * écouter le clavier.
 */

/** En dessous, AniList rend surtout du bruit : « o » trouve tout. */
const SEARCH_MIN = 2;

/**
 * Le terme à envoyer : sans espaces autour ni en double, et vide tant qu'il
 * est trop court pour chercher.
 *
 * Nettoyé AVANT de servir de clé de cache : « oshi no ko » et « oshi  no ko »
 * sont la même recherche, elles ne doivent pas coûter deux requêtes.
 */
export function searchTerm(raw: string): string {
  const term = raw.trim().replace(/\s+/g, ' ');
  return term.length >= SEARCH_MIN ? term : '';
}

/** Ce qu'un résultat désigne — et donc la forme de sa vignette. */
export const RESULT_KINDS = ['anime', 'manga', 'character', 'staff', 'studio'] as const;

export type ResultKind = (typeof RESULT_KINDS)[number];

export interface SearchItem {
  /** Unique dans tout le panneau : l'anime 21 et le manga 21 sont deux œuvres. */
  key: string;
  kind: ResultKind;
  href: string;
  title: string;
  /** La ligne sous le titre : format et année, œuvre d'un personnage, métier… */
  meta: string;
  image: string | null;
  /** Où lire son statut dans la bibliothèque — les œuvres seulement. */
  libraryKey?: EntryKey;
}

export interface SearchSection {
  /** Une catégorie de résultats, ou les derniers ouverts. */
  kind: ResultKind | 'recent';
  label: string;
  items: SearchItem[];
}

/**
 * D'où viennent les mangas du panneau.
 *
 * De MangaBaka d'abord : c'est lui qui fait autorité côté manga dans l'app,
 * et il connaît ce qu'AniList ignore — « Shadow Slave », roman web, n'existe
 * que chez lui. D'AniList quand MangaBaka n'a pas répondu : leur backend se
 * sait instable, et une panne chez eux ne doit pas vider la section. De nulle
 * part tant qu'il cherche.
 *
 * Le terme accompagne les séries : c'est avec CELUI pour lequel elles ont été
 * trouvées qu'elles se filtrent, pas avec celui qu'on est en train de taper.
 */
export type MangaSource =
  | { from: 'mangabaka'; term: string; series: readonly MbSeries[] }
  | { from: 'anilist' }
  | { from: 'pending' };

/**
 * L'adresse de la recherche MangaBaka.
 *
 * Dix résultats pour en montrer quatre dans le panneau, trente pour la page de
 * résultats : leur tri par pertinence ramène du bruit, que `relevantSeries`
 * écarte ensuite. La notation que l'app cache — voir `HIDDEN_RATING` — et
 * « other », des dōjinshi pour l'essentiel, sont écartés par le serveur, pour
 * ne pas occuper ces places.
 */
export function mbQuickSearchPath(term: string, limit = 10): string {
  const params = new URLSearchParams({
    q: term,
    limit: String(limit),
    not_content_rating: HIDDEN_RATING,
    type_not: 'other',
  });
  return `/series/search?${params.toString()}`;
}

/** La page de tous les résultats d'une recherche. */
export function searchPageHref(term: string): string {
  return `/search?${new URLSearchParams({ q: term }).toString()}`;
}

/**
 * Le terme de la page de résultats où l'on est, vide partout ailleurs.
 *
 * Le champ de l'en-tête l'affiche sur cette page : il se vidait après chaque
 * recherche, et passer de « oshi no ko » à « oshi no ko fu » obligeait à tout
 * retaper.
 */
export function resultsPageTerm(pathname: string, search: string): string {
  return pathname === '/search' ? searchTerm(new URLSearchParams(search).get('q') ?? '') : '';
}

/**
 * Six mangas au plus, dont quatre de MangaBaka.
 *
 * MangaBaka d'abord : ses fiches mènent tout droit à la page manga de l'app,
 * et il connaît ce qu'AniList ignore. Mais son classement se perd vite — sur
 * « oshi no ko », « [Oshi no Ko]: Futari no Etude » n'est même pas dans ses 60
 * premiers résultats, là où AniList le classe cinquième. Les places restantes
 * vont donc à AniList.
 */
const MANGAS = 6;
const MANGAS_MANGABAKA = 4;

/** « TV series · 2023 ». L'année de saison d'abord : un film n'a souvent que l'autre. */
function mediaMeta(m: QuickSearchMedia): string {
  const year = m.seasonYear ?? m.startDate.year;
  return [m.format ? formatLabel(m.format) : null, year].filter(Boolean).join(' · ');
}

/** Une œuvre d'AniList, en ligne du panneau — ou retenue parmi les derniers ouverts. */
export function mediaItem(kind: 'anime' | 'manga', m: QuickSearchMedia): SearchItem {
  return {
    key: `${kind}:${m.id}`,
    kind,
    href: `/${kind}/${m.id}`,
    title: displayTitle(m.title),
    meta: mediaMeta(m),
    image: m.coverImage.medium,
    libraryKey: entryKey(kind, m.id),
  };
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Sans accents ni casse : « Pokémon » et « pokemon » s'écrivent pareil. */
const sansAccents = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

const motsDe = (s: string) =>
  sansAccents(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Un des titres contient-il TOUS les mots cherchés ?
 *
 * La recherche de MangaBaka est large : sur « oshi no ko », mesuré, sept de
 * ses dix premiers résultats n'avaient rien à voir — « Hoshi no Ko! »,
 * « Honey and Clover ». On ne garde qu'une série dont un titre, principal ou
 * alternatif, a chaque mot cherché au DÉBUT d'un de ses mots : « oshi » ne
 * trouve pas « hoshi », « berserk » trouve « Berserker ».
 *
 * Le japonais, le chinois et le coréen n'espacent pas leurs mots : pour eux,
 * le texte cherché doit simplement figurer dans le titre.
 */
function titreCorrespond(titres: readonly string[], term: string): boolean {
  const cherches = motsDe(term);
  if (cherches.length === 0) return false;
  return titres.some((titre) => {
    const texte = sansAccents(titre);
    const mots = motsDe(titre);
    return cherches.every((c) =>
      CJK.test(c) ? texte.includes(c) : mots.some((m) => m.startsWith(c)),
    );
  });
}

function titresDe(s: MbSeries): string[] {
  const alternatifs = Object.values(s.secondary_titles ?? {}).flatMap((groupe) =>
    (groupe ?? []).map((t) => t.title),
  );
  return [s.title, s.native_title, ...alternatifs].filter((t): t is string => Boolean(t));
}

/** « Manhwa · 2018 ». Le vocabulaire de MangaBaka, comme dans son catalogue. */
function mbMeta(s: MbSeries): string {
  return [typeLabel(s.type), s.year].filter(Boolean).join(' · ');
}

/**
 * Les séries de MangaBaka à montrer pour un terme : les règles du catalogue
 * — `displayable` —, puis la pertinence.
 *
 * Une série passe aussi quand AniList la reconnaît : `confirmed`, ses œuvres
 * retenues par `relevantMedia` pour le MÊME terme. MangaBaka trouve bien
 * « ATTACK ON TITAN » pour « snk », en tête, mais l'abréviation n'est dans
 * aucun de ses titres ; elle est dans les synonymes d'AniList.
 */
export function relevantSeries(
  series: readonly MbSeries[],
  term: string,
  confirmed: readonly { id: number }[] = [],
): MbSeries[] {
  const connues = new Set(confirmed.map((m) => m.id));
  return displayable(series).filter((s) => {
    const anilist = numericId(s.source?.anilist?.id);
    return titreCorrespond(titresDe(s), term) || (anilist !== undefined && connues.has(anilist));
  });
}

/**
 * Les œuvres d'AniList qui contiennent vraiment les mots cherchés.
 *
 * Son classement tient mieux que celui de MangaBaka, mais pas jusqu'au bout :
 * au-delà des bons titres, « oshi no ko » ramène « Hoshi no Ko » et « Voices
 * of a Distant Star ».
 *
 * Les synonymes comptent comme des titres : c'est par eux qu'AniList trouve
 * les abréviations. Sans eux, « snk » affichait l'anime Attack on Titan — ses
 * résultats ne passent pas par ce filtre — et faisait disparaître le manga,
 * que les deux sources avaient pourtant trouvé.
 */
export function relevantMedia<M extends { title: TitleSet; synonyms?: readonly string[] | null }>(
  media: readonly M[],
  term: string,
): M[] {
  return media.filter((m) =>
    titreCorrespond(
      [m.title.english, m.title.romaji, m.title.native, ...(m.synonyms ?? [])].filter(
        (t): t is string => Boolean(t),
      ),
      term,
    ),
  );
}

/** Un manga trouvé, avec la source qui le décrit. */
type MangaHit<M> = { from: 'mangabaka'; series: MbSeries } | { from: 'anilist'; media: M };

/**
 * MangaBaka d'abord, AniList pour compléter — la règle du panneau comme de la
 * page de résultats.
 *
 * Une œuvre que les deux ont trouvée n'apparaît qu'une fois, dans sa version
 * MangaBaka : sa fiche est la page manga de l'app, et son type dit « Manhwa »
 * là où AniList écrit « Manga ». Les deux se reconnaissent à l'identifiant
 * AniList que MangaBaka porte quand il connaît l'œuvre.
 */
export function mangaBakaThenAniList<M extends { id: number }>(
  series: readonly MbSeries[],
  media: readonly M[],
): MangaHit<M>[] {
  const connues = new Set(series.map((s) => numericId(s.source?.anilist?.id)));
  const hits: MangaHit<M>[] = series.map((s) => ({ from: 'mangabaka', series: s }));
  for (const m of media) if (!connues.has(m.id)) hits.push({ from: 'anilist', media: m });
  return hits;
}

/**
 * Un manga de MangaBaka, en ligne du panneau.
 *
 * Le statut dans la bibliothèque se lit sous la clé AniList quand la série en
 * a une : c'est sous elle que l'œuvre a été suivie, depuis AniList ou depuis
 * sa fiche MangaBaka.
 */
export function mbItem(s: MbSeries): SearchItem {
  const anilist = numericId(s.source?.anilist?.id);
  return {
    key: `mangabaka:${s.id}`,
    kind: 'manga',
    href: `/mangabaka/${s.id}`,
    title: s.title ?? s.native_title ?? 'Untitled',
    meta: mbMeta(s),
    /* La plus petite taille suffit à une vignette de 32 px. */
    image: s.cover?.x150?.x1 ?? coverUrl(s, 'x150'),
    libraryKey: anilist ? entryKey('manga', anilist) : mbEntryKey(s.id),
  };
}

/**
 * La section Manga du panneau.
 *
 * Tant que MangaBaka cherche, rien : ses résultats passeront devant, et des
 * titres qui se décalent sous le pointeur font cliquer à côté. S'il n'a pas
 * répondu, AniList seul.
 */
function mangaItems(anilist: QuickSearchAnswer | undefined, manga: MangaSource): SearchItem[] {
  if (manga.from === 'pending') return [];
  const deAniList = anilist ? relevantMedia(anilist.result.manga.media, anilist.term) : [];
  const deMangaBaka =
    manga.from === 'mangabaka'
      ? relevantSeries(
          manga.series,
          manga.term,
          /* Pour le même terme seulement : pendant la frappe, l'une des deux
             réponses a souvent une lettre de retard sur l'autre. */
          anilist?.term === manga.term ? deAniList : [],
        ).slice(0, MANGAS_MANGABAKA)
      : [];
  return mangaBakaThenAniList(deMangaBaka, deAniList)
    .slice(0, MANGAS)
    .map((h) => (h.from === 'mangabaka' ? mbItem(h.series) : mediaItem('manga', h.media)));
}

/**
 * Les résultats rangés pour l'affichage, dans un ordre FIXE : anime, manga,
 * personnages, staff, studios.
 *
 * Fixe et non « la catégorie la plus pertinente d'abord » : une liste dont les
 * blocs changent de place à chaque lettre tapée ne se lit pas, et le clavier
 * y perdrait ses repères. Une catégorie vide disparaît plutôt que d'afficher
 * un titre au-dessus de rien.
 *
 * Les deux sources répondent chacune à son rythme : `anilist` absent, seules
 * les œuvres de MangaBaka s'affichent, et inversement.
 */
export function searchSections(
  anilist: QuickSearchAnswer | undefined,
  manga: MangaSource,
): SearchSection[] {
  const data = anilist?.result;
  const sections: SearchSection[] = [
    {
      kind: 'anime',
      label: 'Anime',
      items: (data?.anime.media ?? []).map((m) => mediaItem('anime', m)),
    },
    { kind: 'manga', label: 'Manga', items: mangaItems(anilist, manga) },
    {
      kind: 'character',
      label: 'Characters',
      items: (data?.characters.characters ?? []).map(characterItem),
    },
    { kind: 'staff', label: 'Staff', items: (data?.staff.staff ?? []).map(staffItem) },
    { kind: 'studio', label: 'Studios', items: (data?.studios.studios ?? []).map(studioItem) },
  ];
  return sections.filter((s) => s.items.length > 0);
}

/**
 * Les lignes des autres catégories.
 *
 * Exportées comme `mediaItem` et `mbItem` : la page de tous les résultats les
 * fabrique aussi, pour retenir ce qu'on y ouvre — voir `lib/recentResults`.
 */
export function characterItem(
  c: QuickSearchResult['characters']['characters'][number],
): SearchItem {
  const oeuvre = c.media.nodes[0];
  return {
    key: `character:${c.id}`,
    kind: 'character',
    href: `/character/${c.id}`,
    title: c.name.full,
    meta: oeuvre ? displayTitle(oeuvre.title) : '',
    image: c.image.medium,
  };
}

export function staffItem(s: QuickSearchResult['staff']['staff'][number]): SearchItem {
  return {
    key: `staff:${s.id}`,
    kind: 'staff',
    href: `/staff/${s.id}`,
    title: s.name.full,
    /* Deux métiers au plus : Hayao Miyazaki en compte cinq, et la ligne
       déborderait pour dire ce que les deux premiers disent déjà. */
    meta: s.primaryOccupations.slice(0, 2).join(' · '),
    image: s.image.medium,
  };
}

export function studioItem(s: QuickSearchResult['studios']['studios'][number]): SearchItem {
  return {
    key: `studio:${s.id}`,
    kind: 'studio',
    href: `/studio/${s.id}`,
    title: s.name,
    // Le même vocabulaire que la page studio.
    meta: s.isAnimationStudio ? 'Animation studio' : 'Producer',
    image: null,
  };
}

/**
 * L'option suivante ou précédente au clavier, en boucle : descendre depuis la
 * dernière ramène à la première. `-1` quand il n'y a rien à choisir.
 */
export function stepIndex(current: number, count: number, delta: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
