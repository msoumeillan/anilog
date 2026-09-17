import { Select } from '../components/Select';
import { FORMATS, SEASONS, YEARS } from '../lib/mediaOptions';
import {
  LETTERS,
  THEME_KINDS,
  browseSorts,
  type BrowseFilters,
  type MusicCategory,
} from '../lib/musicBrowse';
import { songSorts, type SongKind, type SongSort } from '../lib/songList';
import styles from './Music.module.css';

/** D'où vient une liste de génériques : le catalogue, la bibliothèque, les favoris. */
export type MusicSource = 'all' | 'library' | 'favourites';

const SOURCES: { value: MusicSource; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'library', label: 'My library' },
  { value: 'favourites', label: 'Favourites' },
];

/**
 * La barre de filtres de Musiques.
 *
 * Sortie de la page le 14 septembre 2026, qui passait les 750 lignes : elle
 * ne fait qu'AFFICHER des réglages et rendre ce qu'on choisit. Ce qui les
 * écrit dans l'adresse, les efface d'une catégorie à l'autre, remet la page à
 * un — tout ce qui décide — reste dans Musiques, derrière `onChange`.
 */
export function MusicFilters({
  cat,
  source,
  type,
  filtres,
  sortLocal,
  local,
  cherche,
  onChange: setParam,
}: {
  cat: MusicCategory;
  source: MusicSource;
  type: SongKind;
  filtres: BrowseFilters;
  sortLocal: SongSort;
  /** Une liste de la bibliothèque ou des favoris, triée ici plutôt qu'au serveur. */
  local: boolean;
  cherche: boolean;
  onChange: (nom: string, valeur: string | null) => void;
}) {
  return (
    <div className={styles.filtres}>
      {cat === 'themes' && (
        <Select
          label="Source"
          value={source}
          onChange={(v) => setParam('src', v === 'all' ? null : v)}
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      )}

      {cat === 'themes' && (
        <Select
          label="Type"
          value={type}
          onChange={(v) => setParam('type', v === 'all' ? null : v)}
        >
          {THEME_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      )}

      {/* Les filtres d'index n'ont pas cours sur une recherche : leur API
    refuse de trier un résultat de recherche — « Sorting by this value
    is not supported when using the search parameter » — et la
    première lettre n'aurait plus rien à filtrer. */}
      {!local && !cherche && cat !== 'themes' && (
        <Select
          label="First letter"
          value={filtres.letter}
          onChange={(v) => setParam('letter', v || null)}
        >
          <option value="">Any</option>
          {LETTERS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      )}

      {!local && !cherche && cat === 'anime' && (
        <>
          <Select
            label="Season"
            value={filtres.season}
            onChange={(v) => setParam('season', v || null)}
          >
            <option value="">Any</option>
            {SEASONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>

          <Select label="Year" value={filtres.year} onChange={(v) => setParam('year', v || null)}>
            <option value="">Any</option>
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </Select>

          <Select
            label="Format"
            value={filtres.format}
            onChange={(v) => setParam('format', v || null)}
          >
            <option value="">Any</option>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </>
      )}

      {cherche ? (
        <p className={`label ${styles.pertinence}`}>Sorted by relevance</p>
      ) : (
        <Select
          label="Sort by"
          value={local ? sortLocal : filtres.sort}
          onChange={(v) => setParam('sort', v)}
        >
          {(local ? songSorts(false) : browseSorts(cat)).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
