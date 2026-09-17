import { describe, expect, it } from 'vitest';
import { airedCount, upNextRow, upNextRows, type AiringFacts } from './upNext';
import type { LibraryEntry } from '../types/library';

/**
 * Le retard est une soustraction, et c'est bien pour ça qu'il faut le tester :
 * un retard faux ne se voit pas à l'œil, il se lit comme une dette qu'on n'a
 * pas — ou pire, il en cache une.
 */

const MAINTENANT = Date.parse('2026-09-12T12:00:00.000Z');
const ilYA = (jours: number) => new Date(MAINTENANT - jours * 86_400_000).toISOString();

const entree = (over: Partial<LibraryEntry> & { title: string }): LibraryEntry =>
  ({
    key: `anime:${over.title}`,
    media: 'anime',
    ids: { anilist: 1 },
    status: 'current',
    progress: { kind: 'anime', episodes: 0 },
    addedAt: ilYA(200),
    updatedAt: ilYA(1),
    ...over,
  }) as LibraryEntry;

const faits = (over: Partial<AiringFacts> = {}): AiringFacts => ({
  episodes: 12,
  status: 'RELEASING',
  nextAiringEpisode: { episode: 9, airingAt: 1_789_000_000 },
  ...over,
});

describe('airedCount', () => {
  it('déduit les sorties du prochain épisode annoncé', () => {
    // L'épisode 9 arrive : huit sont sortis.
    expect(airedCount(faits())).toBe(8);
  });

  it('compte TOUT sur une série finie', () => {
    expect(airedCount(faits({ status: 'FINISHED', nextAiringEpisode: null }))).toBe(12);
  });

  it('ne sait rien d’une série en cours sans grille annoncée', () => {
    /* Une pause, ou une grille non publiée : le total annoncé reste une
       promesse. Dire « 12 sortis » inventerait un retard. */
    expect(airedCount(faits({ nextAiringEpisode: null }))).toBeNull();
    expect(
      airedCount(faits({ status: 'NOT_YET_RELEASED', nextAiringEpisode: null, episodes: 24 })),
    ).toBeNull();
  });

  it('ne sait rien sans fiche du tout', () => {
    // AniList n'a pas encore répondu : la carte montrera la progression, pas une dette.
    expect(airedCount(undefined)).toBeNull();
  });

  it('rend zéro plutôt qu’un négatif sur un premier épisode à venir', () => {
    expect(airedCount(faits({ nextAiringEpisode: { episode: 1, airingAt: 0 } }))).toBe(0);
  });
});

describe('upNextRow', () => {
  it('compte ce qui attend et nomme le prochain à voir', () => {
    const r = upNextRow(
      entree({ title: 'One Piece', progress: { kind: 'anime', episodes: 5 } }),
      faits(),
      MAINTENANT,
    );
    expect([r.aired, r.waiting, r.next]).toEqual([8, 3, 6]);
  });

  it('prend le total du réseau, et celui de la copie locale à défaut', () => {
    const e = entree({ title: 'Sans réseau', totalUnits: 26 });
    expect(upNextRow(e, faits(), MAINTENANT).total).toBe(12);
    expect(upNextRow(e, undefined, MAINTENANT).total).toBe(26);
  });

  it('dit « à jour » sans prochain à voir', () => {
    const r = upNextRow(
      entree({ title: 'À jour', progress: { kind: 'anime', episodes: 8 } }),
      faits(),
      MAINTENANT,
    );
    expect([r.waiting, r.next]).toEqual([0, null]);
    expect(r.upcoming?.episode).toBe(9);
  });

  it('n’affiche jamais un retard négatif', () => {
    /* Coché plus loin que la grille — une avant-première, un décalage chez
       eux. « -2 en attente » n'aurait aucun sens. */
    const r = upNextRow(
      entree({ title: 'En avance', progress: { kind: 'anime', episodes: 10 } }),
      faits(),
      MAINTENANT,
    );
    expect([r.waiting, r.next]).toEqual([0, null]);
  });

  it('laisse le retard inconnu quand les sorties le sont', () => {
    const r = upNextRow(
      entree({ title: 'Sans grille', progress: { kind: 'anime', episodes: 3 } }),
      undefined,
      MAINTENANT,
    );
    expect([r.aired, r.waiting, r.next]).toEqual([null, null, null]);
    expect(r.watched).toBe(3);
  });

  it('range à part ce qu’on n’a pas touché depuis un mois', () => {
    const vieille = entree({ title: 'Mise de côté', updatedAt: ilYA(40) });
    expect(upNextRow(vieille, faits(), MAINTENANT).group).toBe('dormant');
    expect(upNextRow(entree({ title: 'Hier' }), faits(), MAINTENANT).group).toBe('now');
    /* À jour, un mois sans y toucher ne veut plus rien dire : il n'y a rien à
       rattraper. */
    const aJour = entree({
      title: 'À jour depuis longtemps',
      progress: { kind: 'anime', episodes: 8 },
      updatedAt: ilYA(40),
    });
    expect(upNextRow(aJour, faits(), MAINTENANT).group).toBe('clear');
  });
});

describe('upNextRows', () => {
  it('met devant ce qui attend, puis ce qui dort, puis ce qui est à jour', () => {
    const rows = upNextRows(
      [
        entree({ title: 'À jour', progress: { kind: 'anime', episodes: 8 } }),
        entree({ title: 'Inconnue', ids: {} }),
        entree({ title: 'En sommeil', updatedAt: ilYA(40) }),
        entree({ title: 'En cours' }),
      ],
      (e) => (e.ids.anilist ? faits() : undefined),
      MAINTENANT,
    );
    expect(rows.map((r) => r.entry.title)).toEqual([
      'En cours',
      'En sommeil',
      'À jour',
      'Inconnue',
    ]);
  });

  it('à retard égal, le dernier touché d’abord', () => {
    const rows = upNextRows(
      [
        entree({ title: 'Avant-hier', updatedAt: ilYA(2) }),
        entree({ title: 'Ce matin', updatedAt: ilYA(0) }),
      ],
      () => faits(),
      MAINTENANT,
    );
    expect(rows.map((r) => r.entry.title)).toEqual(['Ce matin', 'Avant-hier']);
  });

  it('entre séries à jour, la prochaine sortie d’abord', () => {
    const aJour = { kind: 'anime', episodes: 8 } as const;
    const rows = upNextRows(
      [
        entree({ title: 'Dimanche', progress: aJour, updatedAt: ilYA(0) }),
        entree({ title: 'Demain', progress: aJour, updatedAt: ilYA(3) }),
      ],
      (e) =>
        faits({
          nextAiringEpisode: { episode: 9, airingAt: e.title === 'Demain' ? 100 : 900 },
        }),
      MAINTENANT,
    );
    expect(rows.map((r) => r.entry.title)).toEqual(['Demain', 'Dimanche']);
  });
});
