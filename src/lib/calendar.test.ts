import { describe, expect, it } from 'vitest';
import {
  attachAdn,
  byDay,
  countdown,
  dayKey,
  localTime,
  mainAt,
  mergeReleases,
  shiftWeeks,
  slugTitle,
  toIso,
  weekBounds,
  weekDays,
  weekStart,
  type FrenchRelease,
  type Slot,
} from './calendar';
import type { AdnVideo } from '../api/adn/client';

/**
 * L'arithmétique des dates et le rapprochement de deux catalogues sans
 * identifiant commun : les deux choses de cet onglet qu'on ne peut pas vérifier
 * à l'œil.
 */

const slot = (over: Partial<Slot> & { airingAt: number }): Slot => ({
  mediaId: 1,
  episode: 1,
  origin: 'JP',
  title: 'One Piece',
  cover: null,
  format: 'TV',
  streams: [],
  fr: [],
  ...over,
});

const sortie = (over: Partial<FrenchRelease> & { at: string }): FrenchRelease => ({
  platform: 'Crunchyroll',
  languages: ['vostf'],
  approx: false,
  ...over,
});

describe('weekStart', () => {
  it('rend le LUNDI de la semaine', () => {
    // Mercredi 9 septembre 2026 → lundi 7.
    expect(dayKey(weekStart(new Date(2026, 8, 9, 15, 30)))).toBe('2026-09-07');
  });

  it('ne saute pas la semaine un DIMANCHE', () => {
    /* `getDay` rend 0 le dimanche : sans décalage, il renverrait au lundi
       suivant et la semaine sauterait. */
    expect(dayKey(weekStart(new Date(2026, 8, 13, 23, 0)))).toBe('2026-09-07');
  });

  it('rend déjà le lundi quand on lui donne un lundi', () => {
    expect(dayKey(weekStart(new Date(2026, 8, 7, 0, 1)))).toBe('2026-09-07');
  });

  it('remonte au mois précédent quand il le faut', () => {
    // Jeudi 1er janvier 2026 → lundi 29 décembre 2025.
    expect(dayKey(weekStart(new Date(2026, 0, 1)))).toBe('2025-12-29');
  });

  it('remet l’heure à minuit', () => {
    const d = weekStart(new Date(2026, 8, 9, 23, 59, 59));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('weekDays et shiftWeeks', () => {
  it('rend sept jours consécutifs', () => {
    const jours = weekDays(weekStart(new Date(2026, 8, 9)));
    expect(jours.map(dayKey)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('avance et recule d’une semaine, par-dessus les mois', () => {
    const debut = weekStart(new Date(2026, 8, 28));
    expect(dayKey(shiftWeeks(debut, 1))).toBe('2026-10-05');
    expect(dayKey(shiftWeeks(debut, -1))).toBe('2026-09-21');
  });

  it('borne la semaine du lundi minuit au lundi suivant', () => {
    const { from, to } = weekBounds(weekStart(new Date(2026, 8, 9)));
    expect(to - from).toBe(7 * 24 * 3600);
    expect(dayKey(new Date(from * 1000))).toBe('2026-09-07');
  });
});

describe('byDay', () => {
  it('range sur le jour LOCAL, pas sur le jour UTC', () => {
    /* Le défaut que ce test protège : un épisode diffusé à Tokyo le vendredi à
       1 h du matin tombe le jeudi soir chez nous, et c'est le jeudi qu'il faut
       l'afficher. Regrouper sur la date UTC le raterait. */
    const local = new Date(2026, 8, 10, 22, 30);
    const par = byDay([slot({ airingAt: Math.floor(local.getTime() / 1000) })]);
    expect([...par.keys()]).toEqual(['2026-09-10']);
  });

  it('trie chaque journée par heure', () => {
    const t = (h: number) => Math.floor(new Date(2026, 8, 9, h).getTime() / 1000);
    const par = byDay([
      slot({ airingAt: t(20), episode: 3 }),
      slot({ airingAt: t(9), episode: 1 }),
      slot({ airingAt: t(14), episode: 2 }),
    ]);
    expect(par.get('2026-09-09')?.map((s) => s.episode)).toEqual([1, 2, 3]);
  });

  it('place l’épisode au jour de sa SORTIE FRANÇAISE quand on la connaît', () => {
    /* Meitantei Precure! : diffusé au Japon le dimanche, en ligne ici le lundi.
       C'est le lundi qu'on le regarde. */
    const dimanche = Math.floor(new Date(2026, 8, 13, 1, 30).getTime() / 1000);
    const lundi = new Date(2026, 8, 14, 3, 30).toISOString();
    const par = byDay([slot({ airingAt: dimanche, fr: [sortie({ at: lundi })] })]);
    expect([...par.keys()]).toEqual(['2026-09-14']);
  });

  it('trie sur l’heure française, pas sur la japonaise', () => {
    const t = (h: number) => Math.floor(new Date(2026, 8, 9, h).getTime() / 1000);
    const fr = (h: number) => [sortie({ at: new Date(2026, 8, 9, h).toISOString() })];
    const par = byDay([
      // Diffusé plus tôt au Japon, mais en ligne plus tard ici.
      slot({ airingAt: t(9), episode: 1, fr: fr(22) }),
      slot({ airingAt: t(14), episode: 2, fr: fr(15) }),
    ]);
    expect(par.get('2026-09-09')?.map((s) => s.episode)).toEqual([2, 1]);
  });
});

describe('toIso', () => {
  it('ramène ADN et LiveChart à la même écriture', () => {
    /* Sans ça, la même sortie annoncée par les deux ne se reconnaîtrait pas,
       et la carte afficherait deux fois ADN 20:00. */
    expect(toIso('2026-09-13T18:00:00Z')).toBe('2026-09-13T18:00:00.000Z');
    expect(toIso('2026-09-13T18:00:00.000000000Z')).toBe('2026-09-13T18:00:00.000Z');
  });

  it('rend null plutôt qu’une date invalide', () => {
    expect(toIso(null)).toBeNull();
    expect(toIso('')).toBeNull();
    expect(toIso('bientôt')).toBeNull();
  });
});

describe('mergeReleases', () => {
  it('réunit la même plateforme à la même minute, et additionne les langues', () => {
    const at = '2026-09-09T14:00:00.000Z';
    const r = mergeReleases([
      sortie({ at, languages: ['vf'] }),
      sortie({ at, languages: ['vostf'] }),
    ]);
    expect(r).toEqual([sortie({ at, languages: ['vostf', 'vf'] })]);
  });

  it('garde deux plateformes, de la plus tôt à la plus tardive', () => {
    const r = mergeReleases([
      sortie({ at: '2026-09-13T20:00:00.000Z' }),
      sortie({ at: '2026-09-13T18:00:00.000Z', platform: 'ADN' }),
    ]);
    expect(r.map((x) => x.platform)).toEqual(['ADN', 'Crunchyroll']);
  });

  it('une estimation qui rencontre une annonce devient une annonce', () => {
    const at = '2026-09-13T18:00:00.000Z';
    expect(mergeReleases([sortie({ at, approx: true }), sortie({ at })])[0]?.approx).toBe(false);
  });
});

describe('mainAt', () => {
  it('prend la première sortie française, sinon la diffusion japonaise', () => {
    expect(mainAt(slot({ airingAt: 1_000 }))).toBe(1_000_000);
    const at = '2026-09-13T18:00:00.000Z';
    expect(mainAt(slot({ airingAt: 1_000, fr: [sortie({ at })] }))).toBe(Date.parse(at));
  });
});

describe('slugTitle', () => {
  it('efface la casse, les accents et la ponctuation', () => {
    expect(slugTitle('Pokémon: The Origin!')).toBe('pokemontheorigin');
    expect(slugTitle('ONE PIECE')).toBe(slugTitle('One Piece'));
  });

  it('rend une chaîne vide plutôt que d’exploser', () => {
    expect(slugTitle(null)).toBe('');
    expect(slugTitle(undefined)).toBe('');
  });
});

describe('attachAdn', () => {
  const video = (over: Partial<AdnVideo> = {}): AdnVideo => ({
    id: 1,
    number: 'Épisode 11',
    shortNumber: '11',
    name: 'À la veille de la pleine lune',
    releaseDate: '2026-09-07T13:30:00Z',
    languages: ['vostf'],
    url: null,
    show: {
      id: 1409,
      title: 'One Piece',
      originalTitle: null,
      shortTitle: null,
      url: 'https://animationdigitalnetwork.com/video/1409',
    },
    ...over,
  });

  it('colle la sortie française sur la bonne diffusion', () => {
    const [r] = attachAdn([slot({ airingAt: 1, episode: 11 })], [video()]);
    expect(r?.fr).toEqual([
      { at: '2026-09-07T13:30:00.000Z', platform: 'ADN', languages: ['vostf'], approx: false },
    ]);
  });

  it('exige que le NUMÉRO corresponde', () => {
    /* ADN publie parfois sept épisodes d'un coup : sans cette condition, la
       sortie de l'épisode 1 se collerait sur la diffusion du 11. */
    const [r] = attachAdn([slot({ airingAt: 1, episode: 11 })], [video({ shortNumber: '1' })]);
    expect(r?.fr).toEqual([]);
  });

  it('rapproche malgré une écriture différente du titre', () => {
    const [r] = attachAdn(
      [slot({ airingAt: 1, episode: 11, title: 'ONE PIECE' })],
      [
        video({
          show: { id: 1, title: 'One Piece!', originalTitle: null, shortTitle: null, url: null },
        }),
      ],
    );
    expect(r?.fr).toHaveLength(1);
  });

  it('essaie AUSSI le titre original et le titre court', () => {
    const v = video({
      show: {
        id: 1,
        title: 'Titre marketing sans rapport',
        originalTitle: 'Meitantei Conan',
        shortTitle: null,
        url: null,
      },
    });
    const [r] = attachAdn([slot({ airingAt: 1, episode: 11, title: 'Meitantei Conan' })], [v]);
    expect(r?.fr).toHaveLength(1);
  });

  it('laisse la diffusion INTACTE quand rien ne correspond', () => {
    /* Un ratage n'enlève rien : la ligne garde son horaire japonais, elle perd
       seulement la mention française. */
    const entree = slot({ airingAt: 1, episode: 11, title: 'Série inconnue d’ADN' });
    const [r] = attachAdn([entree], [video()]);
    expect(r).toEqual(entree);
  });

  it('ignore une mise en ligne sans date', () => {
    const [r] = attachAdn([slot({ airingAt: 1, episode: 11 })], [video({ releaseDate: null })]);
    expect(r?.fr).toEqual([]);
  });

  it('ne garde que les langues qu’il sait montrer', () => {
    const [r] = attachAdn(
      [slot({ airingAt: 1, episode: 11 })],
      [video({ languages: ['vf', 'vostfr-hd', 'vostf'] })],
    );
    expect(r?.fr[0]?.languages).toEqual(['vostf', 'vf']);
  });
});

describe('localTime', () => {
  it('écrit sur 24 heures, et minuit et demi comme 00:30', () => {
    /* `hour12: false` rend « 24:30 » sur certains moteurs ; `h23` non. La date
       est construite à l'heure LOCALE, donc le test ne dépend pas du fuseau. */
    const s = (h: number, m: number) => Math.floor(new Date(2026, 8, 13, h, m).getTime() / 1000);
    expect(localTime(s(0, 30))).toBe('00:30');
    expect(localTime(s(20, 0))).toBe('20:00');
  });
});

describe('countdown', () => {
  const t = 1_800_000_000;

  it('compte en minutes, en heures, puis en jours', () => {
    expect(countdown(t, t * 1000 - 30 * 60_000)).toBe('in 30m');
    expect(countdown(t, t * 1000 - 5 * 3_600_000)).toBe('in 5h');
    expect(countdown(t, t * 1000 - 3 * 86_400_000)).toBe('in 3d');
  });

  it('ne dit RIEN pour ce qui est passé', () => {
    // La date suffit ; « il y a 4 jours » sur une grille de semaine est du bruit.
    expect(countdown(t, t * 1000)).toBeNull();
    expect(countdown(t, t * 1000 + 60_000)).toBeNull();
  });
});
