import { describe, expect, it } from 'vitest';
import {
  alignedRelease,
  indexAbsoluteGroup,
  indexSeason,
  pickAbsoluteGroup,
  matchShow,
  searchQuery,
  stillUrl,
  tmdbTarget,
  type TmdbCandidate,
  type TmdbEpisode,
  type TmdbGroup,
} from './tmdb';

const ep = (n: number, extra: Partial<TmdbEpisode> = {}): TmdbEpisode => ({
  episode_number: n,
  name: `Titre ${n}`,
  overview: `Synopsis ${n}`,
  still_path: `/img${n}.jpg`,
  air_date: '2013-04-07',
  ...extra,
});

describe('tmdbTarget', () => {
  it('lit les trois formes de la table', () => {
    expect(tmdbTarget([37854])).toEqual({ id: 37854, offset: 0 });
    expect(tmdbTarget([1429, 1])).toEqual({ id: 1429, season: 1, offset: 0 });
    expect(tmdbTarget([1429, 3, 12])).toEqual({ id: 1429, season: 3, offset: 12 });
  });

  it('refuse une entrée absente ou vide', () => {
    expect(tmdbTarget(undefined)).toBeNull();
    expect(tmdbTarget([])).toBeNull();
    expect(tmdbTarget([0])).toBeNull();
  });
});

describe('pickAbsoluteGroup', () => {
  const groupe = (name: string, count: number, type = 2): TmdbGroup => ({
    id: name,
    name,
    type,
    episode_count: count,
  });

  it('choisit par le nombre, pas par le nom', () => {
    /* Le cas réel de One Piece : « With Specials » décale tout d'un cran,
       « No Specials » tombe juste. Vérifié aux épisodes 1 et 1 000. */
    const choisi = pickAbsoluteGroup(
      [groupe('Absolute (With Specials)', 1220), groupe('Absolute (No Specials)', 1181)],
      1181,
    );
    expect(choisi?.name).toBe('Absolute (No Specials)');
  });

  it('ignore les groupes qui ne sont pas de type absolu', () => {
    expect(pickAbsoluteGroup([groupe('DVD Order', 1181, 3)], 1181)).toBeNull();
  });

  it('tolère un petit écart', () => {
    // Naruto : 220 épisodes annoncés, groupe absolu de 222.
    expect(pickAbsoluteGroup([groupe('Absolute Order', 222)], 220)?.episode_count).toBe(222);
  });

  it('refuse un groupe trop éloigné plutôt que d’aligner de travers', () => {
    /* Detective Conan a un groupe « China Online Version » de 1 189 épisodes
       qui n'est pas sa numérotation. Sur un titre court, un tel écart doit
       être écarté. */
    expect(pickAbsoluteGroup([groupe('China Online Version', 1189)], 26)).toBeNull();
    expect(pickAbsoluteGroup([groupe('Autre', 40)], 26)).toBeNull();
  });

  it('ne renvoie rien sans groupe absolu ni total connu', () => {
    expect(pickAbsoluteGroup([], 100)).toBeNull();
    expect(pickAbsoluteGroup([groupe('Absolute', 100)], 0)).toBeNull();
  });
});

describe('indexSeason', () => {
  it('garde la numérotation quand il n’y a pas de décalage', () => {
    const m = indexSeason([ep(1), ep(2)]);
    expect([...m.keys()]).toEqual([1, 2]);
    expect(m.get(1)?.title).toBe('Titre 1');
  });

  it('applique le décalage d’une saison scindée', () => {
    /* Attack on Titan saison 3 partie 2 : son épisode 1 est le treizième de
       la saison TMDB. */
    const m = indexSeason([ep(13), ep(14)], 12);
    expect([...m.keys()]).toEqual([1, 2]);
    expect(m.get(1)?.title).toBe('Titre 13');
  });

  it('découpe trois saisons AniList dans UNE saison TMDB', () => {
    /* Le bug signalé : TMDB range les saisons d'Oshi no Ko dans une seule
       saison de 35 épisodes. Sans décalage, les saisons 2 et 3 affichaient
       les épisodes de la première. */
    const saisonTmdb = Array.from({ length: 35 }, (_, i) => ep(i + 1));
    expect(indexSeason(saisonTmdb, 0).get(1)?.title).toBe('Titre 1');
    expect(indexSeason(saisonTmdb, 11).get(1)?.title).toBe('Titre 12');
    expect(indexSeason(saisonTmdb, 24).get(1)?.title).toBe('Titre 25');
    // Et chacune s'arrête bien où commence la suivante.
    expect(indexSeason(saisonTmdb, 11).get(13)?.title).toBe('Titre 24');
  });

  it('jette ce qui tombe avant le début de la fiche', () => {
    const m = indexSeason([ep(1), ep(12), ep(13)], 12);
    expect([...m.keys()]).toEqual([1]);
  });

  it('construit l’adresse de la vignette et nettoie les champs vides', () => {
    const m = indexSeason([ep(1, { name: '  ', overview: '', still_path: null, air_date: '' })]);
    expect(m.get(1)).toEqual({
      title: undefined,
      synopsis: undefined,
      still: undefined,
      aired: undefined,
    });
  });
});

