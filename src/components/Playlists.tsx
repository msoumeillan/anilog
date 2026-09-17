import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, GripVertical, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { usePlaylists, type Playlist } from '../store/playlists';
import { useSongs } from '../store/songs';
import { usePlayer } from '../store/player';
import { useToast } from '../store/toast';
import { filterSongs, type SongRow } from '../lib/songList';
import { PlaylistLine, SongLine } from './MusicRow';
import styles from './Playlists.module.css';

/**
 * L'onglet Playlists : les siennes, et ce qu'il y a dedans.
 *
 * Deux écrans dans un composant, parce qu'ils partagent tout sauf la liste
 * affichée : la même recherche filtre les playlists par nom sur l'index, et les
 * pistes sur une playlist ouverte. Ce qu'on ouvre vit dans l'URL — voir la page
 * Musiques —, pour qu'un retour arrière referme la playlist comme il refermerait
 * une portée.
 */

/** Ce qu'une piste devient pour être jouée : la copie, et les jugements À JOUR. */
function lignesDe(p: Playlist, judgements: ReturnType<typeof useSongs.getState>['songs']) {
  return p.tracks.map((t): SongRow => ({
    key: t.key,
    ...t.song,
    score: judgements[t.key]?.score,
    favourite: Boolean(judgements[t.key]?.favourite),
  }));
}

/**
 * Ce que le glisser-déposer DIT à un lecteur d'écran.
 *
 * Les phrases par défaut de dnd-kit lisent les identifiants — mesuré : « Draggable
 * item song:150672:ED1 was dropped over droppable area song:150672:OP1 ». Exact,
 * et inutilisable. On dit le TITRE et la PLACE, qui sont les deux choses qu'on
 * cherche à savoir en rangeant sans voir.
 */
const CONSIGNES: ScreenReaderInstructions = {
  draggable:
    'To reorder this theme, press space or enter to pick it up, the up and down arrow keys to move it, space or enter to drop it, and escape to cancel.',
};

function annoncesDe(pistes: readonly SongRow[]): Announcements {
  const titre = (id: string | number) =>
    pistes.find((p) => p.key === String(id))?.title ?? 'This theme';
  const place = (id: string | number) =>
    `position ${pistes.findIndex((p) => p.key === String(id)) + 1} of ${pistes.length}`;

  return {
    onDragStart: ({ active }) => `Picked up ${titre(active.id)}, at ${place(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titre(active.id)} is over ${place(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titre(active.id)} was dropped at ${place(over.id)}.`
        : `${titre(active.id)} was dropped back in place.`,
    onDragCancel: ({ active }) => `Reordering cancelled. ${titre(active.id)} is back in place.`,
  };
}

export function Playlists({
  q,
  openId,
  onOpen,
  onBack,
  onAddToPlaylist,
}: {
  q: string;
  openId: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  onAddToPlaylist: (song: SongRow) => void;
}) {
  const playlists = usePlaylists((s) => s.playlists);
  const hydrated = usePlaylists((s) => s.hydrated);

  if (!hydrated) return <p className="faint">Loading…</p>;

  const ouverte = openId ? playlists[openId] : undefined;
  if (openId) {
    return ouverte ? (
      <PlaylistDetail playlist={ouverte} q={q} onBack={onBack} onAddToPlaylist={onAddToPlaylist} />
    ) : (
      <div className={styles.absente}>
        <p className="muted">This playlist doesn’t exist anymore.</p>
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={2} aria-hidden />
          All playlists
        </button>
      </div>
    );
  }

  return <PlaylistIndex playlists={playlists} q={q} onOpen={onOpen} />;
}

