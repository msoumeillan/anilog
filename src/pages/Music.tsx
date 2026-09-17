import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search, Shuffle, X } from 'lucide-react';
import { useLibrary } from '../store/library';
import { useThemes } from '../store/themes';
import { useSongs } from '../store/songs';
import { usePlayer } from '../store/player';
import {
  PAGE,
  useAnimeListThemes,
  useCatalogue,
  useFavouriteRepair,
  useMusicScope,
  useMusicSearch,
} from '../api/animethemes/hooks';
import { ShowMore } from '../components/ShowMore';
import { CatalogueLine, SongLine, ThemeTable } from '../components/MusicRow';
import { Playlists } from '../components/Playlists';
import { MusicFilters, type MusicSource } from './MusicFilters';
import { PlaylistPicker, type Rangeable } from '../components/PlaylistPicker';
import { usePlaylists } from '../store/playlists';
import {
  CATEGORIES,
  asBrowseSort,
  asCategory,
  parseScope,
  scopeLabel,
  scopeParam,
  type BrowseFilters,
  type CatalogueRow,
  type MusicCategory,
} from '../lib/musicBrowse';
import {
  asSongSort,
  buildSongs,
  defaultSongSort,
  favouriteRows,
  filterSongs,
  orphanFavourites,
  rowsFromRemote,
  sortSongs,
  type SongKind,
  type SongRow,
} from '../lib/songList';
import styles from './Music.module.css';

/**
 * Les génériques — et, depuis, tout le catalogue qui mène à eux.
 *
 * AnimeThemes n'est pas une liste de chansons : c'est une base indexée CINQ
 * fois — par générique, par anime, par artiste, par série, par studio. L'onglet
 * n'en lisait qu'une, et se privait de la seule question qu'on se pose vraiment
 * en écoutant : « qu'est-ce que ces gens-là ont fait d'autre ? »
 *
 * D'où sa forme, qui est celle de leur propre catalogue : une recherche, des
 * onglets de catégorie, une barre de filtres qui change avec la catégorie.
 *
 * DEUX règles tiennent l'écran ensemble :
 *
 *   Tout mène à de la musique. Un artiste, une série, un studio ne sont pas des
 *   fiches : cliquer ouvre leur PORTÉE — tout ce qu'on peut en écouter, dans
 *   une file de lecture. Une liste d'index qui ne mènerait nulle part serait
 *   une liste morte.
 *
 *   La provenance ne change pas l'objet. Bibliothèque, favoris, recherche,
 *   index, portée : la ligne, le lecteur et la notation manipulent le même
 *   `SongRow` et ne savent pas d'où il vient.
 *
 * Le filtre « Source » reste propre aux génériques : ALL interroge le
 * catalogue, LIBRARY ce qu'on suit — local, instantané —, FAVOURITES ce qu'on
 * a étoilé, d'où que ça vienne.
 */

/** Les réglages qui appartiennent à UNE catégorie et meurent avec elle. */
const PROPRES_A_LA_CATEGORIE = [
  'letter',
  'season',
  'year',
  'format',
  'sort',
  'page',
  'scope',
  'pl',
];

