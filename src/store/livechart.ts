import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { envelope, readVersioned } from '../lib/versioned';
import { now } from '../lib/ids';
import {
  liveChart,
  LiveChartError,
  type RawLcSchedules,
  type RawLcSearch,
} from '../api/livechart/client';
import {
  SCHEDULES_BATCH,
  SEARCH_BATCH,
  schedulesQuery,
  searchQuery,
  type SearchItem,
} from '../api/livechart/queries';
import { frenchReleases, pickLiveChartId, type LcRelease } from '../lib/livechart';

/**
 * Ce que LiveChart a dit des sorties françaises.
 *
 * Un CACHE, comme celui des génériques — voir `store/themes`, qui explique la
 * différence avec ce qu'on a décidé. Rien ici ne se perd : tout se redemande.
 * La sauvegarde ne le contient donc pas, et n'a rien à faire pour ça — elle
 * nomme ses clés une par une.
 *
 * Persisté quand même, pour ne pas repayer à chaque visite ce que Cloudflare
 * fait payer cher — voir `api/livechart/client`. Deux tables, parce qu'elles
 * ne vieillissent pas au même rythme :
 *
 *   `ids`     — AniList → LiveChart. Un identifiant ne change pas : trouvé une
 *               fois, gardé pour toujours. Une série INTROUVABLE est notée
 *               aussi, sinon on la rechercherait à chaque visite.
 *   `sorties` — les sorties françaises connues. Elles bougent chaque semaine,
 *               et un épisode peut être décalé.
 *
 * Et le calendrier doit rester juste SANS ce store : LiveChart n'est pas une
 * API publique. S'il tombe, les cartes gardent l'heure japonaise et ADN.
 */

const K_LIVECHART = 'anilog:livechart';

/** Version du format persisté. Décision 3 — voir `lib/versioned`. */
const LIVECHART_VERSION = 1;

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;

/**
 * Six heures avant de redemander une série.
 *
 * LiveChart ne donne que le précédent et le prochain épisode : une sortie
 * passée reste juste pour la semaine où elle tombe, ce qui manque au bout de
 * six heures, c'est au pire l'épisode d'APRÈS — et un décalage annoncé.
 */
const FRAIS_MS = 6 * HEURE;

/** Une série introuvable aujourd'hui peut être ajoutée chez eux la semaine prochaine. */
const REESSAI_MS = 7 * JOUR;

/**
 * Après une panne, quinze minutes sans rien demander.
 *
 * La panne probable est un défi Cloudflare, et il dure : curl est resté bloqué
 * au moins 38 minutes, en réessayant toutes les quatre. Insister n'a aucune
 * chance de le lever plus tôt. En attendant, les cartes gardent ce que le
 * cache sait déjà.
 */
const PAUSE_MS = 15 * 60 * 1000;

/** Des sorties plus vieilles qu'un mois ne serviront plus à aucune semaine affichée. */
const OUBLI_MS = 30 * JOUR;

interface Correspondance {
  /** `null` : cherchée, pas trouvée. */
  lc: string | null;
  at: string;
}

interface Sorties {
  at: string;
  releases: LcRelease[];
}

/** Clés : l'identifiant AniList en texte, JSON n'ayant pas de clé nombre. */
interface LiveChartTable {
  ids: Record<string, Correspondance>;
  sorties: Record<string, Sorties>;
}

const vide = (): LiveChartTable => ({ ids: {}, sorties: {} });

interface LiveChartState {
  hydrated: boolean;
  table: LiveChartTable;
  /** Une synchronisation tourne. */
  loading: boolean;
  /** Dernière panne rencontrée, pour la dire à l'écran. */
  error: string | null;

  hydrate: () => Promise<void>;
  /**
   * Va chercher ce qui manque ou a vieilli pour ces séries. Un appel pendant
   * une synchronisation n'est pas perdu : le dernier est rejoué à la fin.
   */
  sync: (series: readonly SearchItem[]) => Promise<void>;
}

