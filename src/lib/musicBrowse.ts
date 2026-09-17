import { coverOf, themeSources, type ThemeSource } from './themes';
import type {
  RawAtAnimeCard,
  RawAtArtistCard,
  RawAtImage,
  RawAtNamed,
  RawAtSeriesCard,
  RawAtStudioCard,
  RawThemeInfo,
} from '../api/animethemes/client';

/**
 * Parcourir le catalogue d'AnimeThemes.
 *
 * L'onglet Musiques ne cherchait que des CHANSONS. Or leur base est indexée
 * quatre fois de plus — par anime, par artiste, par série, par studio — et
 * chacune de ces entrées mène quelque part : tout ce que YOASOBI a chanté,
 * tout ce qu'A-1 Pictures a produit. Ce fichier est ce qui transforme ces
 * index en listes affichables, et les filtres d'écran en variables de requête.
 *
 * Pur, donc testé. Deux choses s'y jouent qui ne pardonnent pas :
 *
 *   - la construction des variables, où un `null` de trop vide la page ;
 *   - la mise en forme des lignes, où une image absente doit rester absente
 *     plutôt que de devenir un carré cassé.
 */

// ─────────────────────────────────────────────────────────────
//  Les catégories
// ─────────────────────────────────────────────────────────────

export type MusicCategory = 'themes' | 'anime' | 'artists' | 'series' | 'studios';

export const CATEGORIES: { value: MusicCategory; label: string }[] = [
  { value: 'themes', label: 'Themes' },
  { value: 'anime', label: 'Anime' },
  { value: 'artists', label: 'Artists' },
  { value: 'series', label: 'Series' },
  { value: 'studios', label: 'Studios' },
];

/** Une valeur venue de l'URL. Les génériques par défaut : c'est un onglet Musiques. */
export function asCategory(value: string | null | undefined): MusicCategory {
  return CATEGORIES.find((c) => c.value === value)?.value ?? 'themes';
}

// ─────────────────────────────────────────────────────────────
//  Les filtres
// ─────────────────────────────────────────────────────────────

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * La première lettre, en motif SQL.
 *
 * Leur API n'a pas de filtre alphabétique : `titleRomaji_like` en tient lieu,
 * et attend ce que `LIKE` attend — « a% ». Rien plutôt qu'un motif quand aucune
 * lettre n'est choisie : ce qui suit explique pourquoi ce n'est pas `null`.
 */
export function letterPattern(letter: string): string | undefined {
  const propre = letter.trim().slice(0, 1).toLowerCase();
  return /^[a-z]$/.test(propre) ? `${propre}%` : undefined;
}

/** Les trois familles de générique, telles que le filtre les propose. */
export const THEME_KINDS: { value: string; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'OP', label: 'Openings' },
  { value: 'ED', label: 'Endings' },
  { value: 'IN', label: 'Inserts' },
];

/**
 * Les tris, tels que LEUR schéma les nomme.
 *
 * Les valeurs sont les énumérations de l'API et partent telles quelles dans la
 * requête : les traduire ici en un vocabulaire maison ajouterait une table de
 * correspondance à tenir à jour pour rien.
 *
 * `RANDOM` existe partout chez eux et c'est le défaut des génériques : une
 * liste FINIE et différente à chaque fois vaut mieux qu'un catalogue de
 * quatorze mille lignes qu'on fait défiler sans intention.
 */
const TRIS: Record<MusicCategory, { value: string; label: string }[]> = {
  themes: [
    { value: 'RANDOM', label: 'Random' },
    { value: 'SONG_TITLE_ROMAJI', label: 'Song A → Z' },
    { value: 'CREATED_AT_DESC', label: 'Recently added' },
  ],
  anime: [
    { value: 'TITLE_ROMAJI', label: 'A → Z' },
    { value: 'TITLE_ROMAJI_DESC', label: 'Z → A' },
    { value: 'YEAR_DESC', label: 'Newest first' },
    { value: 'YEAR', label: 'Oldest first' },
    { value: 'RANDOM', label: 'Random' },
  ],
  artists: [
    { value: 'NAME_MAIN', label: 'A → Z' },
    { value: 'NAME_MAIN_DESC', label: 'Z → A' },
    { value: 'CREATED_AT_DESC', label: 'Recently added' },
    { value: 'RANDOM', label: 'Random' },
  ],
  series: [
    { value: 'TITLE_ROMAJI', label: 'A → Z' },
    { value: 'TITLE_ROMAJI_DESC', label: 'Z → A' },
    { value: 'RANDOM', label: 'Random' },
  ],
  studios: [
    { value: 'NAME', label: 'A → Z' },
    { value: 'NAME_DESC', label: 'Z → A' },
    { value: 'RANDOM', label: 'Random' },
  ],
};

