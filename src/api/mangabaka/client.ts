/**
 * Client MangaBaka.
 *
 * Une couche d'ENRICHISSEMENT, jamais une source d'identité. C'est AniList qui
 * donne la clé d'une œuvre — décision 2 — et MangaBaka ne fait qu'ajouter ce
 * qu'AniList n'a pas : les notes des sept bases qu'il agrège, la correspondance
 * entre le manga et son adaptation, les éditeurs par région.
 *
 * Ce choix n'est pas de la prudence de principe. Leur propre application
 * officielle embarque un disjoncteur — « several server-side failures in a row,
 * the backend is treated as down » — et une bannière pour le dire. Faire
 * dépendre l'identité de la bibliothèque d'un service qui se sait instable
 * serait un mauvais échange. Ici, quand il tombe, une section disparaît.
 *
 * Le pont depuis AniList est direct : `/v1/source/anilist/{id}`. Mesuré sur 30
 * mangas d'AniList, du plus populaire au plus obscur — 30 sur 30 retrouvés, en
 * ~110 ms. Ni table de correspondance, ni recherche par titre, ni invariant à
 * vérifier, contrairement à TMDB.
 */

const BASE = 'https://api.mangabaka.org/v1';

/**
 * 180 requêtes par minute annoncées, et les réponses en cache ne comptent pas.
 * 350 ms laisse une marge confortable sur une app qui n'en tire qu'une par
 * fiche ouverte.
 */
const MIN_INTERVAL_MS = 350;

export class MangaBakaError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MangaBakaError';
    this.status = status;
  }
}

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

/** File propre à cet hôte : la mutualiser avec AniList sérialiserait pour rien. */
function slot(): Promise<void> {
  const next = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  chain = next.catch(() => {});
  return next;
}

export async function mangaBaka<T>(path: string, signal?: AbortSignal): Promise<T> {
  await slot();

  const res = await fetch(BASE + path, { signal, headers: { Accept: 'application/json' } });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new MangaBakaError(body?.message ?? `MangaBaka responded ${res.status}.`, res.status);
  }

  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────
//  Formes de réponse — volontairement partielles
// ─────────────────────────────────────────────────────────────

/*
 * On ne décrit que ce qu'on lit. Leur documentation le dit elle-même : « the
 * schema is subject to change at any time and without notice ». Décrire toute
 * la réponse reviendrait à s'exposer à des changements qui ne nous concernent
 * pas.
 */

/** Une des sept bases qu'ils agrègent. `rating_normalized` est sur 100. */
export interface MbSourceRating {
  /** Un nombre chez la plupart, un slug chez Anime-Planet et MangaUpdates. */
  id?: number | string | null;
  rating?: number | null;
  rating_normalized?: number | null;
}

/** Une taille de couverture, en trois densites d'ecran. */
export interface MbCoverSize {
  x1?: string | null;
  x2?: string | null;
  x3?: string | null;
}

export interface MbCover {
  raw?: { url?: string | null } | null;
  x150?: MbCoverSize | null;
  x250?: MbCoverSize | null;
  x350?: MbCoverSize | null;
}

export interface MbSeries {
  id: number;
  canonical_url: string | null;
  // ── Ce que le catalogue affiche ────────────────────────────
  title?: string | null;
  native_title?: string | null;
  /** « manga », « novel », « manhwa », « manhua », « oel », « other ». */
  type?: string | null;
  year?: number | null;
  published?: { start_date?: string | null; end_date?: string | null } | null;
  /** « releasing », « completed », « hiatus », « cancelled », « upcoming ». */
  status?: string | null;
  description?: string | null;
  cover?: MbCover | null;
  authors?: string[] | null;
  artists?: string[] | null;
  genres?: string[] | null;
  /** Des chaines nues, sans rang ni marqueur de spoiler — rien a voir avec les tags d'AniList. */
  tags?: string[] | null;
  /** Les titres alternatifs, groupes par langue. La cle « unknown » existe. */
  secondary_titles?: Record<string, { title?: string | null }[] | null> | null;
  /**
   * Liens sortants. `type` vaut « info », « publisher », « webplatform »…
   * et `name_display` porte le nom lisible.
   */
  links_v2?:
    | {
        url?: string | null;
        name_display?: string | null;
        type?: string | null;
        /** « en », « ja », « fr »… Une œuvre a souvent deux Wikipédia. */
        language?: string | null;
      }[]
    | null;
  content_rating?: string | null;
  /** Vrai quand l'œuvre est licenciée quelque part. */
  is_licensed?: boolean | null;
  /**
   * Une fiche fusionnee pointe vers celle qui l'a absorbee. On l'ecarte du
   * catalogue : elle ferait doublon avec sa jumelle.
   */
  state?: string | null;
  merged_with?: number | null;
  /** Note agrégée, sur 100. */
  rating: number | null;
  /**
   * Chapitres et tomes PARUS — en CHAÎNES, « 1191 » et non 1191.
   *
   * Elles ressemblent à des nombres dans la réponse et n'en sont pas ; le
   * `as T` de la couche fetch laisserait passer le mensonge sans bruit. Lues
   * par `counts()`, qui les convertit.
   */
  total_chapters: string | null;
  final_volume: string | null;
  /**
   * Où commence et où finit l'adaptation animée, PAR SAISON.
   *
   * Texte libre, et volontairement affiché tel quel : « Vol 1, Chap 1 (S1)
   * Chap 1-2 adapted in EP 7-8 / Vol 8, Chap 55 (S2) ». En tirer une plage
   * structurée demanderait d'analyser une chaîne dont rien ne garantit la
   * forme — c'est exactement le genre d'interprétation qui a coûté cher sur
   * les épisodes TMDB.
   */
  anime: { start?: string | null; end?: string | null } | null;
  publishers: { name: string; type: string; note: string }[] | null;
  source: Record<string, MbSourceRating | null> | null;
}

export interface MbSourceLookup {
  data: { series: MbSeries[] } | null;
}

/** Une page de `/series/search`. */
export interface MbSearchPage {
  data: MbSeries[] | null;
  pagination: { count?: number | null; next?: string | null; page?: number | null } | null;
}

/**
 * Une relation, AVEC la serie visee.
 *
 * A ne pas confondre avec `relationships_v2` sur la fiche, qui ne porte qu'un
 * `to_series_id` : celui-la aurait coute une requete par relation. Ce
 * point d'entree-ci les rend toutes en une seule, titre et couverture compris.
 */
export interface MbRelation {
  relation_type?: string | null;
  series?: MbSeries | null;
}
