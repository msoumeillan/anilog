import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLibrary } from '../store/library';
import { useLiveChart } from '../store/livechart';
import {
  useLinkSources,
  useWeekSchedule,
  type LinkSource,
  type WeekSlot,
} from '../api/anilist/hooks';
import { useAdnWeek } from '../api/adn/hooks';
import { displayTitle } from '../lib/title';
import { useArtworkKey } from '../store/artwork';
import { artUrl } from '../lib/artwork';
import { entryKey } from '../lib/ids';
import {
  attachAdn,
  byDay,
  countdown,
  dayKey,
  localTime,
  mainAt,
  shiftWeeks,
  weekBounds,
  weekDays,
  weekStart,
  type FrenchRelease,
  type Langue,
  type Slot,
} from '../lib/calendar';
import { attachLiveChart, platformIcon } from '../lib/livechart';
import styles from './Calendar.module.css';

/**
 * La semaine de sortie.
 *
 * Sept colonnes, du lundi au dimanche, comme LiveChart — mais restreinte par
 * défaut à ce qu'on SUIT. C'est la différence entre un site d'actualité et un
 * journal : la question n'est pas « qu'est-ce qui sort », c'est « qu'est-ce
 * que j'ai à voir cette semaine ».
 *
 * Les heures sont celles d'ICI, et d'abord celles de la SORTIE FRANÇAISE :
 * LiveChart la donne par plateforme, ADN pour son catalogue — voir
 * `api/livechart/client`. AniList fournit la grille, les épisodes et l'heure
 * de la première diffusion — au Japon, ou en Chine pour un donghua —, qui
 * reste en petit, et passe en grand quand aucune sortie française n'est connue.
 *
 * Une carte se place au jour de sa première sortie française. D'où la fenêtre
 * demandée à AniList, qui commence DEUX JOURS avant le lundi : un épisode
 * diffusé au Japon le samedi et mis en ligne ici le lundi appartient à cette
 * semaine-ci.
 */

/**
 * Deux jours de marge. Mesuré sur les 75 séries de la semaine du 7 septembre
 * 2026 qui ont une sortie française : une demi-heure d'écart médian avec la
 * diffusion japonaise, 26 h au plus — Meitantei Precure!, diffusé le dimanche
 * matin à Tokyo et mis en ligne ici le lundi.
 */
const AVANT_S = 2 * 86_400;

