import { Link } from 'react-router-dom';
import { useLibrary } from '../../store/library';
import { useThemes } from '../../store/themes';
import { useSongs } from '../../store/songs';
import { bestSongs, buildSongs, songStats, topArtists } from '../../lib/songList';
import {
  activity,
  byFinishYear,
  byLength,
  byStatus,
  byYear,
  countBy,
  mediaStats,
  scoreSpread,
  timeSpent,
  topGenres,
  topStudios,
  type Part,
} from '../../lib/libraryStats';
import { monthLabel } from '../../lib/diary';
import { searchPageHref } from '../../lib/quickSearch';
import type { LibraryEntry, MediaType } from '../../types/library';
import styles from './Library.module.css';
import own from './Stats.module.css';

/**
 * Les chiffres de la bibliothèque.
 *
 * Le profil MONTRE — des affiches, des visages — et cet onglet COMPTE. Tout se
 * calcule sur la copie locale : aucune requête, et les chiffres s'affichent
 * hors ligne comme le reste.
 *
 * Une règle tient toute la page : on ne dessine que ce que la bibliothèque
 * SAIT. Longtemps ça a voulu dire ni temps passé ni genres, faute de les
 * stocker. Plutôt que d'estimer, l'entrée porte maintenant les deux — la durée
 * annoncée d'un épisode et les genres de l'œuvre, recopiés à la visite d'une
 * fiche et à l'import. Deux champs facultatifs, donc aucune migration.
 *
 * La règle, elle, n'a pas bougé : le temps passé se calcule sur les durées
 * CONNUES, et la page dit combien de titres n'en ont pas plutôt que de les
 * compter à vingt-quatre minutes.
 */

