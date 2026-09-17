import type { ReactNode } from 'react';
import styles from './Grid.module.css';

/**
 * Grille d'affiches. `auto-fill` plutôt qu'un nombre de colonnes fixe :
 * elle passe de 2 colonnes à 375 px à 7 en desktop sans une seule media query.
 */
export function Grid({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return <div className={`${styles.grid} ${dense ? styles.dense : ''}`}>{children}</div>;
}

/** Squelette d'attente — même gabarit que les cartes, pour éviter le saut de mise en page. */
export function GridSkeleton({ count = 18, dense = false }: { count?: number; dense?: boolean }) {
  return (
    <Grid dense={dense}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeleton} aria-hidden>
          <div className={`poster ${styles.pulse}`} />
          <div className={`${styles.line} ${styles.pulse}`} />
          <div className={`${styles.line} ${styles.lineShort} ${styles.pulse}`} />
        </div>
      ))}
    </Grid>
  );
}
