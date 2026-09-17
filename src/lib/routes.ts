/**
 * Destinations internes.
 *
 * Le média vit dans le CHEMIN d'une fiche, pas dans un paramètre : `/anime/21`
 * et `/manga/30642` sont deux adresses, et rien ne permet d'ouvrir l'une en
 * croyant l'autre. Décision 2, celle qui distingue l'anime 21 du manga 21.
 *
 * Le type vient d'AniList en majuscules et de notre modèle en minuscules ;
 * les deux passent.
 */
export function mediaHref(type: string | undefined, id: number): string | null {
  const isManga = type === 'MANGA' || type === 'manga';
  return isManga ? `/manga/${id}` : `/anime/${id}`;
}

/**
 * Un lien vers Browse avec des filtres déjà posés.
 *
 * C'est ce qui rend cliquables le format, le statut et la saison d'une fiche :
 * « WINTER 2015 » mène à Browse filtré sur cette saison-là. Les filtres de
 * Browse vivent donc dans l'URL, ce qui les rend aussi partageables et
 * défaisables par le retour arrière.
 *
 * Les valeurs vides sont retirées plutôt qu'écrites vides : `?season=` ne veut
 * rien dire et resterait dans la barre d'adresse.
 */
export function browseHref(filters: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/browse?${query}` : '/browse';
}

/**
 * L'état de navigation qui demande le haut de page.
 *
 * `ScrollManager` laisse la page où elle est quand seule la query change :
 * c'est un filtre qu'on règle sous ses yeux. Une recherche lancée n'en est pas
 * un. De « miyazaki » à « one piece », le chemin reste `/search`, mais c'est
 * une autre page, et elle s'ouvrait à la hauteur de la précédente — mesuré,
 * 1 500 px plus bas. La recherche le dit donc en naviguant avec cet état.
 */
export const SCROLL_TO_TOP = { scrollToTop: true };

/** Cet état de navigation demande-t-il le haut de page ? */
export function asksScrollToTop(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'scrollToTop' in state &&
    state.scrollToTop === true
  );
}

/**
 * Un lien vers la page d'un magazine de prépublication.
 *
 * L'identifiant est celui de MyAnimeList, seul à savoir lister un magazine —
 * AniList n'a pas la notion. Le nom l'accompagne dans l'URL parce que
 * MyAnimeList n'expose pas de `/magazines/{id}` : sans lui, une adresse
 * partagée s'ouvrirait sur un titre vide.
 */
export function magazineHref(malId: number, name: string): string {
  const params = new URLSearchParams({ name });
  return `/magazine/${malId}?${params.toString()}`;
}

/**
 * De quoi poser une carte pour une entrée de la bibliothèque.
 *
 * Une entrée n'a pas forcément d'identifiant AniList : les romans web n'y
 * sont pas. Celles-là mènent à leur fiche MangaBaka, et la destination
 * explicite coupe aussi la pastille « dans la bibliothèque » de la carte —
 * elle se calcule sur l'espace de clés d'AniList, où cette œuvre n'existe pas.
 */
export function entryCard(entry: { ids: { anilist?: number; mangaBaka?: number } }): {
  id: number;
  href?: string;
} {
  if (typeof entry.ids.anilist === 'number') return { id: entry.ids.anilist };

  const mb = entry.ids.mangaBaka;
  if (typeof mb === 'number') return { id: mb, href: `/mangabaka/${mb}` };

  /* Ni l'un ni l'autre : la carte s'affiche quand même — le titre et la
     couverture sont dans l'entrée — mais elle ne mène nulle part. */
  return { id: 0 };
}
