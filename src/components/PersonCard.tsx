import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './PersonCard.module.css';

/**
 * Carte d'une personne — personnage ou membre du staff.
 *
 * La même partout : aperçu d'une fiche anime, fiche seiyuu, pages « tous les
 * personnages » et « tout le staff ». D'où `to` plutôt qu'un identifiant : la
 * carte ne décide pas où elle mène.
 *
 * `link` est une seconde destination, le doubleur d'un personnage. Deux liens
 * frères et non imbriqués : un `<a>` dans un `<a>` est invalide, et le
 * navigateur en fait ce qu'il veut.
 */
export function PersonCard({
  to,
  name,
  image,
  role,
  link,
  onOpen,
}: {
  to: string;
  name: string;
  image: string | null;
  role?: string | null;
  link?: { to: string; label: string } | null;
  /** Appelé à l'ouverture — voir `MediaCardProps.onOpen`. */
  onOpen?: () => void;
}) {
  return (
    <div className={styles.card}>
      <Link to={to} className={styles.main} onClick={onOpen}>
        <div className={styles.face}>{image && <img src={image} alt="" loading="lazy" />}</div>
        <p className={styles.name}>{name}</p>
      </Link>
      {role && <p className={`label ${styles.role}`}>{role}</p>}
      {link && (
        <Link to={link.to} className={styles.sub}>
          {link.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Grille de cartes.
 *
 * `teaser` fige six colonnes : l'aperçu d'une fiche tient sur une ligne, sans
 * défilement horizontal — une barre de scroll dans une page qui défile déjà
 * verticalement cache autant qu'elle montre. Sans `teaser`, la grille remplit
 * la largeur disponible, pour les pages qui listent tout.
 */
export function PersonGrid({ teaser, children }: { teaser?: boolean; children: ReactNode }) {
  return <div className={teaser ? styles.gridTeaser : styles.gridFull}>{children}</div>;
}
