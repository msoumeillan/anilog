import type { MbSeries, MbSourceRating } from '../api/mangabaka/client';

/**
 * Ce qu'on retient d'une fiche MangaBaka, mis en forme.
 *
 * Le fetch est ailleurs ; ici on ne fait que choisir, nommer et ordonner.
 */

/**
 * Les sept bases, nommées et dans un ordre fixe.
 *
 * Un ordre fixe et non trié par note : une liste qui se réarrange selon les
 * valeurs empêche de comparer deux œuvres d'un coup d'œil, et c'est justement
 * pour comparer qu'on affiche sept notes.
 */
const SOURCES: {
  key: string;
  label: string;
  short: string;
  color: string;
  /**
   * L'oeuvre chez eux, quand ils en donnent l'identifiant.
   *
   * MangaBaka le fait aussi : la note dit ce qu'ils en pensent, le lien mene
   * lire pourquoi. `undefined` quand l'identifiant manque — un lien mort
   * vaudrait moins que pas de lien.
   */
  url?: string;
  /** L'adresse de l'oeuvre chez eux. Verifiee sur Chainsaw Man, base par base. */
  page: (id: string) => string;
}[] = [
  {
    key: 'my_anime_list',
    label: 'MyAnimeList',
    short: 'MAL',
    color: '#2e51a2',
    page: (id) => `https://myanimelist.net/manga/${id}`,
  },
  {
    key: 'anilist',
    label: 'AniList',
    short: 'AL',
    color: '#02a9ff',
    page: (id) => `https://anilist.co/manga/${id}`,
  },
  {
    key: 'manga_updates',
    label: 'MangaUpdates',
    short: 'MU',
    color: '#ff8c15',
    page: (id) => `https://www.mangaupdates.com/series/${id}`,
  },
  {
    key: 'anime_planet',
    label: 'Anime-Planet',
    short: 'AP',
    color: '#1c3867',
    page: (id) => `https://www.anime-planet.com/manga/${id}`,
  },
  {
    key: 'kitsu',
    label: 'Kitsu',
    short: 'KIT',
    color: '#f75239',
    page: (id) => `https://kitsu.app/manga/${id}`,
  },
  {
    key: 'anime_news_network',
    label: 'ANN',
    short: 'ANN',
    color: '#2b669a',
    page: (id) => `https://www.animenewsnetwork.com/encyclopedia/manga.php?id=${id}`,
  },
  {
    key: 'shikimori',
    label: 'Shikimori',
    short: 'SHI',
    color: '#ae3f3f',
    page: (id) => `https://shikimori.one/mangas/${id}`,
  },
];

/**
 * Un identifiant de base, quand c'est bien un nombre.
 *
 * MangaBaka mele les deux : AniList et MyAnimeList numerotent, Anime-Planet et
 * MangaUpdates utilisent des slugs. Ce qui attend un nombre — un appel d'API,
 * une adresse interne — doit donc le verifier plutot que de l'esperer.
 */
export function numericId(id: number | string | null | undefined): number | undefined {
  return typeof id === 'number' && id > 0 ? id : undefined;
}

export interface Rating {
  /** La clé de la base — c'est elle qui désigne son logo. */
  key: string;
  label: string;
  /**
   * Deux ou trois lettres et la couleur de la marque.
   *
   * Le repli quand le logo manque : mieux vaut une pastille reconnaissable
   * qu'un trou dans la ligne.
   */
  short: string;
  color: string;
  /**
   * L'œuvre chez eux, quand ils en donnent l'identifiant.
   *
   * MangaBaka fait pareil : la note dit ce qu'ils en pensent, le lien mène
   * lire pourquoi. `undefined` quand l'identifiant manque — un lien mort
   * vaudrait moins que pas de lien.
   */
  url?: string;
  /** Sur 100 — c'est `rating_normalized`, la seule échelle commune. */
  score: number;
}

/**
 * Les notes disponibles, sur une échelle commune.
 *
 * `rating_normalized` et non `rating` : les bases ne notent pas pareil —
 * MyAnimeList sur 10, Anime-Planet sur 5 — et les afficher côte à côte sans
 * les ramener à la même échelle ferait passer 4,4 pour une note médiocre à
 * côté d'un 9,09 qui vaut la même chose.
 */
export function ratings(series: MbSeries | null | undefined): Rating[] {
  if (!series?.source) return [];

  const out: Rating[] = [];
  for (const { key, label, short, color, page } of SOURCES) {
    const value: MbSourceRating | null | undefined = series.source[key];
    const score = value?.rating_normalized;
    /* Zéro n'est pas une note : c'est ce que renvoie une base où personne ne
       s'est prononcé. Même piège que les votes TMDB. */
    if (typeof score !== 'number' || score <= 0) continue;

    const id = value?.id;
    const url =
      typeof id === 'number' || (typeof id === 'string' && id.trim())
        ? page(String(id))
        : undefined;
    out.push({ key, label, short, color, score, url });
  }
  return out;
}

