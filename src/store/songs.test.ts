import { beforeEach, describe, expect, it } from 'vitest';
import { songKey } from '../lib/ids';
import type { SongRow } from '../lib/songList';
import { useSongs } from './songs';

/*
 * Les tests tournent en environnement `node` : la couche de stockage retombe
 * sur sa version mémoire, et les écritures différées n'ont rien à attendre.
 */

/** Une LIGNE, pas une simple chanson : c'est ce que les écrans passent au store. */
const ligne = (over: Partial<SongRow> = {}): SongRow => ({
  key: songKey(150672, 'OP1'),
  anilistId: 150672,
  slug: 'OP1',
  kind: 'OP',
  title: 'Idol',
  artists: ['YOASOBI'],
  anime: '[Oshi no Ko]',
  link: 'https://v.animethemes.moe/OshiNoKo-OP1.webm',
  cover: 'https://img/oshi.jpg',
  year: 2023,
  score: 9,
  favourite: false,
  ...over,
});

const avis = (key = songKey(150672, 'OP1')) => useSongs.getState().songs[key];

describe('store des avis sur les génériques', () => {
  beforeEach(() => useSongs.setState({ songs: {} }));

  it('garde de quoi réafficher la chanson, sans qu’on ait à le passer', () => {
    /* Le bug : l'étoile du lecteur ne passait pas l'instantané, et ses favoris
       restaient invisibles dans Favourites. Le store le prend désormais sur la
       chanson elle-même. */
    useSongs.getState().toggleFavourite(ligne());
    expect(avis()?.favourite).toBe(true);
    expect(avis()?.snapshot).toEqual({
      anilistId: 150672,
      slug: 'OP1',
      kind: 'OP',
      title: 'Idol',
      artists: ['YOASOBI'],
      anime: '[Oshi no Ko]',
      link: 'https://v.animethemes.moe/OshiNoKo-OP1.webm',
    });
  });

  it('ne fige pas dans l’instantané la note ni l’étoile de la ligne', () => {
    useSongs.getState().setScore(ligne({ score: 3, favourite: true }), 8);
    const snapshot = avis()?.snapshot;
    expect(snapshot).not.toHaveProperty('score');
    expect(snapshot).not.toHaveProperty('favourite');
    expect(snapshot).not.toHaveProperty('cover');
    expect(avis()?.score).toBe(8);
  });

  it('garde le premier instantané', () => {
    useSongs.getState().setScore(ligne({ anime: 'Premier titre' }), 7);
    useSongs.getState().toggleFavourite(ligne({ anime: 'Second titre' }));
    expect(avis()?.snapshot?.anime).toBe('Premier titre');
  });

  it('retire l’avis qui ne dit plus rien', () => {
    useSongs.getState().toggleFavourite(ligne());
    useSongs.getState().toggleFavourite(ligne());
    expect(avis()).toBeUndefined();

    // Recliquer la même note l'enlève.
    useSongs.getState().setScore(ligne(), 6);
    useSongs.getState().setScore(ligne(), 6);
    expect(avis()).toBeUndefined();
  });

  describe('restoreSnapshots : les favoris posés sans instantané', () => {
    it('recopie l’instantané, sans toucher à l’étoile, à la note ni à la date', () => {
      useSongs.setState({
        songs: { [songKey(150672, 'OP1')]: { favourite: true, score: 9, updatedAt: '2026-09-01' } },
      });
      useSongs.getState().restoreSnapshots([ligne()]);
      expect(avis()).toMatchObject({ favourite: true, score: 9, updatedAt: '2026-09-01' });
      expect(avis()?.snapshot?.title).toBe('Idol');
    });

    it('n’écrase pas un instantané existant, et ignore ce qui n’a pas d’avis', () => {
      useSongs.getState().toggleFavourite(ligne({ title: 'Titre gardé' }));
      const avant = useSongs.getState().songs;
      useSongs
        .getState()
        .restoreSnapshots([
          ligne({ title: 'Autre' }),
          ligne({ key: songKey(1, 'ED1'), slug: 'ED1' }),
        ]);
      expect(avis()?.snapshot?.title).toBe('Titre gardé');
      expect(avis(songKey(1, 'ED1'))).toBeUndefined();
      /* Rien à réparer : la table reste la même, et rien ne s'écrit. */
      expect(useSongs.getState().songs).toBe(avant);
    });
  });
});