export const useLiveChart = create<LiveChartState>((set, get) => {
  /* Trois états de module, et non de store : personne ne les REGARDE. Les
     mettre dans le store provoquerait des rendus pour rien. */
  let lecture: Promise<void> | null = null;
  let enAttente: readonly SearchItem[] | null = null;
  let pauseJusqua = 0;

  const write = (table: LiveChartTable) => {
    set({ table });
    queueWrite(K_LIVECHART, envelope(LIVECHART_VERSION, table));
  };

  return {
    hydrated: false,
    table: vide(),
    loading: false,
    error: null,

    hydrate() {
      /* Une seule lecture, quel que soit le nombre d'appels : `sync` l'attend
         aussi, et une seconde lecture écraserait ce qu'une synchronisation
         vient d'écrire. */
      lecture ??= (async () => {
        const raw = await storage.get<unknown>(K_LIVECHART);
        const { items, rewrite, recoveredFrom } = readVersioned<LiveChartTable>({
          raw,
          version: LIVECHART_VERSION,
          empty: vide,
          migrations: {},
        });
        if (recoveredFrom) console.warn(`[livechart] reparti de zéro : ${recoveredFrom}`);

        const limite = Date.now() - OUBLI_MS;
        const sorties = Object.fromEntries(
          Object.entries(items.sorties).filter(([, s]) => Date.parse(s.at) >= limite),
        );
        const oublies = Object.keys(sorties).length !== Object.keys(items.sorties).length;
        const table = { ids: items.ids, sorties };

        set({ hydrated: true, table });
        if (rewrite || oublies) queueWrite(K_LIVECHART, envelope(LIVECHART_VERSION, table));
      })();
      return lecture;
    },

    async sync(series) {
      await get().hydrate();
      if (get().loading) {
        enAttente = series;
        return;
      }
      if (Date.now() < pauseJusqua) return;

      const uniques = [...new Map(series.map((s) => [s.id, s])).values()];
      const t = Date.now();
      set({ loading: true, error: null });

      try {
        // 1. Les séries encore jamais retrouvées chez LiveChart.
        const aChercher = uniques.filter((s) => {
          const c = get().table.ids[String(s.id)];
          return !c || (c.lc === null && Date.parse(c.at) < t - REESSAI_MS);
        });

        for (let i = 0; i < aChercher.length; i += SEARCH_BATCH) {
          const lot = aChercher.slice(i, i + SEARCH_BATCH);
          const { query, variables } = searchQuery(lot);
          const data = await liveChart<RawLcSearch>(query, variables);

          /* On repart de l'état courant à chaque lot, comme `store/themes` :
             la table a pu bouger pendant la requête. */
          const table = get().table;
          const ids = { ...table.ids };
          const at = now();
          for (const s of lot) {
            ids[String(s.id)] = { lc: pickLiveChartId(data[`a${s.id}`]?.nodes, s.id), at };
          }
          write({ ...table, ids });
        }

        // 2. Leurs sorties françaises, quand elles manquent ou ont vieilli.
        const aLire = uniques.flatMap((s) => {
          const lc = get().table.ids[String(s.id)]?.lc;
          if (!lc) return [];
          const connues = get().table.sorties[String(s.id)];
          return !connues || Date.parse(connues.at) < t - FRAIS_MS ? [{ id: s.id, lc }] : [];
        });

        for (let i = 0; i < aLire.length; i += SCHEDULES_BATCH) {
          const lot = aLire.slice(i, i + SCHEDULES_BATCH);
          const { query, variables } = schedulesQuery(lot);
          const data = await liveChart<RawLcSchedules>(query, variables);

          const table = get().table;
          const sorties = { ...table.sorties };
          const at = now();
          for (const s of lot) {
            sorties[String(s.id)] = {
              at,
              releases: frenchReleases(data[`l${s.id}`]?.releaseSchedules?.nodes),
            };
          }
          write({ ...table, sorties });
        }
      } catch (e) {
        /* Deux pannes qui ne se soignent pas pareil. Un refus du réseau — défi
           Cloudflare, coupure — passe : on réessaie dans quinze minutes. Une
           réponse 200 qui REFUSE la requête dit que LiveChart a changé son
           schéma, ou qu'un lot est trop lourd : réessayer n'y changera rien
           avant une nouvelle version de l'app, donc plus rien jusqu'au
           prochain chargement. */
        const refusee = e instanceof LiveChartError && e.status === 200;
        pauseJusqua = refusee ? Number.POSITIVE_INFINITY : Date.now() + PAUSE_MS;
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ loading: false });
      }

      const suite = enAttente;
      enAttente = null;
      if (suite) void get().sync(suite);
    },
  };
});
