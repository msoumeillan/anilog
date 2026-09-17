import type { MediaType } from '../types/library';

/**
 * Le mode global : anime ou manga.
 *
 * Décision 6 — le mode vit DANS L'URL, pas dans un état de composant. Une
 * page de mangas filtrés se partage, se met en favori, et le bouton retour la
 * défait. Un état interne ne ferait rien de tout ça.
 *
 * Les fiches, elles, portent leur mode dans leur chemin : `/anime/16498` et
 * `/manga/30642`. Il n'y a donc rien à lire ici pour elles — l'adresse suffit,
 * et c'est ce qui empêche d'ouvrir un manga « en mode anime ».
 *
 * L'accueil ignore le mode et montre les deux : c'est la page qui répond à
 * « où j'en suis », toutes lectures confondues.
 */

/** Le nom du paramètre, en un seul endroit. */
const MEDIA_PARAM = 'media';

/**
 * Le mode que dit l'URL. L'anime par défaut : c'est le cœur de l'app, et une
 * adresse sans paramètre doit rester la plus courante.
 */
export function readMode(params: URLSearchParams): MediaType {
  return params.get(MEDIA_PARAM) === 'manga' ? 'manga' : 'anime';
}

/** `ANIME` / `MANGA` pour AniList, à partir du mode. */
export function anilistType(media: MediaType): 'ANIME' | 'MANGA' {
  return media === 'manga' ? 'MANGA' : 'ANIME';
}

/** Ce qu'on compte : des épisodes ou des chapitres. */
export function unitLabel(media: MediaType, plural = false): string {
  const one = media === 'manga' ? 'chapter' : 'episode';
  return plural ? `${one}s` : one;
}

/**
 * Ou l'on parcourt un media.
 *
 * L'anime se parcourt chez AniList, le manga chez MangaBaka — dont le
 * catalogue est un sur-ensemble : plus de 300 000 series contre les seules oeuvres
 * qu'AniList reference, romans web exclus. Ce n'est plus un essai, c'est la
 * porte d'entree du manga.
 */
export function browsePath(media: MediaType): string {
  return media === 'manga' ? '/mangabaka' : '/browse';
}

/**
 * Le media courant, chemin compris.
 *
 * `/mangabaka` et `/library/manga` ne portent pas `?media=manga` — leur chemin
 * le dit deja. Sans cette lecture, le selecteur afficherait « Anime » en
 * surbrillance sur le catalogue manga.
 */
export function modeOf(pathname: string, params: URLSearchParams): MediaType {
  if (pathname.startsWith('/mangabaka') || pathname.startsWith('/library/manga')) return 'manga';
  if (pathname.startsWith('/library/anime')) return 'anime';
  return readMode(params);
}
