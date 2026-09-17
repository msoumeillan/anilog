/**
 * Une image choisie sur le disque, cadrée à la main puis rangée.
 *
 * Deux temps distincts, et c'est volontaire : on CHARGE d'abord — pour la
 * montrer telle quelle et laisser cadrer — puis on ROGNE, une seule fois, à la
 * validation. Redimensionner à l'ouverture aurait été plus simple mais aurait
 * jeté les pixels avant que quiconque ait choisi lesquels garder.
 *
 * Le résultat finit dans IndexedDB, en `data:` — donc dans la même sauvegarde
 * que le pseudo. Un fichier d'appareil photo pèse cinq à dix mégaoctets, et un
 * tiers de plus en base64 : c'est le rognage qui le ramène à quelques dizaines
 * de kilo-octets. WebP quand le navigateur sait l'écrire, sinon JPEG.
 *
 * Rien n'est envoyé nulle part : tout se passe dans la page.
 */

/** Au-delà, on refuse avant même de décoder : ce n'est pas une photo de profil. */
const MAX_FICHIER = 25 * 1024 * 1024;

export interface ImageChargee {
  ok: true;
  image: HTMLImageElement;
  /** À révoquer quand on a fini : sinon le fichier reste en mémoire. */
  libere: () => void;
}

export type ChargementImage = ImageChargee | { ok: false; raison: string };

/**
 * Charge un fichier image pour l'afficher.
 *
 * Une `objectURL` plutôt qu'une `data:` URL : le navigateur garde le fichier
 * là où il est au lieu d'en fabriquer une copie encodée en base64, qu'on
 * jetterait de toute façon après rognage.
 */
export async function chargerImage(file: File): Promise<ChargementImage> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, raison: 'This file isn’t an image.' };
  }
  if (file.size > MAX_FICHIER) {
    return { ok: false, raison: 'Image too large (25 MB max).' };
  }

  const url = URL.createObjectURL(file);
  const libere = () => URL.revokeObjectURL(url);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decoding failed'));
      img.src = url;
    });

    /* Une image sans dimensions n'est pas rognable — un SVG sans `width` en
       est un cas réel, et il passerait le test de type sans encombre. */
    if (!image.naturalWidth || !image.naturalHeight) {
      libere();
      return { ok: false, raison: 'This image has no readable dimensions.' };
    }

    return { ok: true, image, libere };
  } catch {
    libere();
    /* Fichier abîmé, ou format que ce navigateur ne décode pas — un HEIC
       d'iPhone sur un navigateur qui l'ignore, par exemple. */
    return { ok: false, raison: 'This image can’t be read.' };
  }
}

/** La zone gardée, EN PIXELS DE LA SOURCE. */
export interface Cadre {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/**
 * Découpe `cadre` dans l'image et rend une `data:` URL à la taille demandée.
 *
 * La sortie a toujours la même taille quelle que soit la source : c'est elle
 * qui borne le poids stocké, pas le fichier d'origine.
 */
export function rogner(image: HTMLImageElement, cadre: Cadre, sortie: Taille): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = sortie.largeur;
  canvas.height = sortie.hauteur;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  /* Le lissage de qualité : sans lui, réduire une photo de 4000 pixels à 512
     donne des escaliers très visibles sur les diagonales. */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    cadre.x,
    cadre.y,
    cadre.largeur,
    cadre.hauteur,
    0,
    0,
    sortie.largeur,
    sortie.hauteur,
  );

  /* `toDataURL` rend du PNG quand le format demandé est inconnu : on vérifie
     ce qui SORT plutôt que de supposer que WebP est accepté. Un PNG de photo
     pèse plusieurs fois le JPEG équivalent.

     WebP d'abord aussi parce qu'il garde la TRANSPARENCE : quand on a reculé
     au-delà de la couverture, le pourtour vide doit laisser voir le fond de la
     page. Le repli JPEG l'ignore et le rendrait noir — il ne concerne que les
     navigateurs qui ne savent pas encoder de WebP, ce qui est devenu rare. */
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

export interface Taille {
  largeur: number;
  hauteur: number;
}

/** Ce qu'on demande à l'utilisateur de cadrer, et ce qu'on en garde. */
export interface FormatImage {
  /** largeur / hauteur. Le cadre de recadrage le respecte exactement. */
  ratio: number;
  sortie: Taille;
  /**
   * Largeur maximale du cadre à l'écran, en pixels.
   *
   * Un cadre carré laissé libre prend toute la largeur de la fenêtre — 830
   * pixels de haut pour choisir une vignette à 96. Absente, la largeur
   * disponible est prise telle quelle : c'est ce qu'on veut d'une bannière.
   */
  cadreMax?: number;
}

/** La photo de profil s'affiche dans un rond : le cadre est carré. */
export const FORMAT_AVATAR: FormatImage = {
  ratio: 1,
  sortie: { largeur: 512, hauteur: 512 },
  cadreMax: 300,
};

/**
 * La bannière traverse l'écran. 4:1 : plus large que ce qu'un écran étroit en
 * montrera, moins que ce qu'un très grand écran en découpera — dans les deux
 * cas c'est `object-fit: cover` qui finit le travail, en rognant autour de ce
 * qui a été centré ici. 1920 de large suffit : au-delà l'écart ne se voit
 * plus, le poids si.
 */
export const FORMAT_BANNIERE: FormatImage = {
  ratio: 4,
  sortie: { largeur: 1920, hauteur: 480 },
};
