import { useEffect, useRef } from 'react';

/**
 * Sentinelle de chargement au défilement.
 *
 * Un élément invisible posé après une liste : quand il approche du bas de
 * l'écran, il déclenche `onVisible`. On observe l'intersection plutôt que
 * d'écouter le scroll — un écouteur se déclencherait à chaque pixel.
 *
 * À ne poser qu'en FIN de page. Au milieu d'un écran, une liste qui s'allonge
 * toute seule repousse indéfiniment ce qui la suit.
 *
 * Note : un IntersectionObserver ne se déclenche pas dans un onglet caché ou
 * non composé. C'est normal, et c'est aussi ce qui empêche de le vérifier
 * autrement que dans un vrai navigateur au premier plan.
 */
export function AutoLoad({ active, onVisible }: { active: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const io = new IntersectionObserver(
      // Un observateur livre toujours au moins une entrée, mais rien dans le
      // type ne le garantit — on ne lit donc pas l'indice les yeux fermés.
      ([entry]) => {
        if (entry?.isIntersecting) onVisible();
      },
      { rootMargin: '500px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [active, onVisible]);

  return <div ref={ref} aria-hidden />;
}
