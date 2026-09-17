import { describe, expect, it } from 'vitest';
import { aggregate, animeSpan, counts, numericId, publishers, ratings } from './mangabaka';
import type { MbSeries } from '../api/mangabaka/client';

const serie = (over: Partial<MbSeries> = {}): MbSeries => ({
  id: 3248,
  canonical_url: null,
  rating: null,
  total_chapters: null,
  final_volume: null,
  anime: null,
  publishers: null,
  source: null,
  ...over,
});

describe('ratings', () => {
  it('ramène toutes les notes à la même échelle', () => {
    /* Les valeurs réelles de Vinland Saga : MyAnimeList note sur 10,
       Anime-Planet sur 5. Côte à côte sans normalisation, 4,4 passerait pour
       médiocre à côté d'un 9,09 qui vaut la même chose. */
    const r = ratings(
      serie({
        source: {
          my_anime_list: { rating: 9.09, rating_normalized: 91 },
          anime_planet: { rating: 4.4, rating_normalized: 88 },
        },
      }),
    );
    /* La clé désigne le logo, la pastille sert de repli, et l'URL manque
       ici puisque ces deux-là n'ont pas donné d'identifiant. */
    expect(r).toEqual([
      {
        key: 'my_anime_list',
        label: 'MyAnimeList',
        short: 'MAL',
        color: '#2e51a2',
        score: 91,
        url: undefined,
      },
      {
        key: 'anime_planet',
        label: 'Anime-Planet',
        short: 'AP',
        color: '#1c3867',
        score: 88,
        url: undefined,
      },
    ]);
  });

  it('garde un ordre fixe, pas trié par note', () => {
    // Une liste qui se réarrange empêche de comparer deux œuvres d'un coup d'œil.
    const r = ratings(
      serie({
        source: {
          kitsu: { rating_normalized: 99 },
          my_anime_list: { rating_normalized: 10 },
        },
      }),
    );
    expect(r.map((x) => x.label)).toEqual(['MyAnimeList', 'Kitsu']);
  });

  it('écarte un zéro : ce n’est pas une note, c’est une absence de votes', () => {
    expect(ratings(serie({ source: { anilist: { rating_normalized: 0 } } }))).toEqual([]);
  });

  it('encaisse une source absente ou nulle', () => {
    expect(ratings(serie({ source: { anilist: null, kitsu: {} } }))).toEqual([]);
    expect(ratings(serie())).toEqual([]);
    expect(ratings(null)).toEqual([]);
  });
});

describe('aggregate', () => {
  it('arrondit la moyenne', () => {
    expect(aggregate(serie({ rating: 88.7674285714286 }))).toBe(89);
  });

  it('ne rend rien plutôt qu’un zéro', () => {
    expect(aggregate(serie({ rating: 0 }))).toBeNull();
    expect(aggregate(serie())).toBeNull();
  });
});

describe('animeSpan', () => {
  it('rend le texte tel quel, sans l’interpréter', () => {
    /* Il mêle tomes, chapitres, saisons et parfois épisodes, sans grammaire
       garantie. En tirer une plage structurée reviendrait à deviner. */
    const span = animeSpan(
      serie({
        anime: {
          start: 'Vol 1, Chap 1 (S1) Chap 1-2 adapted in EP 7-8 / Vol 8, Chap 55 (S2)',
          end: 'Vol 8, Chap 54 (S1) / Vol 14, Chap 100 (S2)',
        },
      }),
    );
    expect(span?.start).toContain('(S2)');
    expect(span?.end).toContain('Chap 100');
  });

  it('accepte une fin absente — une adaptation en cours n’en a pas', () => {
    expect(animeSpan(serie({ anime: { start: 'Vol 1, Chap 1', end: '' } }))).toEqual({
      start: 'Vol 1, Chap 1',
      end: null,
    });
  });

  it('ne rend rien sans début : sans lui, la fin ne situe rien', () => {
    expect(animeSpan(serie({ anime: { start: '  ', end: 'Vol 8' } }))).toBeNull();
    expect(animeSpan(serie())).toBeNull();
  });
});

