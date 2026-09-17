import { useMemo, useState } from 'react';
import { AudioLines, Play } from 'lucide-react';
import { songKey } from '../lib/ids';
import { rowsFromRemote, type SongRow } from '../lib/songList';
import { weight, type Theme, type ThemeMark } from '../lib/themes';
import { usePlayer } from '../store/player';
import { useSongs } from '../store/songs';
import { ShowMore } from './ShowMore';
import styles from './Themes.module.css';

/**
 * Les openings et endings, en vidéo.
 *
 * Façade cliquable plutôt que lecteur d'emblée, comme la bande-annonce : un
 * opening pèse une soixantaine de méga-octets en 1080p Blu-ray, et personne
 * n'a demandé à en télécharger quatre en ouvrant une fiche. Le poids est
 * ÉCRIT sur le bouton — c'est ce qui rend le clic informé plutôt que subi.
 *
 * Le clic lance LE lecteur de l'app, celui de l'onglet Musiques, et non plus
 * une vidéo logée dans la carte. Deux lecteurs, c'étaient deux jeux de
 * commandes — les natives ici, les nôtres là-bas —, deux volumes, et une
 * chanson qui s'arrêtait dès qu'on quittait la fiche. La file est celle de
 * l'anime : tous ses génériques, dans l'ordre de la section.
 */

/**
 * Combien de thèmes avant de demander un clic.
 *
 * One Piece en a 73 — mesuré. Les dérouler tous repousserait la section des
 * épisodes à trente-sept rangées de cartes plus bas, et la fiche ne se lirait
 * plus. Douze couvrent une série entière ; au-delà, on est dans le fleuve, et
 * on le dit.
 */
const VISIBLES = 12;

/** L'anime de la fiche : de quoi nommer ce qui joue dans le lecteur. */
interface ThemeAnime {
  anilistId: number;
  title: string;
  year: number | null;
  cover: string | null;
}

export function ThemeList({ themes, anime }: { themes: readonly Theme[]; anime: ThemeAnime }) {
  const [tout, setTout] = useState(false);
  const montres = tout ? themes : themes.slice(0, VISIBLES);
  const judgements = useSongs((s) => s.songs);

  /* La file : TOUS les génériques, y compris ceux que « Show all » cache
     encore — écouter l'anime ne dépend pas de ce qu'on a déroulé. Les mêmes
     lignes que dans Musiques, au même constructeur près : le lecteur et la
     notation n'ont pas à savoir qu'elles viennent d'une fiche. */
  const { anilistId, title, year, cover } = anime;
  const file = useMemo(
    () =>
      rowsFromRemote(
        themes.map((theme) => ({ anilistId, anime: title, year, cover, theme })),
        judgements,
      ),
    [themes, anilistId, title, year, cover, judgements],
  );

  return (
    <>
      <div className={styles.liste}>
        {montres.map((t) => (
          <ThemeCard key={t.slug} theme={t} anilistId={anilistId} file={file} />
        ))}
      </div>
      {!tout && themes.length > VISIBLES && (
        <ShowMore
          onClick={() => setTout(true)}
          loading={false}
          label={`Show all ${themes.length}`}
        />
      )}
    </>
  );
}

