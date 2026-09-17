import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  ListPlus,
  Play,
  Star,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMusicScope } from '../api/animethemes/hooks';
import { usePlayer } from '../store/player';
import { useSongs } from '../store/songs';
import { playableVersion, rowsFromRemote, type SongRow } from '../lib/songList';
import { weight } from '../lib/themes';
import type { CatalogueRow } from '../lib/musicBrowse';
import styles from './MusicRow.module.css';

/**
 * Les lignes de l'onglet Musiques.
 *
 * DEUX lignes, un seul squelette : une vignette qui agit, un titre, une ligne
 * de contexte, des commandes à droite. C'est ce qui permet à cinq catégories
 * de se ressembler assez pour qu'on n'ait jamais à réapprendre à les lire —
 * ce qui change d'un studio à une chanson tient dans le libellé et dans ce que
 * le clic déclenche, pas dans la structure.
 *
 * La vignette ET le titre déclenchent la même action, volontairement : l'une
 * est une grande cible qu'on vise sans réfléchir, l'autre est ce qu'on lit.
 * Les imbriquer serait plus court à écrire et invalide — un lien ne vit pas
 * dans un bouton.
 */

/**
 * L'image, ou le repère qui la remplace : jamais un carré vide.
 *
 * L'INITIALE plutôt que le motif habituel des affiches manquantes, et pour une
 * raison qu'on ne voit qu'en liste : une série n'a aucune image chez eux —
 * jamais —, si bien qu'un index de séries devenait une colonne de trente croix
 * identiques. Une lettre distingue les lignes, et garde la cible du clic.
 */
