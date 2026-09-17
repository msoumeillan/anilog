import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rogner, type Cadre, type FormatImage } from '../lib/imageFile';
import styles from './ImageCropper.module.css';

/**
 * Cadrer une image : la déplacer, l'agrandir, garder ce qui rentre.
 *
 * Sans ça, téléverser une photo revenait à la subir : `object-fit: cover`
 * garde le centre, ce qui coupe la tête sur un portrait et le sujet sur une
 * photo décentrée. C'est le geste qu'on trouve partout ailleurs, et son
 * absence se remarque tout de suite.
 *
 * Le cadre a un RATIO FIXE, celui de l'endroit où l'image ira — carré pour la
 * photo de profil, large pour la bannière. Laisser choisir le ratio n'aurait
 * servi à rien : l'affichage le rognerait derrière, et le cadrage choisi ne
 * serait pas celui qu'on voit.
 *
 * Tout se compte en pixels d'affichage, et la conversion vers les pixels de la
 * source ne se fait qu'à la validation, dans `cadreSource`. Mélanger les deux
 * repères est la façon habituelle de rater ce composant.
 */

/** Jusqu'où on peut agrandir. Au-delà, une image d'écran devient une bouillie. */
const ZOOM_MAX = 4;

/** Un coup de flèche du clavier, en pixels d'affichage. */
const PAS_CLAVIER = 12;

