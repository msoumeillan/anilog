import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Upload } from 'lucide-react';
import { useLibrary } from '../../store/library';
import { BackButton } from '../../components/BackButton';
import { parseMalXml, readMalFile, type MalExport } from '../../lib/malImport';
import { traduire, type Avancement } from '../../lib/malBridge';
import { statusLabel, STATUS_ORDER } from '../../lib/trackStatus';
import { browseHref } from '../../lib/routes';
import { mbCataloguePath } from '../../lib/mangabakaCatalogue';
import type { MediaType } from '../../types/library';
import styles from './Library.module.css';
import own from './Import.module.css';

/**
 * Importer sa liste MyAnimeList.
 *
 * Trois temps, et ils sont séparés exprès : on LIT le fichier, on MONTRE ce
 * qu'il contient, puis on écrit — seulement après un clic. Un import qui
 * s'exécute au dépôt du fichier ne laisse aucune place au « ce n'est pas le
 * bon fichier », et il n'y a pas d'annulation dans une bibliothèque.
 *
 * La traduction des identifiants prend du temps — cinquante œuvres par requête,
 * trente requêtes par minute — et l'écran le dit au lieu de faire semblant
 * d'être bloqué. Voir `lib/malBridge`.
 */

type Etape =
  | { nom: 'attente' }
  | { nom: 'lu'; contenu: MalExport; fichier: string }
  | { nom: 'encours'; avancement: Avancement }
  | {
      nom: 'fini';
      ajoutees: number;
      misesAJour: number;
      ignorees: number;
      perdus: string[];
      media: MediaType;
    };

export default function LibraryImport() {
  const importEntries = useLibrary((s) => s.importEntries);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const [etape, setEtape] = useState<Etape>({ nom: 'attente' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [remplacer, setRemplacer] = useState(false);

  const choisir = async (file: File | undefined) => {
    if (!file) return;
    setErreur(null);
    try {
      const xml = await readMalFile(file);
      const lu = parseMalXml(xml);
      if (!lu.ok) {
        setErreur(lu.raison);
        return;
      }
      if (lu.export.entries.length === 0) {
        setErreur('This file holds no title.');
        return;
      }
      setEtape({ nom: 'lu', contenu: lu.export, fichier: file.name });
    } catch {
      setErreur('This file can’t be read.');
    }
    /* Remis à zéro : sans ça, redéposer LE MÊME fichier après une erreur ne
       déclenche aucun événement. */
    if (input.current) input.current.value = '';
  };

  const lancer = async () => {
    if (etape.nom !== 'lu') return;
    const { media, entries } = etape.contenu;

    const controleur = new AbortController();
    abort.current = controleur;
    setEtape({ nom: 'encours', avancement: { fait: 0, total: 1 } });

    try {
      const { rows, perdus } = await traduire(entries, media, {
        signal: controleur.signal,
        onProgress: (avancement) => setEtape({ nom: 'encours', avancement }),
      });

      const compte = importEntries(rows, remplacer);
      setEtape({ nom: 'fini', ...compte, media, perdus: perdus.map((p) => p.title) });
    } catch {
      setErreur('AniList didn’t respond. Nothing was written — you can try again.');
      setEtape({ nom: 'lu', contenu: etape.contenu, fichier: etape.fichier });
    } finally {
      abort.current = null;
    }
  };

  return (
    <>
      <div className={styles.listHead}>
        <BackButton />
        <div>
          <h1 className="title">Import from MyAnimeList</h1>
          <p className={styles.listDesc}>
            On MyAnimeList, open <strong>Profile → Export</strong> and download your list. Drop the
            file you get here — the <code>.xml.gz</code> works as is, no need to unzip it.
            MyAnimeList exports <strong>one file per medium</strong>: do it again for the other
            list, and drop that one here too.
          </p>
        </div>
      </div>

      {etape.nom === 'attente' && (
        <div className={styles.field}>
          <button type="button" className="btn" onClick={() => input.current?.click()}>
            <Upload size={15} strokeWidth={2} aria-hidden />
            Choose your export
          </button>
          {erreur && <p className="muted">{erreur}</p>}
          <p className="faint">
            Nothing is sent anywhere: the file is read inside the page. Only the ids are asked of
            AniList, which doesn’t know MyAnimeList’s own.
          </p>
        </div>
      )}

      {etape.nom === 'lu' && (
        <Resume
          contenu={etape.contenu}
          fichier={etape.fichier}
          remplacer={remplacer}
          setRemplacer={setRemplacer}
          erreur={erreur}
          onAnnuler={() => setEtape({ nom: 'attente' })}
          onLancer={() => void lancer()}
        />
      )}

      {etape.nom === 'encours' && (
        <section className={styles.section}>
          <h2 className="label">
            Matching titles · {etape.avancement.fait} / {etape.avancement.total}
          </h2>
          <div className={own.jauge}>
            <div
              className={own.jaugeFill}
              style={{
                inlineSize: `${Math.round((etape.avancement.fait / Math.max(1, etape.avancement.total)) * 100)}%`,
              }}
            />
          </div>
          <p className="faint">
            Fifty titles per request, a pause between each: AniList only takes thirty requests a
            minute.
          </p>
          <button type="button" className="btn btn--quiet" onClick={() => abort.current?.abort()}>
            Stop
          </button>
        </section>
      )}

      {etape.nom === 'fini' && <Rapport {...etape} media={etape.media} />}

      <input
        ref={input}
        type="file"
        accept=".xml,.gz,application/gzip,text/xml"
        hidden
        onChange={(e) => void choisir(e.target.files?.[0])}
      />
    </>
  );
}

/** Ce que le fichier contient, avant d'écrire quoi que ce soit. */
function Resume({
  contenu,
  fichier,
  remplacer,
  setRemplacer,
  erreur,
  onAnnuler,
  onLancer,
}: {
  contenu: MalExport;
  fichier: string;
  remplacer: boolean;
  setRemplacer: (v: boolean) => void;
  erreur: string | null;
  onAnnuler: () => void;
  onLancer: () => void;
}) {
  const parStatut = STATUS_ORDER.map((s) => ({
    statut: s,
    n: contenu.entries.filter((e) => e.status === s).length,
  })).filter((x) => x.n > 0);

  const notes = contenu.entries.filter((e) => typeof e.score === 'number').length;
  const critiques = contenu.entries.filter((e) => e.comments).length;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className="label">
          {contenu.entries.length} {contenu.media}
          {contenu.username ? ` · ${contenu.username}` : ''}
        </h2>
        <p className="label">{fichier}</p>
      </div>

      <div className={styles.segmented} role="group" aria-label="What the file holds">
        {parStatut.map(({ statut, n }) => (
          <span key={statut} className={styles.segment}>
            {statusLabel(statut, contenu.media)}
            <span className={styles.segmentCount}>{n}</span>
          </span>
        ))}
      </div>

      <p className="muted">
        {notes} score{notes > 1 ? 's' : ''} and {critiques} comment{critiques > 1 ? 's' : ''} will
        be carried over. MyAnimeList tags become yours.
      </p>

      <label className={styles.bascule}>
        <input
          type="checkbox"
          checked={remplacer}
          onChange={(e) => setRemplacer(e.target.checked)}
        />
        <span>
          Overwrite what I already track
          <span className="faint">
            {' '}
            — otherwise titles already in the library are left as they are
          </span>
        </span>
      </label>

      {erreur && <p className="muted">{erreur}</p>}

      <div className={styles.listActions}>
        <button type="button" className="btn" onClick={onLancer}>
          Import {contenu.entries.length} {contenu.media}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onAnnuler}>
          Choose another file
        </button>
      </div>
    </section>
  );
}

