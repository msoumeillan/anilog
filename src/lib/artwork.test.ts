import { describe, expect, it } from 'vitest';
import {
  ANY_LANGUAGE,
  TEXTLESS,
  artUrl,
  filterByLanguage,
  languageLabel,
  languagesOf,
  preferSeason,
  sortImages,
  type TmdbImage,
} from './artwork';

const img = (file_path: string, over: Partial<TmdbImage> = {}): TmdbImage => ({
  file_path,
  iso_639_1: 'en',
  vote_average: 5,
  vote_count: 1,
  width: 500,
  height: 750,
  ...over,
});

describe('artUrl', () => {
  it('compose une URL TMDB à la taille demandée', () => {
    expect(artUrl('/a.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/a.jpg');
  });

  it('ne rend rien sans chemin — un `src` vide déclencherait une requête sur la page', () => {
    expect(artUrl(undefined, 'w500')).toBeUndefined();
    expect(artUrl(null, 'w500')).toBeUndefined();
    expect(artUrl('', 'w500')).toBeUndefined();
  });
});

describe('languagesOf', () => {
  it('compte les langues et met la plus fournie en tête', () => {
    expect(
      languagesOf([
        img('/1', { iso_639_1: 'en' }),
        img('/2', { iso_639_1: 'ja' }),
        img('/3', { iso_639_1: 'ja' }),
      ]),
    ).toEqual([
      { code: 'ja', count: 2 },
      { code: 'en', count: 1 },
    ]);
  });

  it('range les images sans texte sous leur propre code', () => {
    expect(languagesOf([img('/1', { iso_639_1: null })])).toEqual([{ code: TEXTLESS, count: 1 }]);
  });

  it('traite la chaîne vide comme « sans texte » — TMDB sert les deux', () => {
    expect(languagesOf([img('/1', { iso_639_1: '' }), img('/2', { iso_639_1: null })])).toEqual([
      { code: TEXTLESS, count: 2 },
    ]);
  });

  it('départage à égalité par le code, pour un ordre stable entre deux ouvertures', () => {
    const langs = languagesOf([img('/1', { iso_639_1: 'ja' }), img('/2', { iso_639_1: 'en' })]);
    expect(langs.map((l) => l.code)).toEqual(['en', 'ja']);
  });
});

describe('filterByLanguage', () => {
  const images = [
    img('/1', { iso_639_1: 'ja' }),
    img('/2', { iso_639_1: null }),
    img('/3', { iso_639_1: '' }),
  ];

  it('laisse tout passer sur « toutes langues »', () => {
    expect(filterByLanguage(images, ANY_LANGUAGE)).toHaveLength(3);
  });

  it('ne garde que les images sans texte sur « sans texte »', () => {
    expect(filterByLanguage(images, TEXTLESS).map((i) => i.file_path)).toEqual(['/2', '/3']);
  });

  it('filtre sur un code de langue', () => {
    expect(filterByLanguage(images, 'ja').map((i) => i.file_path)).toEqual(['/1']);
  });
});

describe('languageLabel', () => {
  it('nomme les langues courantes', () => {
    expect(languageLabel('ja')).toBe('Japanese');
  });

  it('résout les codes obsolètes que TMDB traîne encore', () => {
    expect(languageLabel('mo')).toBe('Romanian');
  });

  it('rend le code tel quel quand il est inconnu mais bien formé', () => {
    expect(languageLabel('zzz')).toBe('zzz');
  });

  it('ne lève pas sur un code mal formé — la chaîne vide arrive vraiment', () => {
    expect(languageLabel('')).toBe('');
  });

  it('nomme les deux entrées qui ne sont pas des langues', () => {
    expect(languageLabel(ANY_LANGUAGE)).toBe('All languages');
    expect(languageLabel(TEXTLESS)).toBe('No text');
  });
});

describe('sortImages', () => {
  it('classe par note, puis par nombre de votes', () => {
    const sorted = sortImages([
      img('/faible', { vote_average: 5.4, vote_count: 1 }),
      img('/forte', { vote_average: 7, vote_count: 1 }),
      img('/portee', { vote_average: 5.4, vote_count: 8 }),
    ]);
    expect(sorted.map((i) => i.file_path)).toEqual(['/forte', '/portee', '/faible']);
  });

  it('donne le même ordre à deux appels : la grille ne doit pas se réarranger', () => {
    const equal = [img('/b'), img('/a'), img('/c')];
    expect(sortImages(equal).map((i) => i.file_path)).toEqual(['/a', '/b', '/c']);
  });

  it('ne modifie pas le tableau reçu', () => {
    const source = [img('/b', { vote_average: 1 }), img('/a', { vote_average: 9 })];
    sortImages(source);
    expect(source.map((i) => i.file_path)).toEqual(['/b', '/a']);
  });
});

describe('preferSeason', () => {
  it('place les affiches de la saison avant celles de la série', () => {
    const merged = preferSeason(
      [img('/saison', { vote_average: 1 })],
      [img('/serie', { vote_average: 9 })],
    );
    expect(merged.map((i) => i.file_path)).toEqual(['/saison', '/serie']);
  });

  it('ne montre pas deux fois une image servie aux deux niveaux', () => {
    const shared = img('/commune');
    expect(preferSeason([shared], [shared, img('/autre')]).map((i) => i.file_path)).toEqual([
      '/commune',
      '/autre',
    ]);
  });

  it('trie à l’intérieur de chaque groupe', () => {
    const merged = preferSeason(
      [img('/s-faible', { vote_average: 2 }), img('/s-forte', { vote_average: 8 })],
      [img('/x-faible', { vote_average: 1 }), img('/x-forte', { vote_average: 9 })],
    );
    expect(merged.map((i) => i.file_path)).toEqual([
      '/s-forte',
      '/s-faible',
      '/x-forte',
      '/x-faible',
    ]);
  });
});
