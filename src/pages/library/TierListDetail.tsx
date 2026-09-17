import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLists } from '../../store/lists';
import { useLibrary } from '../../store/library';
import { Modal } from '../../components/Modal';
import { TitlePicker } from '../../components/TitlePicker';
import { BackButton } from '../../components/BackButton';
import { display, dropTarget, tierKeys, VIVIER } from '../../lib/lists';
import { isEntryKey } from '../../lib/ids';
import { useArtworkKey } from '../../store/artwork';
import { artUrl } from '../../lib/artwork';
import type { EntryKey, LibraryEntry, Tier, TierList, WorkSnapshot } from '../../types/library';
import styles from './Library.module.css';
import own from './TierListDetail.module.css';

/**
 * Une tier list : des rangs, un vivier, et le glisser-déposer entre les deux.
 *
 * Le composant ne décide de RIEN : où tombe une carte se calcule dans
 * `lib/lists.dropTarget`, et le déplacement lui-même dans le store. Ce qui
 * reste ici est le câblage de dnd-kit — capteurs, conteneurs, calque de
 * glissement — c'est-à-dire la seule partie qu'un test sans navigateur ne
 * pourrait pas juger.
 */

/**
 * Où l'on vise, quand des rangs sont empilés les uns sur les autres.
 *
 * `closestCorners` — le premier essai — compare les DISTANCES entre le
 * rectangle traîné et tous les autres. Sur une pile de bandes larges et
 * basses, le coin d'une carte du rang voisin est souvent plus proche que le
 * fond du rang qu'on survole : la carte tombait une rangée trop haut ou trop
 * bas. C'est le défaut signalé, et il ne se corrige pas en bougeant des
 * pixels : c'est la question posée qui était mauvaise.
 *
 * `pointerWithin` demande autre chose : QUI EST SOUS LE CURSEUR. Il n'y a
 * plus de « presque » — le rang survolé est celui qui reçoit, et une carte
 * sous le pointeur l'emporte sur le fond du rang, ce qui permet d'insérer à
 * une place précise.
 *
 * Le repli en `rectIntersection` sert au clavier, qui n'a pas de pointeur :
 * là, l'intersection des rectangles est la seule mesure disponible.
 */
const viser: CollisionDetection = (args) => {
  const sousLeCurseur = pointerWithin(args);
  return sousLeCurseur.length > 0 ? sousLeCurseur : rectIntersection(args);
};

export default function TierListDetail() {
  const id = useParams().id ?? '';
  const hydrated = useLists((s) => s.hydrated);
  const liste = useLists((s) => s.tierLists[id]);
  const entries = useLibrary((s) => s.entries);
  const moveTierItem = useLists((s) => s.moveTierItem);
  const addToTierList = useLists((s) => s.addToTierList);
  const addTier = useLists((s) => s.addTier);

  const [actif, setActif] = useState<EntryKey | null>(null);
  const [reglages, setReglages] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [rangs, setRangs] = useState(false);

  /* Un seuil de 6 pixels : sans lui, le moindre frémissement pendant un clic
     démarre un glissement, et on ne peut plus simplement cliquer une carte.
     Le clavier a son propre capteur — une tier list au clavier reste une tier
     list. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!hydrated) return <p className="faint">Loading…</p>;

  if (!liste)
    return (
      <div className={styles.soon}>
        <h2 className="label">Tier list</h2>
        <p className="muted">This tier list is gone.</p>
        <p>
          <Link className="label" to="/library/lists?kind=tiers">
            Back to tier lists
          </Link>
        </p>
      </div>
    );

  const onDragStart = (e: DragStartEvent) => {
    const cle = String(e.active.id);
    /* Ce que dnd-kit rend est un identifiant nu. On le VERIFIE plutot que de
       le promettre : une cle malformee ne doit pas entrer dans le store. */
    if (isEntryKey(cle)) setActif(cle);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActif(null);
    const cle = String(e.active.id);
    if (!e.over || !isEntryKey(cle)) return;
    const dest = dropTarget(liste, String(e.over.id));
    if (!dest) return;
    moveTierItem(liste.id, cle, dest.tierId, dest.index);
  };

  return (
    <>
      <div className={styles.listHead}>
        <BackButton />

        <div>
          <h1 className="title">{liste.name}</h1>
          <p className="label">
            {tierKeys(liste).length} {liste.media} · {liste.tiers.length} tiers
          </p>
        </div>

        <div className={styles.listActions}>
          <button type="button" className="btn btn--quiet" onClick={() => setAjout(true)}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            Add titles
          </button>
          <button
            type="button"
            className={rangs ? 'btn' : 'btn btn--quiet'}
            aria-pressed={rangs}
            onClick={() => setRangs((v) => !v)}
          >
            {rangs ? 'Done' : 'Edit tiers'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => setReglages(true)}>
            <Pencil size={15} strokeWidth={2} aria-hidden />
            Edit
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={viser}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActif(null)}
      >
        <div className={own.tiers}>
          {liste.tiers.map((t, i) => (
            <Rang key={t.id} liste={liste} tier={t} index={i} entries={entries} edition={rangs} />
          ))}
        </div>

        {rangs && (
          <button type="button" className="btn btn--quiet" onClick={() => addTier(liste.id)}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            Add a tier
          </button>
        )}

        <Vivier liste={liste} entries={entries} />

        {/* La carte suit le curseur au lieu de rester en place : sans elle, on
            traîne un trou et on ne sait plus ce qu'on déplace. */}
        <DragOverlay>
          {actif && <Carte cle={actif} entries={entries} snapshots={liste.snapshots} fantome />}
        </DragOverlay>
      </DndContext>

      <Reglages liste={liste} ouvert={reglages} onClose={() => setReglages(false)} />
      <TitlePicker
        ouvert={ajout}
        media={liste.media}
        deja={tierKeys(liste)}
        onAdd={(c) => addToTierList(liste.id, c.key, c.snapshot)}
        onClose={() => setAjout(false)}
      />
    </>
  );
}

