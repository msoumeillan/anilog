const ENDPOINT = 'https://www.livechart.me/graphql';

/**
 * Client LiveChart.
 *
 * La source des heures de sortie FRANÇAISES. Le calendrier en a cherché une
 * longtemps, et l'avait crue introuvable :
 *
 *   animeschedule.net  — trois heures par série, japonaise, « sub », « dub ».
 *                        Leur « sub » est le créneau anglophone : 18 h pour
 *                        One Piece, quand la France l'a à 20 h et 22 h.
 *   Crunchyroll (FR)   — CORS refusé, et leur API demande un compte.
 *   ADN                — joignable et exact, mais son seul catalogue.
 *
 * LiveChart tient UN CALENDRIER PAR PLATEFORME, avec ses langues de
 * sous-titres et de doublage, et dit lequel est disponible là où l'on est
 * (`applicableToViewer`, calculé sur l'adresse de celui qui demande). Mesuré
 * le 11 septembre 2026 sur les 106 séries japonaises de la semaine : 99
 * retrouvées par leur lien AniList exact, 75 avec une sortie française datée,
 * 40 sur 40 parmi les plus populaires — contre 8 avec ADN seul. Ses heures ADN
 * sont identiques, à la minute, aux 8 que donne l'API d'ADN elle-même.
 *
 * Ce que ça coûte, et qui est vrai :
 *
 *   Ce n'est PAS une API publique — leur FAQ le dit : « We do not offer a
 *   public API ». C'est celle de leur application, documentée par des tiers
 *   (github.com/Metro420yt/livechart.me-api). Elle peut changer sans prévenir ;
 *   le calendrier doit donc rester juste sans elle — voir `store/livechart`.
 *
 *   Cloudflare la garde : curl s'est fait bloquer (`cf-mitigated: challenge`)
 *   après une dizaine de requêtes en deux minutes et demie, et l'était encore
 *   38 minutes plus tard. Le navigateur est passé quinze fois en dix minutes
 *   sans défi. D'où l'intervalle ci-dessous, et des requêtes GROUPÉES.
 *
 *   Pas d'introspection : le schéma ne se découvre pas, il se lit dans la
 *   documentation de tiers et se vérifie dans `npm run check:queries`.
 */

/**
 * Une requête toutes les 4 s, et c'est délibérément lent.
 *
 * Le seuil de Cloudflare n'est pas connu pour un navigateur ; celui de curl
 * tombait vers quatre requêtes par minute. Quatre secondes gardent sous quinze
 * par minute même au pire — la première visite de « Everything airing », une
 * douzaine de requêtes. « Mine » en demande deux ou trois, et le reste vient
 * du cache.
 */
const MIN_INTERVAL_MS = 4000;

export class LiveChartError extends Error {
  /** 0 quand la requête n'a même pas abouti — CORS, réseau, défi Cloudflare. */
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'LiveChartError';
    this.status = status;
  }
}

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

/** File propre à cet hôte, comme celles d'AnimeThemes et d'ADN. */
function slot(): Promise<void> {
  const next = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  chain = next.catch(() => {});
  return next;
}

export async function liveChart<T>(
  query: string,
  variables: object = {},
  signal?: AbortSignal,
): Promise<T> {
  await slot();

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (e) {
    /* Un défi Cloudflare arrive ici, pas plus bas : sa page n'a pas d'en-têtes
       CORS, donc le navigateur ne rend même pas le 403 — seulement un
       « Failed to fetch ». Une annulation, elle, se relance telle quelle. */
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new LiveChartError('LiveChart is unreachable.', 0);
  }

  const body = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message: string }[];
  } | null;

  if (!res.ok || !body) {
    throw new LiveChartError(`LiveChart responded ${res.status}.`, res.status);
  }
  /* Une limite de complexité dépassée revient en 200 avec `errors` et sans
     `data` : c'est une requête mal dimensionnée, pas une panne. */
  if (body.errors?.length) {
    throw new LiveChartError(body.errors.map((e) => e.message).join(' · '), res.status);
  }
  if (!body.data) {
    throw new LiveChartError('Empty response from LiveChart.', res.status);
  }
  return body.data;
}

/**
 * Les formes BRUTES rendues par les requêtes — voir `queries.ts`.
 *
 * Tout est facultatif, et c'est la seule posture honnête face à un schéma
 * qu'on ne peut pas introspecter. La mise en forme vit dans `lib/livechart`,
 * qui est pur et testé.
 */
export interface RawLcAnime {
  databaseId: string | null;
  anilistUrl: string | null;
}

/** Une recherche par alias : `a<idAniList>` → les anime trouvés. */
export type RawLcSearch = Record<string, { nodes: RawLcAnime[] | null } | null>;

export interface RawLcRelease {
  date: string | null;
  timeIsApproximate: boolean | null;
  numberRange: { minNumber: number | null; size: number | null } | null;
}

export interface RawLcSchedule {
  applicableToViewer: boolean | null;
  network: { name: string | null } | null;
  tracks: { type: string | null; languageCode: string | null }[] | null;
  releaseState: {
    nextRelease: RawLcRelease | null;
    previousRelease: RawLcRelease | null;
  } | null;
}

/** Des calendriers par alias : `l<idAniList>` → les calendriers de sortie. */
export type RawLcSchedules = Record<
  string,
  { releaseSchedules: { nodes: RawLcSchedule[] | null } | null } | null
>;
