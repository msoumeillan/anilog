import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { envelope, readVersioned } from '../lib/versioned';
import { newId, now } from '../lib/ids';
import type {
  CustomList,
  EntryKey,
  MediaType,
  Tier,
  TierList,
  WorkSnapshot,
} from '../types/library';

/**
 * Les listes composées à la main : listes ordonnées et tier lists.
 *
 * Store SÉPARÉ de la bibliothèque, comme les favoris et les affiches. Une
 * liste n'est pas un suivi : on range dans « Ghibli » un film qu'on n'a pas
 * encore vu, et y ajouter un titre ne doit pas l'inscrire dans ses listes de
 * visionnage. Les deux se croisent par la clé, et c'est tout ce qu'il leur
 * faut.
 *
 * Elles ne portent QUE des clés — jamais un titre ni une affiche recopiés.
 * C'est la différence avec les favoris : un favori doit s'afficher même si
 * l'œuvre n'est plus suivie, alors qu'une liste vit à côté de la bibliothèque
 * qui a déjà tout. Recopier ici, c'est se condamner à voir un titre périmé.
 *
 * Les deux sortes tiennent dans une seule sauvegarde : une liste, c'est des
 * noms et des clés, quelques kilo-octets pour des dizaines de listes. Le
 * découpage par entrée de la bibliothèque n'a pas de raison d'être ici.
 */

export const K_LISTS = 'anilog:lists';

/**
 * Version du format persisté. À monter en AJOUTANT une migration, jamais en
 * éditant une existante — voir `lib/versioned`.
 *
 * 1 — première forme : `{ lists, tierLists }`.
 */
const LISTS_VERSION = 1;

interface Tables {
  lists: Record<string, CustomList>;
  tierLists: Record<string, TierList>;
}

const vide = (): Tables => ({ lists: {}, tierLists: {} });

/**
 * Les rangs par défaut d'une tier list neuve.
 *
 * S à D plutôt que S à F : cinq rangs se remplissent, sept se regardent. On en
 * ajoute si on veut — c'est l'inverse qui est pénible, supprimer des rangs
 * vides qu'on n'a jamais voulus.
 */
const RANGS_PAR_DEFAUT: { label: string; color: string }[] = [
  { label: 'S', color: '#e5544b' },
  { label: 'A', color: '#e5893f' },
  { label: 'B', color: '#e5c93f' },
  { label: 'C', color: '#7fc45f' },
  { label: 'D', color: '#5fa8c4' },
];

/**
 * La table des copies de secours, avec celle-ci en plus.
 *
 * Rien n'est ecrit quand l'oeuvre est suivie : la bibliotheque a deja le titre
 * et l'affiche, et une copie de plus serait une copie a laisser perimer.
 */
function avec(
  table: Record<string, WorkSnapshot> | undefined,
  key: EntryKey,
  snapshot: WorkSnapshot | undefined,
): Record<string, WorkSnapshot> | undefined {
  return snapshot ? { ...table, [key]: snapshot } : table;
}

/** La meme table sans cette cle : une copie orpheline grossirait sans fin. */
function sans(
  table: Record<string, WorkSnapshot> | undefined,
  key: EntryKey,
): Record<string, WorkSnapshot> | undefined {
  if (!table || !(key in table)) return table;
  const next = { ...table };
  delete next[key];
  return next;
}

/** Un indice ramene dans les bornes : hors limites, `splice` perdrait l'element. */
function borne(index: number, longueur: number): number {
  return Math.max(0, Math.min(longueur, index));
}

/** Toutes les cles d'une tier list, rangs et vivier confondus. */
function tierKeysOf(l: TierList): EntryKey[] {
  return [...l.tiers.flatMap((t) => t.items), ...l.unranked];
}

/**
 * La meme liste, sans cette cle, ou qu'elle soit.
 *
 * Une oeuvre n'occupe qu'une place : la laisser dans deux rangs ferait un
 * classement qui se contredit, et c'est exactement ce qu'un glisser-depose
 * produit si on insere avant d'avoir retire.
 */
function sansCle(l: TierList, key: EntryKey): TierList {
  return {
    ...l,
    tiers: l.tiers.map((t) => ({ ...t, items: t.items.filter((k) => k !== key) })),
    unranked: l.unranked.filter((k) => k !== key),
  };
}

interface ListsState {
  hydrated: boolean;
  lists: Record<string, CustomList>;
  tierLists: Record<string, TierList>;

  hydrate: () => Promise<void>;

