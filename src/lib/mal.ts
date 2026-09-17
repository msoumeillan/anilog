import type { MalManga } from '../api/mal/client';

/**
 * Ce qu'on retient d'une fiche manga MyAnimeList.
 *
 * Le fetch est ailleurs ; ici on ne fait que choisir et nommer.
 */

export interface Magazine {
  name: string;
  /**
   * L'identifiant MyAnimeList du magazine.
   *
   * C'est lui qui ouvre sa page dans l'app : MyAnimeList est le seul à savoir
   * lister ce qu'un magazine prépublie, AniList n'ayant pas la notion. Zéro
   * quand il manque — le nom reste alors du texte.
   */
  malId: number;
}

/**
 * Les magazines de prépublication, dans l'ordre de MyAnimeList.
 *
 * Il y en a parfois plusieurs : une série qui déménage garde ses deux
 * sérialisations, et cet ordre est chronologique — on le respecte plutôt que
 * d'en élire une.
 */
export function magazines(manga: MalManga | null | undefined): Magazine[] {
  const list = manga?.serializations ?? [];
  return list
    .filter((s) => s.name?.trim())
    .map((s) => ({
      name: s.name.trim(),
      malId: typeof s.mal_id === 'number' && s.mal_id > 0 ? s.mal_id : 0,
    }));
}
