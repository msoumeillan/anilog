import { describe, expect, it } from 'vitest';
import {
  anilistIdOf,
  attachLiveChart,
  frenchLanguages,
  frenchReleases,
  pickLiveChartId,
  platformIcon,
  platformName,
  type LcRelease,
} from './livechart';
import type { FrenchRelease, Slot } from './calendar';
import type { RawLcRelease, RawLcSchedule } from '../api/livechart/client';

/**
 * Les fixtures reprennent des réponses RÉELLES de LiveChart, relevées le 11
 * septembre 2026 — One Piece, Re:Zero, Ghost in the Shell. Pas une forme
 * supposée : leur schéma ne s'introspecte pas, et c'est exactement l'erreur
 * qui avait fait échouer le premier import MyAnimeList.
 */

const sortieBrute = (date: string, episode: number, size = 1): RawLcRelease => ({
  date,
  timeIsApproximate: false,
  numberRange: { minNumber: episode, size },
});

const calendrier = (over: Partial<RawLcSchedule> = {}): RawLcSchedule => ({
  applicableToViewer: true,
  network: { name: 'Crunchyroll' },
  tracks: [
    { type: 'SUBTITLES', languageCode: 'fr' },
    { type: 'AUDIO', languageCode: 'ja' },
  ],
  releaseState: {
    previousRelease: sortieBrute('2026-09-06T20:00:00.000000000Z', 1177),
    nextRelease: sortieBrute('2026-09-13T20:00:00.000000000Z', 1178),
  },
  ...over,
});

/** La diffusion japonaise : pas de plateforme, audio japonais seul. */
const diffusionJaponaise = calendrier({
  applicableToViewer: false,
  network: null,
  tracks: [{ type: 'AUDIO', languageCode: 'ja' }],
});

describe('anilistIdOf', () => {
  it('lit l’identifiant d’un lien AniList', () => {
    expect(anilistIdOf('https://anilist.co/anime/21')).toBe(21);
    expect(anilistIdOf('https://anilist.co/anime/21/One-Piece/')).toBe(21);
  });

  it('ne confond pas 21 et 210', () => {
    expect(anilistIdOf('https://anilist.co/anime/210')).toBe(210);
  });

  it('rend null sans lien AniList', () => {
    expect(anilistIdOf(null)).toBeNull();
    expect(anilistIdOf('https://myanimelist.net/anime/21')).toBeNull();
  });
});

describe('pickLiveChartId', () => {
  it('choisit par le lien AniList, JAMAIS par le rang', () => {
    /* « One Piece » rend d'abord… le bon, ici, mais aussi son remake et ses
       films : le rang ne prouve rien. */
    const nodes = [
      { databaseId: '12460', anilistUrl: 'https://anilist.co/anime/171630' },
      { databaseId: '321', anilistUrl: 'https://anilist.co/anime/21' },
    ];
    expect(pickLiveChartId(nodes, 21)).toBe('321');
  });

  it('rend null quand aucun résultat ne pointe vers la série', () => {
    expect(
      pickLiveChartId([{ databaseId: '3830', anilistUrl: 'https://anilist.co/anime/12859' }], 21),
    ).toBeNull();
    expect(pickLiveChartId(null, 21)).toBeNull();
  });
});

describe('platformName', () => {
  it('raccourcit ce qui ne tient pas sur une carte', () => {
    expect(platformName('Animation Digital Network')).toBe('ADN');
    expect(platformName('Crunchyroll')).toBe('Crunchyroll');
    expect(platformName(null)).toBe('TV');
  });
});

