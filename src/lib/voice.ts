/**
 * Doubleurs.
 *
 * AniList attache les doubleurs à l'APPARITION, pas au personnage : le même
 * personnage a un doubleur par adaptation, et une liste par langue. Deux
 * lectures différentes en découlent, d'où les deux fonctions ci-dessous.
 *
 * Le champ n'est jamais filtré côté serveur : deux alias du même champ avec
 * des arguments différents sont fusionnés par AniList, et le dernier gagne.
 * Le tri se fait donc ici.
 */

export const JAPANESE = 'Japanese';

export interface Voice {
  id: number;
  name: { full: string };
  languageV2: string;
}

export interface Actor {
  id: number;
  name: string;
}

/**
 * Le seiyuu d'une apparition — la version courte, pour une carte.
 * Une carte n'a la place que d'un nom, et c'est la version originale.
 */
export function seiyuu(actors: Voice[]): Actor | null {
  const a = actors.find((v) => v.languageV2 === JAPANESE);
  return a ? { id: a.id, name: a.name.full } : null;
}

/**
 * Tous les doubleurs d'un personnage, groupés par langue — la version longue,
 * pour sa fiche.
 *
 * On agrège sur toutes les apparitions et on dédoublonne par identifiant :
 * un doubleur qui reprend le rôle dans trois saisons ne doit apparaître
 * qu'une fois.
 */
export function voicesByLanguage(appearances: { voiceActors: Voice[] }[]) {
  const byLang = new Map<string, Map<number, string>>();

  for (const a of appearances) {
    for (const v of a.voiceActors) {
      let actors = byLang.get(v.languageV2);
      if (!actors) byLang.set(v.languageV2, (actors = new Map()));
      actors.set(v.id, v.name.full);
    }
  }

  /* Le japonais en tête : c'est la version originale, et c'est le défaut de
     la fiche. Le reste par ordre alphabétique. */
  const languages = [...byLang.keys()].sort((a, b) => {
    if (a === JAPANESE) return -1;
    if (b === JAPANESE) return 1;
    return a.localeCompare(b);
  });

  const actorsIn = (lang: string): Actor[] =>
    [...(byLang.get(lang)?.entries() ?? [])].map(([id, name]) => ({ id, name }));

  return { languages, actorsIn };
}
