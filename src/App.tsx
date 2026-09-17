import { lazy, Suspense, useEffect } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  NavLink,
  Link,
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Tv, BookOpen } from 'lucide-react';
import Home from './pages/Home';
import { useMangaBaka } from './api/mangabaka/hooks';
import { PlayerBar } from './components/PlayerBar';
import { QuickSearch } from './components/QuickSearch';
import { Toast } from './components/Toast';
import { usePlayer } from './store/player';
import { ScrollManager } from './components/ScrollManager';
import { browsePath, modeOf, readMode } from './lib/mediaMode';
import type { MediaType } from './types/library';
import styles from './App.module.css';

/*
 * Les pages se chargent À LA DEMANDE, l'accueil excepté.
 *
 * Tout tenait dans un seul fichier de 693 Ko — 209 Ko compressés —, que la
 * première visite téléchargeait en entier : les statistiques, l'import
 * MyAnimeList, le glisser-déposer des listes, avant même d'afficher l'accueil.
 * Vite le signalait à chaque build. L'accueil reste dans le paquet principal :
 * c'est là que presque toutes les visites commencent, et le charger à part
 * ajouterait une attente à chacune d'elles.
 */
const Browse = lazy(() => import('./pages/Browse'));
const AnimeDetail = lazy(() => import('./pages/AnimeDetail'));
const MangaDetail = lazy(() => import('./pages/MangaDetail'));
const AnimeEpisodes = lazy(() => import('./pages/AnimeEpisodes'));
const MediaCharacters = lazy(() => import('./pages/MediaCharacters'));
const MediaStaff = lazy(() => import('./pages/MediaStaff'));
const Collection = lazy(() => import('./pages/Collection'));
const LibraryShell = lazy(() => import('./pages/library/Shell'));
const LibraryCollection = lazy(() => import('./pages/library/Collection'));
const LibraryProfile = lazy(() => import('./pages/library/Profile'));
const LibraryDiary = lazy(() => import('./pages/library/Diary'));
const LibraryReviews = lazy(() => import('./pages/library/Reviews'));
const LibraryTags = lazy(() => import('./pages/library/Tags'));
const LibraryStats = lazy(() => import('./pages/library/Stats'));
const LibraryBackup = lazy(() => import('./pages/library/Backup'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Music = lazy(() => import('./pages/Music'));
const LibraryLists = lazy(() => import('./pages/library/Lists'));
const ListDetail = lazy(() => import('./pages/library/ListDetail'));
const TierListDetail = lazy(() => import('./pages/library/TierListDetail'));
const LibraryImport = lazy(() => import('./pages/library/Import'));
const StaffCharacters = lazy(() => import('./pages/StaffCharacters'));
const Character = lazy(() => import('./pages/Character'));
const Staff = lazy(() => import('./pages/Staff'));
const Studio = lazy(() => import('./pages/Studio'));
const Magazine = lazy(() => import('./pages/Magazine'));
const MbCatalogue = lazy(() => import('./pages/MbCatalogue'));
const MbSeries = lazy(() => import('./pages/MbSeries'));
const Search = lazy(() => import('./pages/Search'));

/**
 * Coquille de l'app.
 *
 * Routage en mode hash — décidé pour rester compatible avec Capacitor,
 * qui sert l'app depuis un schéma d'URL où le routage par chemin casse.
 */

/**
 * `carriesMode` : les pages qui existent dans les deux médias.
 *
 * Un mode global doit SUIVRE. Sans ça, passer au manga puis cliquer « My
 * library » ramenait à l'étagère anime, et le sélecteur avait l'air de mentir.
 * L'accueil montre les deux et le reste n'a pas de mode.
 */
const NAV = [
  { to: '/', label: 'Home', end: true, carriesMode: false },
  { to: '/browse', label: 'Browse', end: false, carriesMode: true },
  { to: '/library', label: 'My library', end: false, carriesMode: false },
  /* Le calendrier n'a pas de mode : le manga n'a pas de grille de diffusion,
     et MangaBaka ne donne pas de date de parution par chapitre. */
  { to: '/calendar', label: 'Calendar', end: false, carriesMode: false },
  { to: '/music', label: 'Music', end: false, carriesMode: false },
];

/**
 * Le sélecteur de média.
 *
 * Des LIENS et non des boutons : le mode vit dans l'URL — décision 6 — donc
 * en changer est une navigation. On garde la page où l'on est et les filtres
 * qui ont un sens en face ; voir `lib/mediaMode`.
 *
 * Sur une fiche, le mode est déjà dit par le chemin (`/anime/21` contre
 * `/manga/30642`) et il n'y a rien à basculer : le sélecteur renvoie alors
 * vers Browse, qui est l'endroit où l'on cherche.
 */
function MediaSwitch() {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const mode = modeOf(pathname, params);

  /* Seule la bibliothèque bascule SUR PLACE : elle existe dans les deux
     médias au même endroit. Les catalogues, eux, sont deux pages distinctes —
     `/browse` pour l'anime, `/mangabaka` pour le manga — et basculer veut donc
     dire changer de page. */
  /* Les collections de la bibliotheque sont deux onglets : basculer y reste
     dans la bibliotheque. Partout ailleurs, basculer mene au catalogue du
     media choisi — `/browse` ou `/mangabaka`, deux pages distinctes. */
  const cible = (to: MediaType) =>
    pathname.startsWith('/library') ? `/library/${to}` : browsePath(to);

  return (
    <div className={styles.mediaSwitch} role="group" aria-label="Media">
      {(
        [
          { value: 'anime', label: 'Anime', Icon: Tv },
          { value: 'manga', label: 'Manga', Icon: BookOpen },
        ] as const
      ).map(({ value, label, Icon }) => (
        <Link
          key={value}
          to={cible(value)}
          className={`${styles.mode} ${mode === value ? styles.modeOn : ''}`}
          aria-current={mode === value ? 'true' : undefined}
        >
          <Icon size={15} strokeWidth={1.8} aria-hidden />
          {label}
        </Link>
      ))}
    </div>
  );
}

/**
 * `/browse?media=manga` menait au catalogue d'AniList ; le manga se parcourt
 * desormais chez MangaBaka. On renvoie plutot que de casser : les anciens
 * favoris et les liens deja partages continuent de mener quelque part.
 */
function BrowseRoute() {
  return readMode(useSearchParams()[0]) === 'manga' ? (
    <Navigate to="/mangabaka" replace />
  ) : (
    <Browse />
  );
}

/**
 * Une adresse manga d'AniList mene a la fiche MangaBaka correspondante.
 *
 * C'est MangaBaka qui fait autorite du cote manga — chapitres parus, notes
 * des sept bases, editeurs, romans web — et AniList l'enrichit par-dessus.
 * Mais les liens d'AniList sont partout : relations d'un anime, credits d'un
 * staff, apparitions d'un personnage. Ils portent son identifiant, pas celui
 * de MangaBaka, d'ou cette resolution.
 *
 * `/v1/source/anilist/{id}` la fait en une requete, mesuree a ~110 ms et mise
 * en cache 24 h. Quand MangaBaka ne connait pas l'oeuvre — rare, 30 sur 30
 * retrouves a la mesure — la fiche AniList prend le relais telle quelle.
 */
function MangaRoute() {
  const id = Number(useParams().id);
  const mb = useMangaBaka(id);

  if (mb.isPending)
    return (
      <div className="page">
        <p className="faint">Loading…</p>
      </div>
    );

  const mbId = mb.data?.id;
  return typeof mbId === 'number' ? (
    <Navigate to={`/mangabaka/${mbId}`} replace />
  ) : (
    <MangaDetail />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  /* Le suffixe à recoller aux liens qui portent le mode : `?media=manga`, ou
     rien du tout en anime — une adresse sans paramètre reste la plus courante. */
  const { pathname, search } = useLocation();
  const media = modeOf(pathname, new URLSearchParams(search));
  const mode = media === 'manga' ? '?media=manga' : '';

  /* Le lecteur agrandi COUVRE la page, et elle doit se tenir tranquille
     dessous. Sans ça, mesuré : une fois le lecteur défilé jusqu'en bas, la
     molette continuait sur la page, 855 px plus bas à la fermeture. `inert`
     fait le reste — ni tabulation vers des liens qu'on ne voit plus, ni
     lecteur d'écran qui lirait la page derrière. */
  const couverte = usePlayer((s) => s.expanded && s.queue.length > 0);
  useEffect(() => {
    if (!couverte) return;
    const racine = document.documentElement;
    const avant = racine.style.overflow;
    racine.style.overflow = 'hidden';
    return () => {
      racine.style.overflow = avant;
    };
  }, [couverte]);

  return (
    <>
      <header className={styles.header} inert={couverte}>
        <div className={`page ${styles.headerInner}`}>
          <Link to="/" className={styles.logo}>
            AniLog
          </Link>

          {/* Sélecteur de média — le mode global décidé en conception. Chaque
              média a son catalogue : `/browse` pour l'anime, `/mangabaka`
              pour le manga. Voir `browsePath`. */}
          <MediaSwitch />

          <nav className={styles.nav}>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                /* « Browse » mène au catalogue du média courant : deux pages,
                   pas un paramètre. Voir `browsePath`. */
                to={n.to === '/browse' ? browsePath(media) : n.to + (n.carriesMode ? mode : '')}
                end={n.end}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navOn : ''}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <QuickSearch className={styles.recherche} />
        </div>
      </header>

      <main inert={couverte}>{children}</main>
    </>
  );
}

/** Ce qu'on voit pendant qu'une page se charge pour la première fois. */
function Chargement() {
  return (
    <div className="page">
      <p className="faint">Loading…</p>
    </div>
  );
}

/** Une adresse qui ne mène à aucun écran. */
function NotFound() {
  return (
    <div className={`page ${styles.introuvable}`}>
      <h1 className="title">Page not found</h1>
      <p className="muted">This address doesn’t lead anywhere in AniLog.</p>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ScrollManager />
      {/* AU-DESSUS des routes, et c'est toute la raison de sa place ici :
          dans la page Musiques, il serait demonte au premier clic vers une
          fiche et la lecture s'arreterait. HORS de la coquille aussi, avec les
          bandeaux : c'est elle que le lecteur agrandi rend inerte, et il ne
          doit pas s'y rendre lui-meme. */}
      <PlayerBar />
      <Toast />
      <Shell>
        {/* Le temps qu'une page arrive la première fois. La coquille — en-tête,
            lecteur — reste en place : seule la page attend. */}
        <Suspense fallback={<Chargement />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<BrowseRoute />} />
            <Route path="/anime/:id" element={<AnimeDetail />} />
            <Route path="/manga/:id" element={<MangaRoute />} />
            <Route path="/anime/:id/episodes" element={<AnimeEpisodes />} />
            <Route path="/anime/:id/characters" element={<MediaCharacters media="anime" />} />
            <Route path="/manga/:id/characters" element={<MediaCharacters media="manga" />} />
            <Route path="/anime/:id/staff" element={<MediaStaff media="anime" />} />
            <Route path="/manga/:id/staff" element={<MediaStaff media="manga" />} />
            <Route path="/character/:id" element={<Character />} />
            <Route path="/staff/:id" element={<Staff />} />
            <Route path="/staff/:id/characters" element={<StaffCharacters />} />
            <Route path="/studio/:id" element={<Studio />} />
            <Route path="/magazine/:id" element={<Magazine />} />
            {/* Essai : le catalogue MangaBaka, a cote de celui d'AniList, pour
              comparer avant de decider s'il le remplace du cote manga. */}
            <Route path="/mangabaka" element={<MbCatalogue />} />
            <Route path="/mangabaka/:id" element={<MbSeries />} />
            <Route path="/genre/:name" element={<Collection kind="genre" />} />
            <Route path="/tag/:name" element={<Collection kind="tag" />} />
            {/* La bibliotheque se partage en onglets, chacun a son adresse :
              un signet et un retour arriere par vue. */}
            <Route path="/library" element={<LibraryShell />}>
              <Route index element={<LibraryProfile />} />
              <Route path="manga" element={<LibraryCollection media="manga" />} />
              <Route path="anime" element={<LibraryCollection media="anime" />} />
              <Route path="diary" element={<LibraryDiary />} />
              <Route path="reviews" element={<LibraryReviews />} />
              <Route path="lists" element={<LibraryLists />} />
              <Route path="lists/:id" element={<ListDetail />} />
              <Route path="tiers/:id" element={<TierListDetail />} />
              <Route path="import" element={<LibraryImport />} />
              <Route path="backup" element={<LibraryBackup />} />
              <Route path="tags" element={<LibraryTags />} />
              <Route path="stats" element={<LibraryStats />} />
            </Route>
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/music" element={<Music />} />
            <Route path="/search" element={<Search />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Shell>
    </HashRouter>
  );
}
