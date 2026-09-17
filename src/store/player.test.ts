import { beforeEach, describe, expect, it } from 'vitest';
import { songKey } from '../lib/ids';
import { usePlayer, type PlayableSong } from './player';

const chanson = (anilistId: number, slug: string, anime: string): PlayableSong => ({
  key: songKey(anilistId, slug),
  anilistId,
  slug,
  kind: slug.startsWith('ED') ? 'ED' : 'OP',
  title: `${anime} ${slug}`,
  artists: [],
  anime,
  link: `https://v.animethemes.moe/${anilistId}-${slug}.webm`,
});

const idol = chanson(1, 'OP1', 'Oshi no Ko');
const mephisto = chanson(1, 'ED1', 'Oshi no Ko');
const fatal = chanson(2, 'OP1', 'Oshi no Ko 2');
const burning = chanson(2, 'ED1', 'Oshi no Ko 2');

const titres = () => usePlayer.getState().queue.map((s) => s.title);
const enCours = () => usePlayer.getState().current()?.title;

describe('reculer et avancer dans la file', () => {
  beforeEach(() => usePlayer.getState().close());

  it('ne recule pas avant le premier morceau', () => {
    /* Le cas signalé : reculer depuis Idol, premier résultat de la recherche,
       menait au dernier résultat, sans rapport. */
    usePlayer.getState().play([idol, mephisto, fatal], 0);
    usePlayer.getState().prev();
    expect(enCours()).toBe('Oshi no Ko OP1');
    expect(usePlayer.getState().index).toBe(0);
  });

  it('recule d’un morceau ailleurs, et oublie le fichier choisi pour celui qu’on quitte', () => {
    usePlayer.getState().play([idol, mephisto, fatal], 2);
    usePlayer.getState().setSource('https://v.animethemes.moe/fatal-720.webm');
    usePlayer.getState().prev();
    expect(enCours()).toBe('Oshi no Ko ED1');
    expect(usePlayer.getState().source).toBeNull();
  });

  it('avance en boucle : la lecture enchaîne toute seule, et repart du début', () => {
    usePlayer.getState().play([idol, mephisto], 1);
    usePlayer.getState().next();
    expect(enCours()).toBe('Oshi no Ko OP1');
  });
});

describe('extendQueue : la file qui passe d’un anime au suivant', () => {
  beforeEach(() => usePlayer.getState().close());

  it('élargit la file autour de la chanson en cours, qui garde sa place', () => {
    const ticket = usePlayer.getState().play([idol, mephisto], 1);
    usePlayer.getState().extendQueue(ticket, [idol, mephisto, fatal, burning]);

    expect(titres()).toEqual([
      'Oshi no Ko OP1',
      'Oshi no Ko ED1',
      'Oshi no Ko 2 OP1',
      'Oshi no Ko 2 ED1',
    ]);
    expect(enCours()).toBe('Oshi no Ko ED1');

    /* Le cas signalé : après Mephisto, la suite n'est plus Idol mais Fatal. */
    usePlayer.getState().next();
    expect(enCours()).toBe('Oshi no Ko 2 OP1');
  });

  it('garde le fichier choisi : la chanson en cours ne change pas', () => {
    const ticket = usePlayer.getState().play([idol, mephisto], 0);
    usePlayer.getState().setSource('https://v.animethemes.moe/idol-720.webm');
    usePlayer.getState().extendQueue(ticket, [idol, mephisto, fatal]);
    expect(usePlayer.getState().source).toBe('https://v.animethemes.moe/idol-720.webm');
  });

  it('suit la chanson même si l’on a avancé entre-temps', () => {
    const ticket = usePlayer.getState().play([idol, mephisto], 0);
    usePlayer.getState().next();
    usePlayer.getState().extendQueue(ticket, [idol, mephisto, fatal]);
    expect(enCours()).toBe('Oshi no Ko ED1');
    expect(usePlayer.getState().index).toBe(1);
  });

  it('ne touche à rien si une autre file a été lancée entre-temps', () => {
    const ticket = usePlayer.getState().play([idol, mephisto], 0);
    usePlayer.getState().play([burning], 0);
    usePlayer.getState().extendQueue(ticket, [idol, mephisto, fatal, burning]);
    expect(titres()).toEqual(['Oshi no Ko 2 ED1']);
  });

  it('ne touche à rien si le lecteur a été fermé', () => {
    const ticket = usePlayer.getState().play([idol, mephisto], 0);
    usePlayer.getState().close();
    usePlayer.getState().extendQueue(ticket, [idol, mephisto, fatal]);
    expect(titres()).toEqual([]);
  });

  it('ne touche à rien si la chanson en cours manque à la nouvelle file', () => {
    const ticket = usePlayer.getState().play([idol, mephisto], 0);
    usePlayer.getState().extendQueue(ticket, [fatal, burning]);
    expect(titres()).toEqual(['Oshi no Ko OP1', 'Oshi no Ko ED1']);
  });
});