export function browseSorts(cat: MusicCategory): { value: string; label: string }[] {
  return TRIS[cat];
}

export function defaultBrowseSort(cat: MusicCategory): string {
  return TRIS[cat][0]?.value ?? 'RANDOM';
}

/**
 * Un tri venu de l'URL, s'il a cours dans cette catégorie.
 *
 * Les valeurs ne se recoupent pas d'une catégorie à l'autre — `NAME` chez les
 * studios, `TITLE_ROMAJI` chez les séries —, et une valeur étrangère ferait
 * répondre « Sorting by this value is not supported ». On retombe sur le défaut
 * plutôt que de laisser passer.
 */
export function asBrowseSort(cat: MusicCategory, value: string | null | undefined): string {
  return TRIS[cat].find((s) => s.value === value)?.value ?? defaultBrowseSort(cat);
}

export interface BrowseFilters {
  /** « A » … « Z », ou vide. */
  letter: string;
  season: string;
  year: string;
  format: string;
  /** `all`, `OP`, `ED`, `IN` — les génériques seulement. */
  type: string;
  sort: string;
}

/**
 * Les variables d'un index — et le piège qui a coûté une mesure.
 *
 * Un filtre absent est un filtre ABSENT DE L'OBJET, jamais un `null`. Mesuré le
 * 12 septembre 2026 sur leur serveur : `season: null` passé par variable rend
 * ZÉRO résultat au lieu de tout — leur résolveur le lit comme « la saison vaut
 * nul », pas comme « pas de filtre ». Même chose pour `year`, `format` et
 * `type`. Seuls les `_like` tolèrent le nul, et on ne s'y fie pas non plus.
 *
 * C'est la raison d'être de cette fonction : construire l'objet par AJOUTS
 * successifs rend le piège impossible à retomber dedans, là où un littéral
 * avec six champs facultatifs le réinviterait à chaque modification.
 */
export function indexVariables(
  cat: MusicCategory,
  f: BrowseFilters,
  page: number,
  perPage: number,
): Record<string, unknown> {
  const v: Record<string, unknown> = { first: perPage, page, sort: [f.sort] };

  /* Les génériques n'ont pas de première lettre : le titre de la chanson vit
     dans une autre table que le générique, et leur `_like` ne la traverse pas.
     Passer une variable que la requête ne déclare pas serait de toute façon
     refusé. */
  if (cat === 'themes') {
    if (f.type !== 'all') v.type = f.type;
    return v;
  }

  const letter = letterPattern(f.letter);
  if (letter) v.letter = letter;

  if (cat === 'anime') {
    if (f.season) v.season = f.season;
    if (f.year) v.year = Number(f.year);
    if (f.format) v.format = f.format;
  }

  return v;
}

/**
 * Les variables de la recherche.
 *
 * Les cinq booléens pilotent les `@include` de la requête : une seule section
 * est demandée, celle qu'on regarde. Les quatre autres ne sont pas vides dans
 * la réponse — elles en sont ABSENTES, ce qui est autre chose et se lit
 * autrement.
 */
export function searchVariables(
  q: string,
  cat: MusicCategory,
  page: number,
  perPage: number,
): Record<string, unknown> {
  return {
    q: q.trim(),
    first: perPage,
    page,
    themes: cat === 'themes',
    anime: cat === 'anime',
    artists: cat === 'artists',
    series: cat === 'series',
    studios: cat === 'studios',
  };
}

// ─────────────────────────────────────────────────────────────
//  Les lignes du catalogue
// ─────────────────────────────────────────────────────────────

/** Ce qu'une portée ouvre : la musique d'un anime, d'un artiste, d'une série… */
export type ScopeKind = 'anime' | 'artist' | 'series' | 'studio';

