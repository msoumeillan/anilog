import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MediaType } from '../types/library';
import styles from './Tags.module.css';

/**
 * Les tags d'une œuvre.
 *
 * AniList en renvoie beaucoup — 29 sur Attack on Titan — et de trois natures
 * différentes, qu'on ne peut pas afficher pareil :
 *
 *   - les pertinents (rang ≥ 60), qui décrivent vraiment l'œuvre ;
 *   - les marginaux, votés par une poignée de personnes ;
 *   - les SPOILERS, que montrer par défaut serait une faute.
 *
 * On affiche donc tous les pertinents — il y en avait 18 sur Attack on Titan
 * pour 12 montrés — et les deux autres groupes derrière un bouton chacun.
 */

/** Seuil de pertinence d'AniList : en dessous, le tag n'a convaincu personne. */
const RELEVANT = 60;

export interface MediaTag {
  name: string;
  rank: number;
  isMediaSpoiler: boolean;
}

export function Tags({ tags, media = 'anime' }: { tags: MediaTag[]; media?: MediaType }) {
  const [showMinor, setShowMinor] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);

  const byRank = [...tags].sort((a, b) => b.rank - a.rank);
  const safe = byRank.filter((t) => !t.isMediaSpoiler);
  const main = safe.filter((t) => t.rank >= RELEVANT);
  const minor = safe.filter((t) => t.rank < RELEVANT);
  const spoilers = byRank.filter((t) => t.isMediaSpoiler);

  if (tags.length === 0) return null;

  const chip = (t: MediaTag, spoiler = false) => (
    <Link
      key={t.name}
      /* Le média voyage avec le lien : un tag de manga ouvre des mangas. */
      to={`/tag/${encodeURIComponent(t.name)}${media === 'manga' ? '?media=manga' : ''}`}
      className={`${styles.chip} ${spoiler ? styles.spoiler : ''}`}
    >
      {t.name} <span className="faint">{t.rank}</span>
    </Link>
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.chips}>
        {main.map((t) => chip(t))}
        {showMinor && minor.map((t) => chip(t))}
        {showSpoilers && spoilers.map((t) => chip(t, true))}
      </div>

      <div className={styles.toggles}>
        {minor.length > 0 && !showMinor && (
          <button type="button" className={styles.toggle} onClick={() => setShowMinor(true)}>
            Show {minor.length} less relevant {minor.length > 1 ? 'tags' : 'tag'}
          </button>
        )}
        {/* Bouton distinct, et jamais ouvert par défaut : c'est le seul groupe
            dont l'affichage gâche quelque chose. */}
        {spoilers.length > 0 && !showSpoilers && (
          <button type="button" className={styles.toggle} onClick={() => setShowSpoilers(true)}>
            Show {spoilers.length} spoiler {spoilers.length > 1 ? 'tags' : 'tag'}
          </button>
        )}
      </div>
    </div>
  );
}
