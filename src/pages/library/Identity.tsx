import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Pencil, Upload, X, HardDriveDownload } from 'lucide-react';
import { useLibrary } from '../../store/library';
import { Modal } from '../../components/Modal';
import { ImageCropper } from '../../components/ImageCropper';
import {
  chargerImage,
  FORMAT_AVATAR,
  FORMAT_BANNIERE,
  type ChargementImage,
  type FormatImage,
} from '../../lib/imageFile';
import styles from './Library.module.css';

/**
 * Bannière, photo de profil, pseudo.
 *
 * Les images se TÉLÉVERSENT depuis le disque, puis se CADRENT à la main. Elles
 * se choisissaient d'abord parmi les jaquettes de la bibliothèque — mais une
 * jaquette n'est pas un portrait : elle est verticale, elle appartient à
 * quelqu'un d'autre, et en bannière elle s'étirait en travers de l'écran.
 *
 * Le cadrage n'est pas un ornement : sans lui, `object-fit: cover` garde le
 * centre, ce qui coupe la tête sur un portrait et le sujet sur une photo
 * décentrée. Voir `components/ImageCropper`.
 *
 * Rien ne part sur un serveur : le fichier est rogné dans la page puis rangé
 * en `data:` avec le pseudo.
 */

export function Identity() {
  const user = useLibrary((s) => s.user);
  const entries = useLibrary((s) => s.entries);
  const setUsername = useLibrary((s) => s.setUsername);
  const setProfileImage = useLibrary((s) => s.setProfileImage);
  const [open, setOpen] = useState(false);

  const nom = user.username || 'My library';
  const animes = Object.values(entries).filter((e) => e.media === 'anime').length;
  const mangas = Object.values(entries).filter((e) => e.media === 'manga').length;

  return (
    <>
      <div className={styles.hero}>
        {user.backdrop ? (
          <img className={styles.heroImg} src={user.backdrop} alt="" />
        ) : (
          <div className={`${styles.heroImg} placeholder`} />
        )}
        <div className={styles.heroVeil} />
      </div>

      <div className={styles.identity}>
        {user.avatar ? (
          <img className={styles.avatar} src={user.avatar} alt="" />
        ) : (
          <div className={`${styles.avatar} ${styles.avatarVide}`}>{nom.charAt(0)}</div>
        )}

        <div className={styles.identityText}>
          <h1 className="title">{nom}</h1>
          <p className="muted">
            {animes} anime · {mangas} manga
          </p>
        </div>

        <button type="button" className="btn btn--quiet" onClick={() => setOpen(true)}>
          <Pencil size={15} strokeWidth={2} aria-hidden />
          Edit profile
        </button>

        {/* L'import vit ici et non dans un onglet : c'est un geste qu'on fait
            une fois, au debut. Un neuvieme onglet pour ca serait un onglet
            mort le reste du temps. */}
        <Link className="btn btn--quiet" to="/library/import">
          <Download size={15} strokeWidth={2} aria-hidden />
          Import
        </Link>

        {/* Meme raison que l'import : un geste rare, qui ne merite pas un
            onglet permanent. */}
        <Link className="btn btn--quiet" to="/library/backup">
          <HardDriveDownload size={15} strokeWidth={2} aria-hidden />
          Backup
        </Link>
      </div>

      <Modal open={open} onOpenChange={setOpen} title="Edit profile" wide>
        <div className={styles.editor}>
          <label className={styles.field}>
            <span className="label">Username</span>
            <input
              className={styles.input}
              value={user.username}
              placeholder="Your name"
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <ChampImage
            titre="Profile picture"
            aide="Drag to reposition, then Apply."
            valeur={user.avatar}
            format={FORMAT_AVATAR}
            rond
            onChange={(url) => setProfileImage('avatar', url)}
          />

          <ChampImage
            titre="Banner"
            aide="Drag to reposition, then Apply."
            valeur={user.backdrop}
            format={FORMAT_BANNIERE}
            onChange={(url) => setProfileImage('backdrop', url)}
          />
        </div>
      </Modal>
    </>
  );
}

/**
 * Un champ image : l'aperçu de ce qui est posé, un bouton pour en choisir une
 * autre, un autre pour l'enlever — et le cadreur, une fois un fichier choisi.
 *
 * L'`<input type="file">` reste caché derrière un vrai bouton : celui du
 * navigateur ne se met pas au style du reste, et son libellé — « Aucun fichier
 * sélectionné » — dit le contraire de ce que montre l'aperçu.
 */
function ChampImage({
  titre,
  aide,
  valeur,
  format,
  rond,
  onChange,
}: {
  titre: string;
  aide: string;
  valeur: string | undefined;
  format: FormatImage;
  rond?: boolean;
  onChange: (url: string | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [encours, setEncours] = useState(false);
  /** L'image en cours de cadrage. `null` = on montre l'aperçu. */
  const [aCadrer, setACadrer] = useState<{ image: HTMLImageElement; libere: () => void } | null>(
    null,
  );

  /* L'`objectURL` doit être révoquée, sinon le fichier reste en mémoire aussi
     longtemps que l'onglet — plusieurs mégaoctets par essai de cadrage. */
  useEffect(() => () => aCadrer?.libere(), [aCadrer]);

  const choisir = async (file: File | undefined) => {
    if (!file) return;
    setErreur(null);
    setEncours(true);
    const r: ChargementImage = await chargerImage(file);
    setEncours(false);

    if (r.ok) {
      aCadrer?.libere();
      setACadrer({ image: r.image, libere: r.libere });
    } else {
      setErreur(r.raison);
    }

    /* Remis à zéro : sans ça, rechoisir LE MÊME fichier après une erreur ne
       déclenche aucun événement — la valeur de l'input n'a pas changé. */
    if (input.current) input.current.value = '';
  };

  const fermerCadreur = () => {
    aCadrer?.libere();
    setACadrer(null);
  };

  return (
    <div className={styles.field}>
      <span className="label">{titre}</span>

      {aCadrer ? (
        <ImageCropper
          image={aCadrer.image}
          format={format}
          onAnnuler={fermerCadreur}
          onValider={(url) => {
            onChange(url);
            fermerCadreur();
          }}
        />
      ) : (
        <div className={styles.upload}>
          {valeur ? (
            <img
              className={`${styles.apercu} ${rond ? styles.apercuRond : ''}`}
              src={valeur}
              alt=""
            />
          ) : (
            <div
              className={`${styles.apercu} ${rond ? styles.apercuRond : ''} placeholder`}
              aria-hidden
            />
          )}

          <div className={styles.uploadActions}>
            <button
              type="button"
              className="btn btn--quiet"
              disabled={encours}
              onClick={() => input.current?.click()}
            >
              <Upload size={15} strokeWidth={2} aria-hidden />
              {encours ? 'Reading…' : valeur ? 'Replace' : 'Choose a file'}
            </button>

            {valeur && (
              <button type="button" className="btn btn--quiet" onClick={() => onChange(undefined)}>
                <X size={15} strokeWidth={2} aria-hidden />
                Remove
              </button>
            )}

            <p className="faint">{erreur ?? aide}</p>
          </div>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void choisir(e.target.files?.[0])}
      />
    </div>
  );
}
