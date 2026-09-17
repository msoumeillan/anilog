/**
 * Client des données MyAnimeList — Tenrai d'abord, Jikan en repli.
 *
 * Les deux servent la MÊME base et le MÊME schéma : Tenrai annonce la
 * compatibilité v1 de Jikan, et c'est vérifié sur les épisodes. Le repli ne
 * coûte donc aucune conversion.
 *
 * Pourquoi Tenrai en premier, mesuré depuis l'app :
 *
 *   latence sur Vinland Saga     60 ms  contre 182 ms
 *   débit annoncé            120/min, 4/s  contre ~60/min
 *   vignettes d'épisode      92 à 100 %  contre 6 à 21 %
 *   synopsis d'épisode              100 %  contre aucun
 *
 * Et surtout, Tenrai n'est PAS un scraper : Jikan lit les pages de MAL, et
 * quand il n'y arrive pas il renvoie 504 — c'est arrivé quatre jours d'affilée
 * pendant le développement, alors que MAL lui-même répondait.
 *
 * Le repli reste là parce que Tenrai est jeune et financé par dons, quand
 * Jikan a des années de service derrière lui. Tout ce qui dépend d'eux reste
 * de toute façon optionnel : une section qui disparaît, jamais une page qui
 * casse.
 */

interface Source {
  name: string;
  base: string;
  /**
   * Intervalle minimal entre deux requêtes, MESURÉ et non deviné.
   *
   * Tenrai annonce 4 req/s ; à 150 ms on récolte des 429, à 300 ms les douze
   * pages de One Piece passent en 4,3 s.
   *
   * Jikan tient en rafale à 700 ms mais dépasse ses 60/min dès qu'on enchaîne
   * deux séries longues ; à 1 100 ms on est à 54/min, sous le plafond des deux
   * côtés.
   */
  minIntervalMs: number;
}

const SOURCES: Source[] = [
  { name: 'tenrai', base: 'https://api.tenrai.org/v1', minIntervalMs: 300 },
  { name: 'jikan', base: 'https://api.jikan.moe/v4', minIntervalMs: 1100 },
];

export class MalError extends Error {
  status: number;
  /** Vrai quand la source est joignable mais n'arrive pas à lire MyAnimeList. */
  upstreamDown: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MalError';
    this.status = status;
    this.upstreamDown = status === 503 || status === 504;
  }
}

/**
 * Une file PAR SOURCE.
 *
 * Elles ont des plafonds différents et des serveurs différents : une file
 * commune ferait attendre Tenrai au rythme de Jikan. Séparées d'AniList pour
 * la même raison.
 */
const queues = new Map<string, { chain: Promise<unknown>; lastAt: number }>();

function slot(source: Source): Promise<void> {
  const q = queues.get(source.name) ?? { chain: Promise.resolve(), lastAt: 0 };
  queues.set(source.name, q);

  const next = q.chain.then(async () => {
    const wait = source.minIntervalMs - (Date.now() - q.lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    q.lastAt = Date.now();
  });
  q.chain = next.catch(() => {});
  return next;
}

async function askOne<T>(source: Source, path: string, signal?: AbortSignal): Promise<T> {
  await slot(source);

  const res = await fetch(source.base + path, { signal, headers: { Accept: 'application/json' } });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new MalError(body?.message ?? `${source.name} responded ${res.status}.`, res.status);
  }

  return (await res.json()) as T;
}

/**
 * Demande à Tenrai, puis à Jikan si elle échoue.
 *
 * Le repli se déclenche sur TOUT échec, 404 compris : les deux servent la même
 * base, donc un 404 chez l'une signale plus probablement un point d'entrée
 * absent qu'une œuvre inconnue. La requête de trop ne survient que quand la
 * première a déjà échoué.
 *
 * Un abandon n'est pas un échec : on ne replie pas une requête que l'appelant
 * vient d'annuler.
 */
export async function mal<T>(path: string, signal?: AbortSignal): Promise<T> {
  let last: unknown;

  for (const source of SOURCES) {
    try {
      return await askOne<T>(source, path, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      last = error;
    }
  }

  throw last;
}

export interface MalPagination {
  last_visible_page: number;
  has_next_page: boolean;
}

/**
 * Une entrée de `/anime/{id}/episodes`.
 *
 * Les trois derniers champs ne viennent que de Tenrai : Jikan ne les sert pas,
 * et c'est précisément ce pour quoi TMDB avait été ajouté au projet. Ils sont
 * donc optionnels — le repli sur Jikan les laisse vides.
 */
export interface MalEpisode {
  mal_id: number;
  title: string | null;
  title_japanese: string | null;
  title_romanji: string | null;
  aired: string | null;
  score: number | null;
  filler: boolean;
  recap: boolean;
  forum_url: string | null;
  /** En SECONDES chez Tenrai — 1440 pour un épisode de 24 minutes. */
  duration?: number | null;
  synopsis?: string | null;
  images?: { jpg?: { image_url?: string | null } | null } | null;
}

/**
 * Ce qu'on lit de `/manga/{id}` — le magazine de prépublication.
 *
 * AniList ne le porte pas : son schéma n'a aucun champ de sérialisation, seul
 * `source` existe et désigne le support d'origine d'une adaptation. MyAnimeList
 * l'a, et le sert pour tout le monde — mesuré sur 40 titres, de One Piece au
 * rang 800, manhwa coréens compris : 40 sur 40, Naver Webtoon et KakaoPage
 * inclus.
 */
export interface MalManga {
  serializations?: { mal_id: number; name: string; url: string }[] | null;
}

/**
 * Une page de `/manga?magazines={id}` — la liste d'un magazine, classée.
 *
 * On n'en lit que les identifiants : les fiches viennent d'AniList, seul à
 * savoir ouvrir une page dans cette app. MyAnimeList apporte le CLASSEMENT,
 * qu'il est le seul à connaître.
 */
export interface MalMangaPage {
  data: { mal_id: number }[];
  pagination: MalPagination & { items?: { total?: number | null } | null };
}
