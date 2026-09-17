import { describe, expect, it } from 'vitest';
import { indexStreaming, type StreamingEpisode } from './streaming';

const ep = (n: number, titre = `Titre ${n}`): StreamingEpisode => ({
  title: `Episode ${n} - ${titre}`,
  thumbnail: `https://img/${n}.jpg`,
});

const liste = (n: number) => Array.from({ length: n }, (_, i) => ep(i + 1));

describe('indexStreaming', () => {
  it('indexe par le numéro lu dans le libellé', () => {
    const m = indexStreaming([ep(1, 'Cruelty'), ep(2)], 26);
    expect(m.get(1)).toEqual({ title: 'Cruelty', thumbnail: 'https://img/1.jpg' });
    expect([...m.keys()]).toEqual([1, 2]);
  });

  it('écarte tout quand la fiche liste plus d’épisodes qu’elle n’en a', () => {
    /* Les cas réels : AniList attache les épisodes de la première saison aux
       fiches de suite. Attack on Titan saison 2 annonce 12 épisodes et en
       liste 25 ; Jujutsu Kaisen saison 2, 23 contre 24. */
    expect(indexStreaming(liste(25), 12).size).toBe(0);
    expect(indexStreaming(liste(24), 23).size).toBe(0);
    expect(indexStreaming(liste(26), 11).size).toBe(0);
  });

  it('garde une fiche dont le compte concorde', () => {
    // Death Note, Steins;Gate, Attack on Titan saison 1 : autant que d'épisodes.
    expect(indexStreaming(liste(37), 37).size).toBe(37);
    expect(indexStreaming(liste(25), 25).size).toBe(25);
  });

  it('garde une liste partielle — c’est normal, pas suspect', () => {
    // One Piece : 69 épisodes listés sur 1 175. Incomplet, mais bien les siens.
    expect(indexStreaming(liste(69), 1175).size).toBe(69);
  });

  it('ne juge pas quand le total est inconnu', () => {
    expect(indexStreaming(liste(5), 0).size).toBe(5);
  });

  it('ignore les libellés qui ne suivent pas le format', () => {
    const bizarres: StreamingEpisode[] = [
      { title: 'Bande-annonce', thumbnail: 'https://img/x.jpg' },
      { title: null, thumbnail: null },
      ep(3),
    ];
    expect([...indexStreaming(bizarres, 26).keys()]).toEqual([3]);
  });

  it('supporte une liste absente ou vide', () => {
    expect(indexStreaming(undefined, 26).size).toBe(0);
    expect(indexStreaming([], 26).size).toBe(0);
  });
});
