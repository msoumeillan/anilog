import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useLists } from '../../store/lists';
import { useLibrary } from '../../store/library';
import { Modal } from '../../components/Modal';
import { listCovers, tierKeys } from '../../lib/lists';
import type { CustomList, MediaType, TierList } from '../../types/library';
import styles from './Library.module.css';

/**
 * Mes listes, en deux registres — un seul à l'écran à la fois.
 *
 * Une LISTE est un ordre : « Mon top 20 », « À montrer à quelqu'un ». Une TIER
 * LIST est un classement par paliers, où l'ordre à l'intérieur d'un rang ne
 * veut rien dire. Ce sont deux gestes différents, et les mélanger dans un même
 * index obligerait à lire une pastille pour savoir ce qu'on va ouvrir.
 *
 * Le registre vit dans l'URL, comme le journal juste à côté : un lien envoyé
 * pointe sur le bon, et le retour arrière ramène au précédent.
 */

const REGISTRES = [
  { value: 'lists', label: 'Lists' },
  { value: 'tiers', label: 'Tier lists' },
] as const;

export default function LibraryLists() {
  const [params, setParams] = useSearchParams();
  const registre = params.get('kind') === 'tiers' ? 'tiers' : 'lists';

  const hydrated = useLists((s) => s.hydrated);
  const lists = useLists((s) => s.lists);
  const tierLists = useLists((s) => s.tierLists);

  const [creation, setCreation] = useState(false);

  if (!hydrated) return <p className="faint">Loading…</p>;

  const mesListes = Object.values(lists).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const mesTiers = Object.values(tierLists).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const courant = registre === 'tiers' ? mesTiers : mesListes;

  const choisir = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'lists') next.delete('kind');
    else next.set('kind', value);
    setParams(next);
  };

  return (
    <>
      <div className={styles.listsBar}>
        <div className={styles.segmented} role="group" aria-label="List kind">
          {REGISTRES.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`${styles.segment} ${registre === r.value ? styles.segmentOn : ''}`}
              aria-pressed={registre === r.value}
              onClick={() => choisir(r.value)}
            >
              {r.label}
              <span className={styles.segmentCount}>
                {(r.value === 'tiers' ? mesTiers : mesListes).length}
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="btn" onClick={() => setCreation(true)}>
          <Plus size={15} strokeWidth={2.2} aria-hidden />
          {registre === 'tiers' ? 'New tier list' : 'New list'}
        </button>
      </div>

      {courant.length === 0 && (
        <p className="muted">
          {registre === 'tiers'
            ? 'No tier list yet. Create one and sort your titles into tiers.'
            : 'No list yet. Create one: “My top 20”, “Ghibli”, whatever you like.'}
        </p>
      )}

      <div className={styles.listGrid}>
        {registre === 'tiers'
          ? mesTiers.map((t) => <TierCard key={t.id} liste={t} />)
          : mesListes.map((l) => <ListCard key={l.id} liste={l} />)}
      </div>

      <DialogueCreation ouvert={creation} registre={registre} onClose={() => setCreation(false)} />
    </>
  );
}

/**
 * La vignette d'une liste : une mosaïque d'affiches, son nom, son compte.
 *
 * Les affiches se chevauchent comme un jeu de cartes étalé — c'est ce qui
 * distingue une liste d'une simple ligne de texte dans un index, et ce qu'on
 * reconnaît d'un coup d'œil sans lire le titre.
 */
function ListCard({ liste }: { liste: CustomList }) {
  const entries = useLibrary((s) => s.entries);
  const covers = listCovers(liste, entries);

  return (
    <Link to={`/library/lists/${liste.id}`} className={styles.listCard}>
      <Mosaique covers={covers} />
      <div>
        <p className={styles.listName}>{liste.name}</p>
        <p className="label">
          {liste.items.length} {liste.media}
          {liste.numbered ? ' · ranked' : ''}
        </p>
      </div>
    </Link>
  );
}

function TierCard({ liste }: { liste: TierList }) {
  const entries = useLibrary((s) => s.entries);
  const keys = tierKeys(liste);
  const covers = keys.map((k) => entries[k]?.cover).filter((c): c is string => Boolean(c));

  return (
    <Link to={`/library/tiers/${liste.id}`} className={styles.listCard}>
      <Mosaique covers={covers.slice(0, 4)} />
      <div>
        <p className={styles.listName}>{liste.name}</p>
        <p className="label">
          {keys.length} {liste.media} · {liste.tiers.length} tiers
        </p>
      </div>
    </Link>
  );
}

/** Quatre affiches en éventail, ou un cadre vide quand la liste l'est. */
function Mosaique({ covers }: { covers: string[] }) {
  if (covers.length === 0) return <div className={`${styles.mosaic} ${styles.mosaicVide}`} />;

  return (
    <div className={styles.mosaic}>
      {covers.map((c, i) => (
        <img key={`${i}-${c.slice(-16)}`} src={c} alt="" loading="lazy" />
      ))}
    </div>
  );
}

/**
 * Créer une liste : un nom, un média.
 *
 * Le média se fixe À LA CRÉATION et ne bouge plus. Décision 6 — une liste
 * appartient à un média et un seul, sinon « 12 titres » ne veut rien dire à
 * cheval sur les deux, et le sélecteur d'ajout ne saurait pas quoi proposer.
 */
function DialogueCreation({
  ouvert,
  registre,
  onClose,
}: {
  ouvert: boolean;
  registre: 'lists' | 'tiers';
  onClose: () => void;
}) {
  const createList = useLists((s) => s.createList);
  const createTierList = useLists((s) => s.createTierList);
  const [nom, setNom] = useState('');
  const [media, setMedia] = useState<MediaType>('anime');

  const valider = () => {
    const propre = nom.trim();
    if (!propre) return;
    if (registre === 'tiers') createTierList(media, propre);
    else createList(media, propre);
    setNom('');
    onClose();
  };

  return (
    <Modal
      open={ouvert}
      onOpenChange={(o) => !o && onClose()}
      title={registre === 'tiers' ? 'New tier list' : 'New list'}
    >
      <div className={styles.editor}>
        <label className={styles.field}>
          <span className="label">Name</span>
          <input
            className={styles.input}
            value={nom}
            placeholder={registre === 'tiers' ? 'Shonen tier list' : 'My top 20'}
            autoFocus
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valider()}
          />
        </label>

        <div className={styles.field}>
          <span className="label">Media</span>
          {/* Un choix qui ne se reprend pas : il vaut mieux le poser en deux
              boutons visibles qu'au fond d'un menu. */}
          <div className={styles.segmented} role="group" aria-label="Media">
            {(['anime', 'manga'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.segment} ${media === m ? styles.segmentOn : ''}`}
                aria-pressed={media === m}
                onClick={() => setMedia(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.dialogActions}>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!nom.trim()} onClick={valider}>
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