/** La moyenne de MangaBaka, arrondie. `null` quand elle manque. */
export function aggregate(series: MbSeries | null | undefined): number | null {
  const value = series?.rating;
  return typeof value === 'number' && value > 0 ? Math.round(value) : null;
}

export interface AnimeSpan {
  start: string;
  end: string | null;
}

/**
 * Où l'adaptation animée commence et s'arrête dans le manga.
 *
 * Rendu TEL QUEL, sans analyse. La chaîne vaut « Vol 1, Chap 1 (S1) Chap 1-2
 * adapted in EP 7-8 / Vol 8, Chap 55 (S2) » : elle mêle tomes, chapitres,
 * saisons et parfois épisodes, sans grammaire garantie. En extraire une plage
 * structurée reviendrait à deviner, et ce projet a déjà payé le prix des
 * suppositions sur des données molles.
 */
export function animeSpan(series: MbSeries | null | undefined): AnimeSpan | null {
  const anime = series?.anime;
  const start = anime?.start?.trim();
  if (!start) return null;
  return { start, end: anime?.end?.trim() || null };
}

export interface Publisher {
  name: string;
  /** « Original », « English », « German »… tel que MangaBaka le qualifie. */
  region: string;
}

/**
 * Les éditeurs, l'original en tête.
 *
 * C'est la seule information qui dit si une œuvre est licenciée dans une
 * langue donnée — AniList ne la porte pas du tout.
 *
 * `type` porte la région : « Original », « English », « Korean », ou « Other »
 * quand aucune ne s'applique. `note` est un champ libre, et c'est là qu'est le
 * piège : sur One Piece elle contient « 1176 Chapters; Ongoing », sur VIZ Media
 * « 111 Volumes; Ongoing | 35 3-in-1 Omnibuses; Ongoing ». Elle ne complète la
 * région QUE derrière un « Other », où elle nomme parfois la langue restée sans
 * case — « German » chez Carlsen, « Portuguese » chez Devir.
 */
export function publishers(series: MbSeries | null | undefined): Publisher[] {
  const list = series?.publishers ?? [];
  return list
    .filter((p) => p.name?.trim())
    .map((p) => ({ name: p.name.trim(), region: region(p.type, p.note) }))
    .sort((a, b) => Number(b.region === 'Original') - Number(a.region === 'Original'));
}

/**
 * La région d'un éditeur — jamais « Other », qui ne dit rien.
 *
 * Une langue n'a ni chiffre ni point-virgule ; « 3-in-1 Omnibus » et
 * « 20 Volumes; Ongoing » se disqualifient donc d'eux-mêmes, et mieux vaut une
 * case vide qu'une case qui ment.
 */
function region(type: string | undefined, note: string | undefined): string {
  const kind = type?.trim() ?? '';
  if (kind && kind !== 'Other') return kind;

  const hint = note?.trim() ?? '';
  return hint && !/[\d;|]/.test(hint) ? hint : '';
}

export interface Counts {
  /** Chapitres parus à ce jour. */
  chapters: number | null;
  /** Tomes parus à ce jour. */
  volumes: number | null;
}

/**
 * Combien de chapitres et de tomes sont parus.
 *
 * AniList laisse `chapters` à `null` tant qu'une série n'est pas terminée —
 * mesuré, 15 des 40 mangas testés, One Piece compris. MangaBaka compte les
 * parutions : un dénominateur là où le suivi n'affichait qu'un « ? ».
 *
 * Ne sert QU'À COMBLER : quand AniList donne un nombre, c'est le sien qui
 * reste. Les deux s'accordent sur 23 des 25 comparés, et sur les deux restants
 * ils diffèrent d'une unité — assez pour faire osciller un total d'une fiche à
 * l'autre si on laissait la priorité changer selon qui répond.
 */
export function counts(series: MbSeries | null | undefined): Counts {
  return { chapters: number(series?.total_chapters), volumes: number(series?.final_volume) };
}

/**
 * Un entier positif, ou rien.
 *
 * Accepte aussi un nombre : leur schéma est « subject to change at any time
 * and without notice », et le jour où ces champs deviennent numériques, ce
 * n'est pas un compteur qui doit disparaître de l'écran.
 */
function number(raw: string | number | null | undefined): number | null {
  const value = typeof raw === 'string' ? Number(raw.trim()) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
}
