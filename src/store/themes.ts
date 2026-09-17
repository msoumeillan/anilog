import { create } from 'zustand';
import { storage, queueWrite } from '../platform/storage';
import { envelope, readVersioned } from '../lib/versioned';
import { now } from '../lib/ids';
import { animeThemes, type RawAnimeThemesBatch } from '../api/animethemes/client';
import { ANIME_THEMES_BATCH } from '../api/animethemes/queries';
import { themesByAnilistId, type Theme } from '../lib/themes';

/**
 * Le catalogue des génériques de la bibliothèque.
 *
 * Un CACHE, et il faut le dire clairement parce que la distinction gouverne
 * tout ce fichier : ce qui est ici peut être jeté et redemandé sans rien
 * perdre. Ce qu'on en pense — les notes, les favoris — vit dans `store/songs`,
 * qui est précieux. Mélanger les deux ferait qu'un vidage de cache emporterait
 * un jugement.
 *
 * Persisté quand même, et pour une raison mesurée : AnimeThemes met de 0,7 à
 * 10 secondes par requête selon l'heure, et une bibliothèque de trois cents
 * titres demande une douzaine de requêtes. Le garder en mémoire seulement
 * ferait repayer cette attente à chaque rechargement de page — exactement ce
 * qui « ramait » dans la v1.
 */

const K_THEMES = 'anilog:themes';

/** Version du format persisté. Décision 3 — voir `lib/versioned`. */
const THEMES_VERSION = 2;

const estObjet = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Une version v1 : `video`, UN fichier ou rien. Rend `null` dès que la forme
 * n'est pas celle qu'on a écrite — voir plus bas pourquoi on n'insiste pas.
 */
function versionV2(v: unknown): Record<string, unknown> | null {
  if (!estObjet(v)) return null;
  /* DÉJÀ au nouveau format sous l'ancien numéro : l'app a tourné quelques heures
     avec `videos` sans avoir monté la version, et un navigateur au cache vide a
     pu synchroniser pendant ce temps. Rien à convertir. */
  if (Array.isArray(v.videos)) return v;
  const { video, ...reste } = v;
  if (video === null) return { ...reste, videos: [] };
  return estObjet(video) ? { ...reste, videos: [video] } : null;
}

/** Un générique v1, ses versions converties — ou `null` s'il est illisible. */
function themeV2(t: unknown): Record<string, unknown> | null {
  if (!estObjet(t) || !Array.isArray(t.versions)) return null;
  const versions = t.versions.map(versionV2);
  if (versions.some((v) => v === null)) return null;
  return { ...t, versions };
}

/**
 * Les migrations du cache. On n'édite jamais une migration publiée.
 *
 * 1 → 2 : une version porte TOUTES ses vidéos (`videos`), et non plus la seule
 * meilleure (`video`). Le changement est venu avec le choix du fichier dans le
 * lecteur — et il a d'abord été publié SANS cette migration : un navigateur
 * qui avait déjà rempli ce cache lisait `versions[0].videos[0]` sur des
 * versions qui n'avaient que `video`, et l'onglet Musiques plantait en écran
 * noir. Le navigateur de test, lui, avait une bibliothèque vide : rien à lire,
 * rien à casser. C'est exactement le défaut que la décision 3 nomme.
 *
 * La conversion est EXACTE — `video` devient `videos: [video]` — pour ne pas
 * refaire payer à tout le monde la douzaine de requêtes lentes que ce cache
 * existe pour éviter. Mais une entrée qui n'a pas la forme attendue est
 * ÉCARTÉE entière, et pas à moitié : absente, elle sera redemandée à la
 * prochaine synchronisation ; gardée avec un générique en moins, elle
 * passerait pour fraîche pendant une semaine.
 */
const MIGRATIONS = {
  1: (items: unknown): unknown => {
    if (!estObjet(items)) return {};
    const out: Record<string, unknown> = {};

    for (const [id, entree] of Object.entries(items)) {
      if (!estObjet(entree) || !Array.isArray(entree.themes)) continue;
      const themes = entree.themes.map(themeV2);
      if (themes.some((t) => t === null)) continue;
      out[id] = { ...entree, themes };
    }

    return out;
  },
};

/**
 * Combien d'anime par requête.
 *
 * Vingt-cinq, et non les quatre-vingts que l'API accepte : leur temps de
 * réponse grandit avec le lot — 8,6 s mesurés pour 80 — et une barre de
 * progression qui n'avance qu'une fois par minute ne rassure personne. Des
 * lots courts donnent un écran qui se remplit.
 */