  /** Crée une liste vide et rend son identifiant. */
  createList: (media: MediaType, name: string) => string;
  patchList: (id: string, patch: Partial<Omit<CustomList, 'id' | 'createdAt'>>) => void;
  deleteList: (id: string) => void;
  /**
   * Ajoute en fin de liste. Sans effet si la cle y est deja.
   *
   * `snapshot` n'est fourni que pour une oeuvre NON SUIVIE : sans lui, la liste
   * n'aurait ni titre ni affiche a montrer. Voir `WorkSnapshot`.
   */
  addToList: (id: string, key: EntryKey, snapshot?: WorkSnapshot) => void;
  removeFromList: (id: string, key: EntryKey) => void;
  /** Déplace l'élément de `from` vers l'indice `to`. */
  moveInList: (id: string, from: number, to: number) => void;

  createTierList: (media: MediaType, name: string) => string;
  patchTierList: (id: string, patch: Partial<Omit<TierList, 'id' | 'createdAt'>>) => void;
  deleteTierList: (id: string) => void;
  /** Ajoute au vivier. Sans effet si la cle est deja quelque part. */
  addToTierList: (id: string, key: EntryKey, snapshot?: WorkSnapshot) => void;
  removeFromTierList: (id: string, key: EntryKey) => void;
  /**
   * Deplace une cle vers un rang — ou vers le vivier quand `tierId` est `null`
   * — a l'indice demande. C'est l'operation du glisser-deposer, et la seule
   * qui compte : tout le reste du classement en decoule.
   */
  moveTierItem: (id: string, key: EntryKey, tierId: string | null, index: number) => void;
  addTier: (id: string) => void;
  patchTier: (id: string, tierId: string, patch: Partial<Omit<Tier, 'id'>>) => void;
  /** Supprime un rang ; ce qu'il tenait retourne au vivier, jamais a la poubelle. */
  removeTier: (id: string, tierId: string) => void;
  moveTier: (id: string, from: number, to: number) => void;
}