/**
 * Une ligne d'index, quelle que soit la catégorie.
 *
 * Une seule forme pour quatre catégories, et c'est ce qui permet à l'écran de
 * n'avoir qu'un composant de ligne : ce qui change d'un artiste à un studio
 * tient dans un libellé et une forme d'image, pas dans une structure.
 */
export interface CatalogueRow {
  kind: ScopeKind;
  /** L'identifiant chez eux — c'est lui qui ouvre la portée. */
  slug: string;
  title: string;
  /** « TV · Spring 2023 · 2 themes », « Studio · 134 anime ». */
  meta: string;
  image: string | null;
  /** L'identifiant AniList, quand ils le connaissent : il ouvre la fiche. */
  anilistId: number | null;
  /** Une affiche est verticale, un portrait d'artiste est carré. */
  shape: 'poster' | 'square';
}

/**
 * « 1 theme », « 12 themes », « 134 anime », et rien du tout quand on ne sait
 * pas.
 *
 * Le pluriel est DONNÉ et non déduit : « anime » est invariable en anglais, et
 * un « 134 animes » sur la ligne d'un studio se remarque immédiatement.
 */
function compte(n: number | null | undefined, singulier: string, pluriel?: string): string | null {
  if (typeof n !== 'number' || n <= 0) return null;
  return `${n} ${n > 1 ? (pluriel ?? `${singulier}s`) : singulier}`;
}

function anilistIdOf(
  resources: { nodes: { site: string | null; externalId: number | null }[] } | null | undefined,
): number | null {
  const id = (resources?.nodes ?? []).find((r) => r.site === 'ANILIST')?.externalId;
  return typeof id === 'number' && id > 0 ? id : null;
}

export function animeRows(cards: readonly RawAtAnimeCard[] | null | undefined): CatalogueRow[] {
  const rows: CatalogueRow[] = [];

  for (const a of cards ?? []) {
    /* Sans slug, aucune portée à ouvrir : la ligne ne mènerait nulle part. */
    if (!a.slug) continue;
    const saison = [a.seasonLocalized, a.year].filter(Boolean).join(' ');
    rows.push({
      kind: 'anime',
      slug: a.slug,
      title: a.title?.romaji?.trim() || a.slug,
      meta: [a.formatLocalized, saison, compte(a.animethemes?.length, 'theme')]
        .filter(Boolean)
        .join(' · '),
      image: coverOf(a.images),
      anilistId: anilistIdOf(a.resources),
      shape: 'poster',
    });
  }

  return rows;
}

export function artistRows(cards: readonly RawAtArtistCard[] | null | undefined): CatalogueRow[] {
  const rows: CatalogueRow[] = [];

  for (const a of cards ?? []) {
    if (!a.slug) continue;
    rows.push({
      kind: 'artist',
      slug: a.slug,
      title: a.name?.main?.trim() || a.slug,
      meta: 'Artist',
      image: coverOf(a.images),
      anilistId: null,
      shape: 'square',
    });
  }

  return rows;
}

/**
 * Séries et studios : même forme, même question — « qu'est-ce qu'on écoute de
 * ça ? ». Seuls le mot et l'image changent, une série n'ayant pas de logo chez
 * eux.
 */
function groupRows(
  cards:
    readonly (RawAtSeriesCard & { images?: { nodes: RawAtImage[] } | null })[] | null | undefined,
  kind: 'series' | 'studio',
): CatalogueRow[] {
  const rows: CatalogueRow[] = [];

  for (const s of cards ?? []) {
    if (!s.slug) continue;
    rows.push({
      kind,
      slug: s.slug,
      title: s.name?.trim() || s.slug,
      meta: [scopeLabel(kind), compte(s.anime?.pageInfo?.total, 'anime', 'anime')]
        .filter(Boolean)
        .join(' · '),
      image: coverOf(s.images),
      anilistId: null,
      shape: 'square',
    });
  }

  return rows;
}

export function seriesRows(cards: readonly RawAtSeriesCard[] | null | undefined): CatalogueRow[] {
  return groupRows(cards, 'series');
}

export function studioRows(cards: readonly RawAtStudioCard[] | null | undefined): CatalogueRow[] {
  return groupRows(cards, 'studio');
}

// ─────────────────────────────────────────────────────────────
//  D'où vient ce qu'on écoute
// ─────────────────────────────────────────────────────────────