const PAR_LOT = 25;

/**
 * Au bout de combien de temps on redemande.
 *
 * Un générique diffusé ne change plus ; ce qui bouge, c'est l'ajout d'un thème
 * récent. Une semaine de retard là-dessus ne coûte rien, et évite de refaire
 * douze requêtes à chaque visite de l'onglet.
 */
const FRAIS_MS = 7 * 24 * 60 * 60 * 1000;

export interface CatalogueEntry {
  fetchedAt: string;
  /** Vide quand AnimeThemes ne connaît pas l'anime — voir `sync`. */
  themes: Theme[];
}

/** Clé : l'identifiant AniList en texte, parce que JSON n'a pas de clé nombre. */
type Table = Record<string, CatalogueEntry>;

export interface SyncProgress {
  done: number;
  total: number;
}

interface ThemesState {
  hydrated: boolean;
  themes: Table;
  /** Renseigné pendant une synchronisation, `null` sinon. */
  progress: SyncProgress | null;
  /** Dernière panne rencontrée, pour la dire à l'écran. */
  error: string | null;

  hydrate: () => Promise<void>;
  /** Va chercher ce qui manque ou ce qui a vieilli. `force` reprend tout. */
  sync: (anilistIds: readonly number[], force?: boolean) => Promise<void>;
  /** Interrompt la synchronisation en cours à la fin du lot courant. */
  stop: () => void;
  themesFor: (anilistId: number) => Theme[];
}

export const useThemes = create<ThemesState>((set, get) => {
  /* Un drapeau et non un état : personne ne le REGARDE, il sert seulement à
     arrêter la boucle entre deux lots. Le passer dans le store provoquerait un
     rendu pour rien. */
  let stopped = false;

  const write = (table: Table) => {
    set({ themes: table });
    queueWrite(K_THEMES, envelope(THEMES_VERSION, table));
  };

  return {
    hydrated: false,
    themes: {},
    progress: null,
    error: null,

    async hydrate() {
      const raw = await storage.get<unknown>(K_THEMES);
      const { items, rewrite, recoveredFrom } = readVersioned<Table>({
        raw,
        version: THEMES_VERSION,
        empty: () => ({}),
        migrations: MIGRATIONS,
      });
      if (recoveredFrom) console.warn(`[themes] repartie de zéro : ${recoveredFrom}`);

      set({ hydrated: true, themes: items });
      /* Sans délai, comme les favoris : une migration passée doit être sur le
         disque avant qu'un autre onglet ne relise l'ancienne forme. */
      if (rewrite) queueWrite(K_THEMES, envelope(THEMES_VERSION, items), 0);
    },

    async sync(anilistIds, force = false) {
      if (get().progress) return;

      const table = get().themes;
      const limite = Date.now() - FRAIS_MS;
      const aFaire = [...new Set(anilistIds)].filter((id) => {
        if (force) return true;
        const e = table[String(id)];
        return !e || Date.parse(e.fetchedAt) < limite;
      });

      if (aFaire.length === 0) return;

      stopped = false;
      set({ progress: { done: 0, total: aFaire.length }, error: null });

      try {
        for (let i = 0; i < aFaire.length; i += PAR_LOT) {
          if (stopped) break;
          const lot = aFaire.slice(i, i + PAR_LOT);
          const brut = await animeThemes<RawAnimeThemesBatch>(ANIME_THEMES_BATCH, { id: lot });
          const par = themesByAnilistId(brut);

          /* On repart de l'état courant à chaque lot : la table a pu bouger
             entre deux requêtes — une fiche ouverte dans un autre onglet de
             l'app écrit ici aussi. */
          const suivante = { ...get().themes };
          const horodatage = now();
          for (const id of lot) {
            /* Un anime absent de la réponse est INCONNU d'AnimeThemes, pas en
               panne. On l'écrit avec une liste vide : sans ça, il serait
               redemandé à chaque passage, et une bibliothèque pleine de vieux
               OVA referait tout le tour pour rien. */
            suivante[String(id)] = { fetchedAt: horodatage, themes: par.get(id) ?? [] };
          }
          write(suivante);
          set({ progress: { done: Math.min(i + PAR_LOT, aFaire.length), total: aFaire.length } });
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ progress: null });
      }
    },

    stop() {
      stopped = true;
    },

    themesFor(anilistId) {
      return get().themes[String(anilistId)]?.themes ?? [];
    },
  };
});
