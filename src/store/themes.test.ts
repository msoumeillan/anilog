import { beforeEach, describe, expect, it } from 'vitest';
import { useThemes } from './themes';
import { storage } from '../platform/storage';
import { buildSongs } from '../lib/songList';
import type { LibraryEntry } from '../types/library';

/**
 * Le bug que ces tests figent : un navigateur qui avait rempli ce cache AVANT
 * que les versions portent toutes leurs vidéos — `video`, un objet — ouvrait
 * l'onglet Musiques sur un écran noir. `buildSongs` lisait `videos[0]` sur des
 * versions qui n'avaient pas `videos`, et le rendu s'effondrait entier.
 *
 * Le navigateur de développement ne l'a pas vu : sa bibliothèque était vide.
 * La clé et la forme v1 sont donc écrites en DUR ici — c'est le contrat
 * persisté, ce que les navigateurs contiennent déjà, et un test qui les
 * relirait depuis le code ne verrait pas qu'on les a changées.
 */
const K_THEMES = 'anilog:themes';

const t = () => useThemes.getState();

const fichier = {
  link: 'https://v.animethemes.moe/TokyoGhoul-OP1.webm',
  resolution: 1080,
  nc: true,
  size: 60_000_000,
};

/** Un générique tel que la v1 l'écrivait : `video`, au singulier. */
const genériqueV1 = (video: unknown = fichier) => ({
  slug: 'OP1',
  kind: 'OP',
  sequence: 1,
  title: 'unravel',
  artists: ['TK from Ling tosite sigure'],
  versions: [{ version: 1, episodes: '1-12', start: 1, spoiler: false, video }],
});

const entree = (id: number): LibraryEntry => ({
  key: `anime:${id}`,
  media: 'anime',
  ids: { anilist: id },
  title: 'Tokyo Ghoul',
  status: 'current',
  progress: { kind: 'anime', episodes: 3 },
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  await storage.del(K_THEMES);
  useThemes.setState({ hydrated: false, themes: {}, progress: null, error: null });
});

describe('migration 1 → 2', () => {
  it('convertit `video` en `videos`, sans rien redemander', async () => {
    await storage.set(K_THEMES, {
      version: 1,
      items: { '20605': { fetchedAt: '2026-09-01T00:00:00.000Z', themes: [genériqueV1()] } },
    });
    await t().hydrate();

    const version = t().themes['20605']?.themes[0]?.versions[0];
    expect(version?.videos).toEqual([fichier]);
    expect(version).not.toHaveProperty('video');
    /* L'horodatage est gardé : l'entrée reste fraîche, et la douzaine de
       requêtes lentes que ce cache évite ne se rejoue pas. */
    expect(t().themes['20605']?.fetchedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('rend à nouveau jouable ce qui faisait planter l’onglet', async () => {
    /* Le chemin exact de l'écran noir : le cache hydraté, puis `buildSongs`. */
    await storage.set(K_THEMES, {
      version: 1,
      items: { '20605': { fetchedAt: '2026-09-01T00:00:00.000Z', themes: [genériqueV1()] } },
    });
    await t().hydrate();

    const lignes = buildSongs([entree(20605)], (id) => t().themesFor(id), {});
    expect(lignes.map((l) => l.link)).toEqual([fichier.link]);
  });

  it('garde une version sans fichier… sans fichier', async () => {
    await storage.set(K_THEMES, {
      version: 1,
      items: { '1': { fetchedAt: 'z', themes: [genériqueV1(null)] } },
    });
    await t().hydrate();
    expect(t().themes['1']?.themes[0]?.versions[0]?.videos).toEqual([]);
  });

  it('laisse tel quel ce qui est déjà au nouveau format sous l’ancien numéro', async () => {
    /* L'app a tourné quelques heures avec `videos` sans avoir monté la version :
       un navigateur au cache vide a pu écrire la bonne forme sous le mauvais
       numéro. */
    const déjàV2 = { ...genériqueV1(), versions: [{ version: 1, videos: [fichier] }] };
    await storage.set(K_THEMES, {
      version: 1,
      items: { '2': { fetchedAt: 'z', themes: [déjàV2] } },
    });
    await t().hydrate();
    expect(t().themes['2']?.themes[0]?.versions[0]?.videos).toEqual([fichier]);
  });

  it('ÉCARTE une entrée illisible entière, pour qu’elle soit redemandée', async () => {
    /* Gardée avec un générique en moins, elle passerait pour fraîche pendant
       une semaine. Absente, la prochaine synchronisation la reprend. */
    await storage.set(K_THEMES, {
      version: 1,
      items: {
        '3': { fetchedAt: 'z', themes: [genériqueV1(), genériqueV1('pas une vidéo')] },
        '4': { fetchedAt: 'z', themes: 'pas une liste' },
        '5': { fetchedAt: 'z', themes: [genériqueV1()] },
      },
    });
    await t().hydrate();
    expect(Object.keys(t().themes)).toEqual(['5']);
  });

  it('réécrit la conversion, pour qu’elle ne se rejoue pas', async () => {
    await storage.set(K_THEMES, {
      version: 1,
      items: { '20605': { fetchedAt: 'z', themes: [genériqueV1()] } },
    });
    await t().hydrate();
    // `queueWrite` sans délai, mais quand même asynchrone.
    await new Promise((r) => setTimeout(r, 20));

    const relu = await storage.get<{ version: number }>(K_THEMES);
    expect(relu?.version).toBe(2);
  });
});
