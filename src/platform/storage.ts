/**
 * Couche de stockage. Décision 5.
 *
 * Tout le reste de l'app passe par ici et ne connaît jamais `localStorage`
 * ni IndexedDB. C'est ce qui rend indolores les trois changements qui arrivent :
 *
 *   - passer à IndexedDB quand le volume grossit (fait : c'est le défaut ici)
 *   - passer à Preferences/SQLite le jour où l'app tourne dans Capacitor
 *   - brancher une synchro serveur par-dessus
 *
 * L'interface est asynchrone même quand l'implémentation ne l'est pas :
 * un `get` synchrone aujourd'hui interdirait IndexedDB demain.
 */
import {
  get as idbGet,
  set as idbSet,
  del as idbDel,
  entries as idbEntries,
  createStore,
} from 'idb-keyval';

export interface Storage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  /** Toutes les paires dont la clé commence par `prefix`. */
  byPrefix<T>(prefix: string): Promise<[string, T][]>;
  readonly backend: 'indexeddb' | 'localstorage' | 'memory';
}

// ─────────────────────────────────────────────────────────────
//  IndexedDB — le chemin normal
// ─────────────────────────────────────────────────────────────

function indexedDbStorage(): Storage | null {
  if (typeof indexedDB === 'undefined') return null;
  const store = createStore('anilog', 'kv');
  return {
    backend: 'indexeddb',
    async get<T>(key: string) {
      return (await idbGet<T>(key, store)) ?? null;
    },
    async set<T>(key: string, value: T) {
      await idbSet(key, value, store);
    },
    async del(key: string) {
      await idbDel(key, store);
    },
    async byPrefix<T>(prefix: string) {
      const all = await idbEntries<string, T>(store);
      return all.filter(([k]) => typeof k === 'string' && k.startsWith(prefix));
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  localStorage — repli quand IndexedDB est indisponible
//  (navigation privée sur certains navigateurs, site data bloqué…)
// ─────────────────────────────────────────────────────────────

function localStorageStorage(): Storage | null {
  try {
    const probe = '__anilog_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch {
    return null;
  }
  return {
    backend: 'localstorage',
    async get<T>(key: string) {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    async del(key: string) {
      localStorage.removeItem(key);
    },
    async byPrefix<T>(prefix: string) {
      const out: [string, T][] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(prefix)) continue;
        const v = await this.get<T>(k);
        if (v !== null) out.push([k, v]);
      }
      return out;
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  Mémoire — dernier recours, pour que l'app tourne quand même
// ─────────────────────────────────────────────────────────────

function memoryStorage(): Storage {
  const map = new Map<string, unknown>();
  return {
    backend: 'memory',
    async get<T>(key: string) {
      return (map.get(key) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      map.set(key, value);
    },
    async del(key: string) {
      map.delete(key);
    },
    async byPrefix<T>(prefix: string) {
      return [...map.entries()].filter(([k]) => k.startsWith(prefix)) as [string, T][];
    },
  };
}

export const storage: Storage = indexedDbStorage() ?? localStorageStorage() ?? memoryStorage();

// ─────────────────────────────────────────────────────────────
//  Écriture différée
// ─────────────────────────────────────────────────────────────

const pending = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Programme une écriture. Les appels rapprochés sur la même clé sont fusionnés :
 * cocher cinq épisodes d'affilée ne produit qu'une écriture par entrée.
 *
 * C'est la correction de fond du `saveData()` de la v1, qui re-sérialisait
 * l'intégralité de la bibliothèque à chaque clic.
 */
export function queueWrite<T>(key: string, value: T, delayMs = 400): void {
  pending.set(key, value);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushWrites, delayMs);
}

async function flushWrites(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = [...pending.entries()];
  pending.clear();
  for (const [key, value] of batch) {
    try {
      await storage.set(key, value);
    } catch (e) {
      // Quota dépassé ou stockage refusé : on le signale sans casser l'app.
      console.error(`[storage] écriture impossible pour ${key}`, e);
    }
  }
}

/** À brancher sur `visibilitychange` : ne pas perdre une écriture en attente. */
export function installFlushOnHide(): () => void {
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushWrites();
  };
  document.addEventListener('visibilitychange', onHide);
  return () => document.removeEventListener('visibilitychange', onHide);
}
