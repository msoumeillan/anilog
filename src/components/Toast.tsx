import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { useToast } from '../store/toast';
import styles from './Toast.module.css';

/**
 * Le bandeau de confirmation — voir `store/toast`.
 *
 * Monté une fois, dans `App`, à côté du lecteur : il doit pouvoir parler par-
 * dessus une fenêtre ouverte comme par-dessus le lecteur agrandi.
 *
 * La zone `role="status"` existe TOUJOURS, vide ou non : un lecteur d'écran
 * n'annonce de façon fiable que ce qui change dans une zone déjà présente, pas
 * une zone qui apparaît avec son texte.
 */

/** Le temps de lire « Idol was added to “Soirée idols” », et un peu plus. */
const DUREE_MS = 3500;

export function Toast() {
  const message = useToast((s) => s.message);
  const dismiss = useToast((s) => s.dismiss);

  useEffect(() => {
    if (!message) return;
    const minuteur = setTimeout(() => dismiss(message.id), DUREE_MS);
    return () => clearTimeout(minuteur);
  }, [message, dismiss]);

  return (
    <div className={styles.zone} role="status" aria-live="polite">
      {message && (
        /* La clé remonte le bandeau à chaque message : son entrée se rejoue,
           et deux confirmations identiques d'affilée se voient comme deux. */
        <p key={message.id} className={styles.toast}>
          <Check className={styles.coche} size={15} strokeWidth={2.6} aria-hidden />
          {message.text}
        </p>
      )}
    </div>
  );
}