describe('platformIcon', () => {
  // Extrait du catalogue réel d'AniList, relevé le 11 septembre 2026.
  const sources = [
    { site: 'Crunchyroll', icon: 'https://s4.anilist.co/cr.png', color: '#F88B24' },
    { site: 'Amazon Prime Video', icon: 'https://s4.anilist.co/apv.png', color: '#FF9900' },
    { site: 'Prime Video', icon: 'https://s4.anilist.co/pv.png', color: '#1A98FF' },
    { site: 'Disney Plus', icon: 'https://s4.anilist.co/dp.png', color: '#21037C' },
    { site: 'Mangamillion', icon: null, color: null },
  ];

  it('retrouve une plateforme écrite pareil chez les deux', () => {
    expect(platformIcon('Crunchyroll', sources)).toEqual({
      icon: 'https://s4.anilist.co/cr.png',
      color: '#F88B24',
    });
  });

  it('prend « Prime Video », pas l’ancien « Amazon Prime Video »', () => {
    expect(platformIcon('Prime Video', sources)?.icon).toBe('https://s4.anilist.co/pv.png');
  });

  it('traduit les noms que LiveChart écrit autrement', () => {
    expect(platformIcon('Disney+', sources)?.icon).toBe('https://s4.anilist.co/dp.png');
  });

  it('porte lui-même le logo d’ADN, qu’AniList ne connaît pas', () => {
    const adn = platformIcon('ADN', []);
    expect(adn?.color).toBe('#0095FF');
    expect(adn?.icon.startsWith('data:image/svg+xml,')).toBe(true);
    // Repeint en blanc, comme les pictogrammes d'AniList.
    expect(decodeURIComponent(adn?.icon ?? '')).toContain('fill="#fff"');
  });

  it('ne rend rien pour une plateforme inconnue, ni pour une source sans icône', () => {
    expect(platformIcon('BBC iPlayer', sources)).toBeNull();
    expect(platformIcon('Mangamillion', sources)).toBeNull();
  });
});

describe('frenchLanguages', () => {
  it('VOSTF pour des sous-titres, VF pour une piste audio', () => {
    expect(
      frenchLanguages([
        { type: 'AUDIO', languageCode: 'fr' },
        { type: 'SUBTITLES', languageCode: 'fr-FR' },
      ]),
    ).toEqual(['vostf', 'vf']);
  });

  it('le français du Québec n’est pas une sortie d’ici', () => {
    expect(frenchLanguages([{ type: 'SUBTITLES', languageCode: 'fr-ca' }])).toEqual([]);
  });

  it('un audio japonais seul n’est rien', () => {
    expect(frenchLanguages([{ type: 'AUDIO', languageCode: 'ja' }])).toEqual([]);
    expect(frenchLanguages(null)).toEqual([]);
  });
});

describe('frenchReleases', () => {
  it('One Piece : ADN puis Crunchyroll, le précédent et le prochain épisode', () => {
    const r = frenchReleases([
      diffusionJaponaise,
      calendrier({
        network: { name: 'Animation Digital Network' },
        releaseState: {
          previousRelease: sortieBrute('2026-09-06T18:00:00.000000000Z', 1177),
          nextRelease: sortieBrute('2026-09-13T18:00:00.000000000Z', 1178),
        },
      }),
      calendrier(),
    ]);
    expect(r.map((x) => `${x.platform} ${x.episode} ${x.at}`)).toEqual([
      'ADN 1177 2026-09-06T18:00:00.000Z',
      'Crunchyroll 1177 2026-09-06T20:00:00.000Z',
      'ADN 1178 2026-09-13T18:00:00.000Z',
      'Crunchyroll 1178 2026-09-13T20:00:00.000Z',
    ]);
  });

  it('écarte un calendrier indisponible ICI, même en français', () => {
    /* One Piece a un calendrier ADN en allemand, et d'autres pays ont leurs
       propres calendriers sous-titrés en français. */
    expect(frenchReleases([calendrier({ applicableToViewer: false })])).toEqual([]);
    expect(frenchReleases([calendrier({ applicableToViewer: null })])).toEqual([]);
  });

  it('écarte un calendrier disponible ici mais sans rien de français', () => {
    const anglais = calendrier({ tracks: [{ type: 'SUBTITLES', languageCode: 'en' }] });
    expect(frenchReleases([anglais])).toEqual([]);
  });

  it('fond les calendriers identiques en une seule sortie', () => {
    // Ghost in the Shell : cinq calendriers Prime Video, un par pays, même minute.
    const prime = calendrier({ network: { name: 'Prime Video' } });
    expect(frenchReleases([prime, prime, prime])).toHaveLength(2);
  });

  it('additionne VOSTF et VF d’une même sortie', () => {
    const vf = calendrier({ tracks: [{ type: 'AUDIO', languageCode: 'fr' }] });
    const r = frenchReleases([calendrier(), vf]);
    expect(r.map((x) => x.languages)).toEqual([
      ['vostf', 'vf'],
      ['vostf', 'vf'],
    ]);
  });

  it('ne fond PAS deux épisodes sortis à la même minute', () => {
    /* Re:Zero, le 9 septembre à 16 h : la VOSTF de l'épisode 16 et la VF de
       l'épisode 13. Ce ne sont pas la même sortie. */
    const vostf = calendrier({
      releaseState: {
        previousRelease: sortieBrute('2026-09-09T14:00:00.000000000Z', 16),
        nextRelease: null,
      },
    });
    const vf = calendrier({
      tracks: [{ type: 'AUDIO', languageCode: 'fr' }],
      releaseState: {
        previousRelease: sortieBrute('2026-09-09T14:00:00.000000000Z', 13),
        nextRelease: null,
      },
    });
    const r = frenchReleases([vostf, vf]);
    expect(r.map((x) => `${x.episode} ${x.languages.join('+')}`)).toEqual(['13 vf', '16 vostf']);
  });

  it('ignore une sortie sans numéro ou sans date lisible', () => {
    const r = frenchReleases([
      calendrier({
        releaseState: {
          previousRelease: {
            date: '2026-09-06T20:00:00Z',
            timeIsApproximate: null,
            numberRange: null,
          },
          nextRelease: sortieBrute('bientôt', 1178),
        },
      }),
    ]);
    expect(r).toEqual([]);
  });

  it('retient une heure donnée pour approximative', () => {
    const r = frenchReleases([
      calendrier({
        releaseState: {
          previousRelease: null,
          nextRelease: { ...sortieBrute('2026-09-13T20:00:00Z', 1178), timeIsApproximate: true },
        },
      }),
    ]);
    expect(r[0]?.approx).toBe(true);
  });
});