export default function Calendar() {
  const entries = useLibrary((s) => s.entries);
  const hydrated = useLibrary((s) => s.hydrated);
  const sorties = useLiveChart((s) => s.table.sorties);
  const lcError = useLiveChart((s) => s.error);

  const [depart, setDepart] = useState(() => weekStart(new Date()));
  const [tout, setTout] = useState(false);

  const jours = useMemo(() => weekDays(depart), [depart]);
  const { from, to } = useMemo(() => weekBounds(depart), [depart]);

  /**
   * Ce qu'on REGARDE — le statut « Watching », `current` dans le code.
   *
   * Et rien d'autre : ni « Plan to watch », ni « On hold ». Ce calendrier
   * répond à « qu'est-ce que j'ai à voir cette semaine », et une série en
   * pause n'en fait pas partie même quand elle diffuse — One Piece, en pause,
   * y apparaissait.
   */
  const suivis = useMemo(
    () =>
      Object.values(entries)
        .filter(
          (e) => e.media === 'anime' && e.status === 'current' && typeof e.ids.anilist === 'number',
        )
        .map((e) => e.ids.anilist ?? 0)
        .filter((id) => id > 0),
    [entries],
  );

  const grille = useWeekSchedule(tout ? null : suivis, from - AVANT_S, to);
  const adn = useAdnWeek(jours.map(dayKey), true);
  const plateformes = useLinkSources();

  /* Les séries de la grille, une fois chacune, avec le titre qu'on cherchera
     chez LiveChart : le romaji, le plus proche du leur. */
  const aRetrouver = useMemo(() => {
    const vues = new Map<number, string>();
    for (const w of grille.data ?? []) {
      const t = w.media.title.romaji ?? w.media.title.english ?? w.media.title.native;
      if (t && !vues.has(w.mediaId)) vues.set(w.mediaId, t);
    }
    return [...vues].map(([id, title]) => ({ id, title }));
  }, [grille.data]);

  useEffect(() => {
    if (aRetrouver.length > 0) void useLiveChart.getState().sync(aRetrouver);
  }, [aRetrouver]);

  const slots = useMemo(() => {
    const bruts: Slot[] = (grille.data ?? []).map(versSlot);
    return attachLiveChart(
      attachAdn(bruts, adn.videos),
      (id) => sorties[String(id)]?.releases ?? [],
    );
  }, [grille.data, adn.videos, sorties]);

  const parJour = useMemo(() => byDay(slots), [slots]);
  const aujourdhui = dayKey(new Date());

  /* Rien à demander quand on ne suit rien : la requête rendrait toute la
     planète, ce qui n'est pas ce que « mes séries » veut dire. */
  const rienASuivre = !tout && suivis.length === 0;

  if (!hydrated) return <p className="faint">Loading…</p>;

  return (
    <div className={`page ${styles.wrap}`}>
      <div className={styles.head}>
        <div>
          <h1 className="title">Calendar</h1>
          <p className="label">
            {jours[0]?.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} —{' '}
            {jours[6]?.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className={styles.outils}>
          <button
            type="button"
            className={styles.filtre}
            aria-pressed={!tout}
            onClick={() => setTout(false)}
          >
            Mine
          </button>
          <button
            type="button"
            className={styles.filtre}
            aria-pressed={tout}
            onClick={() => setTout(true)}
          >
            Everything airing
          </button>

          <button
            type="button"
            className={styles.nav}
            aria-label="Previous week"
            onClick={() => setDepart((d) => shiftWeeks(d, -1))}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.filtre}
            onClick={() => setDepart(weekStart(new Date()))}
          >
            Today
          </button>
          <button
            type="button"
            className={styles.nav}
            aria-label="Next week"
            onClick={() => setDepart((d) => shiftWeeks(d, 1))}
          >
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {grille.isError && (
        <p className={`label ${styles.panne}`}>
          AniList didn’t respond — the week will fill in once it’s back.
        </p>
      )}
      {/* Une panne de LiveChart n'efface rien : les cartes gardent ce que le
          cache sait, et l'heure d'origine pour le reste. */}
      {lcError && (
        <p className={`label ${styles.panne}`}>
          LiveChart didn’t respond — some release times may be missing.
        </p>
      )}

      {rienASuivre ? (
        <p className="muted">
          Nothing in your Watching list. Start a show that’s airing, or see{' '}
          <button type="button" className={styles.lienTexte} onClick={() => setTout(true)}>
            everything airing this week
          </button>
          .
        </p>
      ) : (
        <div className={styles.semaine}>
          {jours.map((jour) => {
            const cle = dayKey(jour);
            const duJour = parJour.get(cle) ?? [];
            return (
              <section
                key={cle}
                className={styles.jour}
                aria-current={cle === aujourdhui ? 'date' : undefined}
              >
                <h2 className={styles.jourTitre}>
                  <span className={styles.jourNom}>
                    {jour.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="label">
                    {jour.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                  </span>
                </h2>

                {duJour.length === 0 ? (
                  <p className={styles.vide} aria-hidden />
                ) : (
                  <ul className={styles.liste}>
                    {duJour.map((s) => (
                      <Diffusion
                        key={`${s.mediaId}-${s.episode}`}
                        slot={s}
                        sources={plateformes.data ?? []}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {grille.isFetching && <p className="faint">Loading…</p>}
    </div>
  );
}

/** Ce qu'on lit dans la pastille : l'anglais de l'app, pas VOSTF/VF. */
const LANGUE: Record<Langue, string> = { vostf: 'SUB', vf: 'DUB' };

const libelle = (langues: readonly Langue[]) => langues.map((l) => LANGUE[l]).join(' · ');

/**
 * Le logo d'une plateforme, sur la couleur de sa marque — ou son nom, quand
 * personne n'a d'icône pour elle. Voir `platformIcon`.
 */
function Plateforme({
  nom,
  sources,
  petit = false,
}: {
  nom: string;
  sources: readonly LinkSource[];
  petit?: boolean;
}) {
  const logo = platformIcon(nom, sources);
  if (!logo) return <span className={styles.plateforme}>{nom}</span>;
  return (
    <span
      className={petit ? styles.logoPetit : styles.logo}
      style={{ backgroundColor: logo.color ?? undefined }}
      title={nom}
    >
      <img src={logo.icon} alt={nom} loading="lazy" />
    </span>
  );
}

/** Un épisode, une carte. */
function Diffusion({ slot, sources }: { slot: Slot; sources: readonly LinkSource[] }) {
  /* L'affiche choisie à la main prime, comme partout ailleurs dans l'app. Le
     store garde un CHEMIN TMDB, pas une URL — voir `lib/artwork`. */
  const art = artUrl(useArtworkKey(entryKey('anime', slot.mediaId))?.poster, 'w185');
  const [premiere, ...autres] = slot.fr;
  const quand = mainAt(slot);
  const reste = countdown(Math.floor(quand / 1000));
  // Le pays de la première diffusion : un donghua sort en Chine, pas au Japon.
  const pays = slot.origin ?? 'JP';

  return (
    <li className={styles.item}>
      <Link to={`/anime/${slot.mediaId}`} className={styles.lien}>
        <img className={styles.affiche} src={art ?? slot.cover ?? ''} alt="" loading="lazy" />
        <span className={styles.corps}>
          {/* Le logo, l'heure et les langues sur une ligne : une colonne ne
              laisse qu'une centaine de pixels au texte. */}
          <span className={styles.ligne}>
            {premiere && <Plateforme nom={premiere.platform} sources={sources} />}
            <span className={styles.heure}>
              {premiere?.approx && '≈ '}
              {heure(quand)}
            </span>
            {premiere ? (
              premiere.languages.length > 0 && (
                <span className={styles.langue}>{libelle(premiere.languages)}</span>
              )
            ) : (
              <span className={styles.plateforme}>{pays}</span>
            )}
            {reste && <span className="faint">{reste}</span>}
          </span>
          <span className={styles.titre}>{slot.title}</span>
          <span className={`label ${styles.details}`}>
            <span>EP{slot.episode}</span>
            {premiere ? (
              <>
                {autres.map((a) => (
                  <span key={`${a.platform}|${a.at}`} className={styles.autre}>
                    <Plateforme nom={a.platform} sources={sources} petit />
                    {autreHeure(a, premiere, quand)}
                  </span>
                ))}
                <span>
                  {pays} {localTime(slot.airingAt)}
                </span>
              </>
            ) : (
              slot.format && <span>{slot.format}</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** L'heure d'un instant en millisecondes, telle qu'on la lit ici. */
function heure(ms: number): string {
  return localTime(Math.floor(ms / 1000));
}

/**
 * L'heure d'une autre sortie du même épisode, à côté de son logo : « 22:00 ».
 *
 * Le jour seulement s'il diffère de celui de la carte — deux calendriers
 * Crunchyroll d'une même série peuvent tomber le mercredi et le jeudi. Les
 * langues seulement si elles diffèrent de celles de la première : sinon elles
 * répètent ce qu'on vient de lire.
 */
function autreHeure(a: FrenchRelease, premiere: FrenchRelease, quand: number): string {
  const t = Date.parse(a.at);
  const jour =
    dayKey(new Date(t)) === dayKey(new Date(quand))
      ? ''
      : `${new Date(t).toLocaleDateString('en-US', { weekday: 'short' })} `;
  const langues =
    a.languages.join() === premiere.languages.join() ? '' : ` ${libelle(a.languages)}`;
  return `${jour}${a.approx ? '≈ ' : ''}${heure(t)}${langues}`;
}

/** La réponse d'AniList, ramenée à ce que la grille affiche. */
function versSlot(w: WeekSlot): Slot {
  return {
    mediaId: w.mediaId,
    episode: w.episode,
    airingAt: w.airingAt,
    origin: w.media.countryOfOrigin,
    title: displayTitle(w.media.title),
    cover: w.media.coverImage.large ?? w.media.coverImage.medium,
    format: w.media.format,
    streams: (w.media.externalLinks ?? [])
      .filter((l) => l.type === 'STREAMING')
      .map((l) => ({ site: l.site, url: l.url })),
    fr: [],
  };
}
