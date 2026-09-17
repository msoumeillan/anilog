import { useMemo } from 'react';
import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { envelope, readVersioned } from '../lib/versioned';
import { favouriteKindOf, mbEntryKey, type FavouriteKey, type PersonKind } from '../lib/ids';
import type { MediaType } from '../types/library';

/**
 * Ce qu'on a mis en favori : anime, manga, personnage, staff, studio.
 *
 * Store SÉPARÉ de la bibliothèque, pour la même raison que les affiches :
 * aimer une œuvre ne dit pas qu'on la suit. On peut adorer un film vu il y a
 * dix ans sans vouloir le remettre dans ses listes, et marquer un favori ne
 * doit pas ajouter une entrée qu'aucun bouton n'a annoncée.
 *
 * Un favori et une note de 10 ne sont pas la même chose : la note juge, le
 * favori choisit. AniList et MyAnimeList les gardent séparés aussi.
 *
 * Chaque favori emporte SON NOM ET SON IMAGE, copiés au moment du clic. Le
 * profil les affiche donc sans réseau, comme le reste de la bibliothèque —
 * sinon un top de cinq personnages coûterait cinq requêtes à chaque ouverture.
 *
 * L'IDENTITÉ EST LA CLÉ, et c'est la même que celle de la bibliothèque. Ce
 * store a d'abord été écrit avec `kind` + un nombre, ce qui remettait en place
 * exactement la collision que `lib/ids` existe pour empêcher : la fiche
 * MangaBaka donnait `manga:1677` avec un identifiant MangaBaka, la fiche
 * AniList `manga:1677` avec un identifiant AniList, et aimer l'une retirait
 * l'autre. Passer par `entryKey` / `mbEntryKey` / `personKey` rend la faute
 * impossible à écrire.
 */

export const K_FAV = 'anilog:favourites';

/**
 * Version du format persisté. À monter en AJOUTANT une migration, jamais en
 * éditant une existante — voir `lib/versioned`.
 *
 * 1 — clés qualifiées par la source (`manga:mb1677`), enveloppe `{version}`.
 */
const FAV_VERSION = 1;

export type FavouriteKind = MediaType | PersonKind;

export interface Favourite {
  /** L'identité. Voir `FavouriteKey` : c'est elle qui range et qui compare. */
  key: FavouriteKey;
  kind: FavouriteKind;
  /**
   * L'identifiant DANS L'ESPACE QUE SA CLÉ NOMME — AniList le plus souvent,
   * MangaBaka pour une clé `manga:mb…`.
   *
   * Détail d'AFFICHAGE, jamais une identité : deux favoris peuvent porter le
   * même `id` sans être la même œuvre. C'est précisément la confusion qui a
   * rendu ce champ dangereux quand il servait de clé.
   */
  id: number;
  name: string;
  image?: string;
  /**
   * Où mène le favori.
   *
   * Recopié plutôt que reconstruit : un manga peut vivre sous `/manga/105778`
   * ou sous `/mangabaka/1677` selon qu'AniList le connaît, et le profil n'a
   * pas à refaire ce raisonnement des mois plus tard.
   */
  href?: string;
  /** Pour classer du plus récemment ajouté au plus ancien. */
  addedAt: string;
}

type Table = Record<string, Favourite>;

/**
 * Les sauvegardes d'avant le versionnage : `kind` + un nombre, sans clé.
 *
 * Le `href` recopié à l'époque sauve la mise — c'est lui qui dit de quelle
 * base vient le nombre, et la conversion est donc sans perte.
 */
