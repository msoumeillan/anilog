import { useEffect, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { clampTime, clock } from '../lib/playback';
import styles from './PlayerBar.module.css';

/**
 * La frise du lecteur — où l'on en est, et y aller — et le curseur qui la
 * dessine, repris pour le volume.
 *
 * Sortie de PlayerBar le 14 septembre 2026, qui passait les 700 lignes. La
 * FEUILLE, elle, reste celle du lecteur, et c'est voulu : les règles de la
 * frise changent avec le mode — un trait en barre, une ligne sous l'image
 * agrandie, un voile en plein écran —, et des modules CSS séparés ne peuvent
 * pas se désigner l'un l'autre.
 */

/** Cinq secondes par flèche : le pas de tous les lecteurs vidéo. */
const PAS_CLAVIER: Record<string, number> = {
  ArrowRight: 5,
  ArrowUp: 5,
  ArrowLeft: -5,
  ArrowDown: -5,
};

/**
 * Où l'on en est, et y aller.
 *
 * Un composant À PART pour le rendu : l'élément annonce sa position plusieurs
 * fois par seconde, et seul ce morceau-ci doit se redessiner à ce rythme — pas
 * le panneau, pas la file, pas les dix boutons de note.
 */
export function Progression({
  videoRef,
  cle,
  detaillee,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** L'identité de l'élément — voir PlayerBar : la frise se rebranche quand elle change. */
  cle: string;
  detaillee: boolean;
}) {
  const [courant, setCourant] = useState(0);
  const [duree, setDuree] = useState(0);

  /* La position TENUE sous le pointeur, le temps d'un glissement : sans elle,
     la lecture qui continue ferait avancer le curseur sous le doigt. */
  const [tenue, setTenue] = useState<number | null>(null);
  const glisse = useRef(false);

  /* Rebranchée sur chaque élément neuf, et non remontée avec lui : une frise
     remontée perdrait le focus clavier au changement de chanson. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    /* Lu tout de suite, en plus d'être écouté : la frise repart ainsi de zéro
       sur une chanson neuve, et un fichier déjà en cache peut avoir annoncé sa
       durée avant que l'écoute soit branchée. */
    const lire = () => {
      setCourant(video.currentTime);
      setDuree(Number.isFinite(video.duration) ? video.duration : 0);
    };
    lire();
    video.addEventListener('timeupdate', lire);
    video.addEventListener('durationchange', lire);
    return () => {
      video.removeEventListener('timeupdate', lire);
      video.removeEventListener('durationchange', lire);
    };
  }, [videoRef, cle]);

  const aller = (t: number) => {
    const video = videoRef.current;
    if (!video) return t;
    const cible = clampTime(t, video.duration);
    video.currentTime = cible;
    setCourant(cible);
    return cible;
  };

  const affiche = tenue ?? courant;

  return (
    <>
      {detaillee && <span className={styles.temps}>{clock(affiche)}</span>}
      <Glissiere
        rempli={duree > 0 ? affiche / duree : 0}
        min={0}
        max={duree > 0 ? duree : 1}
        step="any"
        value={affiche}
        disabled={duree === 0}
        aria-label="Seek"
        aria-valuetext={`${clock(affiche)} of ${clock(duree)}`}
        onPointerDown={() => {
          glisse.current = true;
          /* Relâché sur la fenêtre et non sur le curseur : le pointeur a le
             droit de finir son geste ailleurs que là où il l'a commencé. */
          const lacher = () => {
            glisse.current = false;
            setTenue(null);
            window.removeEventListener('pointerup', lacher);
            window.removeEventListener('pointercancel', lacher);
          };
          window.addEventListener('pointerup', lacher);
          window.addEventListener('pointercancel', lacher);
        }}
        onChange={(e) => {
          const cible = aller(Number(e.target.value));
          if (glisse.current) setTenue(cible);
        }}
        onKeyDown={(e) => {
          const pas = PAS_CLAVIER[e.key];
          if (pas === undefined) return;
          e.preventDefault();
          /* Depuis l'ÉLÉMENT, et non depuis l'affichage qui retarde d'un
             `timeupdate` : mesuré, deux flèches rapprochées partaient du même
             point, et la seconde ne reculait de rien. */
          aller((videoRef.current?.currentTime ?? affiche) + pas);
        }}
      />
      {detaillee && <span className={styles.temps}>{clock(duree)}</span>}
    </>
  );
}

/**
 * Un curseur à nous : le rail et sa partie remplie dessinés à part, le vrai
 * `<input type="range">` transparent par-dessus.
 *
 * Dessinés À PART parce qu'aucun pseudo-élément ne peint la partie remplie
 * dans les deux moteurs — Firefox a `::-moz-range-progress`, Chrome rien.
 * L'`<input>` reste le vrai, et avec lui le clavier, le tactile et ce que lit
 * un lecteur d'écran.
 */
export function Glissiere({
  rempli,
  classe,
  ...curseur
}: Omit<ComponentProps<'input'>, 'type' | 'className'> & { rempli: number; classe?: string }) {
  return (
    <div className={classe ? `${styles.piste} ${classe}` : styles.piste}>
      <div className={styles.rempli} style={{ inlineSize: `${Math.min(1, rempli) * 100}%` }} />
      <input {...curseur} type="range" className={styles.curseur} />
    </div>
  );
}
