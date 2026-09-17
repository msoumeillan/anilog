import { entryKey, mbEntryKey, parseEntryKey } from './ids';
import { RESULT_KINDS, type SearchItem } from './quickSearch';

/**
 * Les derniers résultats ouverts depuis la recherche, proposés quand on clique
 * dans le champ vide.
 *
 * Retrouver la série qu'on a regardée hier, c'était la retaper. Et au doigt,
 * sur mobile, taper coûte plus que partout ailleurs.
 *
 * `localStorage` et non la couche `platform/storage`, comme le volume du
 * lecteur : c'est une commodité de l'APPAREIL, pas une donnée de bibliothèque.
 * Rien à sauvegarder ni à synchroniser, et il la faut dès l'ouverture du
 * champ, sans attendre une lecture différée.
 */

const KEY = 'anilog:search:recent';

/** Huit lignes tiennent dans le panneau sans le faire défiler, même sur mobile. */
export const RECENT_MAX = 8;

/**
 * La liste après l'ouverture d'un résultat : lui en tête, sans doublon, et
 * pas plus de `RECENT_MAX`.
 *
 * Rouvrir un résultat le remonte, avec ce qu'il affiche AUJOURD'HUI : un titre
 * corrigé ou une nouvelle couverture remplacent l'ancienne ligne.
 */
export function withOpened(list: readonly SearchItem[], item: SearchItem): SearchItem[] {
  return [item, ...list.filter((i) => i.key !== item.key)].slice(0, RECENT_MAX);
}

const texte = (v: unknown): v is string => typeof v === 'string';

/**
 * Une ligne relue du stockage, si elle a bien la forme d'un résultat.
 *
 * Le stockage vient d'ailleurs : une version passée de l'app, une extension,
 * une main dans les outils du navigateur. Une ligne qui ne se lit pas est
 * écartée seule, sans emporter les autres. Et un lien doit rester INTERNE :
 * c'est lui que le panneau ouvre.
 */
function relue(v: unknown): SearchItem | null {
  if (typeof v !== 'object' || v === null) return null;
  if (!('key' in v && 'kind' in v && 'href' in v && 'title' in v && 'meta' in v && 'image' in v)) {
    return null;
  }
  const { key, kind, href, title, meta, image } = v;
  const genre = RESULT_KINDS.find((k) => k === kind);
  if (!texte(key) || !genre || !texte(title) || !texte(meta)) return null;
  if (!texte(href) || !href.startsWith('/') || href.startsWith('//')) return null;
  if (image !== null && !(texte(image) && image.startsWith('https://'))) return null;

  const item: SearchItem = { key, kind: genre, href, title, meta, image };
  if ('libraryKey' in v) {
    /* Reconstruite depuis sa lecture plutôt que recopiée : une clé qui ne se
       relit pas n'irait chercher aucun statut, ou le mauvais. */
    const cle = texte(v.libraryKey) ? parseEntryKey(v.libraryKey) : null;
    if (!cle) return null;
    item.libraryKey =
      cle.source === 'anilist' ? entryKey(cle.media, cle.anilistId) : mbEntryKey(cle.mangaBakaId);
  }
  return item;
}

/** Les derniers résultats retenus. Rien, ou rien de lisible : une liste vide. */
export function readRecent(): SearchItem[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data
      .map(relue)
      .filter((i): i is SearchItem => i !== null)
      .slice(0, RECENT_MAX);
  } catch {
    // Navigation privée, stockage refusé, JSON abîmé : on repart de rien.
    return [];
  }
}

export function saveRecent(list: readonly SearchItem[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* Sans effet : la liste vaudra pour cette visite, et un stockage refusé
       ne doit pas empêcher d'ouvrir un résultat. */
  }
}
