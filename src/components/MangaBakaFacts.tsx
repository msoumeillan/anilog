import { Link } from 'react-router-dom';
import type { AnimeSpan, Publisher, Rating } from '../lib/mangabaka';
import { outOfTen } from '../lib/score';
import styles from '../pages/AnimeDetail.module.css';
import logoMal from '../assets/sources/MAL.svg';
import logoAniList from '../assets/sources/AL.svg';
import logoMangaUpdates from '../assets/sources/mangaupdates.svg';
import logoAnimePlanet from '../assets/sources/animeplanet.svg';
import logoKitsu from '../assets/sources/kitsu.EqyjSJ-B.svg';
import logoAnn from '../assets/sources/ann.ByU3r1DM.svg';
import logoShikimori from '../assets/sources/shikimori.svg';

/**
 * Les logos, par cle de base.
 *
 * Importes et non charges depuis chaque site : Vite les empreinte, inline
 * ceux de moins de 4 Ko et sert les autres depuis notre propre bundle. Sept
 * requetes vers sept domaines a chaque fiche seraient un mauvais echange
 * dans une app qui doit tourner hors ligne.
 */
const LOGOS: Record<string, string> = {
  my_anime_list: logoMal,
  anilist: logoAniList,
  manga_updates: logoMangaUpdates,
  anime_planet: logoAnimePlanet,
  kitsu: logoKitsu,
  anime_news_network: logoAnn,
  shikimori: logoShikimori,
};

/**
 * Les deux sections que MangaBaka apporte aux DEUX fiches manga.
 *
 * Elles étaient écrites deux fois, une par fiche, et elles avaient déjà
 * divergé : les éditeurs étaient cliquables d'un côté seulement, sans que
 * personne l'ait décidé. C'est la façon dont la v1 est morte — cinq cartes
 * affiche recopiées, puis cinq comportements différents.
 *
 * Elles empruntent la feuille de style des fiches : c'est là qu'elles vivent,
 * et leur donner la leur ferait diverger l'apparence à son tour.
 */

/**
 * Où l'adaptation animée commence et s'arrête dans le manga.
 *
 * Rendu TEL QUEL, sans analyse — voir `animeSpan`. La chaîne mêle tomes,
 * chapitres, saisons et parfois épisodes, sans grammaire garantie.
 */
export function AnimeSpanSection({ span }: { span: AnimeSpan }) {
  return (
    <section className={styles.section}>
      <h2 className="label">Where the anime sits</h2>
      <dl className={styles.infos}>
        <div className={styles.info}>
          <dt className="label">Starts</dt>
          <dd className={styles.infoValue}>{span.start}</dd>
        </div>
        {span.end && (
          <div className={styles.info}>
            <dt className="label">Ends</dt>
            <dd className={styles.infoValue}>{span.end}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/**
 * Les éditeurs, par région.
 *
 * Chaque nom mène au catalogue MangaBaka filtré sur lui : leur API porte un
 * `publisher=`, vérifié — mille deux cents séries pour Yen Press.
 */
export function PublishersSection({ list }: { list: Publisher[] }) {
  return (
    <section className={styles.section}>
      <h2 className="label">Publishers</h2>
      <dl className={styles.infos}>
        {list.map((m) => (
          <div key={m.name} className={styles.info}>
            <dt className="label">{m.region || '—'}</dt>
            <dd className={styles.infoValue}>
              <Link
                to={`/mangabaka?publisher=${encodeURIComponent(m.name)}`}
                className={styles.inlineLink}
              >
                {m.name}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Les notes des bases qu'agrège MangaBaka, chacune sous son logo.
 *
 * Sans titre : sept logos alignés se passent d'être annoncés.
 *
 * Cliquer mène à l'œuvre chez eux — comme sur MangaBaka : la note dit ce
 * qu'ils en pensent, le lien mène lire pourquoi. Sans identifiant, le bloc
 * reste affiché mais ne mène nulle part : un lien mort vaudrait moins.
 *
 * Le logo manquant retombe sur une pastille aux couleurs de la marque, et le
 * nom complet reste dans le `title` — l'image situe, le mot confirme.
 */
export function ElsewhereScores({ notes }: { notes: Rating[] }) {
  return (
    <div className={styles.otherScores}>
      <div className={styles.scoreRow}>
        {notes.map((n) => {
          const logo = LOGOS[n.key];
          const dedans = (
            <>
              {logo ? (
                <img className={styles.mark} src={logo} alt="" width={18} height={18} />
              ) : (
                <span className={styles.markText} style={{ background: n.color }}>
                  {n.short}
                </span>
              )}
              {outOfTen(n.score)}
            </>
          );

          return n.url ? (
            <a
              key={n.key}
              className={styles.otherScore}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              title={n.label}
            >
              {dedans}
            </a>
          ) : (
            <span key={n.key} className={styles.otherScore} title={n.label}>
              {dedans}
            </span>
          );
        })}
      </div>
    </div>
  );
}
