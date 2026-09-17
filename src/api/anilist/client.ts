const ENDPOINT = 'https://graphql.anilist.co';

export class AniListError extends Error {
  status: number;
  /** Secondes à attendre avant de réessayer, quand l'API le précise. */
  retryAfter?: number;

  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = 'AniListError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface RateLimit {
  limit?: number;
  remaining?: number;
}

/** Dernier état de quota vu — utile pour afficher un avertissement dans l'UI. */
export let lastRateLimit: RateLimit = {};

/**
 * Une requête GraphQL AniList.
 *
 * Volontairement minimal : le cache, la déduplication et les réessais sont
 * le travail de TanStack Query, pas celui d'ici. On ne gère que ce que la
 * couche au-dessus ne peut pas voir — le quota et la forme des erreurs.
 */
export async function anilist<T>(
  query: string,
  variables: object = {},
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });

  lastRateLimit = {
    limit: numberOrUndefined(res.headers.get('X-RateLimit-Limit')),
    remaining: numberOrUndefined(res.headers.get('X-RateLimit-Remaining')),
  };

  if (res.status === 429) {
    throw new AniListError(
      'Quota AniList atteint.',
      429,
      numberOrUndefined(res.headers.get('Retry-After')),
    );
  }

  const body = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message: string }[];
  } | null;

  if (!res.ok || !body) {
    throw new AniListError(`AniList responded ${res.status}.`, res.status);
  }
  if (body.errors?.length) {
    throw new AniListError(body.errors.map((e) => e.message).join(' · '), res.status);
  }
  if (!body.data) {
    throw new AniListError('Empty response from AniList.', res.status);
  }
  return body.data;
}

function numberOrUndefined(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
