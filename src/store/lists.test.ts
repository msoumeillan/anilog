import { beforeEach, describe, expect, it } from 'vitest';
import { useLists } from './lists';
import { storage } from '../platform/storage';
import { display, dropTarget, tierKeys, VIVIER } from '../lib/lists';
import type { EntryKey } from '../types/library';

/**
 * Le classement d'une tier list se joue dans le store et dans `dropTarget` ;
 * ce que dnd-kit ajoute par-dessus, c'est le geste. Les règles qui font qu'un
 * classement reste cohérent — une œuvre à une seule place, un rang supprimé
 * qui ne perd rien — se vérifient donc ici, où elles ne dépendent ni d'un
 * navigateur ni d'une souris.
 */

const K = 'anilog:lists';
const s = () => useLists.getState();

const cle = (n: number) => `anime:${n}` as EntryKey;

beforeEach(async () => {
  await storage.del(K);
  useLists.setState({ hydrated: true, lists: {}, tierLists: {} });
});

describe('listes ordonnées', () => {
  it('ajoute en fin, sans jamais dupliquer', () => {
    const id = s().createList('anime', 'Top');
    s().addToList(id, cle(1));
    s().addToList(id, cle(2));
    s().addToList(id, cle(1));
    expect(s().lists[id]?.items.map((i) => i.key)).toEqual([cle(1), cle(2)]);
  });

  it('déplace un élément à l’indice demandé', () => {
    const id = s().createList('anime', 'Top');
    for (const n of [1, 2, 3]) s().addToList(id, cle(n));
    s().moveInList(id, 0, 2);
    expect(s().lists[id]?.items.map((i) => i.key)).toEqual([cle(2), cle(3), cle(1)]);
  });

  it('ne perd rien quand l’indice sort des bornes', () => {
    /* `splice` avec un indice hors limites insérerait à la fin ou perdrait
       l'élément selon le sens : les bornes sont rattrapées dans le store. */
    const id = s().createList('anime', 'Top');
    for (const n of [1, 2]) s().addToList(id, cle(n));
    s().moveInList(id, 0, 99);
    expect(s().lists[id]?.items).toHaveLength(2);
    s().moveInList(id, 1, -5);
    expect(s().lists[id]?.items.map((i) => i.key)).toEqual([cle(1), cle(2)]);
  });

  it('naît numérotée', () => {
    const id = s().createList('anime', 'Top');
    expect(s().lists[id]?.numbered).toBe(true);
  });

  it('ignore une opération sur une liste qui n’existe pas', () => {
    s().addToList('fantome', cle(1));
    s().moveInList('fantome', 0, 1);
    s().deleteList('fantome');
    expect(s().lists).toEqual({});
  });
});

describe('tier lists', () => {
  const neuve = () => s().createTierList('anime', 'Rangs');

  it('naît avec cinq rangs vides et un vivier vide', () => {
    const id = neuve();
    const t = s().tierLists[id];
    expect(t?.tiers.map((x) => x.label)).toEqual(['S', 'A', 'B', 'C', 'D']);
    expect(t?.tiers.every((x) => x.items.length === 0)).toBe(true);
    expect(t?.unranked).toEqual([]);
  });

  it('ajoute au vivier, sans doublon où que soit déjà la clé', () => {
    const id = neuve();
    s().addToTierList(id, cle(1));
    const rangS = s().tierLists[id]!.tiers[0]!.id;
    s().moveTierItem(id, cle(1), rangS, 0);
    /* Déjà classée : la reproposer ne doit pas la faire réapparaître dans le
       vivier, sinon elle occuperait deux places. */
    s().addToTierList(id, cle(1));
    expect(tierKeys(s().tierLists[id]!)).toEqual([cle(1)]);
  });

  it('une œuvre n’occupe qu’UNE place', () => {
    /* Le bug que ce test fige : insérer avant d'avoir retiré duplique la
       carte, et le classement se contredit. */
    const id = neuve();
    s().addToTierList(id, cle(1));
    const [S, A] = s().tierLists[id]!.tiers;
    s().moveTierItem(id, cle(1), S!.id, 0);
    s().moveTierItem(id, cle(1), A!.id, 0);

    const t = s().tierLists[id]!;
    expect(t.tiers[0]?.items).toEqual([]);
    expect(t.tiers[1]?.items).toEqual([cle(1)]);
    expect(t.unranked).toEqual([]);
  });

  it('réordonne à l’intérieur d’un rang sans se dupliquer', () => {
    const id = neuve();
    for (const n of [1, 2, 3]) s().addToTierList(id, cle(n));
    const S = s().tierLists[id]!.tiers[0]!.id;
    for (const n of [1, 2, 3]) s().moveTierItem(id, cle(n), S, 99);
    expect(s().tierLists[id]!.tiers[0]?.items).toEqual([cle(1), cle(2), cle(3)]);

    // Le troisième passe en tête.
    s().moveTierItem(id, cle(3), S, 0);
    expect(s().tierLists[id]!.tiers[0]?.items).toEqual([cle(3), cle(1), cle(2)]);
  });

  it('renvoie une carte au vivier', () => {
    const id = neuve();
    s().addToTierList(id, cle(1));
    const S = s().tierLists[id]!.tiers[0]!.id;
    s().moveTierItem(id, cle(1), S, 0);
    s().moveTierItem(id, cle(1), null, 0);
    expect(s().tierLists[id]!.unranked).toEqual([cle(1)]);
    expect(s().tierLists[id]!.tiers[0]?.items).toEqual([]);
  });

  it('un rang supprimé rend ses œuvres au vivier', () => {
    /* Supprimer un rang est un geste de MISE EN PAGE. Emporter le classement
       avec lui serait une perte que rien n'annonce. */
    const id = neuve();
    for (const n of [1, 2]) s().addToTierList(id, cle(n));
    const S = s().tierLists[id]!.tiers[0]!.id;
    s().moveTierItem(id, cle(1), S, 0);
    s().moveTierItem(id, cle(2), S, 1);
    s().removeTier(id, S);

    const t = s().tierLists[id]!;
    expect(t.tiers).toHaveLength(4);
    expect(t.unranked).toEqual([cle(1), cle(2)]);
  });

  it('ajoute un rang EN BAS', () => {
    // En haut, il décalerait tout ce qui est déjà classé.
    const id = neuve();
    s().addTier(id);
    expect(s().tierLists[id]!.tiers.map((t) => t.label)).toEqual(['S', 'A', 'B', 'C', 'D', 'New']);
  });

  it('déplace un rang, bornes comprises', () => {
    const id = neuve();
    s().moveTier(id, 0, 2);
    expect(s().tierLists[id]!.tiers.map((t) => t.label)).toEqual(['A', 'B', 'S', 'C', 'D']);
    s().moveTier(id, 0, 99);
    expect(s().tierLists[id]!.tiers).toHaveLength(5);
  });

  it('retire une œuvre d’où qu’elle soit', () => {
    const id = neuve();
    s().addToTierList(id, cle(1));
    const S = s().tierLists[id]!.tiers[0]!.id;
    s().moveTierItem(id, cle(1), S, 0);
    s().removeFromTierList(id, cle(1));
    expect(tierKeys(s().tierLists[id]!)).toEqual([]);
  });
});