describe('publishers', () => {
  it('met l’éditeur d’origine en tête', () => {
    const p = publishers(
      serie({
        publishers: [
          { name: 'Kodansha USA', type: 'English', note: '' },
          { name: 'Kodansha', type: 'Original', note: '' },
        ],
      }),
    );
    expect(p[0]).toEqual({ name: 'Kodansha', region: 'Original' });
  });

  it('nomme la langue restée sans case, derrière un « Other »', () => {
    // Les valeurs réelles de Vinland Saga et de Chainsaw Man.
    expect(
      publishers(
        serie({
          publishers: [
            { name: 'Carlsen Verlag', type: 'Other', note: 'German' },
            { name: 'Devir', type: 'Other', note: 'Portuguese' },
          ],
        }),
      ),
    ).toEqual([
      { name: 'Carlsen Verlag', region: 'German' },
      { name: 'Devir', region: 'Portuguese' },
    ]);
  });

  it('ne prend pas un détail de parution pour une région', () => {
    /* Le piège de One Piece : `note` est un champ libre, et derrière un type
       qui dit déjà la région elle raconte tout autre chose. */
    expect(
      publishers(
        serie({
          publishers: [
            { name: 'MANGA Plus', type: 'English', note: '1176 Chapters; Ongoing' },
            { name: 'Devir', type: 'Other', note: '3-in-1 Omnibus' },
          ],
        }),
      ),
    ).toEqual([
      { name: 'MANGA Plus', region: 'English' },
      { name: 'Devir', region: '' },
    ]);
  });

  it('n’écrit pas « Other » faute de mieux : la case reste vide', () => {
    expect(
      publishers(serie({ publishers: [{ name: 'Planeta Cómic', type: 'Other', note: '' }] })),
    ).toEqual([{ name: 'Planeta Cómic', region: '' }]);
  });

  it('écarte une entrée sans nom', () => {
    expect(publishers(serie({ publishers: [{ name: '  ', type: 'Original', note: '' }] }))).toEqual(
      [],
    );
    expect(publishers(serie())).toEqual([]);
  });
});

describe('counts', () => {
  it('convertit les chaînes que MangaBaka renvoie', () => {
    /* Les valeurs réelles de One Piece. Elles ressemblent à des nombres dans
       la réponse et n'en sont pas — le `as T` de la couche fetch laisserait
       passer « 1191 » là où un nombre est attendu. */
    expect(counts(serie({ total_chapters: '1191', final_volume: '115' }))).toEqual({
      chapters: 1191,
      volumes: 115,
    });
  });

  it('accepte aussi un nombre, au cas où leur schéma changerait', () => {
    // « The schema is subject to change at any time and without notice. »
    expect(counts(serie({ total_chapters: 232 as unknown as string }))).toEqual({
      chapters: 232,
      volumes: null,
    });
  });

  it('ne rend rien plutôt qu’un compte douteux', () => {
    expect(counts(serie({ total_chapters: '0', final_volume: '  ' }))).toEqual({
      chapters: null,
      volumes: null,
    });
    expect(counts(serie({ total_chapters: 'ongoing' }))).toEqual({ chapters: null, volumes: null });
    expect(counts(serie())).toEqual({ chapters: null, volumes: null });
    expect(counts(null)).toEqual({ chapters: null, volumes: null });
  });
});

describe('ratings — le lien vers chaque base', () => {
  it('construit l’adresse de l’œuvre chez eux', () => {
    /* Les vrais identifiants de Chainsaw Man, vérifiés base par base. */
    const r = ratings(
      serie({
        source: {
          my_anime_list: { id: 116778, rating_normalized: 86 },
          anime_planet: { id: 'chainsaw-man', rating_normalized: 86 },
          anime_news_network: { id: 22369, rating_normalized: 82 },
        },
      }),
    );
    expect(r.map((x) => x.url)).toEqual([
      'https://myanimelist.net/manga/116778',
      'https://www.anime-planet.com/manga/chainsaw-man',
      'https://www.animenewsnetwork.com/encyclopedia/manga.php?id=22369',
    ]);
  });

  it('ne fabrique pas de lien sans identifiant', () => {
    // Un lien mort vaudrait moins que pas de lien.
    expect(
      ratings(serie({ source: { kitsu: { rating_normalized: 85 } } }))[0]?.url,
    ).toBeUndefined();
    expect(
      ratings(serie({ source: { kitsu: { id: '  ', rating_normalized: 85 } } }))[0]?.url,
    ).toBeUndefined();
  });
});

describe('numericId', () => {
  it('ne rend un nombre que si c’en est un', () => {
    /* MangaBaka mêle les deux : AniList numérote, Anime-Planet utilise des
       slugs. Ce qui attend un nombre doit le vérifier. */
    expect(numericId(105778)).toBe(105778);
    expect(numericId('chainsaw-man')).toBeUndefined();
    expect(numericId(0)).toBeUndefined();
    expect(numericId(null)).toBeUndefined();
  });
});
