import { create } from 'zustand';
import type { SearchItem } from '../lib/quickSearch';
import { readRecent, saveRecent, withOpened } from '../lib/recentResults';

/**
 * Les derniers résultats ouverts depuis la recherche — voir `lib/recentResults`.
 *
 * Un store et non une lecture à chaque ouverture du champ : le panneau de
 * l'en-tête et la page de résultats écrivent la même liste, et le panneau doit
 * la voir changer sans recharger.
 */

interface RecentResultsState {
  items: SearchItem[];
  /** Un résultat vient d'être ouvert : il passe en tête. */
  remember: (item: SearchItem) => void;
  clear: () => void;
}

export const useRecentResults = create<RecentResultsState>((set, get) => ({
  items: readRecent(),

  remember(item) {
    const items = withOpened(get().items, item);
    saveRecent(items);
    set({ items });
  },

  clear() {
    saveRecent([]);
    set({ items: [] });
  },
}));
