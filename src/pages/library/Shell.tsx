import { NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import { Identity } from './Identity';
import styles from './Library.module.css';

/**
 * Ma bibliothèque — la coquille et ses onglets.
 *
 * Un seul endroit se partage en plusieurs vues, comme sur Letterboxd : le
 * profil résume, les collections listent, le journal date, les critiques
 * rassemblent ce qu'on a écrit. Chacune a son adresse, donc son signet et son
 * retour arrière.
 *
 * Les deux médias sont deux ONGLETS et non un filtre — décision 6, une
 * bibliothèque ne les mélange jamais. « 12 titres suivis » ne voudrait rien
 * dire à cheval sur les deux.
 *
 * L'en-tête d'identité — bannière, photo, pseudo, comptes, « Edit profile » —
 * n'appartient QU'À l'onglet Profile. Répété au-dessus des sept autres, il
 * poussait chaque liste 300 pixels plus bas et redisait à chaque fois ce qu'on
 * venait de lire ; on ouvre l'onglet Anime pour voir des animes.
 *
 * Il reste rendu ICI et non dans `Profile` parce qu'il passe AVANT la barre
 * d'onglets, qui est commune. Depuis l'`Outlet`, il ne pourrait s'afficher que
 * dessous.
 */

const ONGLETS = [
  { to: '/library', label: 'Profile', end: true },
  { to: '/library/manga', label: 'Manga', end: false },
  { to: '/library/anime', label: 'Anime', end: false },
  { to: '/library/diary', label: 'Diary', end: false },
  { to: '/library/reviews', label: 'Reviews', end: false },
  { to: '/library/lists', label: 'Lists', end: false },
  { to: '/library/tags', label: 'Tags', end: false },
  { to: '/library/stats', label: 'Stats', end: false },
];

export default function LibraryShell() {
  /* `end` : sans lui, `/library/anime` correspondrait aussi et l'en-tête
     reviendrait partout — exactement ce qu'on enlève. */
  const surLeProfil = useMatch({ path: '/library', end: true }) !== null;

  /* Le titre de l'onglet, pour les lecteurs d'écran : sur le profil, le nom
     de l'en-tête d'identité en tient lieu, et ailleurs aucun `<h1>` ne disait
     où l'on est. Seulement sur un onglet EXACT : une liste ouverte, un import,
     une sauvegarde portent déjà le leur, visible. */
  const { pathname } = useLocation();
  const onglet = surLeProfil ? undefined : ONGLETS.find((o) => o.to === pathname);

  return (
    <div className={`page ${styles.wrap}`}>
      {surLeProfil && <Identity />}
      {onglet && <h1 className="sr-only">My library — {onglet.label}</h1>}

      {/* Barre d'onglets : elle défile horizontalement plutôt que de se
          replier sur deux lignes — huit onglets tiennent mal sur un téléphone,
          et un onglet coupé se voit, alors qu'un onglet passé à la ligne se
          confond avec le contenu. */}
      <nav className={styles.tabs} aria-label="Library sections">
        {ONGLETS.map((o) => (
          <NavLink
            key={o.to}
            to={o.to}
            end={o.end}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabOn : ''}`}
          >
            {o.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