describe('indexAbsoluteGroup', () => {
  it('numérote par la POSITION, pas par episode_number', () => {
    /* Le piège : dans un groupe absolu, `episode_number` reste relatif à la
       saison d'origine et recommence à 1 vingt-trois fois sur One Piece. */
    const m = indexAbsoluteGroup([
      { episodes: [ep(1), ep(2), ep(3)] },
      { episodes: [ep(1), ep(2)] },
    ]);
    expect([...m.keys()]).toEqual([1, 2, 3, 4, 5]);
    expect(m.get(4)?.title).toBe('Titre 1');
  });

  it('supporte un groupe vide', () => {
    expect(indexAbsoluteGroup([{ episodes: [] }, {}]).size).toBe(0);
  });
});

describe('stillUrl', () => {
  it('préfixe le chemin TMDB', () => {
    expect(stillUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w300/abc.jpg');
  });

  it('ne fabrique rien sans chemin', () => {
    expect(stillUrl(null)).toBeUndefined();
    expect(stillUrl(undefined)).toBeUndefined();
  });
});

describe('searchQuery', () => {
  it('retire le suffixe d’année qu’AniList ajoute', () => {
    /* Sans ça, TMDB renvoyait zéro résultat sur « False Memory (2026) ». */
    expect(searchQuery('False Memory (2026)')).toBe('False Memory');
    expect(searchQuery('記憶管理局 (2026)')).toBe('記憶管理局');
  });

  it('ne touche pas à une parenthèse qui n’est pas une année', () => {
    expect(searchQuery('Hunter x Hunter (2011 version)')).toBe('Hunter x Hunter (2011 version)');
    expect(searchQuery('Steins;Gate')).toBe('Steins;Gate');
  });
});

describe('matchShow', () => {
  const c = (id: number, name: string, orig: string, date: string): TmdbCandidate => ({
    id,
    name,
    original_name: orig,
    first_air_date: date,
  });

  const falseMemory = c(280564, 'False Memory', '记忆管理局', '2026-08-02');

  it('retrouve la série par son titre anglais ou original', () => {
    expect(matchShow([falseMemory], ['False Memory (2026)'], 2026)?.id).toBe(280564);
    expect(matchShow([falseMemory], ['记忆管理局 (2026)'], 2026)?.id).toBe(280564);
  });

  it('tolère la ponctuation et la casse', () => {
    expect(
      matchShow([c(1, 'Steins;Gate', 'シュタインズ・ゲート', '2011-04-06')], ['steins gate'], 2011)
        ?.id,
    ).toBe(1);
  });

  it('refuse un titre qui ne correspond pas', () => {
    expect(matchShow([falseMemory], ['Autre chose'], 2026)).toBeNull();
  });

  it('refuse une année trop éloignée', () => {
    // Un remake porte souvent le même titre : l'année est le seul garde-fou.
    expect(matchShow([falseMemory], ['False Memory'], 2015)).toBeNull();
  });

  it('accepte un an d’écart — une série de fin décembre bascule d’année', () => {
    expect(matchShow([falseMemory], ['False Memory'], 2025)?.id).toBe(280564);
  });

  it('renonce quand plusieurs candidats se valent', () => {
    const doublon = [
      c(1, 'Bleach', 'BLEACH', '2004-10-05'),
      c(2, 'Bleach', 'BLEACH', '2004-10-05'),
    ];
    expect(matchShow(doublon, ['Bleach'], 2004)).toBeNull();
  });

  it('départage par l’année exacte quand c’est possible', () => {
    const deux = [c(1, 'Bleach', 'BLEACH', '2004-10-05'), c(2, 'Bleach', 'BLEACH', '2022-10-11')];
    expect(matchShow(deux, ['Bleach'], 2022)?.id).toBe(2);
  });

  it('ne cherche rien sans titre exploitable', () => {
    expect(matchShow([falseMemory], [null, undefined, '  '], 2026)).toBeNull();
  });
});

describe('alignedRelease', () => {
  it('accepte le jour même et un écart de listing', () => {
    expect(alignedRelease('2019-01-12', '2019-01-12')).toBe(true);
    // Evangelion : AniList le 3 octobre 1995, TMDB le 4.
    expect(alignedRelease('1995-10-04', '1995-10-03')).toBe(true);
  });

  it('refuse un décalage de saison', () => {
    /* Le cas Kaguya-sama : la saison 2 commence quinze mois après la
       première. Un mauvais alignement se compte en mois, jamais en jours. */
    expect(alignedRelease('2019-01-12', '2020-04-11')).toBe(false);
    expect(alignedRelease('2022-04-09', '2019-01-12')).toBe(false);
  });

  it('ne juge pas ce qu’il ne peut pas comparer', () => {
    // Une saison annoncée n'a pas encore de date : ce n'est pas une erreur.
    expect(alignedRelease(undefined, '2026-01-01')).toBe(true);
    expect(alignedRelease('2026-01-01', null)).toBe(true);
    expect(alignedRelease('pas une date', '2026-01-01')).toBe(true);
  });
});

describe('note d’épisode', () => {
  it('retient la note, les votes et la durée', () => {
    const m = indexSeason([{ episode_number: 1, vote_average: 8.8, vote_count: 212, runtime: 24 }]);
    expect(m.get(1)).toMatchObject({ rating: 8.8, votes: 212, runtime: 24 });
  });

  it('ignore une note que personne n’a donnée', () => {
    /* TMDB renvoie 0 quand aucun vote n'a été enregistré. L'afficher ferait
       passer un épisode pour détesté. */
    const m = indexSeason([{ episode_number: 1, vote_average: 0, vote_count: 0 }]);
    expect(m.get(1)?.rating).toBeUndefined();
    expect(m.get(1)?.votes).toBeUndefined();
  });
});
