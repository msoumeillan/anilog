import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  ListPlus,
  Maximize,
  Minimize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Star,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { usePlayer } from '../store/player';
import { useSongs } from '../store/songs';
import { useThemeInfo } from '../api/animethemes/hooks';
import { scopeParam, type CatalogueRow } from '../lib/musicBrowse';
import { clampTime, toggleMute, withLevel } from '../lib/playback';
import { weight } from '../lib/themes';
import { CatalogueLine } from './MusicRow';
import { Glissiere, Progression } from './PlayerTimeline';
import { PlaylistPicker } from './PlaylistPicker';
import styles from './PlayerBar.module.css';

/**
 * Le lecteur qui survit à la navigation.
 *
 * Monté DANS `App`, au-dessus des routes : c'est toute la raison de son
 * existence à cet endroit. Placé dans la page Musiques, il serait démonté au
 * premier clic vers une fiche, et la lecture s'arrêterait — ce qui est
 * exactement ce qu'un lecteur ne doit pas faire.
 *
 * LES COMMANDES SONT LES NÔTRES, pas celles que le navigateur dessine sur la
 * vidéo. Mesuré avec les natives : en barre, sur 160 pixels, il n'en restait
 * qu'un bouton pause, un menu et un trait de 120 pixels, sans l'heure ni le
 * volume — et ce bouton pause doublait le nôtre, en barre comme agrandi. On
 * garde la balise `<video>`, qui lit le fichier ; on lui retire ce qu'elle
 * dessinait par-dessus.
 *
 * Ce qui ne change pas : l'élément reste la SEULE source de vérité pour « ça
 * joue » et « où on en est ». Nos commandes ne gardent rien — elles lisent ce
 * qu'il annonce (`play`, `pause`, `timeupdate`) et lui demandent de changer. Le
 * volume fait exception, parce qu'il doit survivre à l'élément : voir le store.
 *
 * Le PLEIN ÉCRAN aussi : c'est la SCÈNE qui y passe — la vidéo et nos
 * commandes —, pas la vidéo seule. La vidéo seule n'emmène qu'elle, et le
 * navigateur y dessinait de nouveau ses commandes par-dessus. La scène a un
 * second mérite : elle survit au changement de chanson, alors qu'une vidéo en
 * plein écran retirée de la page — ce que fait chaque chanson neuve — en sort.
 *
 * UN SEUL ARBRE pour les deux tailles, et c'est une contrainte, pas un choix
 * de style : déplacer le `<video>` d'un conteneur à l'autre le remonterait, et
 * la lecture repartirait de zéro. Agrandi ou réduit, seules les classes
 * changent — voir la feuille de style, où `.scene` est un `display: contents`
 * tant que le lecteur est une barre.
 *
 * AGRANDI, un panneau dit d'où vient ce qu'on écoute : l'anime, sa série, son
 * studio, ses interprètes. Chacun s'ouvre dans l'onglet Musiques, sur tout ce
 * qu'on peut en écouter — c'est ce qui referme la boucle entre « j'aime ça »
 * et « qu'est-ce que ces gens-là ont fait d'autre ? ».
 */

