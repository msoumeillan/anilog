import { Link } from 'react-router-dom';
import { useLibrary } from '../../store/library';
import { MediaCard } from '../../components/MediaCard';
import { Rail } from '../../components/Rail';
import { entryCard } from '../../lib/routes';
import { lastCompleted } from '../../lib/libraryStats';
import { statusLabel } from '../../lib/trackStatus';
import { isEntryKey } from '../../lib/ids';
import { PersonCard, PersonGrid } from '../../components/PersonCard';
import { useFavourites, useFavouritesOf } from '../../store/favourites';
import type { LibraryEntry, MediaType } from '../../types/library';
import styles from './Library.module.css';

/**
 * Le profil : ce que la bibliothèque dit de soi EN UN ÉCRAN.
 *
 * Il y a deux façons de rater ça. La première est de tout empiler : huit
 * sections pleine largeur l'une sous l'autre faisaient deux mille pixels, et
 * un profil qu'on parcourt à la molette n'est plus un profil, c'est une liste.
 * La seconde est de tout entasser, et on ne lit plus rien.
 *
 * D'où deux règles ici :
 *
 *   les sections vont PAR PAIRES — anime et manga côte à côte, personnages et
 *   staff côte à côte : ce sont les mêmes questions posées deux fois, et on
 *   les compare mieux l'une en face de l'autre qu'en les faisant défiler ;
 *
 *   chaque top est un BANDEAU qui file sur le côté, pas une grille qui passe à
 *   la ligne : la hauteur d'une section devient prévisible, donc l'écran
 *   entier le devient.
 *
 * Les chiffres, eux, sont partis dans l'onglet Stats. Le profil MONTRE — des
 * affiches, des visages — pendant que Stats COMPTE ; on ne descendait pas
 * jusqu'à la huitième section pour consulter une moyenne.
 *
 * Tout se calcule sur la copie locale : aucune requête, et l'écran s'affiche
 * hors ligne comme le reste.
 */

export default function LibraryProfile() {
  const entries = useLibrary((s) => s.entries);
  const hydrated = useLibrary((s) => s.hydrated);
  const toutes = Object.values(entries);
  const favoris = useFavourites((s) => Object.keys(s.favourites).length);

  if (!hydrated) return <p className="faint">Loading…</p>;

  /* Les favoris ne dependent pas de la bibliotheque : on peut aimer un
     personnage sans rien suivre. Le message d'accueil ne s'affiche donc que
     si TOUT est vide, sinon il masquait les sections deja remplies. */
  if (toutes.length === 0 && favoris === 0)
    return (
      <div className={styles.soon}>
        <h2 className="label">Profile</h2>
        <p className="muted">
          Nothing tracked yet. Open a title and use “Start tracking”: your latest finished titles
          and your favourites will show up here.
        </p>
      </div>
    );

  return (
    <>
      {/* Une paire vide se retire d'elle-même — voir `.pair:empty`. Sans ça,
          l'espacement de la colonne laissait un trou là où deux sections
          absentes n'affichaient rien. */}
      <div className={styles.pair}>
        <Recents entries={toutes} media="anime" />
        <Recents entries={toutes} media="manga" />
      </div>

      <div className={styles.pair}>
        <FavouriteWorks kind="anime" titre="Favourite anime" />
        <FavouriteWorks kind="manga" titre="Favourite manga" />
      </div>

      <div className={styles.pair}>
        <Favourites kind="character" titre="Favourite characters" />
        <Favourites kind="staff" titre="Favourite staff" />
      </div>

      <FavouriteStudios />
    </>
  );
}

/** Les cinq derniers terminés d'un média. Rien du tout plutôt qu'une section vide. */
function Recents({ entries, media }: { entries: LibraryEntry[]; media: MediaType }) {
  const recents = lastCompleted(entries, media);
  if (recents.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className="label">Last completed {media}</h2>
        <Link className="label" to={`/library/${media}?status=completed`}>
          See all
        </Link>
      </div>
      <Rail>
        {recents.map((e) => (
          <MediaCard
            key={e.key}
            media={media}
            libraryKey={e.key}
            {...entryCard(e)}
            title={e.title}
            cover={e.cover ?? null}
            score={e.score ? e.score * 10 : null}
            meta={statusLabel(e.status, media)}
            tip={{
              season: e.season,
              year: e.seasonYear,
              studio: e.studio,
              format: e.format,
              [media === 'manga' ? 'chapters' : 'episodes']: e.totalUnits,
            }}
          />
        ))}
      </Rail>
    </section>
  );
}

/**
 * Les œuvres mises en favori — le top, celui qu'on COMPOSE.
 *
 * Il n'y a plus de classement par note ici, et c'est délibéré : deux sections
 * voisines qui se ressemblent en font une de trop. La note juge, le favori
 * choisit — on peut adorer une œuvre notée 7 et ne pas garder un 10 techniquement
 * irréprochable. Trier par note reste possible dans l'onglet du média.
 *
 * Cinq au plus, comme un top se doit.
 */
function FavouriteWorks({ kind, titre }: { kind: 'anime' | 'manga'; titre: string }) {
  const favs = useFavouritesOf(kind, 5);
  if (favs.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className="label">{titre}</h2>
      <Rail>
        {favs.map((f) => (
          <MediaCard
            key={f.key}
            media={kind}
            id={f.id}
            /* Un favori porte sa vraie cle : c'est elle qui retrouve l'affiche
               choisie, que l'image recopiee au clic ignore. Le PREDICAT plutot
               qu'un cast — `FavouriteKey` couvre aussi les personnages, et le
               compilateur a raison de ne pas nous croire sur parole. */
            libraryKey={isEntryKey(f.key) ? f.key : undefined}
            href={f.href}
            title={f.name}
            cover={f.image ?? null}
          />
        ))}
      </Rail>
    </section>
  );
}

/**
 * Les personnages ou membres du staff mis en favori.
 *
 * Chacun porte son nom et son image, copiés au moment du clic : cette section
 * s'affiche sans réseau, comme le reste de la bibliothèque.
 */
function Favourites({ kind, titre }: { kind: 'character' | 'staff'; titre: string }) {
  const favs = useFavouritesOf(kind, 5);
  if (favs.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className="label">{titre}</h2>
      <PersonGrid teaser>
        {favs.map((f) => (
          <PersonCard
            key={f.key}
            to={f.href ?? `/${kind}/${f.id}`}
            name={f.name}
            image={f.image ?? null}
          />
        ))}
      </PersonGrid>
    </section>
  );
}

/** Les studios mis en favori — un nom, pas une jaquette. */
function FavouriteStudios() {
  const favs = useFavouritesOf('studio');
  if (favs.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className="label">Favourite studios</h2>
      <div className={styles.studios}>
        {favs.map((f) => (
          <Link key={f.key} className={styles.studio} to={f.href ?? `/studio/${f.id}`}>
            {f.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
