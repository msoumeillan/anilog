import { describe, expect, it } from 'vitest';
import {
  currentSeason,
  inSeason,
  queryBounds,
  seasonTitle,
  seasonWindow,
  asSeason,
} from './season';

/** Midi local — même convention que le reste des dates du projet. */
const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe('currentSeason', () => {
  it('donne la saison du jour', () => {
    expect(currentSeason(at('2026-08-29'))).toEqual({ season: 'SUMMER', year: 2026 });
  });

  /* Les quatre bascules, aux deux bords : c'est là et nulle part ailleurs
     qu'un `Math.floor(mois / 3)` écrit de tête se trompe. */
  it.each([
    ['2026-01-01', 'WINTER'],
    ['2026-03-31', 'WINTER'],
    ['2026-04-01', 'SPRING'],
    ['2026-06-30', 'SPRING'],
    ['2026-07-01', 'SUMMER'],
    ['2026-09-30', 'SUMMER'],
    ['2026-10-01', 'FALL'],
    ['2026-12-31', 'FALL'],
  ])('%s tombe en %s', (jour, saison) => {
    expect(currentSeason(at(jour)).season).toBe(saison);
  });

  it('change d’année au 1er janvier, pas avant', () => {
    expect(currentSeason(at('2026-12-31'))).toEqual({ season: 'FALL', year: 2026 });
    expect(currentSeason(at('2027-01-01'))).toEqual({ season: 'WINTER', year: 2027 });
  });

  it('accepte une année bissextile sans décaler', () => {
    expect(currentSeason(at('2028-02-29')).season).toBe('WINTER');
  });
});

describe('seasonTitle', () => {
  it('met en forme pour l’affichage', () => {
    expect(seasonTitle({ season: 'SUMMER', year: 2026 })).toBe('Summer 2026');
    expect(seasonTitle({ season: 'FALL', year: 2027 })).toBe('Fall 2027');
  });
});