/** Un rang : son bandeau à gauche, ce qu'il tient à droite. */
function Rang({
  liste,
  tier,
  index,
  entries,
  edition,
}: {
  liste: TierList;
  tier: Tier;
  index: number;
  entries: Record<string, LibraryEntry>;
  edition: boolean;
}) {
  const patchTier = useLists((s) => s.patchTier);
  const removeTier = useLists((s) => s.removeTier);
  const moveTier = useLists((s) => s.moveTier);
  const { setNodeRef, isOver } = useDroppable({ id: tier.id });

  return (
    <div className={own.tier}>
      <div className={own.tierLabel} style={{ background: tier.color }}>
        {edition ? (
          <input
            className={own.tierNom}
            value={tier.label}
            aria-label="Tier name"
            onChange={(e) => patchTier(liste.id, tier.id, { label: e.target.value })}
          />
        ) : (
          <span>{tier.label}</span>
        )}
      </div>

      <div ref={setNodeRef} className={`${own.tierZone} ${isOver ? own.tierZoneOver : ''}`}>
        <SortableContext items={tier.items} strategy={rectSortingStrategy}>
          {tier.items.map((k) => (
            <CarteTriable key={k} cle={k} entries={entries} snapshots={liste.snapshots} />
          ))}
        </SortableContext>
        {tier.items.length === 0 && <span className="faint">Drop here</span>}
      </div>

      {edition && (
        <div className={own.tierOutils}>
          {/* La couleur en `input type=color` : c'est le sélecteur du système,
              il connaît déjà la pipette et les favoris de l'utilisateur. */}
          <input
            type="color"
            className={own.couleur}
            value={tier.color}
            aria-label="Tier colour"
            onChange={(e) => patchTier(liste.id, tier.id, { color: e.target.value })}
          />
          <button
            type="button"
            className={styles.outil}
            aria-label="Move tier up"
            disabled={index === 0}
            onClick={() => moveTier(liste.id, index, index - 1)}
          >
            <ChevronUp size={15} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.outil}
            aria-label="Move tier down"
            disabled={index === liste.tiers.length - 1}
            onClick={() => moveTier(liste.id, index, index + 1)}
          >
            <ChevronDown size={15} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.outil}
            aria-label="Delete tier"
            onClick={() => removeTier(liste.id, tier.id)}
          >
            <Trash2 size={15} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Le vivier : ce qui n'est pas encore classé.
 *
 * Un conteneur comme les autres, et c'est ce qui permet de RESSORTIR une carte
 * d'un rang. Sans lui, on ne pourrait que déplacer d'un rang à l'autre, jamais
 * revenir en arrière sans supprimer.
 */
function Vivier({ liste, entries }: { liste: TierList; entries: Record<string, LibraryEntry> }) {
  const { setNodeRef, isOver } = useDroppable({ id: VIVIER });
  const removeFromTierList = useLists((s) => s.removeFromTierList);

  return (
    <section className={styles.section}>
      <h2 className="label">Unranked · {liste.unranked.length}</h2>
      <div ref={setNodeRef} className={`${own.vivier} ${isOver ? own.tierZoneOver : ''}`}>
        <SortableContext items={liste.unranked} strategy={rectSortingStrategy}>
          {liste.unranked.map((k) => (
            <CarteTriable
              key={k}
              cle={k}
              entries={entries}
              snapshots={liste.snapshots}
              onRetirer={() => removeFromTierList(liste.id, k)}
            />
          ))}
        </SortableContext>
        {liste.unranked.length === 0 && (
          <span className="faint">Everything is ranked. “Add titles” to bring in more.</span>
        )}
      </div>
    </section>
  );
}

/** Une carte qu'on peut saisir. */
function CarteTriable({
  cle,
  entries,
  snapshots,
  onRetirer,
}: {
  cle: EntryKey;
  entries: Record<string, LibraryEntry>;
  snapshots: Record<string, WorkSnapshot> | undefined;
  onRetirer?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cle,
  });

  return (
    <div
      ref={setNodeRef}
      className={own.carteHote}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        /* Presque effacée, pas retirée : l'emplacement doit rester réservé
           pendant qu'on déplace, sinon la rangée se referme et tout saute. */
        opacity: isDragging ? 0.25 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <Carte cle={cle} entries={entries} snapshots={snapshots} />
      {onRetirer && (
        <button
          type="button"
          className={own.carteX}
          aria-label="Remove"
          /* `pointerDown` arrêté ici : sinon le capteur de glissement prend le
             geste et la croix ne se clique jamais. */
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRetirer}
        >
          <X size={12} strokeWidth={3} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Une carte : une affiche et rien d'autre, le titre en infobulle.
 *
 * Elle RESOUT ce qu'elle montre au lieu de recevoir une entree toute faite.
 * Recevoir `entries[k]` la rendait aveugle a deux choses : les oeuvres ajoutees
 * depuis le catalogue, qui n'ont pas d'entree et sortaient en « ? », et
 * l'affiche choisie a la main, qui ne s'affichait que sur les grilles.
 */
function Carte({
  cle,
  entries,
  snapshots,
  fantome,
}: {
  cle: EntryKey;
  entries: Record<string, LibraryEntry>;
  snapshots: Record<string, WorkSnapshot> | undefined;
  fantome?: boolean;
}) {
  const vue = display(cle, entries, snapshots);
  const affiche = artUrl(useArtworkKey(cle)?.poster, 'w342') ?? vue.cover;

  return (
    <div className={`${own.carte} ${fantome ? own.carteFantome : ''}`} title={vue.title}>
      {affiche ? (
        <img src={affiche} alt="" loading="lazy" />
      ) : (
        /* Ni affiche ni copie : on montre le TITRE, pas un point
           d'interrogation — un rang plein de « ? » ne dit rien de ce qu'on a
           classe. */
        <span className={own.carteVide}>{vue.title}</span>
      )}
    </div>
  );
}

/** Nom de la tier list, et sa suppression. */
function Reglages({
  liste,
  ouvert,
  onClose,
}: {
  liste: TierList;
  ouvert: boolean;
  onClose: () => void;
}) {
  const patchTierList = useLists((s) => s.patchTierList);
  const deleteTierList = useLists((s) => s.deleteTierList);
  const [confirme, setConfirme] = useState(false);

  return (
    <Modal open={ouvert} onOpenChange={(o) => !o && onClose()} title="Edit tier list">
      <div className={styles.editor}>
        <label className={styles.field}>
          <span className="label">Name</span>
          <input
            className={styles.input}
            value={liste.name}
            onChange={(e) => patchTierList(liste.id, { name: e.target.value })}
          />
        </label>

        <div className={styles.dialogActions}>
          {confirme ? (
            <Link
              to="/library/lists?kind=tiers"
              className={`btn ${styles.danger}`}
              onClick={() => deleteTierList(liste.id)}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden />
              Delete for good
            </Link>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={() => setConfirme(true)}>
              <Trash2 size={15} strokeWidth={2} aria-hidden />
              Delete tier list
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