export default function LibraryStats() {
  const entries = useLibrary((s) => s.entries);
  const hydrated = useLibrary((s) => s.hydrated);

  if (!hydrated) return <p className="faint">Loading…</p>;

  const toutes = Object.values(entries);

  if (toutes.length === 0)
    return (
      <div className={styles.soon}>
        <h2 className="label">Stats</h2>
        <p className="muted">
          Nothing tracked yet. Track a few titles and rate them: your score spread, your pace and
          your studios will show up here.
        </p>
      </div>
    );

  const studios = topStudios(toutes);
  const rythme = activity(toutes);
  const parMois = Math.max(...rythme.map((m) => Math.max(m.completed, m.episodes)), 0);

  return (
    <>
      {/* Les deux médias côte à côte : ce sont deux blocs qu'on compare, et
          comparer demande de les voir ensemble. */}
      <div className={styles.statsPair}>
        <ColonneMedia entries={toutes} media="anime" />
        <ColonneMedia entries={toutes} media="manga" />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className="label">Rhythm · 12 months</h2>
          <p className="label">
            <span className={own.puceFin} /> finished <span className={own.puceEp} /> episodes
          </p>
        </div>

        {parMois === 0 ? (
          <p className="muted">
            Nothing dated in the last twelve months. Finishing a title or ticking an episode fills
            this strip.
          </p>
        ) : (
          <div className={own.frise}>
            {rythme.map((m) => (
              <div
                key={m.key}
                className={own.friseMois}
                title={`${monthLabel(m.key)} · ${m.completed} finished · ${m.episodes} episodes`}
              >
                <div className={own.frisePile}>
                  {/* Deux barres et non une : terminer est un évènement rare,
                      cocher un épisode le geste quotidien. Les additionner ne
                      dirait ni l'un ni l'autre. */}
                  {m.episodes > 0 && (
                    <div
                      className={own.friseEp}
                      style={{ blockSize: `${(m.episodes / parMois) * 100}%` }}
                    />
                  )}
                  {m.completed > 0 && (
                    <div
                      className={own.friseFin}
                      style={{ blockSize: `${(m.completed / parMois) * 100}%` }}
                    />
                  )}
                </div>
                <span className="label">{m.key.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Generiques entries={toutes} />

      {studios.length > 0 && (
        <section className={styles.section}>
          <h2 className="label">Studios</h2>
          {/* Comptés, pas choisis — c'est ce qui les met ici et non au profil,
              où le top est celui qu'on COMPOSE. Chacun mène à la recherche
              générale et non à Browse : AniList n'y cherche les œuvres que
              par titre, et « ufotable » n'y trouvait rien. La recherche a sa
              section Studios, qui mène à la page du studio. */}
          <Barres
            parts={studios.map((s) => ({ label: s.studio, count: s.count }))}
            lien={searchPageHref}
          />
        </section>
      )}
    </>
  );
}

/**
 * Les génériques, et ce qu'on en pense.
 *
 * La section n'existe QUE si l'onglet Musiques a déjà ramassé quelque chose :
 * elle ne va rien chercher elle-même. Une page de statistiques qui lance douze
 * requêtes en s'ouvrant serait la surprise que personne ne demande.
 */
function Generiques({ entries }: { entries: LibraryEntry[] }) {
  const table = useThemes((s) => s.themes);
  const judgements = useSongs((s) => s.songs);

  const rows = buildSongs(entries, (id) => table[String(id)]?.themes ?? [], judgements);
  if (rows.length === 0) return null;

  const stats = songStats(rows);
  const artistes = topArtists(rows, 8);
  const podium = bestSongs(rows, 5);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className="label">Themes</h2>
        <Link className="label" to="/music">
          Open Music
        </Link>
      </div>

      <div className={styles.figures}>
        <Figure valeur={stats.total} quoi="themes" />
        <Figure valeur={stats.mean ?? '—'} quoi={`mean of ${stats.rated}`} />
        <Figure valeur={stats.favourites} quoi="favourites" />
      </div>

      {podium.length > 0 && (
        <div>
          <p className="label">Best rated</p>
          {/* Les mieux notées, pas les plus jouées : on ne compte pas les
              lectures, et un compteur d'écoutes serait une mesure de plus a
              tenir pour une information qu'on a deja — la note. */}
          <Barres
            parts={podium.map((r) => ({
              label: `${r.slug} · ${r.title}`,
              count: r.score ?? 0,
              hint: r.anime,
            }))}
          />
        </div>
      )}

      {artistes.length > 0 && (
        <div>
          <p className="label">Artists</p>
          {/* Une chanson compte pour CHACUN de ses interpretes : la somme
              depasse le nombre de chansons, comme pour les genres. */}
          <Barres
            parts={artistes.map((a) => ({
              label: a.artist,
              count: a.count,
              hint: a.mean === null ? undefined : a.mean.toFixed(1),
            }))}
          />
        </div>
      )}
    </section>
  );
}

/** Tout ce qu'on sait dire d'un média, en une colonne. */
function ColonneMedia({ entries, media }: { entries: LibraryEntry[]; media: MediaType }) {
  const shelf = entries.filter((e) => e.media === media);
  const stats = mediaStats(entries, media);

  if (shelf.length === 0) return null;

  const formats = countBy(shelf, (e) => e.format);
  const annees = byYear(shelf);
  const finies = byFinishYear(entries, media);
  const longueurs = byLength(entries, media);
  const ecart = scoreSpread(entries, media);
  const genres = topGenres(entries, media);
  const temps = media === 'anime' ? timeSpent(entries) : null;

  return (
    <div className={styles.stats}>
      <p className="label">{media}</p>

      <div className={styles.figures}>
        <Figure valeur={stats.tracked} quoi="tracked" />
        <Figure valeur={stats.completed} quoi="completed" />
        <Figure
          valeur={stats.units}
          quoi={media === 'manga' ? 'chapters read' : 'episodes watched'}
        />
        <Figure valeur={stats.mean ?? '—'} quoi={`mean of ${stats.rated}`} />
        {/* L'écart-type dit ce que la moyenne cache : deux bibliothèques de
            moyenne 7 n'ont parfois rien en commun. */}
        <Figure valeur={ecart ?? '—'} quoi="score spread" />
        {temps && <Figure valeur={duree(temps.minutes)} quoi="time watched" />}
      </div>

      {/* Ce qui manque au total est dit, pas tu : un chiffre amputé en silence
          vaut moins qu'un chiffre accompagné de sa réserve. */}
      {temps && temps.unknown > 0 && (
        <p className="faint">
          {temps.unknown > 1
            ? `Runtime unknown for ${temps.unknown} started titles: they are not counted.`
            : 'Runtime unknown for 1 started title: it is not counted.'}{' '}
          Open their page to fill it in.
        </p>
      )}

      <div>
        <p className="label">Scores</p>
        <ScoreCurve distribution={stats.distribution} />
      </div>

      <div>
        <p className="label">Genres</p>
        {genres.length > 0 ? (
          <>
            {/* Une œuvre compte dans CHACUN de ses genres : la somme dépasse le
                nombre d'œuvres, et c'est la bonne lecture — d'où des barres et
                non un camembert, qui promettrait un tout. La moyenne à côté du
                compte sépare ce qu'on regarde de ce qu'on aime. */}
            <Barres
              parts={genres.map((g) => ({
                label: g.genre,
                count: g.count,
                hint: g.mean === null ? undefined : `${g.mean.toFixed(1)}`,
              }))}
              lien={(label) => `/genre/${encodeURIComponent(label)}`}
            />
          </>
        ) : (
          /* Une section vide sans explication ferait chercher une panne. Les
             entrées d'avant ce champ n'ont pas de genres : ils se recopient à
             l'ouverture d'une fiche, sans rien redemander au réseau pour
             elles-mêmes. */
          <p className="faint">
            No genre known yet. They are copied over when a page is opened, and on import.
          </p>
        )}
      </div>

      <div>
        <p className="label">Status</p>
        <Barres parts={byStatus(entries, media)} />
      </div>

      {formats.length > 0 && (
        <div>
          <p className="label">Format</p>
          <Barres parts={formats} />
        </div>
      )}

      {longueurs.length > 0 && (
        <div>
          <p className="label">{media === 'manga' ? 'Chapter count' : 'Episode count'}</p>
          {/* Sur la longueur ANNONCÉE de l'œuvre : la question est de savoir si
              l'on regarde des séries courtes ou des fleuves, pas où l'on en est. */}
          <Barres parts={longueurs} />
        </div>
      )}

      {annees.length > 0 && (
        <div>
          <p className="label">Release year</p>
          {/* Les années gardent leurs trous : une année sans rien est une
              information, et la sauter donnerait l'illusion d'une continuité. */}
          <Frise parts={annees} />
        </div>
      )}

      {finies.length > 0 && (
        <div>
          <p className="label">Finished by year</p>
          {/* L'autre moitié de l'histoire : l'année de sortie dit ce qu'on
              regarde, celle-ci quand on l'a regardé. Ensemble elles disent si
              l'on suit l'actualité ou si l'on rattrape. */}
          <Frise parts={finies} />
        </div>
      )}
    </div>
  );
}

/**
 * Des minutes en une durée lisible.
 *
 * En jours dès qu'il y en a un : « 3,2 j » se compare d'un coup d'œil là où
 * « 4 608 min » demande un calcul. En dessous, des heures — dire « 0,3 j »
 * d'une soirée serait juste et illisible.
 */
function duree(minutes: number): string {
  if (minutes <= 0) return '—';
  const heures = minutes / 60;
  return heures >= 24 ? `${(heures / 24).toFixed(1)} d` : `${heures.toFixed(1)} h`;
}

/**
 * Une répartition en barres horizontales.
 *
 * Horizontales parce que les libellés sont du TEXTE — « Plan to watch »,
 * « MAPPA » — et qu'un texte se lit à l'horizontale. Des barres verticales
 * obligeraient à incliner les étiquettes, ce qui ne se lit plus.
 */
function Barres({ parts, lien }: { parts: Part[]; lien?: (label: string) => string }) {
  const max = Math.max(...parts.map((p) => p.count), 0);
  if (max === 0) return <p className="faint">Nothing to count.</p>;

  /* Une colonne de plus pour TOUTES les barres dès qu'une seule porte une
     précision : sinon les comptes ne seraient plus alignés d'une ligne à
     l'autre, et une colonne de chiffres désalignée ne se lit plus. */
  const avecNotes = parts.some((p) => p.hint !== undefined);

  return (
    <div className={`${own.barres} ${avecNotes ? own.barresNotes : ''}`}>
      {parts.map((p) => {
        const contenu = (
          <>
            <span className={own.barreNom}>{p.label}</span>
            <span className={own.barrePiste}>
              {/* Rien du tout a zero : la largeur minimale sert a garder
                  visible UNE occurrence, pas a dessiner une barre la ou il n'y
                  a rien. Un « On hold 0 » avec un trait se lit comme un un. */}
              {p.count > 0 && (
                <span
                  className={own.barreFill}
                  style={{ inlineSize: `${(p.count / max) * 100}%` }}
                />
              )}
            </span>
            {avecNotes && <span className={own.barreNote}>{p.hint ?? ''}</span>}
            <span className={own.barreCompte}>{p.count}</span>
          </>
        );

        return lien ? (
          <Link key={p.label} className={own.barre} to={lien(p.label)}>
            {contenu}
          </Link>
        ) : (
          <div key={p.label} className={own.barre}>
            {contenu}
          </div>
        );
      })}
    </div>
  );
}

/** Une frise d'années : beaucoup de colonnes, peu de place — donc verticale. */
function Frise({ parts }: { parts: Part[] }) {
  const max = Math.max(...parts.map((p) => p.count), 0);
  if (max === 0) return null;

  /* L'annee ENTIERE, jamais « 15 » ni « 20 » : ils ne disent pas de quel
     siecle il s'agit. Toutes quand la frise est courte, une sur cinq au-dela —
     cinquante etiquettes completes se chevaucheraient, mais une frise de
     quatre ans n'en montrerait qu'une seule sous cette regle, ce qui ne situe
     plus rien. */
  const toutes = parts.length <= 8;

  return (
    <div className={own.annees}>
      {parts.map((p) => (
        <div key={p.label} className={own.annee} title={`${p.label} · ${p.count}`}>
          {p.count > 0 && (
            <div className={own.anneeFill} style={{ blockSize: `${(p.count / max) * 100}%` }} />
          )}
          <span className={own.anneeNom}>{toutes || Number(p.label) % 5 === 0 ? p.label : ''}</span>
        </div>
      ))}
    </div>
  );
}

function Figure({ valeur, quoi }: { valeur: number | string; quoi: string }) {
  return (
    <div>
      <p className={styles.figure}>
        {typeof valeur === 'number' ? valeur.toLocaleString('en-US') : valeur}
      </p>
      <p className="label">{quoi}</p>
    </div>
  );
}

/**
 * La répartition des notes, de 1 à 10.
 *
 * Des barres et non une courbe lissée : dix valeurs entières ne se lissent
 * pas sans inventer des points entre elles. La hauteur est relative au plus
 * haut bâton — c'est la FORME qui se lit, pas le compte exact, qui est dans
 * l'infobulle.
 */
function ScoreCurve({ distribution }: { distribution: number[] }) {
  const max = Math.max(...distribution);
  if (max === 0) return <p className="faint">No score yet.</p>;

  return (
    <div className={styles.curve} role="img" aria-label="Score distribution">
      {distribution.map((n, i) => (
        <div key={i} className={styles.bar} title={`${i + 1}/10 · ${n}`}>
          {/* Rien du tout quand la note n'a jamais été donnée : la hauteur
              minimale sert à garder visible UNE occurrence, pas à dessiner un
              bâton là où il n'y a rien. */}
          {n > 0 && <div className={styles.barFill} style={{ blockSize: `${(n / max) * 100}%` }} />}
          <span className="label">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
