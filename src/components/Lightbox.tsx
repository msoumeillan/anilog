import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import styles from './Lightbox.module.css';

/**
 * Une image, en grand, seule.
 *
 * Radix comme la `Modal` — et une seconde `Dialog` par-dessus la première
 * quand elle s'ouvre depuis la galerie : Radix empile les couches, rend le
 * focus à celle du dessous et fait répondre Échap à la plus haute. Écrire
 * cette pile à la main est exactement le genre de chose qui marche sur le
 * moment et lâche au troisième cas.
 *
 * L'image ne remplit pas l'écran de force : elle garde ses proportions et
 * s'arrête à ce qu'elle vaut. Une affiche étirée n'est pas une affiche vue en
 * grand.
 */
export function Lightbox({
  open,
  onOpenChange,
  src,
  title,
  caption,
  onPrev,
  onNext,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | undefined;
  /** Pour les lecteurs d'écran : une fenêtre sans titre n'est pas annonçable. */
  title: string;
  caption?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  /**
   * Agir sans refermer — retenir l'affiche qu'on est en train de regarder.
   * `doneLabel` dit ce qu'est devenue l'image : déjà en service, ou retenue
   * en attendant confirmation. Les deux se ressemblent trop pour partager un
   * mot.
   */
  action?: { label: string; done: boolean; doneLabel?: string; onClick: () => void };
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          /*
           * Cliquer à côté de l'image referme.
           *
           * Radix ferme normalement au clic « dehors », mais ici il n'y a pas
           * de dehors : le contenu occupe tout l'écran pour pouvoir centrer
           * l'image, si bien que le survol de l'ombre appartient encore à la
           * fenêtre. On le rétablit donc à la main.
           *
           * `e.target === e.currentTarget` est ce qui distingue le fond de ce
           * qu'il entoure : un clic sur l'image, sur une flèche ou sur « Use
           * this poster » a pour cible un enfant, et ne ferme rien.
           */
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
        >
          <Dialog.Title className={styles.srOnly}>{title}</Dialog.Title>

          {src && <img className={styles.image} src={src} alt="" />}

          {/* Rien à parcourir ni à décider : pas de barre. Deux flèches mortes
              sous une image qu'on est simplement venu regarder n'annoncent
              qu'une chose, qu'il manque quelque chose. */}
          {(onPrev || onNext || action || caption) && (
            <div className={styles.bar}>
              <button
                type="button"
                className={`btn btn--quiet ${styles.step}`}
                aria-label="Previous image"
                disabled={!onPrev}
                onClick={onPrev}
              >
                <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />
              </button>

              {caption && <span className={styles.caption}>{caption}</span>}

              {action && (
                <button
                  type="button"
                  className={`btn ${action.done ? 'btn--quiet' : 'btn--accent'}`}
                  aria-pressed={action.done}
                  onClick={action.onClick}
                >
                  {action.done ? (
                    <>
                      <Check size={16} strokeWidth={2.4} aria-hidden />
                      {action.doneLabel ?? 'In use'}
                    </>
                  ) : (
                    action.label
                  )}
                </button>
              )}

              <button
                type="button"
                className={`btn btn--quiet ${styles.step}`}
                aria-label="Next image"
                disabled={!onNext}
                onClick={onNext}
              >
                <ChevronRight size={18} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
          )}

          <Dialog.Close className={styles.close} aria-label="Close">
            <X size={20} strokeWidth={2} aria-hidden />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
