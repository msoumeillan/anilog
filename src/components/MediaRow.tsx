import { MaybeLink } from './MaybeLink';
import { mediaHref } from '../lib/routes';
import { useResolvePoster } from '../store/artwork';
import { displayTitle } from '../lib/title';
import styles from './MediaRow.module.css';

/**
 * Une rangée d'œuvres citées : relations, recommandations, adaptations.
 *
 * Le même bloc servait quatre fois — deux sur la fiche anime, deux sur la
 * fiche manga — et la v1 est morte de ce genre de recopie : elle avait CINQ
 * cartes affiche divergentes. Une seule ici, et une seule à corriger.
 *
 * Chaque vignette emporte son titre et son affiche dans l'état de navigation :
 * la destination se peint avant qu'AniList réponde, ce qui prend deux à trois
 * secondes — voir `lib/mediaHint`.
 */

export interface RowItem {
  id: number;
  type: string;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { large: string | null };
  /** Ligne au-dessus du titre : « SEQUEL · ANIME ». */
  above?: string;
  /** Ligne en dessous : la note, quand elle a un sens. */
  below?: string;
  /**
   * Destination alternative, hors du catalogue AniList — la fiche MangaBaka
   * d'une œuvre qu'il ne connaît pas. Même échappatoire que sur `MediaCard`.
   */
  href?: string;
}

export function MediaRow({ items }: { items: RowItem[] }) {
  const posterOf = useResolvePoster('w185');

  return (
    <div className={styles.row}>
      {items.map((item) => {
        const cover = posterOf(item.type, item.id, item.coverImage.large);
        const title = displayTitle(item.title);
        return (
          <MaybeLink
            key={`${item.above ?? ''}-${item.id}`}
            to={item.href ?? mediaHref(item.type, item.id)}
            className={styles.item}
            state={{ title, cover }}
          >
            <div className={`${styles.art} placeholder`}>
              {cover && <img src={cover} alt="" loading="lazy" />}
            </div>
            {item.above && <p className="label">{item.above}</p>}
            <p className={styles.name}>{title}</p>
            {item.below && <p className="label">{item.below}</p>}
          </MaybeLink>
        );
      })}
    </div>
  );
}
