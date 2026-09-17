import { describe, expect, it } from 'vitest';
import {
  activeCount,
  altTitles,
  cataloguePath,
  linkGroups,
  mbSeriesHref,
  relationLabel,
  relations,
  countryOf,
  publishedRange,
  coverUrl,
  displayable,
  genreLabel,
  GENRES,
  NO_FILTERS,
  SORTS,
} from './mangabakaCatalogue';
import type { MbSeries } from '../api/mangabaka/client';

const path = (over = {}) => cataloguePath(1, 25, { ...NO_FILTERS, ...over });
const serie = (over: Partial<MbSeries> = {}): MbSeries =>
  ({ id: 1, canonical_url: null, rating: null, ...over }) as MbSeries;

describe('cataloguePath', () => {
  it('trie par popularité croissante par défaut', () => {
    /* `popularity` est un RANG : 1 est le plus populaire. `popularity_desc`
       remonterait le rang 301 600, « unknown title (please report on ...) ». */
    expect(SORTS[0].value).toBe('popularity_asc');
    expect(path()).toBe(
      '/series/search?limit=25&page=1&sort_by=popularity_asc&not_content_rating=pornographic',
    );
  });

  it('écarte le pornographique au serveur, recherche textuelle comprise', () => {
    /* Filtré seulement à l'affichage, une page perdait ses lignes. */
    expect(path()).toContain('not_content_rating=pornographic');
    expect(path({ q: 'berserk' })).toContain('not_content_rating=pornographic');
    expect(path()).not.toContain('erotica');
  });

  it('laisse la pertinence trier une recherche textuelle', () => {
    // Sinon One Piece remonterait sur n'importe quelle requête.
    const p = path({ q: 'lord of mysteries' });
    expect(p).toContain('q=lord+of+mysteries');
    expect(p).not.toContain('sort_by');
  });

  it('ignore une requête qui n’est que des espaces', () => {
    expect(path({ q: '   ' })).toContain('sort_by=popularity_asc');
  });

  it('n’écrit pas les filtres vides', () => {
    expect(path()).not.toContain('type=');
    expect(path()).not.toContain('genre=');
    expect(path()).not.toContain('status=');
  });

  it('pose type, état et genre tels que MangaBaka les nomme', () => {
    const p = path({ type: 'novel', status: 'releasing', genre: 'martial_arts' });
    expect(p).toContain('type=novel');
    expect(p).toContain('status=releasing');
    expect(p).toContain('genre=martial_arts');
  });
});

describe('GENRES', () => {
  it('ne contient que des valeurs recopiées de leur énumération', () => {
    /* Le serveur répond 400 sur une valeur inconnue. « isekai_free », inventé
       d'après le vocabulaire d'AniList, s'est fait refuser. */
    expect(GENRES).not.toContain('isekai_free');
    expect(GENRES).toContain('martial_arts');
    expect(GENRES).toContain('sci-fi');
  });
});

describe('genreLabel', () => {
  it('rend « school_life » lisible', () => {
    expect(genreLabel('school_life')).toBe('School Life');
    expect(genreLabel('sci-fi')).toBe('Sci Fi');
  });
});

describe('coverUrl', () => {
  it('prend la densité x2, nette sans peser comme l’original', () => {
    const s = serie({ cover: { x350: { x1: 'un', x2: 'deux' }, raw: { url: 'brut' } } });
    expect(coverUrl(s, 'x350')).toBe('deux');
  });

  it('retombe sur x1 puis sur l’original', () => {
    expect(coverUrl(serie({ cover: { x350: { x1: 'un' } } }), 'x350')).toBe('un');
    expect(coverUrl(serie({ cover: { raw: { url: 'brut' } } }), 'x350')).toBe('brut');
  });

  it('ne rend rien plutôt qu’une image absente', () => {
    expect(coverUrl(serie(), 'x250')).toBeNull();
    expect(coverUrl(null, 'x250')).toBeNull();
  });
});

