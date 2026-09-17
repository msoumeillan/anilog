import { Star } from 'lucide-react';
import { useFavourites, useIsFavourite } from '../store/favourites';
import type { FavouriteKey } from '../lib/ids';
import styles from './FavouriteButton.module.css';

/**
 * Mettre en favori : une œuvre, un personnage, un membre du staff, un studio.
 *
 * Le favori emporte le NOM et l'IMAGE au moment du clic : le profil les
 * affiche ensuite sans réseau, comme le reste de la bibliothèque. Sans cette
 * copie, un top de cinq personnages coûterait cinq requêtes à chaque
 * ouverture du profil.
 *
 * La clé arrive CONSTRUITE, par `entryKey`, `mbEntryKey` ou `personKey`. Le
 * bouton ne la fabrique pas à partir d'un genre et d'un nombre : c'est ainsi
 * que la fiche MangaBaka et la fiche AniList désignaient la même case avec
 * deux œuvres différentes. Le nom de la fonction dit désormais de quel espace
 * vient l'identifiant, et se tromper demande de le dire à voix haute.
 */
export function FavouriteButton({
  favKey,
  id,
  name,
  image,
  href,
  compact,
}: {
  favKey: FavouriteKey;
  /** L'identifiant dans l'espace que la clé nomme. Affichage seulement. */
  id: number;
  name: string;
  image?: string | null;
  /** Où mène le favori. Recopié : voir `Favourite.href`. */
  href?: string;
  /** Sans libellé, pour une barre déjà chargée. */
  compact?: boolean;
}) {
  const toggle = useFavourites((s) => s.toggle);
  const isFav = useIsFavourite(favKey);

  return (
    <button
      type="button"
      className={`btn ${isFav ? styles.on : 'btn--quiet'}`}
      aria-pressed={isFav}
      title={isFav ? 'Remove from favourites' : 'Add to favourites'}
      onClick={() => toggle({ key: favKey, id, name, image: image ?? undefined, href })}
    >
      <Star size={15} strokeWidth={2} fill={isFav ? 'currentColor' : 'none'} aria-hidden />
      {!compact && (isFav ? 'Favourite' : 'Add to favourites')}
    </button>
  );
}
