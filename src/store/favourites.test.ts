import { beforeEach, describe, expect, it } from 'vitest';
import { useFavourites } from './favourites';
import { storage } from '../platform/storage';
import { entryKey, mbEntryKey, personKey } from '../lib/ids';

/**
 * Le bug que ces tests figent : la fiche MangaBaka et la fiche AniList
 * rangeaient leurs favoris sous `manga:<nombre>` avec des identifiants venus
 * de deux bases différentes. Aimer Solo Leveling chez MangaBaka retirait donc
 * le manga 3397 d'AniList, sans un mot.
 *
 * La clé de stockage est écrite en dur ici : c'est le CONTRAT persisté, ce que
 * les navigateurs contiennent déjà. La changer par mégarde perdrait tout, et
 * un test qui la relit depuis le code ne le verrait pas.
 */
const K_FAV = 'anilog:favourites';

const fav = () => useFavourites.getState();

beforeEach(async () => {
  await storage.del(K_FAV);
  useFavourites.setState({ hydrated: false, favourites: {} });
});

describe('identité', () => {
  it('ne confond pas la série 1677 de MangaBaka et le manga 1677 d’AniList', () => {
    fav().toggle({
      key: mbEntryKey(1677),
      id: 1677,
      name: 'Solo Leveling',
      href: '/mangabaka/1677',
    });
    fav().toggle({ key: entryKey('manga', 1677), id: 1677, name: 'Un autre', href: '/manga/1677' });

    expect(Object.keys(fav().favourites).sort()).toEqual(['manga:1677', 'manga:mb1677']);
  });

  it('ne confond pas l’anime 21 et le manga 21', () => {
    fav().toggle({ key: entryKey('anime', 21), id: 21, name: 'One Piece' });
    fav().toggle({ key: entryKey('manga', 21), id: 21, name: 'Autre chose' });
    expect(Object.keys(fav().favourites)).toHaveLength(2);
  });

  it('sépare un personnage, un membre du staff et un studio de même numéro', () => {
    for (const kind of ['character', 'staff', 'studio'] as const) {
      fav().toggle({ key: personKey(kind, 7), id: 7, name: kind });
    }
    expect(Object.keys(fav().favourites)).toHaveLength(3);
  });

  it('refuse une clé qui ne désigne rien', () => {
    /* Elle resterait dans la table sans qu'aucun bouton puisse l'enlever. */
    expect(fav().toggle({ key: 'manga:0' as never, id: 0, name: 'néant' })).toBe(false);
    expect(fav().favourites).toEqual({});
  });
});

describe('toggle', () => {
  it('ajoute puis retire, et le dit', () => {
    const key = entryKey('anime', 21);
    expect(fav().toggle({ key, id: 21, name: 'One Piece' })).toBe(true);
    expect(fav().toggle({ key, id: 21, name: 'One Piece' })).toBe(false);
    expect(fav().favourites).toEqual({});
  });

  it('déduit le genre de la clé plutôt que de le croire sur parole', () => {
    fav().toggle({ key: mbEntryKey(1677), id: 1677, name: 'Solo Leveling' });
    expect(fav().favourites[mbEntryKey(1677)]?.kind).toBe('manga');
  });
});

describe('hydratation', () => {
  it('lit une sauvegarde versionnée telle quelle', async () => {
    const key = entryKey('anime', 21);
    await storage.set(K_FAV, {
      version: 1,
      items: { [key]: { key, kind: 'anime', id: 21, name: 'One Piece', addedAt: 'z' } },
    });
    await fav().hydrate();
    expect(fav().favourites[key]?.name).toBe('One Piece');
  });

  it('convertit une sauvegarde d’avant le versionnage', async () => {
    /* La forme réelle : pas d'enveloppe, pas de champ `key`, et le `href`
       recopié à l'époque est ce qui dit de quelle base vient le nombre. */
    await storage.set(K_FAV, {
      'manga:1677': {
        kind: 'manga',
        id: 1677,
        name: 'Solo Leveling',
        href: '/mangabaka/1677',
        addedAt: 'a',
      },
      'anime:21': { kind: 'anime', id: 21, name: 'One Piece', href: '/anime/21', addedAt: 'b' },
      'character:17': { kind: 'character', id: 17, name: 'Nami', addedAt: 'c' },
    });
    await fav().hydrate();

    expect(Object.keys(fav().favourites).sort()).toEqual([
      'anime:21',
      'character:17',
      'manga:mb1677',
    ]);
    expect(fav().favourites['manga:mb1677']?.name).toBe('Solo Leveling');
  });

  it('range sous AniList un vieux manga sans href', async () => {
    /* On ne peut pas savoir. AniList était la seule source le jour où ce store
       est né : c'est le pari le moins destructeur, et il est écrit. */
    await storage.set(K_FAV, {
      'manga:105778': { kind: 'manga', id: 105778, name: 'Chainsaw Man', addedAt: 'a' },
    });
    await fav().hydrate();
    expect(Object.keys(fav().favourites)).toEqual(['manga:105778']);
  });

  it('réécrit la conversion, pour qu’elle ne se rejoue pas', async () => {
    await storage.set(K_FAV, {
      'anime:21': { kind: 'anime', id: 21, name: 'One Piece', addedAt: 'b' },
    });
    await fav().hydrate();

    // `queueWrite` sans délai, mais quand même asynchrone.
    await new Promise((r) => setTimeout(r, 20));
    const stored = await storage.get<{ version: number }>(K_FAV);
    expect(stored?.version).toBe(1);
  });

  it('jette les enregistrements abîmés sans perdre les autres', async () => {
    await storage.set(K_FAV, {
      bon: { kind: 'anime', id: 21, name: 'One Piece', addedAt: 'a' },
      sansGenre: { id: 21, name: 'orphelin', addedAt: 'b' },
      nul: null,
    });
    await fav().hydrate();
    expect(Object.keys(fav().favourites)).toEqual(['anime:21']);
  });
});