const MIGRATIONS = {
  0: (items: unknown): Table => {
    if (items === null || typeof items !== 'object') return {};
    const out: Table = {};

    for (const ancien of Object.values(items)) {
      if (ancien === null || typeof ancien !== 'object') continue;
      const champ = (nom: string): unknown => (ancien as Record<string, unknown>)[nom];

      const kind = champ('kind');
      const id = champ('id');
      const href = champ('href');
      if (typeof kind !== 'string' || typeof id !== 'number') continue;

      /* `/mangabaka/1677` → l'identifiant venait de MangaBaka. Sans `href`, on
         retombe sur AniList : c'était la seule source du jour où ce store est
         né, et c'est le pari le moins destructeur. */
      const mb = kind === 'manga' && typeof href === 'string' && /^\/mangabaka\/\d+$/.test(href);
      const key = mb ? mbEntryKey(id) : `${kind}:${id}`;

      const genre = favouriteKindOf(key);
      if (!genre) continue;

      /* Recopié champ par champ plutôt que répandu : ce qui vient du disque n'a
         jamais été vérifié, et un `...ancien` ferait entrer dans la table tout
         ce qu'une version future y aura mis — y compris une `key` périmée. */
      out[key] = {
        key: key as FavouriteKey,
        kind: genre,
        id,
        name: typeof champ('name') === 'string' ? (champ('name') as string) : '',
        image: typeof champ('image') === 'string' ? (champ('image') as string) : undefined,
        href: typeof href === 'string' ? href : undefined,
        addedAt:
          typeof champ('addedAt') === 'string'
            ? (champ('addedAt') as string)
            : new Date(0).toISOString(),
      };
    }

    return out;
  },
} satisfies Record<number, (items: unknown) => unknown>;

interface FavouritesState {
  hydrated: boolean;
  favourites: Table;

  hydrate: () => Promise<void>;
  /** Ajoute si absent, retire si présent. Rend le nouvel état. */
  toggle: (fav: Omit<Favourite, 'addedAt' | 'kind'>) => boolean;
}

export const useFavourites = create<FavouritesState>((set, get) => ({
  hydrated: false,
  favourites: {},

  async hydrate() {
    const { items, rewrite, recoveredFrom } = readVersioned<Table>({
      raw: await storage.get<unknown>(K_FAV),
      version: FAV_VERSION,
      empty: () => ({}),
      migrations: MIGRATIONS,
    });
    if (recoveredFrom) console.warn(`[favourites] ${recoveredFrom}`);

    set({ hydrated: true, favourites: items });
    /* Sans délai : la conversion doit survivre à une fermeture immédiate,
       sinon elle se rejoue à chaque ouverture. */
    if (rewrite) queueWrite(K_FAV, envelope(FAV_VERSION, items), 0);
  },

  toggle(fav) {
    const kind = favouriteKindOf(fav.key);
    /* Une clé qui ne désigne rien n'entre pas dans la table : elle y resterait
       sans qu'aucun bouton puisse la retrouver pour l'enlever. */
    if (!kind) return false;

    const next: Table = { ...get().favourites };
    const etait = Boolean(next[fav.key]);

    if (etait) delete next[fav.key];
    else next[fav.key] = { ...fav, kind, addedAt: new Date().toISOString() };

    set({ favourites: next });
    queueWrite(K_FAV, envelope(FAV_VERSION, next));
    return !etait;
  },
}));

/**
 * Les favoris d'un genre, du plus récemment ajouté au plus ancien.
 *
 * Le tri se fait DEHORS du sélecteur. Un sélecteur qui construit un tableau
 * neuf à chaque appel n'est jamais égal au précédent, et le composant se
 * redessine à chaque changement du store, même sans rapport.
 */
export function useFavouritesOf(kind: FavouriteKind, limit?: number): Favourite[] {
  const table = useFavourites((s) => s.favourites);
  return useMemo(() => {
    const list = Object.values(table)
      .filter((f) => f.kind === kind)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    return limit === undefined ? list : list.slice(0, limit);
  }, [table, kind, limit]);
}

/** Vrai si celui-ci est en favori. */
export function useIsFavourite(key: FavouriteKey | undefined): boolean {
  return useFavourites((s) => (key ? Boolean(s.favourites[key]) : false));
}