describe('dropTarget', () => {
  const liste = () => {
    const id = useLists.getState().createTierList('anime', 'x');
    useLists.getState().addToTierList(id, cle(1));
    useLists.getState().addToTierList(id, cle(2));
    return useLists.getState().tierLists[id]!;
  };

  it('sur le fond du vivier : à la fin', () => {
    const t = liste();
    expect(dropTarget(t, VIVIER)).toEqual({ tierId: null, index: 2 });
  });

  it('sur le fond d’un rang : à la fin de ce rang', () => {
    const t = liste();
    const S = t.tiers[0]!;
    expect(dropTarget(t, S.id)).toEqual({ tierId: S.id, index: 0 });
  });

  it('sur une CARTE : à la place de cette carte', () => {
    /* C'est ce qui permet de viser un rang précis dans une file, au lieu de
       toujours tomber à la fin. */
    const t = liste();
    expect(dropTarget(t, cle(2))).toEqual({ tierId: null, index: 1 });
  });

  it('rend `null` sur un identifiant inconnu, plutôt que de deviner', () => {
    expect(dropTarget(liste(), 'rien-du-tout')).toBeNull();
  });
});

describe('persistance', () => {
  it('écrit une enveloppe versionnée et la relit', async () => {
    const id = s().createList('anime', 'Ghibli');
    s().addToList(id, cle(1));

    /* `queueWrite` differe de 400 ms : fusionner les ecritures rapprochees
       est tout l'interet de la file, il faut donc l'attendre. */
    await new Promise((r) => setTimeout(r, 600));
    const brut = await storage.get<{ version: number }>(K);
    expect(brut?.version).toBe(1);

    useLists.setState({ hydrated: false, lists: {}, tierLists: {} });
    await s().hydrate();
    expect(s().lists[id]?.name).toBe('Ghibli');
    expect(s().lists[id]?.items.map((i) => i.key)).toEqual([cle(1)]);
  });
});

describe('copies de secours', () => {
  const copie = { title: 'Frieren', cover: 'f.jpg' };

  it('garde la copie d’une œuvre non suivie, et la rend', () => {
    const id = s().createList('anime', 'A voir');
    s().addToList(id, cle(1), copie);
    const l = s().lists[id]!;
    expect(l.snapshots?.[cle(1)]).toEqual(copie);
    expect(display(cle(1), {}, l.snapshots).title).toBe('Frieren');
  });

  it('n’écrit RIEN pour une œuvre suivie', () => {
    /* La bibliothèque a déjà le titre et l'affiche : une copie de plus serait
       une copie à laisser périmer. */
    const id = s().createList('anime', 'Top');
    s().addToList(id, cle(1));
    expect(s().lists[id]?.snapshots).toBeUndefined();
  });

  it('la bibliothèque PRIME sur la copie', () => {
    /* Elle est vivante ; la copie date du jour de l'ajout. Une œuvre qu'on se
       met à suivre reprend donc son titre courant. */
    const entries = { [cle(1)]: { title: 'Sousou no Frieren', cover: 'vrai.jpg' } };
    expect(display(cle(1), entries as never, { [cle(1)]: copie })).toMatchObject({
      title: 'Sousou no Frieren',
      cover: 'vrai.jpg',
    });
  });

  it('nomme le manque plutôt que de faire disparaître la ligne', () => {
    expect(display(cle(9), {}, undefined).title).toBe('Unknown title');
  });

  it('élague la copie au retrait', () => {
    // Une copie orpheline grossirait sans fin.
    const id = s().createList('anime', 'A voir');
    s().addToList(id, cle(1), copie);
    s().removeFromList(id, cle(1));
    expect(s().lists[id]?.snapshots?.[cle(1)]).toBeUndefined();
  });

  it('vaut aussi pour les tier lists', () => {
    const id = s().createTierList('anime', 'Rangs');
    s().addToTierList(id, cle(1), copie);
    expect(s().tierLists[id]?.snapshots?.[cle(1)]).toEqual(copie);
    s().removeFromTierList(id, cle(1));
    expect(s().tierLists[id]?.snapshots?.[cle(1)]).toBeUndefined();
  });
});