describe('attachLiveChart', () => {
  const slot = (over: Partial<Slot> = {}): Slot => ({
    mediaId: 21,
    episode: 1178,
    airingAt: 1_789_308_900,
    origin: 'JP',
    title: 'ONE PIECE',
    cover: null,
    format: 'TV',
    streams: [],
    fr: [],
    ...over,
  });

  const release = (over: Partial<LcRelease> = {}): LcRelease => ({
    episode: 1178,
    size: 1,
    at: '2026-09-13T20:00:00.000Z',
    platform: 'Crunchyroll',
    languages: ['vostf'],
    approx: false,
    ...over,
  });

  it('colle la sortie sur SON épisode, et pas sur le précédent', () => {
    const releases = [release({ episode: 1177, at: '2026-09-06T20:00:00.000Z' }), release()];
    const [r] = attachLiveChart([slot()], () => releases);
    expect(r?.fr.map((x) => x.at)).toEqual(['2026-09-13T20:00:00.000Z']);
  });

  it('une sortie d’un bloc couvre tous ses épisodes', () => {
    // Une saison entière mise en ligne d'un coup, épisodes 1 à 12.
    const [r] = attachLiveChart([slot({ episode: 5 })], () => [release({ episode: 1, size: 12 })]);
    expect(r?.fr).toHaveLength(1);
    const [hors] = attachLiveChart([slot({ episode: 13 })], () => [
      release({ episode: 1, size: 12 }),
    ]);
    expect(hors?.fr).toEqual([]);
  });

  it('se fond avec la même sortie annoncée par ADN', () => {
    /* Mesuré : les 8 heures ADN de LiveChart valent à la minute celles d'ADN.
       La carte ne doit pas afficher deux fois « ADN 20:00 ». */
    const adn: FrenchRelease = {
      at: '2026-09-13T18:00:00.000Z',
      platform: 'ADN',
      languages: ['vostf'],
      approx: false,
    };
    const [r] = attachLiveChart([slot({ fr: [adn] })], () => [
      release({ platform: 'ADN', at: '2026-09-13T18:00:00.000Z' }),
      release(),
    ]);
    expect(r?.fr.map((x) => x.platform)).toEqual(['ADN', 'Crunchyroll']);
  });

  it('laisse l’épisode INTACT quand LiveChart ne sait rien', () => {
    const entree = slot();
    const [r] = attachLiveChart([entree], () => []);
    expect(r).toBe(entree);
  });
});
