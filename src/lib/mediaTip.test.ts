import { describe, expect, it } from 'vitest';
import { mainStudio, mediaTip } from './mediaTip';

describe('mediaTip', () => {
  it('compose les trois lignes', () => {
    expect(
      mediaTip({ season: 'FALL', year: 2026, studio: 'TRIGGER', format: 'ONA', episodes: 10 }),
    ).toEqual({ when: 'Fall 2026', studio: 'TRIGGER', what: 'ONA · 10 episodes' });
  });

  it('traduit les valeurs d’AniList en libellés lisibles', () => {
    expect(mediaTip({ season: 'WINTER', year: 2015, format: 'TV' })).toEqual({
      when: 'Winter 2015',
      studio: undefined,
      what: 'TV series',
    });
  });

  it('nomme aussi les formats absents du filtre', () => {
    /* `MUSIC` n'est pas proposé au filtre mais AniList le renvoie. La page
       studio l'écrivait « Music video » quand la bulle affichait « MUSIC » :
       les deux passent désormais par la même table. */
    expect(mediaTip({ year: 2026, format: 'MUSIC' })?.what).toBe('Music video');
  });

  it('capitalise plutôt que de perdre un format qu’aucune table ne connaît', () => {
    expect(mediaTip({ year: 2026, format: 'WHATEVER' })?.what).toBe('Whatever');
  });

  describe('quand', () => {
    it('se contente de l’année quand la saison manque — films et OVA en ont rarement', () => {
      expect(mediaTip({ year: 2016, format: 'MOVIE' })?.when).toBe('2016');
    });

    it('ne montre pas une saison sans année : « Fall » seul ne situe rien', () => {
      expect(mediaTip({ season: 'FALL', format: 'TV' })?.when).toBeUndefined();
    });
  });

  describe('combien', () => {
    it('accorde le singulier', () => {
      expect(mediaTip({ format: 'OVA', episodes: 1 })?.what).toBe('OVA');
      expect(mediaTip({ format: 'TV', episodes: 2 })?.what).toBe('TV series · 2 episodes');
    });

    it('ne compte pas les épisodes d’un film — son format le dit déjà', () => {
      expect(mediaTip({ format: 'MOVIE', episodes: 1 })?.what).toBe('Movie');
    });

    it('compte sans format quand c’est tout ce qu’on a', () => {
      expect(mediaTip({ episodes: 24 })?.what).toBe('24 episodes');
    });

    it('n’invente pas un compte quand AniList ne l’a pas encore', () => {
      expect(mediaTip({ year: 2027, format: 'TV', episodes: null })?.what).toBe('TV series');
    });
  });

  describe('rien à montrer', () => {
    it('ne rend pas de bulle vide', () => {
      expect(mediaTip({})).toBeNull();
      expect(mediaTip({ season: null, year: null, studio: null, format: null })).toBeNull();
    });

    it('ignore un studio qui n’est que des espaces', () => {
      expect(mediaTip({ studio: '   ' })).toBeNull();
    });
  });
});

describe('mainStudio', () => {
  const wit = { isMain: true, node: { name: 'WIT STUDIO' } };
  const ponyCanyon = { isMain: false, node: { name: 'Pony Canyon' } };

  it('trouve le studio d’animation parmi les crédits', () => {
    expect(mainStudio({ edges: [wit] })).toBe('WIT STUDIO');
  });

  it('ne prend PAS le premier de la liste', () => {
    /* Le cas qui compte : sous `Character.media`, AniList ignore son propre
       argument `isMain` et renvoie les sept crédits. Mesuré sur Attack on
       Titan — un distributeur peut arriver avant le studio. */
    expect(mainStudio({ edges: [ponyCanyon, wit] })).toBe('WIT STUDIO');
  });

  it('ne rend rien quand aucun crédit n’est principal', () => {
    expect(mainStudio({ edges: [ponyCanyon] })).toBeUndefined();
    expect(mainStudio({ edges: [] })).toBeUndefined();
  });

  it('encaisse l’absence de champ — les manga n’ont pas de studio', () => {
    expect(mainStudio(undefined)).toBeUndefined();
    expect(mainStudio(null)).toBeUndefined();
  });
});

describe('mediaTip, côté manga', () => {
  it('compte des chapitres, pas des épisodes', () => {
    expect(mediaTip({ format: 'manga', chapters: 232 })?.what).toBe('Manga · 232 chapters');
  });

  it('accorde le singulier', () => {
    expect(mediaTip({ chapters: 1 })?.what).toBe('1 chapter');
  });

  it('met l’état de parution là où un anime met son studio', () => {
    /* Un manga n'a pas de studio, mais la question devant une carte est la
       même : « où ça en est ? ». */
    expect(mediaTip({ status: 'Releasing', year: 2018 })).toEqual({
      when: '2018',
      studio: 'Releasing',
      what: undefined,
    });
  });

  it('laisse le studio passer devant quand il y en a un', () => {
    expect(mediaTip({ studio: 'MAPPA', status: 'Releasing' })?.studio).toBe('MAPPA');
  });
});