/** Ce qui a été écrit, et surtout ce qui ne l'a pas été. */
function Rapport({
  ajoutees,
  misesAJour,
  ignorees,
  perdus,
  media,
}: {
  ajoutees: number;
  misesAJour: number;
  ignorees: number;
  perdus: string[];
  media: MediaType;
}) {
  return (
    <section className={styles.section}>
      <h2 className="label">Done</h2>

      <div className={styles.figures}>
        <div>
          <p className={styles.figure}>{ajoutees}</p>
          <p className="label">added</p>
        </div>
        <div>
          <p className={styles.figure}>{misesAJour}</p>
          <p className="label">updated</p>
        </div>
        <div>
          <p className={styles.figure}>{ignorees}</p>
          <p className="label">left alone</p>
        </div>
        <div>
          <p className={styles.figure}>{perdus.length}</p>
          <p className="label">not found</p>
        </div>
      </div>

      {perdus.length > 0 && (
        <>
          {/* Nommés, pas comptés — et CLIQUABLES. « 12 introuvables » ne permet
              pas de les ajouter à la main ; un titre qui ouvre sa recherche, si. */}
          <p className="muted">
            AniList doesn’t know these titles, and nothing was invented in their place: matching by
            name alone would end up importing the wrong work.{' '}
            {media === 'manga'
              ? /* C'est côté manga qu'AniList est le plus court, et c'est
                   exactement pourquoi le catalogue de l'app est MangaBaka et
                   ses 303 000 séries. */
                'Each title opens its search in the MangaBaka catalogue, where they stand a good chance of turning up.'
              : 'Each title opens its search in the catalogue.'}
          </p>
          <div className={own.perdus}>
            {perdus.map((t) => (
              <Link
                key={t}
                className={styles.studio}
                to={media === 'manga' ? mbCataloguePath(t) : browseHref({ search: t })}
              >
                <Search size={13} strokeWidth={2.2} aria-hidden />
                {t}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className={styles.listActions}>
        <Link className="btn" to="/library">
          Back to my library
        </Link>
      </div>
    </section>
  );
}
