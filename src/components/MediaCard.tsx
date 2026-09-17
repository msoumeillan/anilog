import { useState } from 'react';
import { Check } from 'lucide-react';
import { MaybeLink } from './MaybeLink';
import { mediaHref } from '../lib/routes';
import { useLibrary } from '../store/library';
import { useArtworkKey } from '../store/artwork';
import { artUrl } from '../lib/artwork';
import { mediaTip, type TipFacts } from '../lib/mediaTip';
import { outOfTen } from '../lib/score';
import { entryKey } from '../lib/ids';
import type { EntryKey, MediaType } from '../types/library';
import styles from './MediaCard.module.css';

/**
 * La carte affiche. Un seul composant pour toute l'app — la v1 en avait
 * cinq copies divergentes (grille, profil, page personne, top, recherche).
 */

export interface MediaCardProps {
  media: MediaType;
  id: number;
  title: string;
  cover: string | null;
  score?: number | null;
  /** Ligne secondaire : « TV · 2019 », « 29 tomes »… */
  meta?: string;
  /** De quoi remplir la bulle au survol. Absent = pas de bulle. */
  tip?: TipFacts;
  /** Compact = grilles denses ; large = mises en avant. */
  size?: 'compact' | 'large';
  /**
   * Destination alternative, HORS du catalogue AniList.
   *
   * Quand elle est posée, la pastille « dans la bibliothèque » disparaît : les
   * identifiants ne viennent pas du même espace, et la série 3397 de MangaBaka
   * n'est pas le manga 3397 d'AniList. Les confondre marquerait comme suivie
   * une œuvre qui ne l'est pas.
   */
  href?: string;
  /**
   * La clé de bibliothèque, quand l'appelant la tient.
   *
   * Sans elle, la carte la reconstruit depuis `media` et `id` — juste pour un
   * identifiant AniList, faux pour tout le reste. Une liste, un favori, une
   * collection connaissent déjà la vraie clé : la donner évite d'avoir à
   * deviner, et c'est elle qui retrouve l'affiche choisie.
   */
  libraryKey?: EntryKey;
  /**
   * Appelé quand on ouvre la carte.
   *
   * La page de résultats s'en sert pour retenir ce qu'on y a ouvert : ce sont
   * les mêmes lignes que le panneau de l'en-tête propose ensuite, champ vide.
   */
  onOpen?: () => void;
}

/** Largeur de la bulle, en dur ici parce qu'il faut la connaître AVANT de l'afficher. */
const TIP_WIDTH = 230;

export function MediaCard({
  media,
  id,
  title,
  cover,
  score,
  meta,
  tip,
  size = 'compact',
  href,
  libraryKey,
  onOpen,
}: MediaCardProps) {
  /* La clé donnée prime. Sinon on la reconstruit — mais SEULEMENT quand la
     carte ne pointe pas ailleurs : sous `href`, l'identifiant ne vient pas
     d'AniList, et la série 3397 de MangaBaka n'est pas le manga 3397. */
  const cle = libraryKey ?? (href ? undefined : entryKey(media, id));
  const inLibrary = useLibrary((s) => (cle ? Boolean(s.entries[cle]) : false));

  const facts = tip ? mediaTip(tip) : null;
  /* `null` = pas survolée, donc pas de bulle DANS LE DOM. Une bulle par carte
     posée en permanence et cachée en CSS, c'est cinquante bulles pour une
     seule visible — et on vient justement d'alléger les grilles. */
  const [side, setSide] = useState<'start' | 'end' | null>(null);

  /* Le côté se décide à l'entrée : à droite normalement, à gauche quand la
     carte est trop près du bord pour que la bulle y tienne. Sans ça, la
     dernière colonne pousserait la page à défiler horizontalement. */
  const enter = (element: HTMLElement) => {
    if (!facts) return;
    const rect = element.getBoundingClientRect();
    setSide(rect.right + TIP_WIDTH + 16 > window.innerWidth ? 'start' : 'end');
  };
  /* L'affiche choisie l'emporte partout, pas seulement sur la fiche : la
     changer puis retrouver l'ancienne dans sa bibliothèque n'aurait aucun
     sens. `w342` suffit à une carte, même sur écran dense. */
  const art = artUrl(useArtworkKey(cle)?.poster, 'w342') ?? cover;

  return (
    <MaybeLink
      to={href ?? mediaHref(media, id)}
      className={`${styles.card} ${size === 'large' ? styles.large : ''}`}
      title={title}
      /* Le titre et l'affiche sont sous les yeux : la fiche les peint tout de
         suite plutôt que d'afficher « Loading… » pendant qu'AniList répond —
         2 à 3 secondes, mesurées, et sur lesquelles on ne peut rien. */
      state={{ title, cover: art ?? undefined }}
      onPointerEnter={enter}
      onPointerLeave={() => setSide(null)}
      onClick={onOpen}
    >
      {facts && side && (
        /* `aria-hidden` : tout ce qu'elle dit est deja dans la fiche, et une
           bulle qui s'annonce a chaque carte survolee rendrait la grille
           inecoutable au lecteur d'ecran. */
        <span className={`${styles.tip} ${side === 'start' ? styles.tipStart : ''}`} aria-hidden>
          {facts.when && <span className={styles.tipWhen}>{facts.when}</span>}
          {facts.studio && <span className={styles.tipStudio}>{facts.studio}</span>}
          {facts.what && <span className={styles.tipWhat}>{facts.what}</span>}
        </span>
      )}

      <div className={`poster ${styles.art}`}>
        {art ? (
          <img className={styles.img} src={art} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className={`${styles.img} placeholder`} />
        )}

        {/* Sur 10 : c'est l'unite dans laquelle on juge une oeuvre, et la
            fiche dit deja le meme nombre. Voir `outOfTen`. */}
        {outOfTen(score) && <span className={styles.score}>{outOfTen(score)}</span>}

        {inLibrary && (
          <span className={styles.pip} aria-label="In your library">
            <Check size={12} strokeWidth={3} aria-hidden />
          </span>
        )}
      </div>

      <p className={styles.title}>{title}</p>
      {meta && <p className={`label ${styles.meta}`}>{meta}</p>}
    </MaybeLink>
  );
}
