import type { ReactNode } from 'react';
import styles from './Select.module.css';

/**
 * Un sélecteur étiqueté — le contrôle de base des barres de filtres.
 *
 * Élément natif volontairement : sur mobile il ouvre le sélecteur du système,
 * il est accessible au clavier sans rien écrire, et il ne coûte pas un octet
 * de JavaScript. Une liste déroulante maison ne ferait rien de mieux ici.
 */
export function Select<T extends string>({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className="label">{label}</span>
      <select
        className={styles.select}
        value={value}
        disabled={disabled}
        /* Le DOM ne connaît que des chaînes : la conversion vers le type de
           l'appelant se fait ICI, une fois, plutôt qu'un `as SortKey` recopié
           dans chaque barre de filtres. Les `<option>` sont écrits juste à
           côté de l'appel, donc la valeur en sort bien. */
        onChange={(e) => onChange(e.target.value as T)}
      >
        {children}
      </select>
    </label>
  );
}