function Vignette({
  src,
  label,
  shape,
}: {
  src: string | null | undefined;
  label: string;
  shape: 'poster' | 'square';
}) {
  return (
    <span className={styles.cadre} data-shape={shape}>
      {src ? (
        <img className={styles.image} src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className={styles.initiale} aria-hidden>
          {label.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/** Le bouton « ranger dans une playlist », le même sur toutes les lignes. */
function RangerBouton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.etoile}
      aria-label={`Add ${title} to a playlist`}
      title="Add to playlist"
      onClick={onClick}
    >
      <ListPlus size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}

export function SongLine({
  song,
  playing,
  onPlay,
  onFavourite,
  onAddToPlaylist,
  extra,
  rowRef,
  rowStyle,
  dragging,
}: {
  song: SongRow;
  playing: boolean;
  onPlay: () => void;
  onFavourite: () => void;
  onAddToPlaylist?: () => void;
  /** Des commandes propres à l'endroit — la poignée, retirer d'une playlist. */
  extra?: ReactNode;
  /**
   * Ce qu'un glisser-déposer pose sur la ligne : sa référence et son
   * déplacement. Passés par la ligne plutôt qu'enveloppés autour d'elle, parce
   * que c'est le `<li>` lui-même qui doit bouger — un conteneur de plus dans
   * une liste casserait sa sémantique.
   */
  rowRef?: (node: HTMLLIElement | null) => void;
  rowStyle?: CSSProperties;
  dragging?: boolean;
}) {
  return (
    <li
      ref={rowRef}
      className={styles.ligne}
      aria-current={playing}
      style={rowStyle}
      data-dragging={dragging ? 'true' : undefined}
    >
      <div className={styles.rang}>
        <button
          type="button"
          className={styles.action}
          aria-label={`Play ${song.title}`}
          onClick={onPlay}
        >
          <Vignette src={song.cover} label={song.anime} shape="poster" />
          <span className={styles.glyphe}>
            <Play size={14} strokeWidth={2.4} aria-hidden />
          </span>
        </button>

        <div className={styles.texte}>
          <p className={styles.titre}>
            <span className={styles.badge} data-kind={song.kind}>
              {song.slug}
            </span>
            {/* Le titre rejoue la même action que la vignette : on clique ce
                qu'on lit, ou la grande cible, selon ce qu'on visait. */}
            <button type="button" className={styles.nom} onClick={onPlay}>
              {song.title}
            </button>
          </p>

          <p className={styles.meta}>
            {song.artists.length > 0 && <span>{song.artists.join(', ')}</span>}
            <Link to={`/anime/${song.anilistId}`} className={styles.lien}>
              {song.anime}
            </Link>
            {song.year ? <span className={styles.annee}>{song.year}</span> : null}
          </p>
        </div>

        <div className={styles.commandes}>
          {extra}
          {/* La note se DONNE dans le lecteur, sur ce qu'on écoute. Ici on la
              lit seulement : dix boutons par ligne feraient deux mille boutons
              pour un geste qu'on fait une fois. */}
          <span className={styles.note}>{song.score ?? ''}</span>
          {onAddToPlaylist && <RangerBouton title={song.title} onClick={onAddToPlaylist} />}
          <button
            type="button"
            className={styles.etoile}
            aria-label={song.favourite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={song.favourite}
            onClick={onFavourite}
          >
            <Star
              size={15}
              strokeWidth={2}
              aria-hidden
              fill={song.favourite ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Une playlist, dans la liste des playlists.
 *
 * Le même squelette que les autres lignes, et c'est voulu : l'onglet Playlists
 * se lit comme les index d'AnimeThemes, et l'on n'a pas à réapprendre où
 * cliquer. La vignette est l'affiche de la PREMIÈRE piste — celle qu'on entend
 * en lançant la playlist.
 */
export function PlaylistLine({
  name,
  cover,
  meta,
  onOpen,
}: {
  name: string;
  cover: string | null;
  meta: string;
  onOpen: () => void;
}) {
  return (
    <li className={styles.ligne}>
      <div className={styles.rang}>
        <button
          type="button"
          className={styles.action}
          aria-label={`Open playlist ${name}`}
          onClick={onOpen}
        >
          <Vignette src={cover} label={name} shape="square" />
          <span className={styles.glyphe}>
            <ChevronRight size={15} strokeWidth={2.4} aria-hidden />
          </span>
        </button>

        <div className={styles.texte}>
          <p className={styles.titre}>
            <button type="button" className={styles.nom} onClick={onOpen}>
              {name}
            </button>
          </p>
          <p className={styles.meta}>
            <span>{meta}</span>
          </p>
        </div>
      </div>
    </li>
  );
}

export function CatalogueLine({
  row,
  onOpen,
  /** Un anime s'OUVRE sur place ; une série, un studio mènent ailleurs. */
  expandable = false,
  expanded = false,
  children,
}: {
  row: CatalogueRow;
  onOpen: () => void;
  expandable?: boolean;
  expanded?: boolean;
  children?: ReactNode;
}) {
  const Fleche = expandable ? (expanded ? ChevronUp : ChevronDown) : ChevronRight;

  return (
    <li className={styles.ligne}>
      <div className={styles.rang}>
        <button
          type="button"
          className={styles.action}
          aria-label={expandable ? `Themes of ${row.title}` : `Show music from ${row.title}`}
          aria-expanded={expandable ? expanded : undefined}
          onClick={onOpen}
        >
          <Vignette src={row.image} label={row.title} shape={row.shape} />
          <span className={styles.glyphe} data-open={expanded ? 'true' : undefined}>
            <Fleche size={15} strokeWidth={2.4} aria-hidden />
          </span>
        </button>

        <div className={styles.texte}>
          <p className={styles.titre}>
            <button type="button" className={styles.nom} onClick={onOpen}>
              {row.title}
            </button>
          </p>
          <p className={styles.meta}>
            <span>{row.meta}</span>
          </p>
        </div>

        <div className={styles.commandes}>
          {/* La fiche AniLog, quand ils connaissent l'identifiant AniList : leur
              catalogue s'arrête à la musique, la nôtre porte le suivi. */}
          {row.anilistId !== null && (
            <Link
              to={`/anime/${row.anilistId}`}
              className={styles.etoile}
              aria-label={`Open ${row.title} in the library`}
            >
              <ExternalLink size={15} strokeWidth={2} aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {children}
    </li>
  );
}

/**
 * Les génériques d'un anime, dépliés SOUS sa ligne.
 *
 * C'est la réponse à « c'était quoi, l'opening ? » sans quitter la liste : le
 * type, le titre, la plage d'épisodes, et ce qu'on va télécharger. Un opening
 * pèse une soixantaine de méga-octets en 1080p — l'écrire AVANT le clic est ce
 * qui rend le clic informé plutôt que subi, comme sur une fiche.
 *
 * Le composant demande lui-même ce qu'il affiche : c'est ce qui permet à la
 * page de n'ouvrir QUE la ligne qu'on déplie, au lieu de ramener les
 * génériques des trente anime de l'index.
 *
 * Il ne décide PAS de la file de lecture : il rend ses génériques et la place
 * de celui qu'on joue, et c'est la page, qui connaît la liste entière, qui en
 * fait une file — voir `onPlay` dans Musiques.
 */
export function ThemeTable({
  slug,
  title,
  onPlay,
  onAddToPlaylist,
}: {
  slug: string;
  title: string;
  onPlay: (file: SongRow[], index: number) => void;
  onAddToPlaylist?: (row: SongRow) => void;
}) {
  const portee = useMusicScope({ kind: 'anime', slug });
  const judgements = useSongs((s) => s.songs);
  const toggleFavourite = useSongs((s) => s.toggleFavourite);
  const enCours = usePlayer((s) => s.queue[s.index]?.key);

  /* Le thème ET sa ligne jouable, appariés : `rowsFromRemote` écarte ce qui n'a
     pas de vidéo, et se fier à l'ordre des deux tableaux les désynchroniserait
     au premier générique sans fichier. */
  const lignes = useMemo(
    () =>
      (portee.data?.themes ?? []).flatMap((r) => {
        const [row] = rowsFromRemote([r], judgements);
        return row ? [{ theme: r.theme, row }] : [];
      }),
    [portee.data, judgements],
  );

  if (lignes.length === 0) {
    return (
      <p className={`faint ${styles.vide}`}>
        {portee.isFetching ? 'Loading…' : `AnimeThemes has no playable video for ${title}.`}
      </p>
    );
  }

  const file = lignes.map((l) => l.row);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col">Song title</th>
          <th scope="col">Episodes</th>
          <th scope="col">Notes</th>
          {/* La colonne de l'étoile n'a pas d'en-tête écrit — le bouton porte
              déjà son libellé, et « Favourite » au-dessus d'une colonne de
              vingt pixels ferait une colonne de vingt caractères. */}
          <th scope="col" aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {lignes.map(({ theme, row }, i) => {
          const version = playableVersion(theme);
          const video = version?.videos[0];
          const notes = [
            video?.resolution ? `${video.resolution}p` : null,
            video?.nc ? 'NC' : null,
            weight(video?.size),
          ].filter(Boolean);

          return (
            <tr key={row.key} aria-current={row.key === enCours}>
              <td>
                <span className={styles.badge} data-kind={row.kind}>
                  {row.slug}
                </span>
              </td>
              <td>
                <button type="button" className={styles.nom} onClick={() => onPlay(file, i)}>
                  {row.title}
                </button>
                {row.artists.length > 0 && (
                  <span className={styles.interpretes}>{row.artists.join(', ')}</span>
                )}
              </td>
              <td className={styles.episodes}>
                {version?.episodes ?? '—'}
                {/* Un opening est souvent remonté en cours de saison : le dire
                    évite de croire que la plage affichée couvre la série. */}
                {theme.versions.length > 1 && (
                  <span className="faint"> · {theme.versions.length} versions</span>
                )}
              </td>
              <td className={styles.notes}>{notes.join(' · ') || '—'}</td>
              <td className={styles.gestes}>
                {onAddToPlaylist && (
                  <RangerBouton title={row.title} onClick={() => onAddToPlaylist(row)} />
                )}
                <button
                  type="button"
                  className={styles.etoile}
                  aria-label={row.favourite ? 'Remove from favourites' : 'Add to favourites'}
                  aria-pressed={row.favourite}
                  onClick={() => toggleFavourite(row)}
                >
                  <Star
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    fill={row.favourite ? 'currentColor' : 'none'}
                  />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