describe('displayable', () => {
  it('écarte une fiche fusionnée : elle doublonne celle qui l’a absorbée', () => {
    expect(displayable([serie({ id: 1 }), serie({ id: 2, merged_with: 1 })])).toEqual([
      serie({ id: 1 }),
    ]);
  });

  it('écarte une fiche sans titre : c’est un formulaire, pas une œuvre', () => {
    /* Elle remontait en PREMIER résultat sur « Shadow Slave ». */
    expect(
      displayable([{ id: 1, title: 'unknown title (please report on Discord)' } as never]),
    ).toEqual([]);
  });

  it('écarte le pornographique, l’équivalent du filtre adulte d’AniList', () => {
    /* Toutes les requêtes AniList portent `isAdult: false` ; sans
       l'équivalent, « Torokase Orgasm » remontait sous une recherche anodine.
       « suggestive » reste : c'est le seinen ordinaire. */
    expect(displayable([{ id: 1, content_rating: 'pornographic' } as never])).toEqual([]);
    expect(displayable([{ id: 3, content_rating: 'suggestive' } as never])).toHaveLength(1);
  });

  it('garde « erotica » : Berserk, Vagabond ou Heavenly Delusion y sont classés', () => {
    /* Sur les 50 séries « erotica » les plus populaires, 30 ne sont pas
       adultes chez AniList. Les écarter cachait Berserk du catalogue. */
    expect(
      displayable([{ id: 1692, title: 'BERSERK', content_rating: 'erotica' } as never]),
    ).toHaveLength(1);
  });

  it('encaisse une page vide', () => {
    expect(displayable(null)).toEqual([]);
  });
});

describe('activeCount', () => {
  it('ne compte ni le tri ni la recherche', () => {
    expect(activeCount({ ...NO_FILTERS, q: 'berserk', sort: 'score_desc' })).toBe(0);
    expect(activeCount({ ...NO_FILTERS, type: 'novel', genre: 'action' })).toBe(2);
  });
});

describe('altTitles', () => {
  it('aplatit les groupes de langue, « unknown » compris', () => {
    /* Les vrais titres du roman Lord of Mysteries : coréen, espagnol et turc
       sont tous rangés sous « unknown » chez eux. */
    expect(
      altTitles({
        title: 'Lord of Mysteries',
        secondary_titles: {
          unknown: [
            { title: '신비의 제왕 (소설)' },
            { title: 'El señor de los misterios (Novela)' },
          ],
        },
      } as never),
    ).toEqual(['신비의 제왕 (소설)', 'El señor de los misterios (Novela)']);
  });

  it('écarte le titre principal et les doublons', () => {
    expect(
      altTitles({
        title: 'Berserk',
        secondary_titles: {
          en: [{ title: 'Berserk' }, { title: 'ベルセルク' }],
          ja: [{ title: 'ベルセルク' }],
        },
      } as never),
    ).toEqual(['ベルセルク']);
  });

  it('s’arrête à la limite', () => {
    const beaucoup = {
      secondary_titles: { x: [1, 2, 3, 4, 5, 6].map((n) => ({ title: `t${n}` })) },
    };
    expect(altTitles(beaucoup as never, 2)).toEqual(['t1', 't2']);
  });

  it('encaisse une fiche sans titre alternatif', () => {
    expect(altTitles({} as never)).toEqual([]);
    expect(altTitles(null)).toEqual([]);
  });
});

