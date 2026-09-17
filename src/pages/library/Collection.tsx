import { useSearchParams } from 'react-router-dom';
import { entryCard } from '../../lib/routes';
import { useLibrary } from '../../store/library';
import { MediaCard } from '../../components/MediaCard';
import { Grid } from '../../components/Grid';
import { entriesWithTag } from '../../lib/personalTags';
import { asTrackStatus, statusLabel, STATUS_ORDER } from '../../lib/trackStatus';
import { asLibrarySort, librarySorts, sortLibrary } from '../../lib/libraryOrder';
import { Select } from '../../components/Select';
import type { LibraryEntry, MediaType, TrackStatus } from '../../types/library';
import entity from '../Entity.module.css';
/* Le meme groupe de boutons que le journal : deux dessins pour un seul geste —
   choisir parmi quelques valeurs fixes — auraient diverge. */
import filtres from './Library.module.css';

/**
 * Une collection : tout ce qui est suivi dans UN média.
 *
 * Elle ne demande rien au réseau : chaque entrée porte son titre et sa
 * jaquette, copiés au moment du suivi. C'est ce qui remplace le
 * `loadMissingListImages` de la v1 et ses N requêtes à l'ouverture.
 *
 * Le média vient du chemin — `/library/manga`, `/library/anime` — et non d'un
 * paramètre : ce sont deux onglets, deux adresses, et l'un ne filtre pas
 * l'autre. Décision 6.
 */

export default function LibraryCollection({ media }: { media: MediaType }) {
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') ?? '';
  const status = asTrackStatus(params.get('status'));
  /* Le tri vit dans l'URL comme le statut : un lien envoye montre la meme
     chose, et le retour arriere defait le reglage. */
  const tri = asLibrarySort(params.get('sort')) ?? 'updated';

  const entries = useLibrary((s) => s.entries);
  const hydrated = useLibrary((s) => s.hydrated);

  const shelf = Object.values(entries).filter((e) => e.media === media);

  /* Comptés sur l'étagère ENTIÈRE, pas sur ce qui est affiché : un bouton qui
     annonce le nombre auquel il mène doit le dire avant qu'on clique dessus. */
  const comptes = STATUS_ORDER.reduce<Record<TrackStatus, number>>(
    (acc, s) => ({ ...acc, [s]: shelf.filter((e) => e.status === s).length }),
    { current: 0, completed: 0, planned: 0, paused: 0, dropped: 0 },
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  /* Le filtre par etiquette n'a plus de barre de pastilles ici : l'onglet Tags
     montrait deja exactement la meme liste, et la voir deux fois donnait
     l'impression de deux reglages distincts. Le parametre `?tag=` reste lu,
     pour qu'un lien vers `/library/anime?tag=a+relire` continue de marcher. */
  let shown: LibraryEntry[] = tag ? entriesWithTag(shelf, tag) : shelf;
  if (status) shown = shown.filter((e) => e.status === status);
  shown = sortLibrary(shown, tri);

  const unite = media === 'manga' ? 'chapters' : 'episodes';

  return (
    <>
      {/* Des boutons, pas une liste déroulante : les statuts sont cinq, ils ne
          changent jamais, et leur intérêt est autant de FILTRER que de dire
          combien il y en a dans chacun. Un menu fermé cachait les deux — il
          fallait l'ouvrir pour savoir ce qu'on pouvait demander. */}
      <div className={filtres.segmented} role="group" aria-label="Status">
        <BoutonStatut
          label="All"
          compte={shelf.length}
          actif={status === null}
          onClick={() => setParam('status', '')}
        />
        {STATUS_ORDER.map((s) => (
          <BoutonStatut
            key={s}
            label={statusLabel(s, media)}
            compte={comptes[s]}
            actif={status === s}
            onClick={() => setParam('status', s)}
          />
        ))}
      </div>

      <div className={filtres.listsBar}>
        {/* Une liste deroulante ici, contrairement aux statuts : un tri ne
            compte rien et n'a qu'une valeur active a la fois — l'etaler en
            six boutons ferait une seconde barre qui se disputerait la
            premiere. */}
        <Select
          label="Sort"
          value={tri}
          onChange={(v) => setParam('sort', v === 'updated' ? '' : v)}
        >
          {librarySorts(media).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <section className={entity.section}>
        <div className={entity.sectionHead}>
          {/* Le titre nomme le filtre POSE : laisser « All titles » au-dessus
              d'une liste filtree par statut donnait deux reponses differentes
              a la meme question. */}
          <h2 className="label">{tag || (status ? statusLabel(status, media) : 'All titles')}</h2>
          <p className="label">{shown.length}</p>
        </div>

        {!hydrated && <p className="faint">Loading…</p>}

        {hydrated && shelf.length === 0 && (
          <p className="muted">
            Nothing tracked yet. Open a title and use “Start tracking” to add it here.
          </p>
        )}

        {hydrated && shelf.length > 0 && shown.length === 0 && (
          <p className="muted">No title matches this filter.</p>
        )}

        {shown.length > 0 && (
          <Grid>
            {shown.map((e) => (
              <MediaCard
                key={e.key}
                media={media}
                libraryKey={e.key}
                {...entryCard(e)}
                title={e.title}
                cover={e.cover ?? null}
                score={e.score ? e.score * 10 : null}
                meta={[
                  statusLabel(e.status, media),
                  /* La progression se lit dans l'unité du média : des
                     épisodes d'un côté, des chapitres de l'autre. */
                  e.progress.kind === 'anime'
                    ? `${e.progress.episodes}/${e.totalUnits ?? '?'}`
                    : `${e.progress.chapters}/${e.totalUnits ?? '?'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                /* Depuis la copie locale de l'entrée : la bibliothèque
                   s'affiche sans réseau, la bulle aussi. */
                tip={{
                  season: e.season,
                  year: e.seasonYear,
                  studio: e.studio,
                  format: e.format,
                  [unite]: e.totalUnits,
                }}
              />
            ))}
          </Grid>
        )}
      </section>
    </>
  );
}

/**
 * Un statut : son nom, et combien de titres il tient.
 *
 * Le compte est là même à zéro. Masquer les statuts vides ferait bouger les
 * boutons à chaque titre logué — on viserait « Dropped » et on cliquerait sur
 * autre chose — et « 0 » est une réponse, pas un vide.
 */
function BoutonStatut({
  label,
  compte,
  actif,
  onClick,
}: {
  label: string;
  compte: number;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${filtres.segment} ${actif ? filtres.segmentOn : ''}`}
      aria-pressed={actif}
      onClick={onClick}
    >
      {label}
      <span className={filtres.segmentCount}>{compte}</span>
    </button>
  );
}