export const useLists = create<ListsState>((set, get) => {
  /* Un seul point d'écriture : l'horodatage et la sauvegarde ne peuvent pas
     s'oublier dans une opération qu'on ajoutera plus tard. */
  const ecrire = (tables: Tables) => {
    set(tables);
    queueWrite(K_LISTS, envelope(LISTS_VERSION, tables));
  };

  const tables = (): Tables => ({ lists: get().lists, tierLists: get().tierLists });

  const majListe = (id: string, fn: (l: CustomList) => CustomList) => {
    const t = tables();
    const liste = t.lists[id];
    if (!liste) return;
    ecrire({ ...t, lists: { ...t.lists, [id]: { ...fn(liste), updatedAt: now() } } });
  };

  const majTier = (id: string, fn: (l: TierList) => TierList) => {
    const t = tables();
    const liste = t.tierLists[id];
    if (!liste) return;
    ecrire({ ...t, tierLists: { ...t.tierLists, [id]: { ...fn(liste), updatedAt: now() } } });
  };

  return {
    hydrated: false,
    lists: {},
    tierLists: {},

    async hydrate() {
      const { items, rewrite, recoveredFrom } = readVersioned<Tables>({
        raw: await storage.get<unknown>(K_LISTS),
        version: LISTS_VERSION,
        empty: vide,
        /* Rien à convertir : avant la version 1, il n'y avait pas de listes. */
        migrations: { 0: () => vide() },
      });
      if (recoveredFrom) console.warn(`[lists] ${recoveredFrom}`);

      set({ hydrated: true, lists: items.lists ?? {}, tierLists: items.tierLists ?? {} });
      if (rewrite) queueWrite(K_LISTS, envelope(LISTS_VERSION, items), 0);
    },

    createList(media, name) {
      const id = newId();
      const t = tables();
      const liste: CustomList = {
        id,
        media,
        name,
        /* Numérotée par défaut : une liste qu'on compose a un ordre, et c'est
           ce qui la distingue d'une étiquette. On l'enlève d'un clic. */
        numbered: true,
        items: [],
        createdAt: now(),
        updatedAt: now(),
      };
      ecrire({ ...t, lists: { ...t.lists, [id]: liste } });
      return id;
    },

    patchList(id, patch) {
      majListe(id, (l) => ({ ...l, ...patch }));
    },

    deleteList(id) {
      const t = tables();
      if (!t.lists[id]) return;
      const lists = { ...t.lists };
      delete lists[id];
      ecrire({ ...t, lists });
    },

    addToList(id, key, snapshot) {
      majListe(id, (l) =>
        /* Une œuvre ne figure qu'une fois : deux exemplaires du même titre
           dans un classement n'ont pas de sens, et le rang deviendrait faux. */
        l.items.some((i) => i.key === key)
          ? l
          : { ...l, items: [...l.items, { key }], snapshots: avec(l.snapshots, key, snapshot) },
      );
    },

    removeFromList(id, key) {
      majListe(id, (l) => ({
        ...l,
        items: l.items.filter((i) => i.key !== key),
        snapshots: sans(l.snapshots, key),
      }));
    },

    moveInList(id, from, to) {
      majListe(id, (l) => {
        const items = [...l.items];
        const [pris] = items.splice(from, 1);
        if (!pris) return l;
        /* Bornes rattrapées ici plutôt qu'aux sites d'appel : un `to` hors
           limites insérerait `undefined` et perdrait l'élément. */
        items.splice(Math.max(0, Math.min(items.length, to)), 0, pris);
        return { ...l, items };
      });
    },

    createTierList(media, name) {
      const id = newId();
      const t = tables();
      const tiers: Tier[] = RANGS_PAR_DEFAUT.map((r) => ({ id: newId(), ...r, items: [] }));
      const liste: TierList = {
        id,
        media,
        name,
        tiers,
        unranked: [],
        createdAt: now(),
        updatedAt: now(),
      };
      ecrire({ ...t, tierLists: { ...t.tierLists, [id]: liste } });
      return id;
    },

    patchTierList(id, patch) {
      const t = tables();
      const liste = t.tierLists[id];
      if (!liste) return;
      ecrire({
        ...t,
        tierLists: { ...t.tierLists, [id]: { ...liste, ...patch, updatedAt: now() } },
      });
    },

    deleteTierList(id) {
      const t = tables();
      if (!t.tierLists[id]) return;
      const tierLists = { ...t.tierLists };
      delete tierLists[id];
      ecrire({ ...t, tierLists });
    },

    addToTierList(id, key, snapshot) {
      majTier(id, (l) =>
        tierKeysOf(l).includes(key)
          ? l
          : {
              ...l,
              unranked: [...l.unranked, key],
              snapshots: avec(l.snapshots, key, snapshot),
            },
      );
    },

    removeFromTierList(id, key) {
      majTier(id, (l) => ({ ...sansCle(l, key), snapshots: sans(l.snapshots, key) }));
    },

    moveTierItem(id, key, tierId, index) {
      majTier(id, (l) => {
        /* Retiree partout D'ABORD : sans ca, deplacer une carte dans son
           propre rang la dupliquerait, et l'indice vise serait calcule sur une
           liste qui contient encore l'ancienne place. */
        const propre = sansCle(l, key);

        if (tierId === null) {
          const unranked = [...propre.unranked];
          unranked.splice(borne(index, unranked.length), 0, key);
          return { ...propre, unranked };
        }

        return {
          ...propre,
          tiers: propre.tiers.map((t) => {
            if (t.id !== tierId) return t;
            const items = [...t.items];
            items.splice(borne(index, items.length), 0, key);
            return { ...t, items };
          }),
        };
      });
    },

    addTier(id) {
      majTier(id, (l) => ({
        ...l,
        tiers: [
          ...l.tiers,
          /* En BAS : un rang qu'on ajoute est presque toujours le moins bon,
             et l'inserer en haut decalerait tout ce qui est deja classe. */
          { id: newId(), label: 'New', color: '#8b8b8b', items: [] },
        ],
      }));
    },

    patchTier(id, tierId, patch) {
      majTier(id, (l) => ({
        ...l,
        tiers: l.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
      }));
    },

    removeTier(id, tierId) {
      majTier(id, (l) => {
        const vise = l.tiers.find((t) => t.id === tierId);
        if (!vise) return l;
        return {
          ...l,
          tiers: l.tiers.filter((t) => t.id !== tierId),
          /* Ce que le rang tenait revient au vivier. Supprimer un rang est un
             geste de mise en page ; effacer le classement avec serait une
             perte que rien n'annonce. */
          unranked: [...l.unranked, ...vise.items],
        };
      });
    },

    moveTier(id, from, to) {
      majTier(id, (l) => {
        const tiers = [...l.tiers];
        const [pris] = tiers.splice(from, 1);
        if (!pris) return l;
        tiers.splice(borne(to, tiers.length), 0, pris);
        return { ...l, tiers };
      });
    },
  };
});
