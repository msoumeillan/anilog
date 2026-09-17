/**
 * Client TMDB.
 *
 * Troisième source d'épisodes, et de loin la meilleure là où les deux autres
 * manquent. Mesuré sur les séries qui posaient problème :
 *
 *   Evangelion    0 % de vignettes → 100 %, en 1 requête
 *   Conan        21 %              → 100 %, en 1 requête (contre 12 chez Jikan)
 *   One Piece     6 %              → 100 %, en 2 requêtes
 *
 * Elle apporte aussi les synopsis, qu'aucune autre source ne donne : Jikan a
 * bien un point d'entrée par épisode, mais il répond 504.
 *
 * La clé vit dans `.env.local`, hors du dépôt. Sans elle, l'app fonctionne
 * exactement comme avant — voir `tmdbEnabled`.
 */

const KEY = import.meta.env.VITE_TMDB_KEY as string | undefined;
const BASE = 'https://api.themoviedb.org/3';

/** Faux quand aucune clé n'est configurée : toute la couche s'efface alors. */
export const tmdbEnabled = Boolean(KEY);

export class TmdbError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
  }
}

export async function tmdb<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!KEY) throw new TmdbError('No TMDB key configured.', 0);

  const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${KEY}`, {
    signal,
  });

  if (!res.ok) throw new TmdbError(`TMDB responded ${res.status}.`, res.status);
  return res.json() as Promise<T>;
}