describe('linkGroups', () => {
  const liens = (l: unknown[]) => ({ links_v2: l }) as never;

  it('groupe par nature, dans l’ordre du site', () => {
    expect(
      linkGroups(
        liens([
          { url: 'https://wiki', name_display: 'Wikipedia', type: 'info' },
          { url: 'https://manta', name_display: 'Manta', type: 'webplatform' },
          { url: 'https://yen', name_display: 'Yen Press', type: 'publisher' },
        ]),
      ),
    ).toEqual([
      { label: 'Read officially', links: [{ url: 'https://manta', label: 'Manta' }] },
      { label: 'Publisher', links: [{ url: 'https://yen', label: 'Yen Press' }] },
      { label: 'Info', links: [{ url: 'https://wiki', label: 'Wikipedia' }] },
    ]);
  });

  it('garde les plateformes de lecture, plafonnées', () => {
    /* Une première version les écartait pour ne pas noyer le reste — Solo
       Leveling en aligne six. C'était jeter les liens les plus utiles. */
    const six = [1, 2, 3, 4, 5, 6].map((n) => ({
      url: `https://p${n}`,
      name_display: `P${n}`,
      type: 'webplatform',
    }));
    expect(linkGroups(liens(six), 5)[0]?.links).toHaveLength(5);
  });

  it('n’écrit pas un groupe vide', () => {
    expect(linkGroups(liens([{ url: 'https://x', name_display: 'X', type: 'buy' }]))).toEqual([]);
    expect(linkGroups(null)).toEqual([]);
  });

  it('écarte un lien sans adresse, sans nom, ou en double', () => {
    expect(
      linkGroups(
        liens([
          { url: '  ', name_display: 'Vide', type: 'info' },
          { url: 'https://a', name_display: '', type: 'info' },
          { url: 'https://b', name_display: 'Wikipedia', type: 'info' },
          { url: 'https://c', name_display: 'Wikipedia', type: 'info' },
        ]),
      ),
    ).toEqual([{ label: 'Info', links: [{ url: 'https://b', label: 'Wikipedia' }] }]);
  });
});

describe('mbSeriesHref', () => {
  it('mène toujours à la fiche MangaBaka', () => {
    /* C'est elle qui fait autorité du côté manga ; AniList l'enrichit
       par-dessus. Passer par `/manga/<idAniList>` ferait un aller-retour. */
    expect(mbSeriesHref({ id: 3397, source: { anilist: { id: 105398 } } } as never)).toBe(
      '/mangabaka/3397',
    );
    expect(mbSeriesHref({ id: 84351, source: {} } as never)).toBe('/mangabaka/84351');
  });

  it('ne rend rien sans série', () => {
    expect(mbSeriesHref(null)).toBeNull();
  });
});

describe('relationLabel', () => {
  it('rend « spin_off » lisible', () => {
    expect(relationLabel('spin_off')).toBe('spin off');
    expect(relationLabel(null)).toBe('related');
  });
});

describe('relations', () => {
  const lien = (type: string, id: number, over = {}) =>
    ({ relation_type: type, series: { id, title: `t${id}`, ...over } }) as never;

  it('garde le type et l’œuvre visée', () => {
    expect(relations([lien('sequel', 354523)])).toEqual([
      { relation: 'sequel', series: { id: 354523, title: 't354523' } },
    ]);
  });

  it('applique les mêmes filtres que le reste du catalogue', () => {
    /* Une suite pornographique n'a pas plus sa place ici que dans une
       recherche, et une fiche fusionnée ferait doublon. */
    expect(relations([lien('sequel', 1, { content_rating: 'pornographic' })])).toEqual([]);
    expect(relations([lien('sequel', 2, { merged_with: 9 })])).toEqual([]);
  });

  it('écarte une relation sans œuvre au bout', () => {
    expect(relations([{ relation_type: 'sequel', series: null }])).toEqual([]);
    expect(relations(null)).toEqual([]);
  });

  it('s’arrête à la limite', () => {
    expect(relations([lien('a', 1), lien('b', 2), lien('c', 3)], 2)).toHaveLength(2);
  });
});

describe('publishedRange', () => {
  it('rend les dates ISO telles quelles', () => {
    expect(
      publishedRange({ published: { start_date: '1997-07-22', end_date: null } } as never),
    ).toBe('1997-07-22 → —');
  });

  it('ne rend rien sans début', () => {
    expect(publishedRange({} as never)).toBe('—');
    expect(publishedRange(null)).toBe('—');
  });
});

describe('countryOf', () => {
  it('déduit le pays du type, là où la réponse est certaine', () => {
    expect(countryOf({ type: 'manhwa' } as never)).toBe('KR');
    expect(countryOf({ type: 'manhua' } as never)).toBe('CN');
    expect(countryOf({ type: 'manga' } as never)).toBe('JP');
  });

  it('ne devine pas pour un roman ou un OEL', () => {
    expect(countryOf({ type: 'novel' } as never)).toBe('—');
    expect(countryOf(null)).toBe('—');
  });
});