function PlaylistIndex({
  playlists,
  q,
  onOpen,
}: {
  playlists: Record<string, Playlist>;
  q: string;
  onOpen: (id: string) => void;
}) {
  const create = usePlaylists((s) => s.create);
  const [nom, setNom] = useState('');

  const visibles = useMemo(() => {
    const cherche = q.trim().toLowerCase();
    /* Les plus récemment touchées en tête : on revient d'abord à celle qu'on
       remplit en ce moment. */
    return Object.values(playlists)
      .filter((p) => !cherche || p.name.toLowerCase().includes(cherche))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [playlists, q]);

  const total = Object.keys(playlists).length;

  return (
    <>
      <form
        className={styles.nouvelle}
        onSubmit={(e) => {
          e.preventDefault();
          if (!nom.trim()) return;
          /* On ouvre ce qu'on vient de créer : une playlist vide n'a qu'une
             chose à dire, qu'on la remplit avec le + de chaque générique. */
          onOpen(create(nom));
          setNom('');
        }}
      >
        <input
          className={styles.champ}
          type="text"
          placeholder="Name a new playlist…"
          value={nom}
          maxLength={80}
          onChange={(e) => setNom(e.target.value)}
          aria-label="New playlist name"
        />
        <button type="submit" className="btn btn--accent" disabled={!nom.trim()}>
          <Plus size={15} strokeWidth={2.2} aria-hidden />
          New playlist
        </button>
      </form>

      {visibles.length === 0 ? (
        <p className="muted">
          {total === 0
            ? 'No playlist yet. Name one above — or use the + on any theme, in a list or in the player.'
            : 'No playlist matches this search.'}
        </p>
      ) : (
        <ul className={styles.liste}>
          {visibles.map((p) => (
            <PlaylistLine
              key={p.id}
              name={p.name}
              cover={p.tracks[0]?.song.cover ?? null}
              meta={`${p.tracks.length} theme${p.tracks.length === 1 ? '' : 's'}`}
              onOpen={() => onOpen(p.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function PlaylistDetail({
  playlist,
  q,
  onBack,
  onAddToPlaylist,
}: {
  playlist: Playlist;
  q: string;
  onBack: () => void;
  onAddToPlaylist: (song: SongRow) => void;
}) {
  const rename = usePlaylists((s) => s.rename);
  const remove = usePlaylists((s) => s.remove);
  const removeTrack = usePlaylists((s) => s.removeTrack);
  const move = usePlaylists((s) => s.move);
  const show = useToast((s) => s.show);
  const judgements = useSongs((s) => s.songs);
  const toggleFavourite = useSongs((s) => s.toggleFavourite);
  const play = usePlayer((s) => s.play);
  const enCours = usePlayer((s) => s.queue[s.index]?.key);

  const [renommer, setRenommer] = useState<string | null>(null);
  /* Supprimer demande DEUX clics : il n'y a pas d'annulation, et une playlist
     se construit à la main, piste par piste. */
  const [confirmer, setConfirmer] = useState(false);

  /* Même réglage que les listes d'œuvres : six pixels avant qu'un clic devienne
     un glissement, et un capteur clavier — la poignée prise au clavier, Espace
     pour la soulever, les flèches pour la déplacer —, pour que ranger ne
     demande pas de souris. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toutes = useMemo(() => lignesDe(playlist, judgements), [playlist, judgements]);
  /* La recherche FILTRE mais ne réordonne pas : l'ordre d'une playlist est ce
     qu'on y a mis de soi. Et on ne déplace pas une piste dans une vue filtrée —
     la poser « après la suivante » sauterait par-dessus des pistes qu'on ne
     voit pas. */
  const filtre = q.trim();
  const visibles = filtre
    ? filterSongs(toutes, { kind: 'all', favouritesOnly: false, q: filtre })
    : toutes;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    /* `findIndex` sur des chaînes plutôt qu'un `indexOf` qui exigerait une
       `SongKey` : dnd-kit ne rend qu'un identifiant nu, et le lui promettre
       serait une promesse que personne ne vérifie. */
    const cles = toutes.map((s) => s.key);
    const from = cles.findIndex((k) => k === String(e.active.id));
    const to = cles.findIndex((k) => k === String(e.over?.id));
    if (from === -1 || to === -1) return;
    move(playlist.id, from, to);
  };

  const nb = playlist.tracks.length;

  return (
    <>
      <div className={styles.banniere}>
        {renommer !== null ? (
          <form
            className={styles.renommer}
            onSubmit={(e) => {
              e.preventDefault();
              rename(playlist.id, renommer);
              setRenommer(null);
            }}
          >
            <input
              className={styles.champ}
              type="text"
              value={renommer}
              maxLength={80}
              autoFocus
              onChange={(e) => setRenommer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRenommer(null);
              }}
              aria-label="Playlist name"
            />
            <button type="submit" className="btn btn--accent">
              Save
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setRenommer(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <p className={styles.titre}>
            <span className="label">Playlist</span>
            <strong>{playlist.name}</strong>
            <span className="faint">
              {nb} theme{nb === 1 ? '' : 's'}
            </span>
          </p>
        )}

        <div className={styles.actions}>
          {/* Pas de bouton sur une playlist vide : désactivé, il porterait
              l'accent sans rien faire, et l'état vide dit déjà quoi faire. */}
          {nb > 0 && (
            <button type="button" className="btn btn--accent" onClick={() => play(toutes, 0)}>
              <Play size={15} strokeWidth={2.2} aria-hidden />
              Play
            </button>
          )}
          {renommer === null && (
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => setRenommer(playlist.name)}
            >
              <Pencil size={14} strokeWidth={2} aria-hidden />
              Rename
            </button>
          )}
          {confirmer ? (
            <>
              <button
                type="button"
                className={`btn ${styles.danger}`}
                onClick={() => {
                  remove(playlist.id);
                  onBack();
                }}
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden />
                Delete “{playlist.name}”
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => setConfirmer(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={() => setConfirmer(true)}>
              <Trash2 size={14} strokeWidth={2} aria-hidden />
              Delete
            </button>
          )}
          <button type="button" className="btn btn--quiet" onClick={onBack}>
            <X size={15} strokeWidth={2} aria-hidden />
            All playlists
          </button>
        </div>
      </div>

      {nb === 0 ? (
        <p className="muted">
          Empty for now. The + on any theme — in Music, on an anime, in the player — adds it here.
        </p>
      ) : visibles.length === 0 ? (
        <p className="muted">No theme of this playlist matches this search.</p>
      ) : (
        <DndContext
          sensors={sensors}
          /* Une seule colonne : `closestCenter` vise juste, comme sur une liste
             d'œuvres — c'est la tier list, avec ses rangs empilés, qui demande
             mieux. */
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements: annoncesDe(toutes), screenReaderInstructions: CONSIGNES }}
        >
          <SortableContext
            items={visibles.map((s) => s.key)}
            strategy={verticalListSortingStrategy}
          >
            <ul className={styles.liste}>
              {visibles.map((song) => {
                const i = toutes.indexOf(song);
                return (
                  <PisteTriable
                    key={song.key}
                    song={song}
                    triable={!filtre}
                    playing={song.key === enCours}
                    /* La file est la playlist ENTIÈRE, depuis cette piste :
                       lancer la troisième doit enchaîner sur la quatrième,
                       filtre ou pas. */
                    onPlay={() => play(toutes, i)}
                    onAddToPlaylist={() => onAddToPlaylist(song)}
                    onFavourite={() => toggleFavourite(song)}
                    onRemove={() => {
                      removeTrack(playlist.id, song.key);
                      /* La ligne disparaît : sans le mot, on ne sait pas si
                         c'est le clic ou un défilement qui l'a emportée. */
                      show(`${song.title} was removed from “${playlist.name}”`);
                    }}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}

/**
 * Une piste qu'on range à la main, par sa POIGNÉE.
 *
 * La poignée plutôt que la ligne entière, pour la même raison que sur les
 * listes d'œuvres : la ligne porte déjà une vignette qui joue, un titre qui
 * joue, un lien vers l'anime, une étoile — les rendre saisissables ferait
 * partir en glissement le moindre clic un peu appuyé.
 *
 * Pas de poignée dans une vue filtrée : ranger « au-dessus de la suivante »
 * n'a pas de sens quand des pistes sont cachées entre les deux.
 */
function PisteTriable({
  song,
  triable,
  playing,
  onPlay,
  onAddToPlaylist,
  onFavourite,
  onRemove,
}: {
  song: SongRow;
  triable: boolean;
  playing: boolean;
  onPlay: () => void;
  onAddToPlaylist: () => void;
  onFavourite: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.key,
    disabled: !triable,
  });

  return (
    <SongLine
      song={song}
      playing={playing}
      onPlay={onPlay}
      onAddToPlaylist={onAddToPlaylist}
      onFavourite={onFavourite}
      rowRef={setNodeRef}
      /* Le seul `style` en ligne de l'onglet, et il ne décore rien : dnd-kit
         calcule le déplacement image par image, et une classe ne peut pas le
         porter. Même exception que les listes d'œuvres et la tier list. */
      rowStyle={{ transform: CSS.Transform.toString(transform), transition }}
      dragging={isDragging}
      extra={
        <span className={styles.ordre}>
          {triable && (
            <button
              type="button"
              className={`${styles.geste} ${styles.poignee}`}
              aria-label={`Reorder ${song.title}`}
              title="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={16} strokeWidth={2.2} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={styles.geste}
            aria-label={`Remove ${song.title} from this playlist`}
            onClick={onRemove}
          >
            <X size={15} strokeWidth={2} aria-hidden />
          </button>
        </span>
      }
    />
  );
}
