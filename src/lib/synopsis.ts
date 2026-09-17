/**
 * Un synopsis, nettoye et DECOUPE EN PARAGRAPHES.
 *
 * Les deux sources ne parlent pas le meme format, et c'est l'essai MangaBaka
 * qui l'a mis au jour : AniList ecrit du HTML — `<br>`, `<i>` — quand
 * MangaBaka ecrit du Markdown. Rendu tel quel, le second affiche
 * « **Original Novel:** [Qidian](https://www.qidian.com/book/1010868264/) »
 * en pleine page.
 *
 * On ne rend rien, on NETTOIE. Interpreter du HTML venu d'une API tierce
 * demanderait de l'assainir, et un synopsis ne vaut pas ce risque.
 *
 * Les deux sources ont aussi des paragraphes : MangaBaka separe par des lignes
 * vides, AniList par des `<br><br>`. Rendus d'un bloc, le resume et sa ligne de
 * source — « Source: VIZ Media » — se collent en un pave.
 *
 * Les sauts sont donc retablis AVANT de retirer les balises : `<br>` devient
 * une ligne, `</p>` un paragraphe. Les enlever d'abord les aurait effaces.
 */
export function synopsisParagraphs(raw: string | null | undefined): string[] {
  if (!raw) return [];

  return (
    raw
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
      // Les liens Markdown : garder le libelle, jeter l'adresse.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Gras et italique, dans les deux notations.
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Ce qui reste de HTML.
      .replace(/<[^>]*>/g, '')
      .split(/\n{2,}/)
      .map((p) => p.replace(/[ \t]+\n/g, '\n').trim())
      .filter(Boolean)
  );
}
