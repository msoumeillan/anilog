import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLists } from '../../store/lists';
import { useLibrary } from '../../store/library';
import { Modal } from '../../components/Modal';
import { MaybeLink } from '../../components/MaybeLink';
import { TitlePicker } from '../../components/TitlePicker';
import { BackButton } from '../../components/BackButton';
import { entryCard } from '../../lib/routes';
import { mediaHref } from '../../lib/routes';
import { resolveList } from '../../lib/lists';
import { outOfTen } from '../../lib/score';
import { isEntryKey } from '../../lib/ids';
import { useArtworkKey } from '../../store/artwork';
import { artUrl } from '../../lib/artwork';
import type { CustomList, EntryKey } from '../../types/library';
import styles from './Library.module.css';

/**
 * Une liste, ouverte.
 *
 * Le dessin vient de Letterboxd, et ce n'est pas qu'une question de goût : une
 * liste se lit comme une PLANCHE d'affiches, pas comme un tableau. Le rang est
 * posé sur l'affiche, le titre dessous en petit, et rien d'autre ne vient
 * disputer la place — on parcourt des images, on ne lit pas des lignes.
 *
 * Le mode ÉDITION est séparé de la lecture. Des poignées et des croix
 * affichées en permanence transforment une planche en formulaire ; on les
 * demande quand on veut ranger, et elles disparaissent après.
 */

