/**
 * Choix du titre affiché.
 *
 * L'interface est en anglais, donc on préfère `english`. Il manque sur environ
 * 1 % du catalogue (mesuré sur 100 titres populaires), d'où la chaîne de repli
 * anglais → romaji → natif : il ne doit jamais rester un blanc.
 *
 * Un seul endroit décide, pour que passer un jour l'app en « romaji d'abord »
 * — comme le permet AniList dans ses préférences — soit une ligne à changer.
 */

export interface TitleSet {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

export function displayTitle(t: TitleSet | null | undefined): string {
  return t?.english?.trim() || t?.romaji?.trim() || t?.native?.trim() || 'Untitled';
}

/**
 * Les autres graphies, sans répéter celle déjà à l'écran.
 * « Attack on Titan » en titre donne « Shingeki no Kyojin · 進撃の巨人 » en dessous.
 */
export function altTitles(t: TitleSet | null | undefined): string[] {
  const shown = displayTitle(t);
  return [t?.romaji, t?.native]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v) && v !== shown);
}