export function PlayerBar() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const expanded = usePlayer((s) => s.expanded);
  const source = usePlayer((s) => s.source);
  const volume = usePlayer((s) => s.volume);
  const { next, prev, close, toggleExpanded, setSource, setVolume } = usePlayer((s) => s);

  const songs = useSongs((s) => s.songs);
  const setScore = useSongs((s) => s.setScore);
  const toggleFavourite = useSongs((s) => s.toggleFavourite);

  const navigate = useNavigate();
  const song = queue[index];

  /* Demandé seulement quand le panneau s'ouvre : une requête par chanson
     écoutée serait payée par tout le monde pour ceux qui le lisent. */
  const infos = useThemeInfo(song?.anilistId ?? 0, song?.slug ?? '', expanded && Boolean(song));
  const sources = infos.data?.sources ?? [];

  /* « Ajouter à une playlist », ouvert depuis le lecteur. */
  const [rangement, setRangement] = useState(false);

  /* L'élément vidéo, et son IDENTITÉ : la clé change exactement quand React
     en monte un neuf — nouvelle chanson, autre fichier. Ce qui s'y branche
     dépend donc de `cle`, et le retrouve dans la ref. */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cle = song ? `${song.key}:${source ?? ''}` : '';

  /* Le REFLET de l'élément vidéo : mis à jour par ses événements, jamais
     décidé ici. Vrai au départ — une vidéo qui n'a pas encore démarré est en
     pause, et l'autolecture le dira en émettant `play`. */
  const [enPause, setEnPause] = useState(true);

  /* La scène, ce qui passe en plein écran. Reflété lui aussi : c'est le
     navigateur qui en sort — Échap, son propre bandeau —, sans passer par
     nous. */
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [pleinEcran, setPleinEcran] = useState(false);

  /* En plein écran, les commandes s'effacent quand la souris se repose : on
     est venu regarder l'image. Bouger, toucher ou presser une touche les
     rappelle. */
  const [immobile, setImmobile] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reveiller = useCallback(() => {
    setImmobile(false);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setImmobile(true), REPOS_MS);
  }, []);
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  /* Le volume retenu, posé sur chaque élément qui arrive et à chaque réglage.
     Un élément naît à plein volume : sans ceci, chaque chanson repartirait
     à 100 %. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume.level;
    video.muted = volume.muted;
  }, [volume, cle]);

  useEffect(() => {
    const suivre = () => {
      const actif =
        document.fullscreenElement !== null && document.fullscreenElement === sceneRef.current;
      setPleinEcran(actif);
      /* Le compte à rebours part DÈS l'entrée : le clic sur le bouton a eu
         lieu avant, et sans mouvement ensuite, les commandes resteraient
         affichées pour de bon. */
      if (actif) reveiller();
    };
    document.addEventListener('fullscreenchange', suivre);
    return () => document.removeEventListener('fullscreenchange', suivre);
  }, [reveiller]);

  /* Au clavier, en plein écran : Espace lit ou suspend, les flèches reculent
     et avancent de cinq secondes. Sans ça, l'Espace irait au bouton qui garde
     le focus — celui du plein écran, qu'on vient de presser — et en ferait
     sortir. Les curseurs gardent leurs flèches : celui du volume règle le
     volume, celui de la frise avance déjà de lui-même. */
  useEffect(() => {
    if (!pleinEcran) return;
    const appui = (e: KeyboardEvent) => {
      reveiller();
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) basculerLecture(videoRef.current);
        return;
      }
      const pas = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
      const video = videoRef.current;
      if (pas === 0 || !video || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      video.currentTime = clampTime(video.currentTime + pas, video.duration);
    };
    /* Un bouton s'active à l'Espace RELÂCHÉ : arrêter l'appui ne suffit pas
       dans tous les navigateurs, on arrête aussi le relâchement. */
    const relache = (e: KeyboardEvent) => {
      if (e.key === ' ') e.preventDefault();
    };
    document.addEventListener('keydown', appui);
    document.addEventListener('keyup', relache);
    return () => {
      document.removeEventListener('keydown', appui);
      document.removeEventListener('keyup', relache);
    };
  }, [pleinEcran, reveiller]);

  /* Échap referme l'agrandissement sans arrêter la musique : agrandi, le
     lecteur couvre la page, et on doit pouvoir en sortir sans viser un
     bouton. SAUF quand la fenêtre des playlists est ouverte : c'est elle
     qu'Échap referme, et un seul appui ne doit pas défaire deux choses. Même
     règle en plein écran : l'appui qui en sort ne referme pas le lecteur. */
  useEffect(() => {
    if (!expanded || rangement || pleinEcran) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleExpanded();
    };
    /* Réarmé au tour SUIVANT, et c'est mesuré : la fenêtre des playlists se
       ferme sur l'Échap que le document reçoit, React rejoue cet effet aussitôt
       — un appui clavier se traite de façon synchrone —, et l'écouteur remis en
       place recevait le MÊME appui en remontant jusqu'à `window`. Un seul Échap
       refermait alors la fenêtre et le lecteur. */
    const arme = setTimeout(() => window.addEventListener('keydown', onKey), 0);
    return () => {
      clearTimeout(arme);
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded, rangement, pleinEcran, toggleExpanded]);

  if (!song) return null;

  const avis = songs[song.key];
  const silence = volume.muted || volume.level === 0;

  /* Ouvrir une portée REFERME le lecteur : la liste qu'on vient de demander
     est derrière lui, et la musique, elle, continue. */
  const ouvrir = (row: CatalogueRow) => {
    navigate(`/music?scope=${encodeURIComponent(scopeParam(row))}`);
    toggleExpanded();
  };

  const basculer = () => basculerLecture(videoRef.current);

  const basculerPleinEcran = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void sceneRef.current?.requestFullscreen().catch(() => {});
  };

  /* Au repos seulement quand quelque chose JOUE : en pause, on cherche des
     yeux le bouton pour relancer, et il doit être là. */
  const auRepos = pleinEcran && !enPause && immobile;

  return (
    <aside
      className={`${styles.barre} ${expanded ? styles.grand : ''}`}
      aria-label="Theme player"
      /* Agrandi, le fond fait partie du lecteur : cliquer à côté de la vidéo
         referme, comme toute fenêtre posée par-dessus une page. Le fond, c'est
         la marge de la fenêtre ET les vides de la scène, qui la remplit
         désormais — mais jamais en plein écran, où il n'y a pas de page à
         retrouver. */
      onClick={(e) => {
        const fond = e.target === e.currentTarget || e.target === sceneRef.current;
        if (expanded && !pleinEcran && fond) toggleExpanded();
      }}
    >
      {/* La scène : la vidéo et ce qui l'entoure. `display: contents` tant que
          le lecteur est une barre — ce groupe n'existe qu'agrandi, où il range
          l'image et le côté en deux colonnes, et en plein écran, où il prend
          l'écran entier. */}
      <div
        ref={sceneRef}
        className={styles.scene}
        data-repos={auRepos}
        onPointerMove={pleinEcran ? reveiller : undefined}
        onPointerDown={pleinEcran ? reveiller : undefined}
      >
        <video
          /* La CLÉ force un élément neuf à chaque chanson ET à chaque fichier
             choisi. Sans elle, React réutilise le même et une source changée en
             cours de lecture laisse parfois l'image de la précédente. */
          key={cle}
          ref={videoRef}
          className={styles.video}
          src={source ?? song.link}
          autoPlay
          playsInline
          /* En barre, la vignette ouvre le lecteur : trop petite pour qu'on y
             regarde quoi que ce soit, c'est l'image qu'on veut voir en grand.
             Agrandie ou en plein écran, elle lit ou suspend, comme toute
             vidéo. */
          onClick={() => {
            if (expanded) basculer();
            else toggleExpanded();
          }}
          onEnded={next}
          onPlay={() => setEnPause(false)}
          onPause={() => setEnPause(true)}
          /* Une chanson neuve repart en pause jusqu'à ce que l'autolecture
             démarre : sans ça, le bouton garderait l'état de l'élément
             précédent — « pause » affiché sur une vidéo que le navigateur a
             refusé de lancer. En plein écran, elle rappelle aussi les
             commandes, et avec elles le titre de ce qui commence. */
          onLoadStart={() => {
            setEnPause(true);
            if (pleinEcran) reveiller();
          }}
          /* Réglé hors de nos commandes — par le navigateur lui-même —, le
             volume revient au store, sans quoi la chanson suivante
             l'oublierait. La comparaison coupe la boucle : poser le volume
             retenu fait lui-même émettre `volumechange`. */
          onVolumeChange={(e) => {
            const { volume: level, muted } = e.currentTarget;
            if (level !== volume.level || muted !== volume.muted) setVolume({ level, muted });
          }}
        />

        {/* L'habillage : tout ce qui entoure l'image. Hors du plein écran, un
            `display: contents` qui ne dessine aucune boîte, comme la scène en
            barre. En plein écran, il flotte sur la vidéo, et c'est lui qui
            s'efface au repos. */}
        <div className={styles.habillage}>
          {/* Où l'on en est. En barre, un trait sur le bord haut ; agrandi, la
            ligne de commandes de la vidéo, posée sous l'image au lieu de la
            couvrir. */}
          <div className={styles.frise}>
            <Progression videoRef={videoRef} cle={cle} detaillee={expanded} />

            {expanded && (
              <>
                <button
                  type="button"
                  className={styles.icone}
                  aria-label={silence ? 'Unmute' : 'Mute'}
                  onClick={() => setVolume(toggleMute(volume))}
                >
                  {silence ? (
                    <VolumeX size={17} strokeWidth={2} aria-hidden />
                  ) : volume.level < 0.5 ? (
                    <Volume1 size={17} strokeWidth={2} aria-hidden />
                  ) : (
                    <Volume2 size={17} strokeWidth={2} aria-hidden />
                  )}
                </button>
                <Glissiere
                  classe={styles.niveau}
                  rempli={silence ? 0 : volume.level}
                  min={0}
                  max={1}
                  step={0.05}
                  value={silence ? 0 : volume.level}
                  aria-label="Volume"
                  aria-valuetext={`${Math.round((silence ? 0 : volume.level) * 100)}%`}
                  onChange={(e) => setVolume(withLevel(Number(e.target.value)))}
                />
                {document.fullscreenEnabled && (
                  <button
                    type="button"
                    className={styles.icone}
                    aria-label={pleinEcran ? 'Exit full screen' : 'Full screen'}
                    onClick={basculerPleinEcran}
                  >
                    {pleinEcran ? (
                      <Minimize size={17} strokeWidth={2} aria-hidden />
                    ) : (
                      <Maximize size={17} strokeWidth={2} aria-hidden />
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Le CÔTÉ : ce qu'on lit, et non ce qu'on commande — le titre, la
            note, le fichier, et d'où vient la chanson. Agrandi, une colonne à
            droite de l'image, qui lui laisse toute la hauteur ; en barre, un
            `display: contents` qui ne change rien à la ligne ; en plein écran,
            le titre en haut de l'image. */}
          <div className={styles.cote}>
            <div className={styles.infos}>
              <p className={styles.titre}>
                <span className={styles.badge} data-kind={song.kind}>
                  {song.slug}
                </span>
                <span className={styles.nom}>{song.title}</span>
              </p>

              <p className={styles.sous}>
                {song.artists.length > 0 && (
                  <span className={styles.artistes}>{song.artists.join(', ')}</span>
                )}
                <Link to={`/anime/${song.anilistId}`} className={styles.anime}>
                  {song.anime}
                </Link>
              </p>

              {/* Noter ICI et pas dans la liste : on note ce qu'on ÉCOUTE. Dix
                boutons par ligne sur deux cents lignes seraient deux mille
                boutons pour une note qu'on donne une fois. */}
              <div className={styles.notes} role="group" aria-label="My score out of 10">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={styles.note}
                    aria-pressed={typeof avis?.score === 'number' && n <= avis.score}
                    onClick={() => setScore(song, n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Le choix du fichier — la diffusion web, le Blu-ray sans crédits, la
              version remontée en cours de saison. Affiché SEULEMENT quand il y a
              vraiment à choisir : un bouton unique n'est pas un choix, c'est un
              rappel de ce qu'on joue déjà. */}
            {expanded && sources.length > 1 && (
              <div className={styles.sources} role="group" aria-label="Video source">
                {sources.map((s) => {
                  const joue = (source ?? song.link) === s.link;
                  /* La définition est ÉCRITE sur la pastille, le reste se survole.
                     Le nom accessible les dit tous les deux : lu à voix haute,
                     « 51 Mo » sans « 1080p » ne désigne rien. */
                  const detail = [s.label, s.episodes && `episodes ${s.episodes}`, weight(s.size)]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <button
                      key={s.link}
                      type="button"
                      className={styles.source}
                      aria-pressed={joue}
                      aria-label={detail}
                      title={detail}
                      onClick={() => setSource(joue ? null : s.link)}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* D'où vient ce qu'on écoute. Les mêmes lignes que l'onglet Musiques,
              au même composant près : une ligne se lit pareil partout, et ouvre
              la même chose. */}
            {expanded && (
              <section className={styles.panneau} aria-label="About this theme">
                {infos.data && infos.data.origin.length > 0 ? (
                  <>
                    <p className="label">Origin</p>
                    <ul className={styles.liste}>
                      {infos.data.origin.map((row) => (
                        <CatalogueLine
                          key={`${row.kind}:${row.slug}`}
                          row={row}
                          onOpen={() => ouvrir(row)}
                        />
                      ))}
                    </ul>

                    {infos.data.artists.length > 0 && (
                      <>
                        <p className="label">Artists</p>
                        <ul className={styles.liste}>
                          {infos.data.artists.map((row) => (
                            <CatalogueLine
                              key={`${row.kind}:${row.slug}`}
                              row={row}
                              onOpen={() => ouvrir(row)}
                            />
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <p className="faint">
                    {infos.isFetching
                      ? 'Loading…'
                      : 'AnimeThemes knows this theme, but nothing about where it comes from.'}
                  </p>
                )}
              </section>
            )}
          </div>

          <div className={styles.commandes}>
            <button
              type="button"
              className={`${styles.icone} ${styles.facultatif}`}
              aria-label={avis?.favourite ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={Boolean(avis?.favourite)}
              onClick={() => toggleFavourite(song)}
            >
              <Star
                size={17}
                strokeWidth={2}
                aria-hidden
                fill={avis?.favourite ? 'currentColor' : 'none'}
              />
            </button>

            {/* `fenetre` : ce qui n'a de sens que hors du plein écran. La fenêtre
              des playlists s'ouvre par-dessus la PAGE, que le plein écran
              cache ; réduire et fermer y ont leur sortie, Échap et le bouton
              de la frise. */}
            <button
              type="button"
              className={`${styles.icone} ${styles.facultatif} ${styles.fenetre}`}
              aria-label={`Add ${song.title} to a playlist`}
              title="Add to playlist"
              onClick={() => setRangement(true)}
            >
              <ListPlus size={17} strokeWidth={2} aria-hidden />
            </button>

            {/* La file, d'un bloc : reculer, lire ou suspendre, avancer — l'ordre
              de toutes les télécommandes —, puis où l'on en est. */}
            <span className={styles.file}>
              <button
                type="button"
                className={`${styles.icone} ${styles.facultatif}`}
                aria-label="Previous theme"
                /* Au premier morceau, rien derrière : voir `prev` dans le store. */
                disabled={index === 0}
                onClick={prev}
              >
                <SkipBack size={17} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className={`${styles.icone} ${styles.lecture}`}
                aria-label={enPause ? 'Play' : 'Pause'}
                onClick={basculer}
              >
                {enPause ? (
                  <Play size={17} strokeWidth={2} aria-hidden fill="currentColor" />
                ) : (
                  <Pause size={17} strokeWidth={2} aria-hidden fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                className={styles.icone}
                aria-label="Next theme"
                disabled={queue.length < 2}
                onClick={next}
              >
                <SkipForward size={17} strokeWidth={2} aria-hidden />
              </button>
              <span className={`${styles.rang} ${styles.facultatif}`}>
                {index + 1} / {queue.length}
              </span>
            </span>

            <button
              type="button"
              className={`${styles.icone} ${styles.fenetre}`}
              aria-label={expanded ? 'Shrink player' : 'Enlarge player'}
              onClick={toggleExpanded}
            >
              {expanded ? (
                <ChevronDown size={17} strokeWidth={2} aria-hidden />
              ) : (
                <ChevronUp size={17} strokeWidth={2} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className={`${styles.icone} ${styles.fenetre}`}
              aria-label="Close player"
              onClick={close}
            >
              <X size={17} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* La fenêtre suit la chanson qui JOUE : passer à la suivante pendant qu'elle
          est ouverte la fait parler de la nouvelle, pas d'une chanson déjà partie. */}
      <PlaylistPicker song={rangement ? song : null} onClose={() => setRangement(false)} />
    </aside>
  );
}

/** Deux secondes et demie sans bouger avant que le plein écran s'efface : de
    quoi viser un bouton après avoir bougé la souris. */
const REPOS_MS = 2500;

/**
 * Lire ou suspendre.
 *
 * `play()` rend une promesse qui peut échouer — une politique d'autolecture,
 * une source coupée. Rien à en dire ici : l'élément n'aura pas émis `play`, et
 * le bouton restera honnêtement sur « lecture ».
 */
function basculerLecture(video: HTMLVideoElement | null) {
  if (!video) return;
  if (video.paused) void video.play().catch(() => {});
  else video.pause();
}
