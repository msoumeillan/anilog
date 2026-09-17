import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Modal } from './Modal';
import { usePlaylists, type TrackSnapshot } from '../store/playlists';
import { useToast } from '../store/toast';
import type { PlayableSong } from '../store/player';
import styles from './PlaylistPicker.module.css';

/** Ce qu'on peut ranger : n'importe quelle chanson jouable, avec son affiche si on l'a. */
export type Rangeable = PlayableSong & { cover?: string | null; year?: number };

/**
 * « Ajouter à une playlist », d'où qu'on vienne — une ligne, une table, le
 * lecteur.
 *
 * Des CASES plutôt qu'un menu qui se referme au premier clic : on range souvent
 * la même chanson dans deux playlists, et rouvrir la fenêtre pour la seconde
 * serait un geste de trop. Recliquer une case retire — la fenêtre sert donc
 * aussi à défaire, sans aller chercher la piste dans la playlist.
 *
 * Créer une playlist ICI y range la chanson du même geste : c'est presque
 * toujours la raison pour laquelle on la crée maintenant.
 */
export function PlaylistPicker({ song, onClose }: { song: Rangeable | null; onClose: () => void }) {
  const playlists = usePlaylists((s) => s.playlists);
  const toggle = usePlaylists((s) => s.toggle);
  const create = usePlaylists((s) => s.create);
  const show = useToast((s) => s.show);
  const [nom, setNom] = useState('');

  /* Les plus récemment touchées en tête : c'est dans celle qu'on vient de
     remplir qu'on range la suivante. */
  const rangees = useMemo(
    () => Object.values(playlists).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [playlists],
  );

  if (!song) return null;

  /* Recopié champ par champ : la note et l'étoile vivent dans les jugements, et
     une playlist qui les figerait montrerait une note périmée. */
  const instantane: TrackSnapshot = {
    anilistId: song.anilistId,
    slug: song.slug,
    kind: song.kind,
    title: song.title,
    artists: song.artists,
    anime: song.anime,
    link: song.link,
    cover: song.cover ?? null,
    year: song.year,
  };

  const creer = () => {
    if (!nom.trim()) return;
    const id = create(nom, { key: song.key, song: instantane });
    /* Le nom RELU du store, et non celui tapé : le store le nettoie — espaces
       en trop, longueur —, et la confirmation doit nommer ce qui existe. */
    const cree = usePlaylists.getState().playlists[id]?.name ?? nom.trim();
    show(`${song.title} was added to “${cree}”`);
    setNom('');
  };

  return (
    <Modal
      open
      onOpenChange={(ouvert) => {
        if (!ouvert) {
          setNom('');
          onClose();
        }
      }}
      title="Add to playlist"
      subtitle={`${song.slug} · ${song.title} — ${song.anime}`}
    >
      {rangees.length > 0 ? (
        <ul className={styles.liste}>
          {rangees.map((p) => {
            const dedans = p.tracks.some((t) => t.key === song.key);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.choix}
                  role="checkbox"
                  aria-checked={dedans}
                  /* Nommée EXPLICITEMENT : un rôle de case ne garantit pas que
                     tous les lecteurs d'écran lisent le texte du bouton. */
                  aria-label={`${p.name}, ${p.tracks.length} theme${p.tracks.length === 1 ? '' : 's'}`}
                  onClick={() => {
                    /* Le store dit où en est la piste APRÈS le geste : c'est
                       lui, et pas l'état affiché avant le clic, qui choisit
                       le mot. */
                    const apres = toggle(p.id, song.key, instantane);
                    show(
                      apres
                        ? `${song.title} was added to “${p.name}”`
                        : `${song.title} was removed from “${p.name}”`,
                    );
                  }}
                >
                  <span className={styles.case} aria-hidden>
                    {dedans && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className={styles.nom}>{p.name}</span>
                  <span className={styles.compte}>
                    {p.tracks.length} theme{p.tracks.length === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="faint">No playlist yet — name the first one below.</p>
      )}

      <form
        className={styles.nouvelle}
        onSubmit={(e) => {
          e.preventDefault();
          creer();
        }}
      >
        <input
          className={styles.champ}
          type="text"
          placeholder="New playlist…"
          value={nom}
          maxLength={80}
          onChange={(e) => setNom(e.target.value)}
          aria-label="New playlist name"
        />
        <button type="submit" className="btn btn--accent" disabled={!nom.trim()}>
          <Plus size={15} strokeWidth={2.2} aria-hidden />
          Create
        </button>
      </form>
    </Modal>
  );
}