function ThemeCard({
  theme,
  anilistId,
  file,
}: {
  theme: Theme;
  anilistId: number;
  file: readonly SongRow[];
}) {
  const [index, setIndex] = useState(0);
  const cle = songKey(anilistId, theme.slug);

  const play = usePlayer((s) => s.play);
  const setSource = usePlayer((s) => s.setSource);
  const toggleExpanded = usePlayer((s) => s.toggleExpanded);
  const enCours = usePlayer((s) => s.queue[s.index]?.key === cle);
  /* Le fichier qui joue, quand c'est cette chanson : le choix fait à la main,
     sinon celui que la file avait prévu. */
  const lienJoue = usePlayer((s) => {
    const song = s.queue[s.index];
    return song?.key === cle ? (s.source ?? song.link) : undefined;
  });

  const version = theme.versions[index] ?? theme.versions[0];
  if (!version) return null;

  const fichier = version.videos[0];
  const poids = weight(fichier?.size);
  const lien = fichier?.link;
  const joueCeFichier = enCours && lien !== undefined && lienJoue === lien;

  const jouer = () => {
    if (!lien) return;
    /* Ce fichier-là joue déjà : le clic ouvre le lecteur, là où la vidéo se
       regarde. Relancer la même chanson ne ferait rien de visible. */
    if (joueCeFichier) {
      toggleExpanded();
      return;
    }
    const i = file.findIndex((r) => r.key === cle);
    const ligne = file[i];
    if (!ligne) return;
    /* La même chanson dans une autre version change de fichier SANS toucher à
       la file : on garde sa place, et ce qui suit. */
    if (!enCours) play(file, i);
    /* Le store ne retient que ce qui DIFFÈRE du fichier prévu — voir `source`.
       Choisir la v2 d'un ending, c'est justement ce cas. */
    setSource(lien === ligne.link ? null : lien);
  };

  return (
    <article className={styles.carte} aria-current={enCours ? 'true' : undefined}>
      <div className={styles.tete}>
        <span className={styles.badge} data-kind={theme.kind}>
          {theme.slug}
        </span>
        <div className={styles.titres}>
          <p className={styles.chanson}>{theme.title}</p>
          {theme.artists.length > 0 && <p className="label">{theme.artists.join(' · ')}</p>}
        </div>
      </div>

      {/* Les versions ne sont pas des doublons : un opening est souvent
          remonté en cours de saison, et la plage d'épisodes dit laquelle on a
          vue. */}
      {theme.versions.length > 1 && (
        <div className={styles.versions} role="group" aria-label={`${theme.slug} versions`}>
          {theme.versions.map((v, i) => (
            <button
              key={v.version}
              type="button"
              className={styles.version}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              v{v.version}
              {v.episodes && <span className="faint"> · ep. {v.episodes}</span>}
            </button>
          ))}
        </div>
      )}

      <button type="button" className={styles.facade} disabled={!lien} onClick={jouer}>
        <span className={styles.rond}>
          {joueCeFichier ? (
            <AudioLines size={20} strokeWidth={2.2} aria-hidden />
          ) : (
            <Play size={20} strokeWidth={2.2} aria-hidden />
          )}
        </span>
        <span className={styles.info}>
          <span className={styles.infoPrincipal}>
            {joueCeFichier
              ? 'Now playing'
              : theme.versions.length > 1
                ? `Play v${version.version}`
                : 'Play'}
            {version.spoiler && <span className={styles.spoiler}>spoiler</span>}
          </span>
          <span className="label">
            {joueCeFichier
              ? 'Open the player'
              : [
                  fichier?.resolution ? `${fichier.resolution}p` : null,
                  fichier?.nc ? 'no credits' : null,
                  poids,
                  theme.versions.length === 1 && version.episodes
                    ? `ep. ${version.episodes}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </span>
      </button>
    </article>
  );
}

/**
 * Le repère posé dans la liste des épisodes, à l'endroit où le thème change.
 *
 * Uniquement au CHANGEMENT, jamais sur chaque ligne : une pastille répétée sur
 * mille épisodes n'informe plus, elle décore. Là, elle raconte quelque chose —
 * « à partir d'ici, c'est un autre opening », et ça se lit comme un marqueur de
 * chapitre.
 */
export function ThemeMarker({ marks }: { marks: readonly ThemeMark[] }) {
  if (marks.length === 0) return null;

  return (
    <li className={styles.repere}>
      <span className={styles.repereTexte}>
        {marks.map((m) => (
          <span key={`${m.slug}v${m.version}`} className={styles.repereTexte}>
            <span className={styles.badge} data-kind={m.kind}>
              {m.slug}
              {m.isVersion ? ` v${m.version}` : ''}
            </span>
            <span className={styles.repereNom}>{m.title}</span>
          </span>
        ))}
      </span>
      <span className={styles.repereTrait} />
    </li>
  );
}
