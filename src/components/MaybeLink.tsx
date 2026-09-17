import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Rend un lien quand la destination existe, sinon le même contenu inerte.
 *
 * Sert aujourd'hui aux entrées manga : le mode manga n'est pas construit, donc
 * pointer vers `/manga/:id` menait à une page « not found ». On préfère
 * afficher l'information — il existe bien une adaptation manga — sans
 * promettre une navigation qui n'existe pas encore.
 */
export function MaybeLink({
  to,
  className,
  title,
  state,
  onPointerEnter,
  onPointerLeave,
  onClick,
  children,
}: {
  to: string | null;
  className?: string;
  title?: string;
  /** Ce que la destination peut afficher avant d'avoir reçu sa réponse — voir `lib/mediaHint`. */
  state?: unknown;
  /**
   * Survol et focus réunis : la carte les traite pareil, une bulle qui ne
   * s'ouvrirait qu'à la souris serait invisible au clavier.
   */
  onPointerEnter?: (element: HTMLElement) => void;
  onPointerLeave?: () => void;
  /** Au clic sur le lien — rien quand il n'y a pas de destination. */
  onClick?: () => void;
  children: ReactNode;
}) {
  const survol = {
    onMouseEnter: onPointerEnter
      ? (e: { currentTarget: HTMLElement }) => onPointerEnter(e.currentTarget)
      : undefined,
    onFocus: onPointerEnter
      ? (e: { currentTarget: HTMLElement }) => onPointerEnter(e.currentTarget)
      : undefined,
    onMouseLeave: onPointerLeave,
    onBlur: onPointerLeave,
  };

  if (!to) {
    return (
      <div className={className} title={title} aria-disabled="true" {...survol}>
        {children}
      </div>
    );
  }
  return (
    <Link to={to} className={className} title={title} state={state} onClick={onClick} {...survol}>
      {children}
    </Link>
  );
}