export default function ListDetail() {
  const id = useParams().id ?? '';
  const hydrated = useLists((s) => s.hydrated);
  const liste = useLists((s) => s.lists[id]);
  const entries = useLibrary((s) => s.entries);
  const addToList = useLists((s) => s.addToList);

  const moveInList = useLists((s) => s.moveInList);

  const [edition, setEdition] = useState(false);
  const [reglages, setReglages] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [actif, setActif] = useState<EntryKey | null>(null);

  /* Meme reglage que la tier list : six pixels avant qu'un clic devienne un
     glissement, et un capteur clavier pour que ranger ne demande pas de
     souris. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!hydrated) return <p className="faint">Loading…</p>;

  if (!liste)
    return (
      <div className={styles.soon}>
        <h2 className="label">List</h2>
        <p className="muted">This list is gone.</p>
        <p>
          <Link className="label" to="/library/lists">
            Back to lists
          </Link>
        </p>
      </div>
    );

  const items = resolveList(liste, entries);
  const ordre = items.map((i) => i.key);

  const onDragStart = (e: DragStartEvent) => {
    const cle = String(e.active.id);
    if (isEntryKey(cle)) setActif(cle);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActif(null);
    if (!e.over || e.active.id === e.over.id) return;
    /* `findIndex` sur une comparaison de chaines plutot qu'un `indexOf` qui
       exigerait une `EntryKey` : dnd-kit ne rend qu'un identifiant nu, et le
       lui promettre serait une promesse de plus que personne ne verifie. */
    const from = ordre.findIndex((k) => k === String(e.active.id));
    const to = ordre.findIndex((k) => k === String(e.over?.id));
    if (from === -1 || to === -1) return;
    moveInList(liste.id, from, to);
  };

  return (
    <>
      <div className={styles.listHead}>
        <BackButton />

        <div>
          <h1 className="title">{liste.name}</h1>
          {liste.description && <p className={styles.listDesc}>{liste.description}</p>}
          <p className="label">
            {liste.items.length} {liste.media}
            {liste.numbered ? ' · ranked' : ''}
          </p>
        </div>

        <div className={styles.listActions}>
          <button type="button" className="btn btn--quiet" onClick={() => setAjout(true)}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            Add titles
          </button>
          <button
            type="button"
            className={edition ? 'btn' : 'btn btn--quiet'}
            aria-pressed={edition}
            onClick={() => setEdition((v) => !v)}
          >
            {edition ? 'Done' : 'Reorder'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => setReglages(true)}>
            <Pencil size={15} strokeWidth={2} aria-hidden />
            Edit
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <p className="muted">Empty list. “Add titles” to put something in it.</p>
      )}

      <DndContext
        sensors={sensors}
        /* Un seul conteneur ici : la grille. `closestCenter` suffit et vise
           juste — c'est la tier list, avec ses rangs empiles, qui demande
           mieux. */
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActif(null)}
      >
        <SortableContext items={ordre} strategy={rectSortingStrategy}>
          <ol className={styles.planche}>
            {items.map((item, i) => (
              <Ligne key={item.key} liste={liste} index={i} item={item} edition={edition} />
            ))}
          </ol>
        </SortableContext>

        <DragOverlay>
          {actif && (
            <div className={`poster ${styles.plancheFantome}`}>
              {items.find((i) => i.key === actif)?.cover && (
                <img src={items.find((i) => i.key === actif)?.cover} alt="" />
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Reglages liste={liste} ouvert={reglages} onClose={() => setReglages(false)} />
      <TitlePicker
        ouvert={ajout}
        media={liste.media}
        deja={liste.items.map((i) => i.key)}
        onAdd={(c) => addToList(liste.id, c.key, c.snapshot)}
        onClose={() => setAjout(false)}
      />
    </>
  );
}

/** Une affiche, son rang, et — en édition — de quoi la déplacer ou l'enlever. */
/**
 * Une affiche, son rang, et — en édition — sa poignée et sa croix.
 *
 * La POIGNÉE plutôt que la carte entière : sous elle il y a un lien vers la
 * fiche, et rendre toute la vignette saisissable rendrait ce lien impossible à
 * cliquer sans partir en glissement. C'est aussi ce que fait Letterboxd.
 */
function Ligne({
  liste,
  index,
  item,
  edition,
}: {
  liste: CustomList;
  index: number;
  item: ReturnType<typeof resolveList>[number];
  edition: boolean;
}) {
  const removeFromList = useLists((s) => s.removeFromList);
  /* L'affiche CHOISIE prime, ici comme sur les cartes du profil. Sans ca, la
     changer se voyait sur les grilles et nulle part dans les listes. */
  const choisie = artUrl(useArtworkKey(item.key)?.poster, 'w342');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
    /* Rien ne bouge hors du mode édition : une planche qu'on lit ne doit pas
       se réorganiser sous la souris. */
    disabled: !edition,
  });

  const { entry } = item;
  const href = entry
    ? (entryCard(entry).href ?? mediaHref(liste.media, entryCard(entry).id))
    : null;

  return (
    <li
      ref={setNodeRef}
      className={styles.plancheItem}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        /* Presque effacée, pas retirée : la place doit rester réservée, sinon
           la grille se referme et tout saute pendant qu'on déplace. */
        opacity: isDragging ? 0.25 : 1,
      }}
    >
      <MaybeLink to={href} className={styles.plancheArt}>
        <div className="poster">
          {(choisie ?? item.cover) ? (
            <img src={choisie ?? item.cover} alt="" loading="lazy" />
          ) : (
            <div className="placeholder" />
          )}
        </div>

        {liste.numbered && <span className={styles.rang}>{index + 1}</span>}
        {typeof entry?.score === 'number' && (
          <span className={styles.plancheScore}>{outOfTen(entry.score * 10)}</span>
        )}
      </MaybeLink>

      {/* Le titre vient de la bibliothèque quand elle suit l'œuvre, de la copie
          de secours sinon — voir `lib/lists.display`. */}
      <p className={styles.plancheTitre}>{item.title}</p>

      {edition && (
        <div className={styles.plancheOutils}>
          <button
            type="button"
            className={`${styles.outil} ${styles.poignee}`}
            aria-label={`Reorder ${item.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.outil}
            aria-label="Remove from list"
            onClick={() => removeFromList(liste.id, item.key)}
          >
            <X size={15} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

/** Nom, description, numérotation — et la suppression, à part. */
function Reglages({
  liste,
  ouvert,
  onClose,
}: {
  liste: CustomList;
  ouvert: boolean;
  onClose: () => void;
}) {
  const patchList = useLists((s) => s.patchList);
  const deleteList = useLists((s) => s.deleteList);
  const [confirme, setConfirme] = useState(false);

  return (
    <Modal open={ouvert} onOpenChange={(o) => !o && onClose()} title="Edit list">
      <div className={styles.editor}>
        <label className={styles.field}>
          <span className="label">Name</span>
          <input
            className={styles.input}
            value={liste.name}
            onChange={(e) => patchList(liste.id, { name: e.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span className="label">Description</span>
          <textarea
            className={`${styles.input} ${styles.zone}`}
            value={liste.description ?? ''}
            rows={3}
            placeholder="What this list gathers."
            onChange={(e) => patchList(liste.id, { description: e.target.value })}
          />
        </label>

        <label className={styles.bascule}>
          <input
            type="checkbox"
            checked={liste.numbered}
            onChange={(e) => patchList(liste.id, { numbered: e.target.checked })}
          />
          <span>
            Numbered list
            <span className="faint"> — a rank on every poster</span>
          </span>
        </label>

        <div className={styles.dialogActions}>
          {/* Deux temps : une liste supprimée ne se récupère pas, et le bouton
              est à côté de ceux qu'on utilise tous les jours. */}
          {confirme ? (
            <button
              type="button"
              className={`btn ${styles.danger}`}
              onClick={() => {
                deleteList(liste.id);
                onClose();
              }}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden />
              Delete for good
            </button>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={() => setConfirme(true)}>
              <Trash2 size={15} strokeWidth={2} aria-hidden />
              Delete list
            </button>
          )}

          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
