import { beforeEach, describe, expect, it } from 'vitest';
import { usePlaylists, type TrackSnapshot } from './playlists';
import { storage } from '../platform/storage';
import { songKey } from '../lib/ids';

/**
 * La clé est écrite en DUR : c'est le contrat persisté, ce que les navigateurs
 * contiendront. La changer par mégarde perdrait toutes les playlists, et un
 * test qui la relirait depuis le code ne le verrait pas.
 */
const K_PLAYLISTS = 'anilog:playlists';

const pl = () => usePlaylists.getState();

const chanson = (slug: string, title: string): TrackSnapshot => ({
  anilistId: 150672,
  slug,
  kind: slug.startsWith('ED') ? 'ED' : 'OP',
  title,
  artists: ['YOASOBI'],
  anime: '[Oshi no Ko]',
  link: `https://v.animethemes.moe/OshiNoKo-${slug}.webm`,
  cover: 'https://i/onk.avif',
  year: 2023,
});

const IDOL = songKey(150672, 'OP1');
const MEPHISTO = songKey(150672, 'ED1');

beforeEach(async () => {
  await storage.del(K_PLAYLISTS);
  usePlaylists.setState({ hydrated: false, playlists: {} });
});

describe('créer, renommer, supprimer', () => {
  it('crée une playlist vide et rend son identifiant', () => {
    const id = pl().create('  Nuit   blanche ');
    expect(pl().playlists[id]).toMatchObject({ id, name: 'Nuit blanche', tracks: [] });
  });

  it('crée une playlist AVEC sa première piste — le geste « nouvelle playlist » du lecteur', () => {
    const id = pl().create('Idols', { key: IDOL, song: chanson('OP1', 'Idol') });
    expect(pl().playlists[id]?.tracks.map((t) => t.key)).toEqual([IDOL]);
  });

  it('nomme une playlist sans nom plutôt que de la laisser introuvable', () => {
    const id = pl().create('   ');
    expect(pl().playlists[id]?.name).toBe('Untitled playlist');
  });

  it('renomme et supprime', () => {
    const id = pl().create('A');
    pl().rename(id, 'B');
    expect(pl().playlists[id]?.name).toBe('B');
    pl().remove(id);
    expect(pl().playlists).toEqual({});
  });
});

describe('les pistes', () => {
  it('ajoute, puis retire au second geste, et dit où on en est', () => {
    const id = pl().create('A');
    expect(pl().toggle(id, IDOL, chanson('OP1', 'Idol'))).toBe(true);
    expect(pl().toggle(id, IDOL, chanson('OP1', 'Idol'))).toBe(false);
    expect(pl().playlists[id]?.tracks).toEqual([]);
  });

  it('garde l’ordre d’ajout', () => {
    const id = pl().create('A');
    pl().toggle(id, IDOL, chanson('OP1', 'Idol'));
    pl().toggle(id, MEPHISTO, chanson('ED1', 'Mephisto'));
    expect(pl().playlists[id]?.tracks.map((t) => t.song.title)).toEqual(['Idol', 'Mephisto']);
  });

  it('déplace une piste, et ne perd rien hors des bornes', () => {
    const id = pl().create('A');
    pl().toggle(id, IDOL, chanson('OP1', 'Idol'));
    pl().toggle(id, MEPHISTO, chanson('ED1', 'Mephisto'));

    pl().move(id, 1, 0);
    expect(pl().playlists[id]?.tracks.map((t) => t.key)).toEqual([MEPHISTO, IDOL]);

    /* Un « descendre » sur la dernière ligne : `splice` hors limites aurait
       perdu la piste. */
    pl().move(id, 1, 5);
    expect(pl().playlists[id]?.tracks.map((t) => t.key)).toEqual([MEPHISTO, IDOL]);
  });

  it('ne touche à rien pour une playlist qui n’existe pas', () => {
    expect(pl().toggle('nulle-part', IDOL, chanson('OP1', 'Idol'))).toBe(false);
    expect(pl().playlists).toEqual({});
  });
});

describe('le disque', () => {
  it('relit ce qu’elle a écrit', async () => {
    const id = pl().create('Idols', { key: IDOL, song: chanson('OP1', 'Idol') });
    // `queueWrite` diffère l'écriture : on la laisse partir.
    await new Promise((r) => setTimeout(r, 450));

    usePlaylists.setState({ hydrated: false, playlists: {} });
    await pl().hydrate();
    expect(pl().playlists[id]?.tracks[0]?.song.title).toBe('Idol');
  });

  it('écarte une piste injouable sans emporter le reste de sa playlist', async () => {
    /* C'est ce qu'on a rangé à la main : une piste abîmée ne vaut pas qu'on
       perde les autres. */
    await storage.set(K_PLAYLISTS, {
      version: 1,
      items: {
        a: {
          id: 'a',
          name: 'A',
          createdAt: 'z',
          updatedAt: 'z',
          tracks: [
            { key: IDOL, addedAt: 'z', song: chanson('OP1', 'Idol') },
            { key: 'pas-une-cle', addedAt: 'z', song: chanson('OP2', 'X') },
            { key: MEPHISTO, addedAt: 'z', song: { title: 'sans lien' } },
          ],
        },
        cassee: 'pas une playlist',
      },
    });
    await pl().hydrate();

    expect(Object.keys(pl().playlists)).toEqual(['a']);
    expect(pl().playlists.a?.tracks.map((t) => t.key)).toEqual([IDOL]);
  });
});
