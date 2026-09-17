import { ChevronLeft } from 'lucide-react';
import { useGoBack } from '../lib/useGoBack';
import styles from '../pages/Entity.module.css';

/** Retour à l'écran précédent — voir `useGoBack` pour le pourquoi. */
export function BackButton({ label = 'Back' }: { label?: string }) {
  const goBack = useGoBack();
  return (
    <button type="button" className={`btn btn--quiet ${styles.back}`} onClick={goBack}>
      <ChevronLeft size={18} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
