import { describe, expect, it } from 'vitest';
import { asksScrollToTop, browseHref, mediaHref, SCROLL_TO_TOP } from './routes';

describe('mediaHref', () => {
  it('mène à la fiche pour un anime', () => {
    expect(mediaHref('ANIME', 16498)).toBe('/anime/16498');
  });

  it('mène à la fiche manga, sur son propre chemin', () => {
    /* Le média est dans le CHEMIN, pas dans un paramètre : rien ne permet
       d'ouvrir l'un en croyant l'autre. Décision 2. */
    expect(mediaHref('MANGA', 30642)).toBe('/manga/30642');
  });

  it('accepte les deux graphies — AniList crie, notre modèle chuchote', () => {
    expect(mediaHref('manga', 30642)).toBe('/manga/30642');
    expect(mediaHref('anime', 16498)).toBe('/anime/16498');
  });

  it('mène à l’anime par défaut, faute de type', () => {
    expect(mediaHref(undefined, 16498)).toBe('/anime/16498');
  });
});

describe('browseHref', () => {
  it('compose la saison et l’année, comme le lien « Winter 2015 »', () => {
    expect(browseHref({ season: 'WINTER', year: 2015 })).toBe('/browse?season=WINTER&year=2015');
  });

  it('ignore les valeurs absentes plutôt que d’écrire des paramètres vides', () => {
    expect(browseHref({ season: 'FALL', year: null, format: undefined, status: '' })).toBe(
      '/browse?season=FALL',
    );
  });

  it('n’ajoute pas de point d’interrogation sans filtre', () => {
    expect(browseHref({})).toBe('/browse');
    expect(browseHref({ genre: '' })).toBe('/browse');
  });

  it('encode ce qui doit l’être', () => {
    expect(browseHref({ genre: 'Slice of Life' })).toBe('/browse?genre=Slice+of+Life');
  });
});

describe('asksScrollToTop : l’état qui demande le haut de page', () => {
  it('reconnaît l’état que pose la recherche', () => {
    expect(asksScrollToTop(SCROLL_TO_TOP)).toBe(true);
  });

  it('ne demande rien par défaut — un filtre garde sa position', () => {
    /* L'état d'une navigation ordinaire vaut `null` ; il vient de
       l'historique, et rien n'en garantit la forme. */
    for (const etat of [null, undefined, 'haut', 1, {}, { scrollToTop: 'true' }]) {
      expect(asksScrollToTop(etat)).toBe(false);
    }
  });
});