export default function Music() {
  const [params, setParams] = useSearchParams();
  /* Le tirage ne dépend d'aucun filtre : il ne vit donc pas dans l'URL, qui
     décrit ce qu'on cherche, pas quel hasard on a tiré. */
  const [seed, setSeed] = useState(0);
  /* Quel anime est déplié. UN SEUL à la fois : deux tables ouvertes repoussent
     la suite de la liste hors de l'écran, et chacune coûte une requête. */
  const [deplie, setDeplie] = useState<string | null>(null);
  /* La chanson qu'on est en train de ranger dans une playlist. UNE fenêtre pour
     toute la page, que la demande vienne d'une ligne, d'une table ou d'une
     playlist. */
  const [aRanger, setARanger] = useState<Rangeable | null>(null);
  const nbPlaylists = usePlaylists((s) => Object.keys(s.playlists).length);

  const entries = useLibrary((s) => s.entries);
  const libraryReady = useLibrary((s) => s.hydrated);

  const themesReady = useThemes((s) => s.hydrated);
  const themesTable = useThemes((s) => s.themes);
  const progress = useThemes((s) => s.progress);
  const syncError = useThemes((s) => s.error);
  const sync = useThemes((s) => s.sync);
  const stop = useThemes((s) => s.stop);

  const judgements = useSongs((s) => s.songs);
  const toggleFavourite = useSongs((s) => s.toggleFavourite);
  const restoreSnapshots = useSongs((s) => s.restoreSnapshots);
  const play = usePlayer((s) => s.play);
  const extendQueue = usePlayer((s) => s.extendQueue);
  const enCours = usePlayer((s) => s.queue[s.index]?.key);
  const generiquesDeLaPage = useAnimeListThemes();

  const cat = asCategory(params.get('cat'));
  const scope = parseScope(params.get('scope'));
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const source = ((): MusicSource => {
    const v = params.get('src');
    return v === 'library' || v === 'favourites' ? v : 'all';
  })();
  const type = ((): SongKind => {
    const v = params.get('type');
    return v === 'OP' || v === 'ED' || v === 'IN' ? v : 'all';
  })();

  /* Quatre états qui s'excluent, et dont tout le reste découle : on regarde ses
     playlists, une portée, une liste locale, ou le catalogue.

     Les playlists ne sont PAS une catégorie du catalogue : leurs données sont
     locales, et aucun index d'AnimeThemes ne doit tourner pendant qu'on les
     regarde. D'où un état à part plutôt qu'une sixième valeur de
     `MusicCategory`, qui aurait réclamé une branche morte dans chaque requête. */
  const enPlaylists = params.get('cat') === 'playlists';
  const playlistOuverte = enPlaylists ? params.get('pl') : null;
  const enPortee = !enPlaylists && scope !== null;
  const local = !enPlaylists && !enPortee && cat === 'themes' && source !== 'all';
  const cherche = !enPlaylists && !enPortee && !local && q.trim().length >= 2;

  /* Les tris n'ont pas le même vocabulaire des deux côtés : `NAME` chez les
     studios, `score` en local. Chacun lit l'URL avec le sien. */
  const sortLocal = asSongSort(params.get('sort'), false) ?? defaultSongSort(false);
  const filtres: BrowseFilters = {
    letter: params.get('letter') ?? '',
    season: params.get('season') ?? '',
    year: params.get('year') ?? '',
    format: params.get('format') ?? '',
    type,
    sort: asBrowseSort(cat, params.get('sort')),
  };
  const tirage = !enPlaylists && cat === 'themes' && filtres.sort === 'RANDOM' && !cherche;

  const setParam = (nom: string, valeur: string | null) => {
    const suivant = new URLSearchParams(params);
    if (valeur) suivant.set(nom, valeur);
    else suivant.delete(nom);
    /* Changer de recherche ou de source remet à la première page : garder la
       page 3 d'une recherche précédente montrerait un vide inexplicable. */
    if (nom !== 'page') suivant.delete('page');
    if (nom === 'src') suivant.delete('sort');
    /* Chercher, ou changer de source, c'est vouloir autre chose : la portée
       ouverte se referme. Sans ça, la barre de recherche resterait inerte tant
       qu'on est dans un studio, ce qui ressemble à une panne. */
    if (nom === 'q' || nom === 'src') suivant.delete('scope');
    /* `replace` : régler un filtre n'est pas naviguer, et empiler chaque clic
       ferait du retour arrière un défaire-un-réglage. */
    setParams(suivant, { replace: true });
  };

  /**
   * Changer de catégorie oublie ses réglages.
   *
   * Un tri d'artiste passé aux studios ferait répondre « Sorting by this value
   * is not supported », et une lettre gardée d'un index à l'autre montrerait
   * un filtre que personne n'a posé ici. La recherche, elle, SURVIT : c'est le
   * geste même de chercher ailleurs la même chose.
   */
  const setCategory = (value: MusicCategory) => {
    const suivant = new URLSearchParams(params);
    for (const nom of PROPRES_A_LA_CATEGORIE) suivant.delete(nom);
    suivant.delete('src');
    if (value === 'themes') suivant.delete('cat');
    else suivant.set('cat', value);
    setParams(suivant, { replace: true });
  };

  const setPlaylistsTab = () => {
    const suivant = new URLSearchParams(params);
    for (const nom of PROPRES_A_LA_CATEGORIE) suivant.delete(nom);
    suivant.delete('src');
    suivant.set('cat', 'playlists');
    setParams(suivant, { replace: true });
  };

  /* Ouvrir une playlist EMPILE, comme une portée : le retour arrière la
     referme. La recherche est oubliée — celle de l'index filtrait des noms de
     playlists, et filtrerait sinon ses pistes sans qu'on l'ait demandé. */
  const openPlaylist = (id: string) => {
    const suivant = new URLSearchParams(params);
    suivant.set('pl', id);
    suivant.delete('q');
    setParams(suivant);
  };

  const closePlaylist = () => {
    const suivant = new URLSearchParams(params);
    suivant.delete('pl');
    suivant.delete('q');
    setParams(suivant, { replace: true });
  };

  /** Ouvrir une portée : on quitte l'index sans rien perdre de ce qu'on cherchait. */
  const openScope = (row: CatalogueRow) => {
    const suivant = new URLSearchParams(params);
    suivant.set('scope', scopeParam({ kind: row.kind, slug: row.slug }));
    suivant.delete('page');
    setParams(suivant);
  };

  /** Les anime suivis, seuls concernés : un manga n'a pas d'opening. */
  const animeIds = useMemo(
    () =>
      Object.values(entries)
        .filter((e) => e.media === 'anime' && typeof e.ids.anilist === 'number')
        .map((e) => e.ids.anilist ?? 0)
        .filter((id) => id > 0),
    [entries],
  );

  /* On ne ramasse la bibliothèque QUE si on la regarde : ouvrir l'onglet sur
     le catalogue général ne doit pas déclencher douze requêtes en fond. */
  useEffect(() => {
    if (local && libraryReady && themesReady) void sync(animeIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, libraryReady, themesReady, animeIds.length]);

  const recherche = useMusicSearch(cherche ? q : '', cat, page);
  const index = useCatalogue(
    cat,
    filtres,
    page,
    seed,
    !enPlaylists && !enPortee && !local && !cherche,
  );
  const portee = useMusicScope(enPortee ? scope : null);

  const distant = enPortee ? portee : cherche ? recherche : index;
  const enChargement = distant.isFetching;
  const panne = enPlaylists ? null : distant.error;

  const themesDistants = enPortee
    ? (portee.data?.themes ?? [])
    : cherche
      ? (recherche.data?.themes ?? [])
      : (index.data?.themes ?? []);
  const lignes: CatalogueRow[] = cherche ? (recherche.data?.rows ?? []) : (index.data?.rows ?? []);

  const deLaBibliotheque = useMemo(
    () =>
      buildSongs(Object.values(entries), (id) => themesTable[String(id)]?.themes ?? [], judgements),
    [entries, themesTable, judgements],
  );

  /* Les favoris posés sans instantané — l'étoile du lecteur l'oubliait — se
     réparent en les regardant : on retrouve leurs anime au catalogue, et le
     store recopie ce qu'il faut pour les afficher. Rien ne part tant qu'il n'y
     a pas d'orphelin. */
  const orphelins = useMemo(
    () => (local && source === 'favourites' ? orphanFavourites(judgements, deLaBibliotheque) : []),
    [local, source, judgements, deLaBibliotheque],
  );
  const reparation = useFavouriteRepair(orphelins);
  useEffect(() => {
    if (reparation.data) restoreSnapshots(rowsFromRemote(reparation.data, {}));
  }, [reparation.data, restoreSnapshots]);

  const brutes: SongRow[] = useMemo(() => {
    if (!local) return rowsFromRemote(themesDistants, judgements);
    return source === 'library' ? deLaBibliotheque : favouriteRows(judgements, deLaBibliotheque);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, source, deLaBibliotheque, judgements, themesDistants]);

  const chansons = useMemo(() => {
    /* Le filtre par type s'applique PARTOUT : l'index le fait côté serveur,
       mais ni la recherche ni une portée ne savent le faire. Le texte, lui,
       n'est un filtre local que sur une liste locale — à distance, c'est lui
       qui EST la requête. */
    const filtrees = filterSongs(brutes, { kind: type, favouritesOnly: false, q: local ? q : '' });
    /* L'ordre distant est celui de la source — la PERTINENCE sur une recherche,
       l'année sur un studio — et le remplacer perdrait la seule chose que le
       serveur sait et que nous ne savons pas. */
    return local ? sortSongs(filtrees, sortLocal) : filtrees;
  }, [brutes, type, q, local, sortLocal]);

  if (!libraryReady || !themesReady) return <p className="faint">Loading…</p>;

  const total = enPortee || cherche ? null : (index.data?.total ?? null);
  const montreDesLignes = !enPortee && cat !== 'themes';
  const vide = montreDesLignes ? lignes.length === 0 : chansons.length === 0;

  /**
   * Jouer depuis la table dépliée d'un anime : la file suit TOUTE la page.
   *
   * Signalé à l'usage : sur « oshi no ko », Idol puis Mephisto revenaient à
   * Idol, alors que la liste montrait la saison 2 juste dessous — et écouter une
   * saison d'un trait devenait impossible. La table lance tout de suite les
   * génériques qu'elle a sous la main ; ceux de la page arrivent ensuite, et la
   * file s'élargit autour de ce qui joue. Sans réponse, elle reste celle de
   * l'anime : rien de cassé, seulement moins de suite.
   */
  const jouerDansLaPage = (file: SongRow[], i: number) => {
    const ticket = play(file, i);
    void generiquesDeLaPage(lignes)
      .then((themes) => extendQueue(ticket, rowsFromRemote(themes, judgements)))
      .catch(() => {});
  };

  return (
    <div className={`page ${styles.wrap}`}>
      <div className={styles.head}>
        <div>
          <h1 className="title">Music</h1>
          <p className="label">
            {resume({
              playlists: enPlaylists ? nbPlaylists : null,
              cat,
              source,
              enPortee,
              cherche,
              page,
              total,
              local: deLaBibliotheque.length,
              animes: animeIds.length,
              montrees: chansons.length,
            })}
          </p>
        </div>

        {local && source === 'library' && (
          <div className={styles.actions}>
            {progress ? (
              <button type="button" className="btn btn--quiet" onClick={stop}>
                Stop — {progress.done}/{progress.total}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => void sync(animeIds, true)}
                title="Ask AnimeThemes again for every title"
              >
                <RefreshCw size={15} strokeWidth={2} aria-hidden />
                Refresh
              </button>
            )}
          </div>
        )}

        {!enPlaylists && !enPortee && !local && !cherche && filtres.sort === 'RANDOM' && (
          <button type="button" className="btn btn--quiet" onClick={() => setSeed((s) => s + 1)}>
            <Shuffle size={15} strokeWidth={2} aria-hidden />
            Shuffle
          </button>
        )}
      </div>

      {progress && (
        <div
          className={styles.jauge}
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        >
          <div
            className={styles.jaugeFill}
            style={{ inlineSize: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}

      {syncError && local && source === 'library' && (
        <p className={`label ${styles.panne}`}>
          AnimeThemes didn’t respond — {syncError}. What is already here still shows; “Refresh”
          picks up the rest.
        </p>
      )}

      {panne && (
        <p className={`label ${styles.panne}`}>
          AnimeThemes didn’t respond. Their API goes down regularly — try again in a moment.
        </p>
      )}

      {/* La recherche et les catégories, sur une ligne : ce qu'on cherche, et
          où on le cherche. */}
      <div className={styles.barre}>
        <div className={styles.searchBox}>
          <Search className={styles.searchIcon} size={16} strokeWidth={2} aria-hidden />
          <input
            className={styles.search}
            type="search"
            placeholder={
              enPlaylists
                ? playlistOuverte
                  ? 'Search this playlist…'
                  : 'Search your playlists…'
                : placeholder(cat, local)
            }
            value={q}
            onChange={(e) => setParam('q', e.target.value || null)}
            aria-label="Search AnimeThemes"
          />
        </div>

        <div className={styles.onglets} role="group" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={styles.onglet}
              aria-pressed={cat === c.value && !enPortee && !enPlaylists}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
          {/* Le dernier onglet, comme chez AnimeThemes : ce qui est à soi après
              ce qui est à tout le monde. */}
          <button
            type="button"
            className={styles.onglet}
            aria-pressed={enPlaylists}
            onClick={setPlaylistsTab}
          >
            Playlists
          </button>
        </div>
      </div>

      {enPlaylists ? (
        <Playlists
          q={q}
          openId={playlistOuverte}
          onOpen={openPlaylist}
          onBack={closePlaylist}
          onAddToPlaylist={setARanger}
        />
      ) : (
        <>
          {enPortee && scope ? (
            <div className={styles.portee}>
              <p className={styles.porteeNom}>
                <span className="label">{scopeLabel(scope.kind)}</span>
                <strong>{portee.data?.title ?? scope.slug}</strong>
                <span className="faint">{porteeDetail(portee.data)}</span>
              </p>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => setParam('scope', null)}
                aria-label="Close this selection"
              >
                <X size={15} strokeWidth={2} aria-hidden />
                Back to browsing
              </button>
            </div>
          ) : (
            <MusicFilters
              cat={cat}
              source={source}
              type={type}
              filtres={filtres}
              sortLocal={sortLocal}
              local={local}
              cherche={cherche}
              onChange={setParam}
            />
          )}

          {cherche && q.trim().length === 1 && (
            <p className="faint">Two letters at least — one would bring back half the catalogue.</p>
          )}

          {enChargement && vide ? (
            <p className="faint">Loading…</p>
          ) : vide ? (
            <p className="muted">
              {videMessage(cat, source, cherche, enPortee, deLaBibliotheque.length)}
            </p>
          ) : (
            <>
              <ul className={styles.liste}>
                {montreDesLignes
                  ? lignes.map((row) => {
                      /* Un anime s'ouvre SUR PLACE : ses génériques tiennent sous
                     sa ligne, et la question « c'était quoi, l'opening ? » se
                     répond sans quitter la liste. Une série, un studio en ont
                     des centaines : ceux-là mènent à leur portée. */
                      const surPlace = row.kind === 'anime';
                      const ouvert = deplie === row.slug;
                      return (
                        <CatalogueLine
                          key={`${row.kind}:${row.slug}`}
                          row={row}
                          expandable={surPlace}
                          expanded={ouvert}
                          onOpen={() =>
                            surPlace ? setDeplie(ouvert ? null : row.slug) : openScope(row)
                          }
                        >
                          {surPlace && ouvert && (
                            <ThemeTable
                              slug={row.slug}
                              title={row.title}
                              onPlay={jouerDansLaPage}
                              onAddToPlaylist={setARanger}
                            />
                          )}
                        </CatalogueLine>
                      );
                    })
                  : chansons.map((song, i) => (
                      <SongLine
                        key={song.key}
                        song={song}
                        playing={song.key === enCours}
                        onPlay={() => play(chansons, i)}
                        onAddToPlaylist={() => setARanger(song)}
                        onFavourite={() => toggleFavourite(song)}
                      />
                    ))}
              </ul>

              {/* Une page à la fois, et jamais sur un tirage : le hasard n'a pas de
              page deux. Le total vient de leur `paginatorInfo` quand il existe
              — une recherche ne le donne pas, et on ne l'invente pas. */}
              {!local && !enPortee && !tirage && (
                <div className={styles.pages}>
                  {page > 1 && (
                    <ShowMore
                      onClick={() => setParam('page', String(page - 1))}
                      loading={false}
                      label="Previous page"
                    />
                  )}
                  <span className="label">
                    {pagination(page, total, montreDesLignes ? lignes.length : chansons.length)}
                  </span>
                  {(cherche ? recherche.data?.hasMore : index.data?.hasMore) && (
                    <ShowMore
                      onClick={() => setParam('page', String(page + 1))}
                      loading={enChargement}
                      label="Next page"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <PlaylistPicker song={aRanger} onClose={() => setARanger(null)} />
    </div>
  );
}

/** Ce que la ligne sous le titre annonce, selon ce qu'on regarde. */
function resume(s: {
  /** Le nombre de playlists quand on les regarde, `null` sinon. */
  playlists: number | null;
  cat: MusicCategory;
  source: MusicSource;
  enPortee: boolean;
  cherche: boolean;
  page: number;
  total: number | null;
  local: number;
  animes: number;
  montrees: number;
}): string {
  if (s.playlists !== null) return `${s.playlists} playlist${s.playlists === 1 ? '' : 's'}`;
  if (s.enPortee) return `${s.montrees} theme${s.montrees === 1 ? '' : 's'} to play`;
  if (s.cat === 'themes' && s.source === 'library') return `${s.local} themes · ${s.animes} anime`;
  if (s.cat === 'themes' && s.source === 'favourites') return `${s.montrees} starred`;
  if (s.cherche) return `Search · page ${s.page}`;
  if (s.total !== null) return `${s.total.toLocaleString('en-US')} in the catalogue`;
  return 'A handful from the whole catalogue';
}

function porteeDetail(
  data: { animeTotal: number | null; animeShown: number | null } | undefined,
): string {
  if (!data?.animeTotal || !data.animeShown) return '';
  /* On le DIT quand la liste est coupée : une portée de studio plafonnée à
     vingt titres qui n'annoncerait pas les cent trente autres passerait pour
     un catalogue incomplet. */
  return data.animeShown < data.animeTotal
    ? `newest ${data.animeShown} of ${data.animeTotal} anime`
    : `${data.animeTotal} anime`;
}

function pagination(page: number, total: number | null, montrees: number): string {
  if (total === null) return `Page ${page}`;
  const debut = montrees === 0 ? 0 : (page - 1) * PAGE + 1;
  return `${debut}–${(page - 1) * PAGE + montrees} of ${total.toLocaleString('en-US')}`;
}

function placeholder(cat: MusicCategory, local: boolean): string {
  if (local) return 'Song, anime or artist…';
  return cat === 'themes'
    ? 'Search every theme…'
    : cat === 'anime'
      ? 'Search every anime…'
      : cat === 'artists'
        ? 'Search every artist…'
        : cat === 'series'
          ? 'Search every series…'
          : 'Search every studio…';
}

function videMessage(
  cat: MusicCategory,
  source: MusicSource,
  cherche: boolean,
  enPortee: boolean,
  dansLaBibliotheque: number,
): string {
  if (enPortee) return 'Nothing playable here — AnimeThemes has no video for it yet.';
  if (cat === 'themes' && source === 'favourites') {
    return 'No favourite yet. The star, on a row or in the player, makes one.';
  }
  if (cat === 'themes' && source === 'library') {
    return dansLaBibliotheque === 0
      ? 'Nothing yet. Track some anime: their openings and endings show up here.'
      : 'No theme matches this filter.';
  }
  if (cherche) return 'Nothing found here for this search. The other categories may have it.';
  return 'Nothing matches these filters.';
}
