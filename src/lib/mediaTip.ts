import { formatLabel, seasonLabel } from './mediaOptions';
import { isSingleUnit } from './format';

/**
 * La bulle de survol d'une carte : quand, par qui, en combien.
 *
 * Trois lignes et pas une de plus. Une carte donne déjà le titre, l'affiche et
 * la note ; la bulle répond aux questions qui restent — « c'est de quand ? »,
 * « c'est quel studio ? », « c'est long ? » — sans obliger à ouvrir la fiche,
 * qui coûte deux à trois secondes.
 *
 * Tout est facultatif. Les pages personnage et staff, par exemple, n'ont pas
 * le studio, et une œuvre annoncée n'a ni saison ni nombre d'épisodes.
 */

/**
 * Le studio d'animation, parmi tous ceux crédités.
 *
 * Le tri se fait ICI et pas au serveur : AniList n'applique pas son argument
 * `isMain` de la même façon selon la profondeur de la requête — mesuré sur
 * Attack on Titan, un studio sous `Page.media`, sept sous `Character.media`,
 * pour la même formulation. Prendre le premier de la liste ramènerait alors
 * Pony Canyon ou Dentsu, qui financent mais n'animent pas.
 *
 * Le champ `isMain`, lui, est correct dans les deux cas.
 */
export function mainStudio(
  studios: { edges: { isMain: boolean; node: { name: string } }[] } | null | undefined,
): string | undefined {
  return studios?.edges.find((e) => e.isMain)?.node.name;
}

export interface TipFacts {
  season?: string | null;
  year?: number | null;
  studio?: string | null;
  format?: string | null;
  episodes?: number | null;
  /**
   * Manga : l'état de parution, qui tient la ligne du milieu.
   *
   * Un manga n'a pas de studio, mais la question qui reste devant une carte
   * est la même : « où ça en est ? ». La ligne sert donc l'un ou l'autre.
   */
  status?: string | null;
  /** Manga : des chapitres, là où un anime compte des épisodes. */
  chapters?: number | null;
}

export interface Tip {
  /** « Fall 2026 », ou « 2026 » quand la saison manque. */
  when?: string;
  studio?: string;
  /** « TV series · 24 episodes ». */
  what?: string;
}

/** `null` quand il n'y aurait rien à montrer : mieux vaut pas de bulle qu'une bulle vide. */
export function mediaTip(facts: TipFacts): Tip | null {
  /* Une saison sans année ne situe rien — « Fall » tout court peut être
     n'importe laquelle des trente dernières. C'est l'année qui porte
     l'information, la saison qui la précise. */
  const when = facts.year
    ? facts.season
      ? `${seasonLabel(facts.season)} ${facts.year}`
      : String(facts.year)
    : undefined;

  /* « 1 episodes » sur un film ne veut rien dire, et « 1 episode » non plus :
     c'est une œuvre en une pièce, son format le dit déjà. */
  const countable = !isSingleUnit(facts.format ?? undefined, facts.episodes ?? undefined);
  const count =
    countable && facts.episodes
      ? `${facts.episodes} episode${facts.episodes > 1 ? 's' : ''}`
      : undefined;

  /* Un manga compte des chapitres. Ils passent devant les épisodes : une
     œuvre n'a jamais les deux, et c'est le média qui décide de l'unité. */
  const chapitres = facts.chapters
    ? `${facts.chapters} chapter${facts.chapters > 1 ? 's' : ''}`
    : undefined;

  const what = [facts.format ? formatLabel(facts.format) : undefined, chapitres ?? count]
    .filter(Boolean)
    .join(' · ');

  const tip: Tip = {
    when,
    studio: facts.studio?.trim() || facts.status?.trim() || undefined,
    what: what || undefined,
  };

  return tip.when || tip.studio || tip.what ? tip : null;
}
