/**
 * Les filtres d'un magazine, dans le vocabulaire de MyAnimeList.
 *
 * Ils partent au SERVEUR, comme ceux d'un genre et contrairement a ceux d'un
 * studio : un magazine compte jusqu'a 1 918 titres (KakaoPage), et une page
 * n'en charge que 25. Filtrer ce qui est charge afficherait un resultat faux —
 * « 3 titres » alors qu'il y en a 40, parce que les 37 autres ne sont pas
 * encore arrives.
 *
 * Toutes les valeurs ci-dessous ont ete MESUREES contre l'API, pas lues dans
 * une documentation. Deux surprises en sont sorties, notees a leur place.
 */

export interface MagazineFilters {
  /** Une cle de `SORTS`. Jamais vide : une liste est toujours ordonnee. */
  sort: string;
  type: string;
  status: string;
  /** Une annee de depart, en chaine. Vide = depuis toujours. */
  from: string;
}

export const NO_FILTERS: MagazineFilters = { sort: 'members', type: '', status: '', from: '' };

/**
 * Les tris, et ce qu'ils valent chez MyAnimeList.
 *
 * `members` par defaut : c'est le classement par popularite, la seule chose
 * qu'AniList ne sait pas reproduire pour un magazine, et donc la raison
 * d'etre de cette page.
 */
export const SORTS = [
  { value: 'members', label: 'Popularity', orderBy: 'members', dir: 'desc' },
  { value: 'score', label: 'Score', orderBy: 'score', dir: 'desc' },
  { value: 'newest', label: 'Newest', orderBy: 'start_date', dir: 'desc' },
  { value: 'oldest', label: 'Oldest', orderBy: 'start_date', dir: 'asc' },
  { value: 'title', label: 'Title A–Z', orderBy: 'title', dir: 'asc' },
] as const;

/**
 * Les types d'oeuvre.
 *
 * ⚠️ « lightnovel » et NON « novel », qui est pourtant le mot d'AniList et
 * celui du reste de l'app. Mesure : sur Dragon Magazine, `type=lightnovel`
 * rend 36 titres et `type=novel` en rend ZERO — et 36 + 11 manga = les 47 du
 * magazine. Reprendre notre vocabulaire ici aurait donne un filtre muet.
 */
export const TYPES = [
  { value: 'manga', label: 'Manga' },
  { value: 'oneshot', label: 'One shot' },
  { value: 'lightnovel', label: 'Light novel' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'manhua', label: 'Manhua' },
] as const;

/**
 * Les etats de parution. Ils partitionnent exactement le catalogue — mesure
 * sur la Weekly Shounen Jump : 798 termines + 22 en cours + 1 en pause + 2
 * arretes = les 823 annonces.
 */
export const STATUS = [
  { value: 'publishing', label: 'Publishing' },
  { value: 'complete', label: 'Finished' },
  { value: 'hiatus', label: 'On hiatus' },
  { value: 'discontinued', label: 'Discontinued' },
] as const;

/** Combien de filtres sont posés. Le tri n'en est pas un : il y en a toujours un. */
export function activeCount(f: MagazineFilters): number {
  return [f.type, f.status, f.from].filter(Boolean).length;
}

/**
 * Le chemin a demander a MyAnimeList.
 *
 * ⚠️ `from` ne pose QUE `start_date`. MyAnimeList a bien un `end_date`, mais
 * il borne la FIN de parution, pas la periode : sur la Shounen Jump,
 * `start_date=2020-01-01` rend 248 titres et y ajouter `end_date=2020-12-31`
 * n'en laisse que 7 — ceux commences ET termines dans l'annee. Un filtre
 * « annee 2020 » construit avec les deux aurait donc efface tout ce qui court
 * encore. D'ou le libelle « From » : commence a partir de cette annee-la.
 */
export function magazinePath(
  malId: number,
  page: number,
  perPage: number,
  f: MagazineFilters,
): string {
  const sort = SORTS.find((s) => s.value === f.sort) ?? SORTS[0];
  const params = new URLSearchParams({
    magazines: String(malId),
    limit: String(perPage),
    page: String(page),
    order_by: sort.orderBy,
    sort: sort.dir,
  });

  if (f.type) params.set('type', f.type);
  if (f.status) params.set('status', f.status);
  if (f.from) params.set('start_date', `${f.from}-01-01`);

  return `/manga?${params.toString()}`;
}