/**
 * Le panneau d'infos du lecteur : l'origine, et les interprètes.
 *
 * Deux listes et non une, parce que ce ne sont pas deux réponses à la même
 * question : l'ORIGINE dit d'où sort le générique — l'anime, sa série, son
 * studio —, les ARTISTES disent qui le chante. Les mélanger ferait une liste
 * où l'on ne saurait plus ce qu'on lit.
 *
 * Tout y est une `CatalogueRow` : une ligne du panneau et une ligne d'index
 * sont le même objet, se cliquent pareil et ouvrent la même portée.
 */
export interface ThemeInfo {
  origin: CatalogueRow[];
  artists: CatalogueRow[];
  /** Les fichiers du générique en cours — de quoi en jouer un autre. */
  sources: ThemeSource[];
}

/** Une ligne sans décompte : une série, un studio, un artiste. */
function namedRow(named: RawAtNamed, kind: ScopeKind): CatalogueRow | null {
  if (!named.slug) return null;
  return {
    kind,
    slug: named.slug,
    title: named.name?.trim() || named.slug,
    meta: scopeLabel(kind),
    image: coverOf(named.images),
    anilistId: null,
    shape: 'square',
  };
}

export function themeInfo(raw: RawThemeInfo | undefined, anilistId: number): ThemeInfo {
  const a = raw?.findAnimeByExternalSite?.[0];
  if (!a?.slug) return { origin: [], artists: [], sources: [] };

  const saison = [a.seasonLocalized, a.year].filter(Boolean).join(' ');
  const origin: CatalogueRow[] = [
    {
      kind: 'anime',
      slug: a.slug,
      title: a.title?.romaji?.trim() || a.slug,
      meta: [a.formatLocalized, saison, compte(a.themeCount?.length, 'theme')]
        .filter(Boolean)
        .join(' · '),
      image: coverOf(a.images),
      /* L'identifiant est celui qu'on a DEMANDÉ : la requête filtre dessus, la
         réponse ne le répète pas. */
      anilistId,
      shape: 'poster',
    },
  ];

  for (const s of a.series?.nodes ?? []) {
    const row = namedRow(s, 'series');
    if (row) origin.push(row);
  }
  for (const s of a.studios?.nodes ?? []) {
    const row = namedRow(s, 'studio');
    if (row) origin.push(row);
  }

  /* Un artiste revient autant de fois qu'il a de rôles sur la chanson —
     mesuré, cinq fois le même nom sur l'opening d'Assassination Classroom. */
  const artists: CatalogueRow[] = [];
  const vus = new Set<string>();
  for (const p of a.current?.[0]?.song?.performances ?? []) {
    if (!p.artist?.slug || vus.has(p.artist.slug)) continue;
    vus.add(p.artist.slug);
    const row = namedRow(
      { slug: p.artist.slug, name: p.artist.name?.main ?? null, images: p.artist.images },
      'artist',
    );
    if (row) artists.push(row);
  }

  return { origin, artists, sources: themeSources(a.current?.[0]?.animethemeentries) };
}

// ─────────────────────────────────────────────────────────────
//  Les portées
// ─────────────────────────────────────────────────────────────

export interface MusicScope {
  kind: ScopeKind;
  slug: string;
}

const SCOPES: ScopeKind[] = ['anime', 'artist', 'series', 'studio'];

/** `studio:a_1_pictures` — ce que porte l'URL. */
export function scopeParam(scope: MusicScope): string {
  return `${scope.kind}:${scope.slug}`;
}

/**
 * La portée lue depuis l'URL.
 *
 * `null` dès que la forme n'est pas celle attendue : une portée inventée
 * enverrait une requête sur un slug qui n'existe pas, et l'écran afficherait
 * une liste vide sans dire pourquoi.
 */
export function parseScope(value: string | null | undefined): MusicScope | null {
  const [kind, ...reste] = (value ?? '').split(':');
  const slug = reste.join(':').trim();
  const connu = SCOPES.find((k) => k === kind);
  return connu && slug ? { kind: connu, slug } : null;
}

/** Le libellé d'une portée ouverte : « Studio », « Artist »… */
export function scopeLabel(kind: ScopeKind): string {
  return kind === 'anime'
    ? 'Anime'
    : kind === 'artist'
      ? 'Artist'
      : kind === 'series'
        ? 'Series'
        : 'Studio';
}
