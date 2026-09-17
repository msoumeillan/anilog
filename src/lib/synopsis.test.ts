import { describe, expect, it } from 'vitest';
import { synopsisParagraphs } from './synopsis';

/* Ces premiers cas visaient `synopsisText`, un simple `join` par-dessus la
   fonction ci-dessous. La derniere page qui l'appelait est passee aux
   paragraphes, et il ne restait plus que ces tests pour le maintenir en vie —
   une forme de mort que l'audit ne voit pas, puisqu'un import est un import.
   Le nettoyage garde les cas : ils portaient sur le vrai travail, le Markdown
   de MangaBaka et le HTML d'AniList. */
describe('nettoyage', () => {
  it('garde le libellé d’un lien Markdown, pas son adresse', () => {
    // La vraie fin du synopsis de Lord of Mysteries chez MangaBaka.
    expect(
      synopsisParagraphs('**Original Novel:** [Qidian](https://www.qidian.com/book/1010868264/)'),
    ).toEqual(['Original Novel: Qidian']);
  });

  it('enlève gras et italique dans les deux notations', () => {
    expect(synopsisParagraphs('un __gras__ et un _italique_')).toEqual(['un gras et un italique']);
    expect(synopsisParagraphs('un **gras** et un *italique*')).toEqual(['un gras et un italique']);
  });

  it("enlève le HTML d'AniList, mais garde ses sauts", () => {
    // Un `<br>` EST un saut de ligne : l'effacer collait les phrases.
    expect(synopsisParagraphs('Une phrase.<br><i>Source : VIZ</i>')).toEqual([
      'Une phrase.\nSource : VIZ',
    ]);
  });

  it('encaisse un synopsis absent', () => {
    expect(synopsisParagraphs(null)).toEqual([]);
    expect(synopsisParagraphs('')).toEqual([]);
  });
});

describe('synopsisParagraphs', () => {
  it('découpe sur les lignes vides de MangaBaka', () => {
    /* La forme réelle : le résumé, puis sa ligne de source. Rendus d'un bloc,
       ils se collent en un pavé. */
    expect(synopsisParagraphs('Denji was a devil hunter.\n\n*Source: VIZ Media*')).toEqual([
      'Denji was a devil hunter.',
      'Source: VIZ Media',
    ]);
  });

  it('rétablit les sauts d’AniList AVANT de retirer les balises', () => {
    // Les enlever d'abord aurait effacé la séparation.
    expect(synopsisParagraphs('Un.<br><br>Deux.')).toEqual(['Un.', 'Deux.']);
    expect(synopsisParagraphs('<p>Un.</p><p>Deux.</p>')).toEqual(['Un.', 'Deux.']);
  });

  it('garde un saut simple à l’intérieur d’un paragraphe', () => {
    expect(synopsisParagraphs('From Yen Press:  \nIn the storm')).toEqual([
      'From Yen Press:\nIn the storm',
    ]);
  });

  it('n’rend aucun paragraphe vide', () => {
    expect(synopsisParagraphs('a\n\n\n\n\nb')).toEqual(['a', 'b']);
    expect(synopsisParagraphs(null)).toEqual([]);
  });
});
