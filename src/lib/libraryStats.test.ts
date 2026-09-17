import { describe, expect, it } from 'vitest';
import {
  lastCompleted,
  mediaStats,
  activity,
  byStatus,
  byYear,
  countBy,
  topStudios,
} from './libraryStats';
import { byFinishYear, byLength, scoreSpread, timeSpent, topGenres } from './libraryStats';
import type { LibraryEntry, MediaType, TrackStatus } from '../types/library';

/* La cle est typee : `anime:12` et non un nom libre. Le fixture la fabrique
   a partir du titre, qui sert d'identite dans les assertions. */
const entree = (over: Partial<LibraryEntry> & { title: string }): LibraryEntry =>
  ({
    key: `anime:${over.title}`,
    media: 'anime' as MediaType,
    ids: { anilist: 1 },
    status: 'completed' as TrackStatus,
    progress: { kind: 'anime', episodes: 0 },
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as LibraryEntry;

describe('lastCompleted', () => {
  it('classe par date de fin, la plus récente devant', () => {
    const r = lastCompleted(
      [
        entree({ title: 'a', finishedAt: '2026-03-01T00:00:00.000Z' }),
        entree({ title: 'b', finishedAt: '2026-08-01T00:00:00.000Z' }),
      ],
      'anime',
    );
    expect(r.map((e) => e.title)).toEqual(['b', 'a']);
  });

  it('ne classe PAS sur `updatedAt` : une modification n’est pas une fin', () => {
    /* Le defaut vecu : ajouter une etiquette a un anime termine il y a six
       mois le remettait en tete de « Last completed ». `updatedAt` avance au
       moindre geste ; cette section-ci parle de la date de FIN. */
    const r = lastCompleted(
      [
        entree({
          title: 'fini hier',
          finishedAt: '2026-09-05T00:00:00.000Z',
          updatedAt: '2026-09-05T00:00:00.000Z',
        }),
        entree({
          title: 'fini en mars, retouche ce matin',
          finishedAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-09-06T23:00:00.000Z',
        }),
      ],
      'anime',
    );
    expect(r.map((e) => e.title)).toEqual(['fini hier', 'fini en mars, retouche ce matin']);
  });

  it('garde ce qui n’a pas de date de fin, mais a la fin', () => {
    /* Une entree importee sans date de fin existe : ne pas savoir QUAND elle a
       ete terminee n'est pas une raison de la cacher, ce n'en est pas une non
       plus de la faire passer devant. */
    const r = lastCompleted(
      [
        entree({ title: 'sans date', updatedAt: '2026-09-06T00:00:00.000Z' }),
        entree({ title: 'datee', finishedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      'anime',
    );
    expect(r.map((e) => e.title)).toEqual(['datee', 'sans date']);
  });

  it('ne garde que le média demandé, et que ce qui est terminé', () => {
    const r = lastCompleted(
      [
        entree({ title: 'manga', media: 'manga' }),
        entree({ title: 'en cours', status: 'current' }),
        entree({ title: 'bon' }),
      ],
      'anime',
    );
    expect(r.map((e) => e.title)).toEqual(['bon']);
  });

  it('s’arrête à la limite', () => {
    const beaucoup = [1, 2, 3, 4, 5, 6, 7].map((n) => entree({ title: `t${n}` }));
    expect(lastCompleted(beaucoup, 'anime')).toHaveLength(5);
  });
});

describe('mediaStats', () => {
  it('compte, moyenne et répartit', () => {
    const s = mediaStats(
      [
        entree({ title: 'a', score: 8, progress: { kind: 'anime', episodes: 12 } }),
        entree({ title: 'b', score: 10, progress: { kind: 'anime', episodes: 24 } }),
        entree({ title: 'c', status: 'current' }),
      ],
      'anime',
    );
    expect(s.tracked).toBe(3);
    expect(s.completed).toBe(2);
    expect(s.rated).toBe(2);
    expect(s.mean).toBe(9);
    expect(s.units).toBe(36);
    expect(s.distribution[7]).toBe(1); // la note 8
    expect(s.distribution[9]).toBe(1); // la note 10
  });

  it('garde dix cases, creux compris', () => {
    /* Une courbe a besoin de ses creux : sauter les notes jamais données
       tasserait l'axe et ferait mentir la forme. */
    expect(mediaStats([entree({ title: 'a', score: 5 })], 'anime').distribution).toEqual([
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
    ]);
  });

  it('ne compte pas une entrée sans note comme un zéro', () => {
    // Les compter écraserait la moyenne.
    const s = mediaStats([entree({ title: 'a', score: 9 }), entree({ title: 'b' })], 'anime');
    expect(s.rated).toBe(1);
    expect(s.mean).toBe(9);
  });

  it('ne rend pas de moyenne quand rien n’est noté', () => {
    expect(mediaStats([entree({ title: 'a' })], 'anime').mean).toBeNull();
    expect(mediaStats([], 'anime').mean).toBeNull();
  });
});

describe('countBy', () => {
  it('compte du plus fréquent au plus rare', () => {
    const l = [
      entree({ title: 'a', format: 'TV' }),
      entree({ title: 'b', format: 'TV' }),
      entree({ title: 'c', format: 'MOVIE' }),
    ];
    expect(countBy(l, (e) => e.format)).toEqual([
      { label: 'TV', count: 2 },
      { label: 'MOVIE', count: 1 },
    ]);
  });

  it('départage à égalité par ordre alphabétique', () => {
    /* Sans ça, deux formats à trois œuvres changent de place d'un affichage à
       l'autre selon l'ordre de la table. */
    const l = [entree({ title: 'a', format: 'OVA' }), entree({ title: 'b', format: 'MOVIE' })];
    expect(countBy(l, (e) => e.format).map((p) => p.label)).toEqual(['MOVIE', 'OVA']);
  });

  it('ne compte pas ce qui n’a pas de valeur', () => {
    // « Sans format » n'est pas un format : une barre pour lui inventerait une catégorie.
    const l = [
      entree({ title: 'a' }),
      entree({ title: 'b', format: '  ' }),
      entree({ title: 'c', format: 'TV' }),
    ];
    expect(countBy(l, (e) => e.format)).toEqual([{ label: 'TV', count: 1 }]);
  });
});

describe('byStatus', () => {
  it('rend les cinq statuts, toujours dans le même ordre, zéros compris', () => {
    /* Ce sont cinq cases fixes qu'on lit au même endroit : les trier par
       fréquence rendrait la comparaison entre deux médias impossible. */
    const parts = byStatus([entree({ title: 'a', status: 'dropped' })], 'anime');
    expect(parts.map((p) => p.label)).toEqual([
      'Watching',
      'Completed',
      'Plan to watch',
      'On hold',
      'Dropped',
    ]);
    expect(parts.map((p) => p.count)).toEqual([0, 0, 0, 0, 1]);
  });

  it('parle la langue du média', () => {
    expect(byStatus([], 'manga').map((p) => p.label)).toContain('Plan to read');
  });
});

describe('byYear', () => {
  it('remplit les années vides', () => {
    /* Une année sans rien est une information : la sauter tasserait la frise
       et donnerait l'illusion d'une activité continue. */
    const l = [entree({ title: 'a', seasonYear: 2020 }), entree({ title: 'b', seasonYear: 2023 })];
    expect(byYear(l)).toEqual([
      { label: '2020', count: 1 },
      { label: '2021', count: 0 },
      { label: '2022', count: 0 },
      { label: '2023', count: 1 },
    ]);
  });

  it('rend une frise vide quand aucune entrée n’a d’année', () => {
    expect(byYear([entree({ title: 'a' })])).toEqual([]);
  });

  it('refuse une amplitude aberrante plutôt que de dessiner des siècles', () => {
    const l = [entree({ title: 'a', seasonYear: 1200 }), entree({ title: 'b', seasonYear: 2024 })];
    expect(byYear(l)).toEqual([]);
  });
});

describe('activity', () => {
  const en = (mois: number) => new Date(2026, mois - 1, 15);

  it('rend autant de mois que demandé, en finissant au mois courant', () => {
    /* La frise doit finir MAINTENANT même si rien n'y a été fait, sinon elle
       semble s'arrêter toute seule. */
    const a = activity([], 6, en(9));
    expect(a).toHaveLength(6);
    expect(a[0]?.key).toBe('2026-04');
    expect(a[5]?.key).toBe('2026-09');
  });

  it('compte les fins et les épisodes SÉPARÉMENT', () => {
    /* Terminer est un évènement rare, cocher un épisode le geste quotidien :
       une seule courbe ne dirait ni l'un ni l'autre. */
    const l = [
      entree({
        title: 'a',
        finishedAt: '2026-08-20T00:00:00.000Z',
        episodes: {
          1: { watchedAt: ['2026-08-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'], updatedAt: '' },
          2: { watchedAt: ['2026-08-03T00:00:00.000Z'], updatedAt: '' },
        },
      }),
    ];
    const a = activity(l, 3, en(9));
    expect(a.find((m) => m.key === '2026-08')).toEqual({
      key: '2026-08',
      completed: 1,
      episodes: 2,
    });
    expect(a.find((m) => m.key === '2026-09')).toEqual({
      key: '2026-09',
      completed: 0,
      episodes: 1,
    });
  });

  it('ignore ce qui tombe hors de la fenêtre', () => {
    const l = [entree({ title: 'a', finishedAt: '2019-01-01T00:00:00.000Z' })];
    expect(activity(l, 3, en(9)).every((m) => m.completed === 0)).toBe(true);
  });
});
describe('topStudios', () => {
  it('compte les studios des animes suivis', () => {
    expect(
      topStudios([
        entree({ title: 'a', studio: 'MAPPA' }),
        entree({ title: 'b', studio: 'MAPPA' }),
        entree({ title: 'c', studio: 'Wit Studio' }),
      ]),
    ).toEqual([
      { studio: 'MAPPA', count: 2 },
      { studio: 'Wit Studio', count: 1 },
    ]);
  });

  it('ignore le manga : il n’a pas de studio d’animation', () => {
    /* Les compter ensemble ferait un classement qui ne veut rien dire. */
    expect(topStudios([entree({ title: 'm', media: 'manga', studio: 'Kodansha' })])).toEqual([]);
  });

  it('départage à égalité par ordre alphabétique', () => {
    // Sinon le classement changerait d'un affichage à l'autre.
    expect(
      topStudios([
        entree({ title: 'a', studio: 'Wit Studio' }),
        entree({ title: 'b', studio: 'Bones' }),
      ]).map((s) => s.studio),
    ).toEqual(['Bones', 'Wit Studio']);
  });

  it('encaisse une entrée sans studio', () => {
    expect(topStudios([entree({ title: 'a' })])).toEqual([]);
  });
});

describe('scoreSpread', () => {
  it('vaut zéro quand tout est noté pareil', () => {
    const l = [7, 7, 7, 7].map((score, i) => entree({ title: `t${i}`, score }));
    expect(scoreSpread(l, 'anime')).toBe(0);
  });

  it('grandit quand les notes s’écartent, à moyenne égale', () => {
    /* C'est tout l'interêt du chiffre : ces deux bibliothèques ont la même
       moyenne de 7 et n'ont rien en commun. */
    const serre = [6, 7, 7, 8].map((score, i) => entree({ title: `s${i}`, score }));
    const large = [4, 6, 8, 10].map((score, i) => entree({ title: `l${i}`, score }));
    const a = scoreSpread(serre, 'anime');
    const b = scoreSpread(large, 'anime');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b ?? 0).toBeGreaterThan(a ?? 0);
  });

  it('rend `null` sous deux notes', () => {
    /* L'écart d'une seule valeur vaut zéro, ce qui se lirait comme « il note
       toujours pareil » alors qu'il n'a noté qu'une fois. */
    expect(scoreSpread([entree({ title: 'seul', score: 8 })], 'anime')).toBeNull();
    expect(scoreSpread([], 'anime')).toBeNull();
  });

  it('ignore les entrées non notées au lieu de les compter zéro', () => {
    const l = [entree({ title: 'a', score: 7 }), entree({ title: 'b' }), entree({ title: 'c' })];
    expect(scoreSpread(l, 'anime')).toBeNull();
  });
});

describe('byFinishYear', () => {
  it('compte les années où l’on a terminé, sans trou', () => {
    const l = [
      entree({ title: 'a', finishedAt: '2023-05-01T12:00:00.000Z' }),
      entree({ title: 'b', finishedAt: '2025-01-01T12:00:00.000Z' }),
      entree({ title: 'c', finishedAt: '2025-09-01T12:00:00.000Z' }),
    ];
    expect(byFinishYear(l, 'anime')).toEqual([
      { label: '2023', count: 1 },
      { label: '2024', count: 0 },
      { label: '2025', count: 2 },
    ]);
  });

  it('n’invente pas d’année pour ce qui n’a pas de date de fin', () => {
    /* Prendre `updatedAt` faute de mieux fabriquerait un passé : une entrée
       corrigée ce matin n'a pas été terminée ce matin. */
    const l = [entree({ title: 'sans date', updatedAt: '2026-09-06T00:00:00.000Z' })];
    expect(byFinishYear(l, 'anime')).toEqual([]);
  });

  it('ne mélange pas les deux médias', () => {
    const l = [
      entree({ title: 'a', finishedAt: '2025-01-01T12:00:00.000Z' }),
      entree({ title: 'm', media: 'manga', finishedAt: '2025-01-01T12:00:00.000Z' }),
    ];
    expect(byFinishYear(l, 'manga')).toEqual([{ label: '2025', count: 1 }]);
  });
});

describe('byLength', () => {
  it('range les œuvres par longueur annoncée', () => {
    const l = [
      entree({ title: 'film', totalUnits: 1 }),
      entree({ title: 'saison', totalUnits: 12 }),
      entree({ title: 'autre saison', totalUnits: 13 }),
      entree({ title: 'fleuve', totalUnits: 1100 }),
    ];
    const r = byLength(l, 'anime');
    expect(r.find((p) => p.label === '1')?.count).toBe(1);
    expect(r.find((p) => p.label === '7–16')?.count).toBe(2);
    expect(r.find((p) => p.label === '101+')?.count).toBe(1);
  });

  it('garde les creux du milieu et coupe les bouts vides', () => {
    /* Un creux entre deux tranches pleines est une information ; trois cases à
       zéro au bout n'en sont pas une. */
    const l = [entree({ title: 'a', totalUnits: 12 }), entree({ title: 'b', totalUnits: 50 })];
    expect(byLength(l, 'anime').map((p) => p.label)).toEqual(['7–16', '17–28', '29–55']);
  });

  it('compte à part ce qui n’a pas de total, et le met en dernier', () => {
    /* Ranger une série en cours dans « 1 » la ferait passer pour un
       court-métrage. */
    const l = [entree({ title: 'a', totalUnits: 12 }), entree({ title: 'en cours' })];
    const r = byLength(l, 'anime');
    expect(r[r.length - 1]).toEqual({ label: 'Unknown', count: 1 });
  });

  it('n’a pas la même échelle pour le manga', () => {
    // Cent chapitres est un format courant ; cent épisodes, un monument.
    const l = [entree({ title: 'm', media: 'manga', totalUnits: 100 })];
    expect(byLength(l, 'manga').map((p) => p.label)).toEqual(['61–100']);
  });

  it('rend une liste vide quand il n’y a rien du tout', () => {
    expect(byLength([], 'anime')).toEqual([]);
  });
});

describe('topGenres', () => {
  it('compte une œuvre dans CHACUN de ses genres', () => {
    /* La somme dépasse donc le nombre d'œuvres : c'est voulu, et c'est
       pourquoi ce n'est pas un camembert. */
    const l = [
      entree({ title: 'a', genres: ['Action', 'Comedy'] }),
      entree({ title: 'b', genres: ['Action'] }),
    ];
    expect(topGenres(l, 'anime')).toEqual([
      { genre: 'Action', count: 2, mean: null },
      { genre: 'Comedy', count: 1, mean: null },
    ]);
  });

  it('donne la moyenne DANS le genre', () => {
    // Regarder beaucoup un genre et l'aimer sont deux choses différentes.
    const l = [
      entree({ title: 'a', genres: ['Horror'], score: 4 }),
      entree({ title: 'b', genres: ['Horror'], score: 6 }),
      entree({ title: 'c', genres: ['Horror'] }),
    ];
    expect(topGenres(l, 'anime')[0]).toEqual({ genre: 'Horror', count: 3, mean: 5 });
  });

  it('départage les égalités par ordre alphabétique', () => {
    const l = [entree({ title: 'a', genres: ['Drama', 'Action'] })];
    expect(topGenres(l, 'anime').map((g) => g.genre)).toEqual(['Action', 'Drama']);
  });

  it('encaisse les entrées sans genres', () => {
    expect(topGenres([entree({ title: 'a' })], 'anime')).toEqual([]);
  });
});

describe('timeSpent', () => {
  it('multiplie la durée annoncée par les épisodes VUS', () => {
    const l = [
      entree({ title: 'a', duration: 24, progress: { kind: 'anime', episodes: 12 } }),
      entree({ title: 'b', duration: 5, progress: { kind: 'anime', episodes: 10 } }),
    ];
    expect(timeSpent(l)).toEqual({ minutes: 24 * 12 + 50, titles: 2, unknown: 0 });
  });

  it('signale ce qu’il ne peut pas compter au lieu de l’estimer', () => {
    /* Compter une série sans durée à vingt-quatre minutes l'épisode donnerait
       un total plus faux qu'un total incomplet. */
    const l = [
      entree({ title: 'connue', duration: 24, progress: { kind: 'anime', episodes: 2 } }),
      entree({ title: 'inconnue', progress: { kind: 'anime', episodes: 50 } }),
    ];
    expect(timeSpent(l)).toEqual({ minutes: 48, titles: 1, unknown: 1 });
  });

  it('ne compte pas ce qu’on n’a pas commencé', () => {
    const l = [entree({ title: 'a voir', duration: 24, progress: { kind: 'anime', episodes: 0 } })];
    expect(timeSpent(l)).toEqual({ minutes: 0, titles: 0, unknown: 0 });
  });

  it('laisse le manga de côté : personne ne sait combien dure un chapitre', () => {
    const l = [
      entree({
        title: 'm',
        media: 'manga',
        duration: 24,
        progress: { kind: 'manga', chapters: 100, volumes: 10 },
      }),
    ];
    expect(timeSpent(l)).toEqual({ minutes: 0, titles: 0, unknown: 0 });
  });
});