export function ImageCropper({
  image,
  format,
  onAnnuler,
  onValider,
}: {
  image: HTMLImageElement;
  format: FormatImage;
  onAnnuler: () => void;
  onValider: (dataUrl: string) => void;
}) {
  const cadreRef = useRef<HTMLDivElement>(null);
  /** Taille du cadre à l'écran. Mesurée : elle dépend de la largeur disponible. */
  const [cadre, setCadre] = useState({ largeur: 0, hauteur: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [erreur, setErreur] = useState<string | null>(null);

  const sw = image.naturalWidth;
  const sh = image.naturalHeight;

  /* L'échelle à laquelle l'image couvre tout juste le cadre — la référence du
     zoom, qui vaut donc 1 à l'arrivée. */
  const couverture = cadre.largeur > 0 ? Math.max(cadre.largeur / sw, cadre.hauteur / sh) : 0;

  /**
   * Jusqu'où on peut RECULER : l'image entière tient dans le cadre.
   *
   * Le plancher était la couverture, et c'était trop serré : un portrait dans
   * un cadre carré arrivait déjà rogné haut et bas, sans aucun moyen d'en voir
   * plus. On ne choisissait pas un cadrage, on subissait un autre découpage.
   *
   * En dessous de la couverture, le cadre n'est plus rempli — le vide reste
   * TRANSPARENT dans l'image produite, si bien que la bannière laisse voir le
   * fond de la page au lieu d'une barre noire. C'est le choix de la personne
   * qui cadre, pas un accident.
   */
  const contenance = cadre.largeur > 0 ? Math.min(cadre.largeur / sw, cadre.hauteur / sh) : 0;
  const zoomMin = couverture > 0 ? contenance / couverture : 1;

  const echelle = couverture * zoom;
  const dessinee = { largeur: sw * echelle, hauteur: sh * echelle };

  const borner = useCallback(
    (p: { x: number; y: number }, taille: { largeur: number; hauteur: number }) => {
      /* Sur un axe où l'image est PLUS PETITE que le cadre, il n'y a rien à
         déplacer : elle se centre, et la tirer ne ferait que décoller le vide
         d'un bord pour le remettre sur l'autre. Sinon, on borne pour qu'aucun
         bord ne rentre dans le cadre. */
      const axe = (valeur: number, cadreCote: number, dessin: number) =>
        dessin <= cadreCote
          ? (cadreCote - dessin) / 2
          : Math.min(0, Math.max(cadreCote - dessin, valeur));

      return {
        x: axe(p.x, cadre.largeur, taille.largeur),
        y: axe(p.y, cadre.hauteur, taille.hauteur),
      };
    },
    [cadre.largeur, cadre.hauteur],
  );

  /* Mesure du cadre, et remesure quand la fenêtre change : toute la géométrie
     en dépend, et une valeur figée décalerait le rognage après un
     redimensionnement. */
  useLayoutEffect(() => {
    const el = cadreRef.current;
    if (!el) return;
    const observe = new ResizeObserver(([entree]) => {
      const r = entree?.contentRect;
      if (r) setCadre({ largeur: r.width, hauteur: r.height });
    });
    observe.observe(el);
    return () => observe.disconnect();
  }, []);

  /**
   * Position de départ : centrée, sans zoom.
   *
   * Une seule remise à zéro pour les deux réglages, et elle ne LIT pas le zoom
   * — elle le repose. C'est ce qui permet de dépendre honnêtement de tout ce
   * qu'elle utilise, au lieu de faire taire la règle des dépendances : un
   * effet qui lit un état qu'il ne surveille pas est la façon habituelle de se
   * retrouver avec un cadrage calculé sur une valeur périmée.
   *
   * Conséquence assumée : redimensionner la fenêtre pendant le cadrage remet
   * l'image au centre. Le cadre change de taille, donc la géométrie aussi ;
   * conserver un décalage calculé pour l'ancienne largeur serait pire.
   */
  useEffect(() => {
    if (cadre.largeur === 0) return;
    setZoom(1);
    setPos({
      x: (cadre.largeur - sw * couverture) / 2,
      y: (cadre.hauteur - sh * couverture) / 2,
    });
  }, [image, cadre.largeur, cadre.hauteur, couverture, sw, sh]);

  /**
   * Zoomer en gardant fixe le point au CENTRE du cadre.
   *
   * Sans cette correction, agrandir tire l'image vers son coin haut-gauche :
   * on vise un visage, on zoome, il part de l'écran.
   */
  const changerZoom = (suivant: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(zoomMin, suivant));
    const ancienne = couverture * zoom;
    const nouvelle = couverture * z;
    if (ancienne === 0) return;

    const centreX = (cadre.largeur / 2 - pos.x) / ancienne;
    const centreY = (cadre.hauteur / 2 - pos.y) / ancienne;

    setZoom(z);
    setPos(
      borner(
        { x: cadre.largeur / 2 - centreX * nouvelle, y: cadre.hauteur / 2 - centreY * nouvelle },
        { largeur: sw * nouvelle, hauteur: sh * nouvelle },
      ),
    );
  };

  const depart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    depart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = depart.current;
    if (!d) return;
    setPos(borner({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }, dessinee));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    depart.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dx = e.key === 'ArrowLeft' ? -PAS_CLAVIER : e.key === 'ArrowRight' ? PAS_CLAVIER : 0;
    const dy = e.key === 'ArrowUp' ? -PAS_CLAVIER : e.key === 'ArrowDown' ? PAS_CLAVIER : 0;
    if (dx === 0 && dy === 0) return;
    e.preventDefault();
    setPos(borner({ x: pos.x + dx, y: pos.y + dy }, dessinee));
  };

  /**
   * Ce qui est visible, converti dans les pixels de la source.
   *
   * Volontairement NON borné à l'image : quand on a reculé au-delà de la
   * couverture, le cadre déborde, et c'est exact. `drawImage` découpe alors la
   * partie commune et la place au bon endroit de la destination — mesuré : ce
   * qui tombe hors de l'image ressort transparent, pas étiré.
   *
   * Le borner aurait produit l'inverse de ce qu'on voit : un rognage recentré
   * sur l'image, sans le vide, donc pas le cadrage choisi.
   */
  const cadreSource = (): Cadre => ({
    x: -pos.x / echelle,
    y: -pos.y / echelle,
    largeur: cadre.largeur / echelle,
    hauteur: cadre.hauteur / echelle,
  });

  const valider = () => {
    const url = rogner(image, cadreSource(), format.sortie);
    if (url) onValider(url);
    else setErreur('This image couldn’t be prepared.');
  };

  return (
    <div className={styles.cropper}>
      <div
        ref={cadreRef}
        className={styles.cadre}
        style={{
          aspectRatio: String(format.ratio),
          maxInlineSize: format.cadreMax ? `${format.cadreMax}px` : undefined,
        }}
        /* Le cadre est l'outil : il se prend au doigt, à la souris et au
           clavier. `touch-action: none` en CSS, sinon le doigt fait défiler la
           page au lieu de déplacer l'image. */
        role="application"
        aria-label="Move the image with the arrow keys, resize it with the slider below"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onWheel={(e) => changerZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))}
      >
        <img
          className={styles.image}
          src={image.src}
          alt=""
          draggable={false}
          style={{
            width: `${dessinee.largeur}px`,
            height: `${dessinee.hauteur}px`,
            transform: `translate(${pos.x}px, ${pos.y}px)`,
          }}
        />
        {/* Le rond de la photo de profil, dessiné par-dessus : on cadre ce
            qu'on verra, pas un carré dont les coins seront mangés. */}
        {format.ratio === 1 && <div className={styles.rond} aria-hidden />}
      </div>

      <label className={styles.zoom}>
        <span className="label">Zoom</span>
        {/* Le minimum DÉPEND de l'image : c'est l'échelle à laquelle elle tient
            entière. Une valeur fixe aurait laissé un portrait bloqué au ras du
            cadre, ou permis de rapetisser une image déjà minuscule. */}
        <input
          type="range"
          min={zoomMin}
          max={ZOOM_MAX}
          step={0.01}
          value={zoom}
          onChange={(e) => changerZoom(Number(e.target.value))}
        />
      </label>

      {erreur && <p className="faint">{erreur}</p>}

      <div className={styles.actions}>
        <button type="button" className="btn btn--quiet" onClick={onAnnuler}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={valider} disabled={cadre.largeur === 0}>
          Apply
        </button>
      </div>
    </div>
  );
}
