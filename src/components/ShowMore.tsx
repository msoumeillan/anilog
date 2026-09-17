import styles from './ShowMore.module.css';

/**
 * Bouton de chargement d'une section. Discret : il ne doit pas rivaliser
 * avec les actions de suivi, qui sont les seules à porter l'accent.
 */
export function ShowMore({
  onClick,
  loading,
  label = 'Show more',
}: {
  onClick: () => void;
  loading: boolean;
  label?: string;
}) {
  return (
    <button type="button" className={styles.more} onClick={onClick} disabled={loading}>
      {loading ? 'Loading…' : label}
    </button>
  );
}