describe('seasonWindow', () => {
  it('avance les deux bornes de deux semaines', () => {
    // Trimestre 1er juillet – 30 septembre, donc mi-juin à mi-septembre.
    expect(seasonWindow({ season: 'SUMMER', year: 2026 })).toEqual({
      from: 20260617,
      to: 20260916,
    });
  });

  it('ouvre l’hiver à la mi-décembre de l’année PRÉCÉDENTE', () => {
    expect(seasonWindow({ season: 'WINTER', year: 2026 })).toEqual({
      from: 20251218,
      to: 20260317,
    });
  });

  it('pave les quatre saisons sans trou ni recouvrement', () => {
    /* La propriété qui rend la règle sûre : une œuvre sans saison tombe dans
       une fenêtre et une seule. Le décalage identique aux deux bornes est
       exactement ce qui la garantit. */
    const suite = (['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const).map((season) =>
      seasonWindow({ season, year: 2026 }),
    );
    const veille = (n: number) => {
      const j = new Date(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
      j.setDate(j.getDate() - 1);
      return j.getFullYear() * 10000 + (j.getMonth() + 1) * 100 + j.getDate();
    };
    expect(veille(suite[1]!.from)).toBe(suite[0]!.to);
    expect(veille(suite[2]!.from)).toBe(suite[1]!.to);
    expect(veille(suite[3]!.from)).toBe(suite[2]!.to);
  });

  it('gère février d’une année bissextile', () => {
    expect(seasonWindow({ season: 'WINTER', year: 2028 }).to).toBe(20280317);
  });
});

describe('queryBounds', () => {
  it('déborde d’un mois de chaque côté du trimestre', () => {
    expect(queryBounds({ season: 'SUMMER', year: 2026 })).toEqual({
      from: 20260601,
      to: 20261031,
    });
  });

  it('franchit l’année pour l’hiver', () => {
    expect(queryBounds({ season: 'WINTER', year: 2026 })).toEqual({
      from: 20251201,
      to: 20260430,
    });
  });

  it('englobe toujours la fenêtre d’affichage', () => {
    for (const season of ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const) {
      const large = queryBounds({ season, year: 2026 })!;
      const etroite = seasonWindow({ season, year: 2026 });
      expect(large.from).toBeLessThanOrEqual(etroite.from);
      expect(large.to).toBeGreaterThanOrEqual(etroite.to);
    }
  });

  it('prend l’année entière quand la saison n’est pas précisée', () => {
    expect(queryBounds({ year: 2026 })).toEqual({ from: 20260101, to: 20261231 });
  });

  it('ne borne RIEN sur une saison sans année', () => {
    /* « Tous les printemps » ne se borne pas par des dates : on demande sans
       contrainte et on trie ensuite. */
    expect(queryBounds({ season: 'SPRING' })).toBeNull();
    expect(queryBounds({})).toBeNull();
  });
});

describe('inSeason', () => {
  const ete = { season: 'SUMMER', year: 2026 } as const;
  const date = (year: number, month: number, day: number) => ({ year, month, day });

  describe('quand AniList a rangé l’œuvre', () => {
    it('croit la saison, même contre la date', () => {
      /* « Wareware wa Uchuujin » : range en ete, demarre le 25 septembre,
         donc hors fenetre. La saison fait foi. */
      expect(
        inSeason({ season: 'SUMMER', seasonYear: 2026, startDate: date(2026, 9, 25) }, ete),
      ).toBe(true);
    });

    it('écarte une série d’automne qui démarre dans la fenêtre', () => {
      // JoJo Steel Ball Run : range en automne, demarre fin septembre.
      expect(
        inSeason({ season: 'FALL', seasonYear: 2026, startDate: date(2026, 9, 20) }, ete),
      ).toBe(false);
    });

    it('distingue deux étés d’années différentes', () => {
      expect(inSeason({ season: 'SUMMER', seasonYear: 2025 }, ete)).toBe(false);
    });
  });

  describe('quand AniList ne l’a rangée nulle part', () => {
    it('retient un donghua diffusé dans la fenêtre', () => {
      // False Memory (2026) : ONA chinois, aucune saison, debut le 2 aout.
      expect(inSeason({ season: null, seasonYear: null, startDate: date(2026, 8, 2) }, ete)).toBe(
        true,
      );
    });

    it('accepte les deux bords de la fenêtre', () => {
      expect(inSeason({ startDate: date(2026, 6, 17) }, ete)).toBe(true);
      expect(inSeason({ startDate: date(2026, 9, 16) }, ete)).toBe(true);
    });

    it('refuse juste au-delà', () => {
      expect(inSeason({ startDate: date(2026, 6, 16) }, ete)).toBe(false);
      expect(inSeason({ startDate: date(2026, 9, 17) }, ete)).toBe(false);
    });

    it('ne range pas une date trop floue plutôt que de la ranger au hasard', () => {
      expect(inSeason({ startDate: { year: 2026, month: null, day: null } }, ete)).toBe(false);
      expect(inSeason({ startDate: null }, ete)).toBe(false);
      expect(inSeason({}, ete)).toBe(false);
    });

    it('supplée un jour manquant par le premier du mois', () => {
      expect(inSeason({ startDate: { year: 2026, month: 8, day: null } }, ete)).toBe(true);
    });

    it('range le 20 décembre dans l’hiver SUIVANT', () => {
      /* La fenêtre de l'hiver 2026 s'ouvre le 18 décembre 2025. Comparer
         l'année de la date à celle du filtre rejetterait cette œuvre. */
      expect(inSeason({ startDate: date(2025, 12, 20) }, { season: 'WINTER', year: 2026 })).toBe(
        true,
      );
    });
  });

  /* Les deux formes qui donnaient des listes presque vides : « 2026 » seul
     ramenait un donghua, « Spring » seul en ramenait un autre — les seuls
     auxquels AniList avait donné un `seasonYear` ou une `season`. */
  describe('année seule', () => {
    const en2026 = { year: 2026 };

    it('retient une œuvre rangée dans cette année', () => {
      expect(inSeason({ season: 'FALL', seasonYear: 2026 }, en2026)).toBe(true);
    });

    it('retient un donghua démarré dans l’année, quelle que soit la saison', () => {
      expect(inSeason({ startDate: date(2026, 2, 14) }, en2026)).toBe(true);
      expect(inSeason({ startDate: date(2026, 11, 30) }, en2026)).toBe(true);
    });

    it('écarte les années voisines', () => {
      expect(inSeason({ startDate: date(2025, 12, 31) }, en2026)).toBe(false);
      expect(inSeason({ startDate: date(2027, 1, 1) }, en2026)).toBe(false);
    });
  });

  describe('saison seule, toutes années', () => {
    const printemps = { season: 'SPRING' as const };

    it('retient une œuvre rangée dans cette saison, n’importe quand', () => {
      expect(inSeason({ season: 'SPRING', seasonYear: 2017 }, printemps)).toBe(true);
      expect(inSeason({ season: 'SPRING', seasonYear: 2025 }, printemps)).toBe(true);
    });

    it('retient un donghua démarré au printemps, n’importe quelle année', () => {
      // Link Click (30 avril 2021) et The King's Avatar (7 avril 2017).
      expect(inSeason({ startDate: date(2021, 4, 30) }, printemps)).toBe(true);
      expect(inSeason({ startDate: date(2017, 4, 7) }, printemps)).toBe(true);
    });

    it('écarte ce qui démarre dans une autre saison', () => {
      expect(inSeason({ startDate: date(2021, 8, 30) }, printemps)).toBe(false);
    });

    it('rattache décembre à l’hiver, sans année pour l’y aider', () => {
      expect(inSeason({ startDate: date(2025, 12, 20) }, { season: 'WINTER' })).toBe(true);
    });
  });
});

describe('asSeason', () => {
  it('accepte les quatre saisons', () => {
    for (const s of ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const) {
      expect(asSeason(s)).toBe(s);
    }
  });

  it('refuse tout le reste plutôt que de l’envoyer à AniList', () => {
    /* `?season=BANANA` partait tel quel dans les variables GraphQL, et
       l'erreur qui revenait se lisait comme une panne. */
    for (const bad of ['', 'BANANA', 'winter', 'Spring', null, undefined]) {
      expect(asSeason(bad), String(bad)).toBeNull();
    }
  });
});
