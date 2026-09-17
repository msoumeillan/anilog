import { useRef, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { BackButton } from '../../components/BackButton';
import {
  applyBackup,
  backupFilename,
  collectBackup,
  readBackup,
  summarise,
  type Backup,
} from '../../lib/backup';
import styles from './Library.module.css';

/**
 * Sauvegarder, et restaurer.
 *
 * Le code se synchronise par git ; le journal, non. Tout ce qui fait la valeur
 * de l'app vit dans IndexedDB — un navigateur, une machine — et rien ne le
 * suivait jusqu'ici. Cet écran est ce qui permet de changer d'ordinateur, et ce
 * qui protège d'un vidage de cache.
 *
 * Trois temps, comme l'import MyAnimeList : on LIT le fichier, on MONTRE ce
 * qu'il contient, on écrit seulement après un clic. Une restauration remplace,
 * et il n'y a pas d'annulation dans une bibliothèque.
 */

type Etape =
  | { nom: 'attente' }
  | { nom: 'lu'; backup: Backup; fichier: string }
  | { nom: 'refuse'; raison: string }
  | { nom: 'restaure' };

export default function LibraryBackup() {
  const [etape, setEtape] = useState<Etape>({ nom: 'attente' });
  const [occupe, setOccupe] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const telecharger = async () => {
    setOccupe(true);
    try {
      const backup = await collectBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      /* Un lien fabriqué et cliqué : c'est la seule façon de nommer le fichier
         qui sorte. Révoqué juste après, sinon le blob reste en mémoire tant
         que l'onglet vit. */
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename(new Date());
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setOccupe(false);
    }
  };

  const lire = async (fichier: File) => {
    setOccupe(true);
    try {
      const texte = await fichier.text();
      /* `JSON.parse` jette sur un fichier qui n'est pas du JSON — une image
         déposée par erreur, par exemple —, et ce n'est pas une raison de
         casser l'écran. */
      const brut: unknown = JSON.parse(texte);
      const lu = readBackup(brut);
      setEtape(
        lu.ok
          ? { nom: 'lu', backup: lu.backup, fichier: fichier.name }
          : { nom: 'refuse', raison: lu.raison },
      );
    } catch {
      setEtape({ nom: 'refuse', raison: 'This file is not readable JSON.' });
    } finally {
      setOccupe(false);
    }
  };

  const restaurer = async (backup: Backup) => {
    setOccupe(true);
    await applyBackup(backup);
    setEtape({ nom: 'restaure' });
    setOccupe(false);
    /* On recharge plutôt que de réhydrater six stores à la main : c'est le seul
       moyen sûr que rien ne reste en mémoire de l'état d'avant, et une
       restauration est assez rare pour qu'un rechargement ne coûte rien. */
    setTimeout(() => location.reload(), 600);
  };

  return (
    <>
      <div className={styles.listHead}>
        <BackButton />
        <div>
          <h1 className="title">Backup</h1>
          <p className={styles.listDesc}>
            Your library lives in this browser, on this machine. It follows neither the code nor an
            account: this file is what moves it to another computer, and what saves it from a
            cleared cache.
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className="label">Back up</h2>
        <p className="muted">
          Everything you decided — tracked titles, ratings, lists, tier lists, favourites, chosen
          posters, rated themes. The theme cache is not in it: it fetches itself again.
        </p>
        <button type="button" className="btn btn--accent" disabled={occupe} onClick={telecharger}>
          <Download size={15} strokeWidth={2} aria-hidden />
          Download the backup
        </button>
      </section>

      <hr className="rule" />

      <section className={styles.section}>
        <h2 className="label">Restore</h2>

        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void lire(f);
            /* Remis à zéro : sans ça, redéposer LE MÊME fichier ne déclenche
               aucun évènement et l'écran semble ignorer le clic. */
            e.target.value = '';
          }}
        />

        {etape.nom === 'attente' && (
          <>
            <p className="muted">
              Drop a backup made here. It <strong>replaces</strong> what this browser holds — it is
              not a merge. To add to an existing library, the MyAnimeList import is the one you
              want.
            </p>
            <button
              type="button"
              className="btn"
              disabled={occupe}
              onClick={() => input.current?.click()}
            >
              <Upload size={15} strokeWidth={2} aria-hidden />
              Choose a file
            </button>
          </>
        )}

        {etape.nom === 'refuse' && (
          <>
            <p className={styles.listDesc}>{etape.raison}</p>
            <button type="button" className="btn" onClick={() => setEtape({ nom: 'attente' })}>
              Try again
            </button>
          </>
        )}

        {etape.nom === 'lu' && (
          <>
            <div className={styles.sectionHead}>
              <h3 className="label">{etape.fichier}</h3>
              <p className="label">
                {etape.backup.createdAt
                  ? new Date(etape.backup.createdAt).toLocaleString()
                  : 'unknown date'}
              </p>
            </div>

            {/* Ce que le fichier contient, AVANT d'effacer quoi que ce soit. */}
            <ul className={styles.figures}>
              {summarise(etape.backup).map((s) => (
                <li key={s.label}>
                  <p className={styles.figure}>{s.count.toLocaleString('en-US')}</p>
                  <p className="label">{s.label}</p>
                </li>
              ))}
            </ul>

            <p className={styles.listDesc}>
              <AlertTriangle size={15} strokeWidth={2} aria-hidden /> What this browser holds will
              be replaced. Make a backup first if you are not sure.
            </p>

            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn--accent"
                disabled={occupe}
                onClick={() => void restaurer(etape.backup)}
              >
                Replace everything
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => setEtape({ nom: 'attente' })}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {etape.nom === 'restaure' && <p className="muted">Restored. Reloading…</p>}
      </section>
    </>
  );
}
