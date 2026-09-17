import { Fragment, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { useAiringSchedule, useAnimeDetail } from '../api/anilist/hooks';
import { useMalEpisodes } from '../api/mal/hooks';
import { useTmdbEpisodes } from '../api/tmdb/hooks';
import { MalError } from '../api/mal/client';
import { useLibrary } from '../store/library';
import { entryKey } from '../lib/ids';
import { displayTitle } from '../lib/title';
import { indexStreaming } from '../lib/streaming';
import { formatWatchDate, isoDate } from '../lib/dates';
import { isSingleUnit } from '../lib/format';
import { useGoBack } from '../lib/useGoBack';
import { Modal } from '../components/Modal';
import { EpisodeDialog } from '../components/EpisodeDialog';
import { ThemeMarker } from '../components/Themes';
import { useAnimeThemes } from '../api/animethemes/hooks';
import { themeMarks } from '../lib/themes';
import styles from './AnimeEpisodes.module.css';

/**
 * Liste d'épisodes — page à part entière.
 *
 * Trois sources, par ordre de préférence, parce qu'aucune n'est fiable seule :
 *
 *   1. Jikan       filler, recap, note MAL — les seules données qu'il soit
 *                  seul à avoir ; en revanche il tombe souvent (504)
 *   2. TMDB        titre, vignette, SYNOPSIS. Fait autorité dès qu'il
 *                  répond, parce que son alignement est VÉRIFIABLE : la date
 *                  du premier épisode doit tomber sur le début de la fiche.
 *                  Facultatif — sans clé, tout le reste fonctionne.
 *   3. AniList     titre + miniature via streamingEpisodes. En dernier
 *                  recours seulement : son alignement, lui, ne se vérifie
 *                  pas, et il liste souvent les épisodes de la première
 *                  saison sur une fiche de suite (voir `lib/streaming.ts`).
 *   4. le compte   simple numérotation, pour que le suivi marche toujours
 *
 * La page reste utilisable au niveau 4 : c'est la règle qu'on s'est fixée,
 * chaque source dégrade seule.
 *
 * L'ordre 2/3 a été inversé après coup : donner la priorité à AniList
 * paraissait prudent — c'est la source « officielle » — mais c'était donner
 * la priorité à la seule source qu'on ne peut pas contrôler.
 */

interface Row {
  number: number;
  title?: string;
  aired?: string;
  score?: number;
  filler?: boolean;
  recap?: boolean;
  thumbnail?: string;
  synopsis?: string;
  /** Note du public TMDB, sur 10, et son assise. */
  rating?: number;
  votes?: number;
  runtime?: number;
  /** Annoncé, pas encore diffusé : `aired` est alors une date future. */
  upcoming?: boolean;
}

export default function AnimeEpisodes() {
  const id = Number(useParams().id);
  const backToDetail = useGoBack(`/anime/${id}`);

  /* L'épisode ouvert vit dans l'URL : « Watching » depuis la fiche y renvoie
     directement, et le retour arrière referme la fenêtre au lieu de quitter
     la page. */
  const [params, setParams] = useSearchParams();
  const asked = Number(params.get('ep'));
  const openEpisode = Number.isInteger(asked) && asked > 0 ? asked : null;
  const openAt = (n: number | null) => {
    const next = new URLSearchParams(params);
    if (n) next.set('ep', String(n));
    else next.delete('ep');
    setParams(next, { replace: true });
  };
  const { data: anime, isPending: animePending } = useAnimeDetail(id);
  const episodes = useMalEpisodes(anime?.idMal);
  /* Le calendrier à venir ne concerne que ce qui diffuse encore. */
  const airing = useAiringSchedule(id, anime?.status === 'RELEASING');
  /* Les titres servent au repli par recherche, quand la table de
     correspondance ne connaît pas encore la série. */
  const tmdb = useTmdbEpisodes(
    id,
    anime
      ? {
          titles: [anime.title.english, anime.title.romaji, anime.title.native],
          year: anime.startDate?.year ?? anime.seasonYear,
          start: isoDate(anime.startDate),
        }
      : undefined,
  );

  const key = entryKey('anime', id);
  const entry = useLibrary((s) => s.entries[key]);
  const setEpisodeWatched = useLibrary((s) => s.setEpisodeWatched);

  const [hideFillers, setHideFillers] = useState(false);
  const [revealAll, setRevealAll] = useState(false);

  const progress = entry?.progress.kind === 'anime' ? entry.progress.episodes : 0;

  const rows = useMemo<Row[]>(() => {
    if (!anime) return [];

    /* Une série en cours n'a pas de total chez AniList : `episodes` vaut null.
       Mais `nextAiringEpisode` donne le numéro du prochain, donc tout ce qui
       précède est déjà diffusé. Sans ce repli, One Piece et Detective Conan
       n'affichaient AUCUN épisode dès que Jikan lâchait — ce qu'il fait de
       façon persistante au-delà de leur huitième page. */
    const aired = anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 0;
    const total = anime.episodes ?? Math.max(aired, episodes.data?.episodes.length ?? 0);

    /* Source 3 : les titres et miniatures d'AniList. `indexStreaming` les
       écarte en bloc quand leur nombre trahit une fiche de suite — AniList y
       attache régulièrement les épisodes de la PREMIÈRE saison. */
    const streaming = indexStreaming(anime.streamingEpisodes, total);

    /* Source 1 : les données MyAnimeList — Tenrai, ou Jikan en repli.
       Tenrai apporte en plus la vignette, le synopsis et la durée ; Jikan les
       laisse vides, d'où le `?? undefined` sur chacun. */
    const malByNumber = new Map<number, Row>();
    episodes.data?.episodes.forEach((e) => {
      malByNumber.set(e.mal_id, {
        number: e.mal_id,
        title: e.title ?? undefined,
        aired: e.aired ?? undefined,
        score: e.score ?? undefined,
        filler: e.filler,
        recap: e.recap,
        thumbnail: e.images?.jpg?.image_url ?? undefined,
        synopsis: e.synopsis ?? undefined,
        /* Tenrai compte en SECONDES ; la fenêtre d'épisode affiche des
           minutes, comme pour la durée que donne TMDB. */
        runtime: e.duration ? Math.round(e.duration / 60) : undefined,
      });
    });

    /* Non nul seulement si la correspondance a passé la vérification de date. */
    const tmdbFaitAutorite = Boolean(tmdb.data);

    const count = Math.max(total, malByNumber.size);
    const diffuses = Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const base = malByNumber.get(n) ?? { number: n };
      const extra = tmdb.data?.get(n);
      /* Quand TMDB répond, il fait autorité, et on ne mélange plus : son
         alignement a été vérifié sur la date de diffusion, celui de
         `streamingEpisodes` ne peut pas l'être. C'est ce mélange qui donnait
         à Kaguya-sama saison 2 les images de la première — leurs douze
         épisodes rendaient toute vérification par le nombre impossible.
         AniList ne reprend la main que si TMDB n'a rien pour cette fiche. */
      const alt = tmdbFaitAutorite ? undefined : streaming.get(n);
      return {
        ...base,
        title: base.title ?? extra?.title ?? alt?.title,
        /* MAL d'abord pour la vignette et le synopsis : ils sont numérotés
           comme AniList — même découpage par saison — donc sans risque de
           décalage, quand TMDB numérote par SÉRIE et demande une table de
           correspondance et une vérification de date. TMDB reste le recours
           là où MAL n'a rien, Evangelion par exemple. */
        thumbnail: base.thumbnail ?? extra?.still ?? alt?.thumbnail,
        aired: base.aired ?? extra?.aired,
        synopsis: base.synopsis ?? extra?.synopsis,
        rating: extra?.rating,
        votes: extra?.votes,
        runtime: base.runtime ?? extra?.runtime,
      };
    });

    /* Les épisodes annoncés, à la suite. AniList en connaît vingt-sept
       d'avance sur One Piece, là où `nextAiringEpisode` n'en donnait qu'un. */
    const futurs: Row[] = (airing.data ?? [])
      .filter((slot) => slot.episode > count)
      .map((slot) => ({
        number: slot.episode,
        aired: new Date(slot.airingAt * 1000).toISOString(),
        upcoming: true,
      }));

    return [...diffuses, ...futurs];
  }, [anime, episodes.data, airing.data, tmdb.data]);

  const visible = hideFillers ? rows.filter((r) => !r.filler) : rows;

  /* Ou chaque opening COMMENCE, pour poser un repere dans la liste. Requete a
     part : la liste s'affiche sans attendre AnimeThemes, et les reperes
     apparaissent quand ils arrivent. */
  const themes = useAnimeThemes(id);
  const reperes = useMemo(() => themeMarks(themes.data ?? []), [themes.data]);

  /* On cherche dans `rows` et non dans `visible` : un épisode ouvert par
     l'URL doit s'afficher même si le filtre « masquer les fillers » le cache. */
  const openRow = openEpisode === null ? undefined : rows.find((r) => r.number === openEpisode);

  /* Les flèches suivent la liste AFFICHÉE : si les fillers sont masqués, elles
     les sautent. Sauf quand l'épisode ouvert est lui-même masqué — on est
     alors arrivé par l'URL, et c'est la liste complète qui fait foi. */
  const walk = openRow && visible.includes(openRow) ? visible : rows;
  const at = openEpisode === null ? -1 : walk.findIndex((r) => r.number === openEpisode);
  const step = (delta: number) => {
    const target = at < 0 ? undefined : walk[at + delta];
    return target ? () => openAt(target.number) : undefined;
  };
  const fillerCount = rows.filter((r) => r.filler).length;
  /* Le total « vu sur N » ne compte que le diffusé : annoncer 1 202 quand
     27 épisodes n'existent pas encore ferait croire à un retard imaginaire. */
  const airedCount = rows.filter((r) => !r.upcoming).length;

  const upstreamDown = episodes.error instanceof MalError && episodes.error.upstreamDown;

  if (animePending || !anime)
    return (
      <div className={`page ${styles.state}`}>
        <p className="faint">Loading…</p>
      </div>
    );

  /* Un film n'a pas d'épisodes à lister. Plus aucun lien n'y mène, mais
     l'adresse reste tapable : on renvoie à la fiche plutôt que d'afficher une
     liste d'un seul élément. `replace` pour que le retour arrière ne
     ramène pas ici en boucle. */
  if (isSingleUnit(anime.format, anime.episodes)) {
    return <Navigate to={`/anime/${id}`} replace />;
  }

  return (
    <div className={`page ${styles.wrap}`}>
      <div className={styles.head}>
        {/* Un bouton, pas un lien : il RECULE. En empilant une nouvelle entrée
            vers la fiche, il faisait revenir ici au coup d'après — on
            repartait indéfiniment entre la fiche et les épisodes au lieu de
            remonter d'où l'on venait. La fiche n'est que le repli, pour qui
            arrive directement par l'adresse. */}
        <button type="button" className={`btn btn--quiet ${styles.back}`} onClick={backToDetail}>
          <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          {displayTitle(anime.title)}
        </button>

        <div className={styles.headMain}>
          <h1 className="title">Episodes</h1>
          <p className="label">
            {progress} of {anime.episodes ?? airedCount} watched
          </p>
        </div>

        <div className={styles.tools}>
          {fillerCount > 0 && (
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={hideFillers}
              onClick={() => setHideFillers((v) => !v)}
            >
              Hide fillers <span className="faint">{fillerCount}</span>
            </button>
          )}
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={revealAll}
            onClick={() => setRevealAll((v) => !v)}
          >
            {revealAll ? (
              <Eye size={14} strokeWidth={2} aria-hidden />
            ) : (
              <EyeOff size={14} strokeWidth={2} aria-hidden />
            )}
            {revealAll ? 'Titles shown' : 'Hide spoilers'}
          </button>
        </div>
      </div>

      {!entry && (
        <p className="muted">
          This title isn't in your library — add it from the{' '}
          <Link to={`/anime/${id}`}>details page</Link> to track episodes.
        </p>
      )}

      {episodes.data?.truncated && (
        <p className={`label ${styles.notice}`}>
          This series has more episodes than we load at once — the tail of the list shows numbers
          only.
        </p>
      )}

      {upstreamDown && (
        <p className={`label ${styles.notice}`}>
          Jikan can't reach MyAnimeList right now — air dates, filler flags and episode scores are
          unavailable. Titles fall back to AniList.
        </p>
      )}

      <ul className={styles.list}>
        {visible.map((row) => {
          const record = entry?.episodes?.[row.number];
          const watched = (record?.watchedAt.length ?? 0) > 0 || row.number <= progress;
          // On ne coche pas, et on n'ouvre pas, ce qui n'est pas encore sorti.
          const locked = !entry || Boolean(row.upcoming);
          // Un synopsis ou un titre d'épisode non vu est un spoiler par nature.
          const masked = !revealAll && !watched && row.number > progress;

          return (
            <Fragment key={row.number}>
              {reperes.get(row.number) && <ThemeMarker marks={reperes.get(row.number) ?? []} />}
              <li
                className={`${styles.row} ${watched ? styles.rowSeen : ''} ${row.upcoming ? styles.rowUpcoming : ''}`}
              >
                {/* La case coche vite ; le reste de la ligne ouvre la fenêtre.
                  Deux boutons frères, jamais imbriqués. */}
                <button
                  type="button"
                  className={styles.check}
                  aria-pressed={watched}
                  aria-label={`Episode ${row.number}${watched ? ' — watched' : ''}`}
                  disabled={locked}
                  onClick={() =>
                    setEpisodeWatched(key, row.number, (record?.watchedAt.length ?? 0) === 0)
                  }
                />

                <button
                  type="button"
                  className={styles.open}
                  disabled={locked}
                  onClick={() => openAt(row.number)}
                >
                  <span className={styles.num}>{row.number}</span>

                  <div className={`${styles.thumb} ${masked ? styles.thumbMasked : ''}`}>
                    {row.thumbnail && !masked && <img src={row.thumbnail} alt="" loading="lazy" />}
                  </div>

                  <div className={styles.body}>
                    {masked ? (
                      <span className={styles.masked} aria-label="Title hidden to avoid spoilers" />
                    ) : (
                      <span className={styles.title}>{row.title ?? `Episode ${row.number}`}</span>
                    )}
                    <span className={styles.meta}>
                      {row.aired && formatWatchDate(row.aired)}
                      {row.upcoming && <span className={styles.badge}>UPCOMING</span>}
                      {row.filler && <span className={styles.badge}>FILLER</span>}
                      {row.recap && <span className={styles.badge}>RECAP</span>}
                      {(record?.watchedAt.length ?? 0) > 1 && (
                        <span className={styles.rewatch}>×{record!.watchedAt.length}</span>
                      )}
                    </span>
                  </div>

                  <span className={styles.score} title="MyAnimeList episode score, out of 5">
                    {row.score ? (
                      <>
                        {row.score.toFixed(2)}
                        <span className={styles.scoreScale}>/5</span>
                      </>
                    ) : (
                      ''
                    )}
                  </span>
                </button>
              </li>
            </Fragment>
          );
        })}
      </ul>

      {visible.length === 0 && <p className="muted">No episodes listed for this title.</p>}

      <Modal
        open={openEpisode !== null && Boolean(entry)}
        onOpenChange={(next) => !next && openAt(null)}
        title={openRow?.title ?? `Episode ${openEpisode}`}
        wide
        subtitle={[
          `Episode ${openEpisode}`,
          openRow?.aired && formatWatchDate(openRow.aired),
          openRow?.runtime && `${openRow.runtime} min`,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {openEpisode !== null && entry && (
          /* Remonté à chaque épisode : sans cette clé, la date et le
             commentaire saisis restent ceux de l'épisode précédent. */
          <EpisodeDialog
            key={openEpisode}
            entryKey={key}
            episode={openEpisode}
            record={entry.episodes?.[openEpisode]}
            image={openRow?.thumbnail}
            synopsis={openRow?.synopsis}
            rating={openRow?.rating}
            votes={openRow?.votes}
            malScore={openRow?.score}
            onPrev={step(-1)}
            onNext={step(1)}
            onClose={() => openAt(null)}
          />
        )}
      </Modal>
    </div>
  );
}
