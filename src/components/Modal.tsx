import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

/**
 * Fenêtre par-dessus la page.
 *
 * Radix plutôt qu'un `<div>` posé en `position: fixed` : une modale correcte
 * doit piéger le focus, revenir sur le déclencheur à la fermeture, répondre à
 * Échap, bloquer le défilement du fond et se déclarer aux lecteurs d'écran.
 * Chacun de ces points se rate silencieusement quand on l'écrit à la main.
 *
 * `wide` élargit la fenêtre pour un contenu qui se met lui-même en colonnes.
 * Le corps garde son `overflow` en filet de sécurité — un titre à rallonge ou
 * un texte très gros ne doivent pas couper les boutons — mais un contenu qui
 * force à défiler pour atteindre son bouton principal est un contenu à
 * remettre en page, pas à faire défiler.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  subtitle,
  wide,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  /** Contenu en deux colonnes : la fenêtre s'élargit pour lui laisser la place. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={`${styles.content} ${wide ? styles.wide : ''}`}>
          <header className={styles.head}>
            <div className={styles.headText}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              {subtitle && (
                <Dialog.Description className={styles.sub}>{subtitle}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className={styles.close} aria-label="Close">
              <X size={18} strokeWidth={2} aria-hidden />
            </Dialog.Close>
          </header>

          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
