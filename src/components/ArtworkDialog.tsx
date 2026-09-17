import { useMemo, useState } from 'react';
import { Check, Expand, RotateCcw } from 'lucide-react';
import { Select } from './Select';
import { Lightbox } from './Lightbox';
import { ShowMore } from './ShowMore';
import { useTmdbArtwork, type TmdbHints } from '../api/tmdb/hooks';
import { useArtwork, useArtworkFor } from '../store/artwork';
import {
  ANY_LANGUAGE,
  artUrl,
  filterByLanguage,
  languageLabel,
  languagesOf,
  type TmdbImage,
} from '../lib/artwork';
import { entryKey } from '../lib/ids';
import type { MediaType } from '../types/library';
import own from './ArtworkDialog.module.css';

/**
 * Choisir une autre affiche ou un autre arrière-plan.
 *
 * AniList n'en expose qu'un de chaque, souvent celui de la première saison.
 * TMDB en héberge des dizaines — mesuré : 76 à 255 affiches et 27 à 204
 * arrière-plans sur les séries du projet.
 *
 * Cliquer une vignette la RETIENT, sans rien écrire ; une barre demande alors
 * de confirmer. La première version appliquait au clic, pour qu'on juge
 * l'affiche sur la fiche elle-même — mais dans une grille de trois cents
 * vignettes, le clic de trop est la règle et non l'exception, et remplacer son
 * affiche par accident vaut bien deux gestes.
 *
 * Un seul point de confirmation, atteignable des deux chemins : la visionneuse
 * retient elle aussi, et l'on retombe sur la barre en la refermant.
 *
 * « Default » est une vignette comme les autres, à sa place : revenir en
 * arrière ne doit pas se chercher, et se confirme comme le reste.
 */

type Kind = 'poster' | 'backdrop';

/**
 * Vignettes posées d'un coup.
 *
 * Mesuré : les 298 affiches d'Attack on Titan faisaient passer la page de 449
 * à 4377 nœuds et bloquaient le fil d'exécution 145 ms — un à-coup visible à
 * l'ouverture. `loading="lazy"` épargne le réseau, pas le DOM.
 *
 * 60 remplit déjà plusieurs hauteurs de grille : on ne voit pas la limite tant
 * qu'on ne la cherche pas, et la suite arrive par paquets du même prix.
 */
const PAGE = 60;

export function ArtworkDialog({
  media,
  anilistId,
  hints,
  defaultPoster,
  defaultBackdrop,
}: {
  media: MediaType;
  anilistId: number;
  /** Les mêmes que pour les épisodes : la saison doit être la même. */
  hints: TmdbHints;
  /** L'image d'AniList — ce à quoi « Default » ramène. */
  defaultPoster?: string | null;
  defaultBackdrop?: string | null;
}) {
  const key = entryKey(media, anilistId);
  const chosen = useArtworkFor(media, anilistId);
  const { setPoster, setBackdrop } = useArtwork((s) => s);

  const [kind, setKind] = useState<Kind>('poster');
  const [language, setLanguage] = useState(ANY_LANGUAGE);

  const { data, isPending, isError } = useTmdbArtwork(anilistId, hints);

  /* Mémoïsé pour lui-même : sans ça le `?? []` fabrique un tableau neuf à
     chaque rendu, et les deux calculs qui en dépendent se refont pour rien —
     à 255 vignettes, ce n'est plus théorique. */
  const all = useMemo<TmdbImage[]>(
    () => (kind === 'poster' ? data?.posters : data?.backdrops) ?? [],
    [data, kind],
  );
  const languages = useMemo(() => languagesOf(all), [all]);
  const shown = useMemo(() => filterByLanguage(all, language), [all, language]);

  const [limit, setLimit] = useState(PAGE);

  /* Un filtre qui ne survit pas au changement d'onglet : les arrière-plans
     sont majoritairement sans texte, et garder « Japanese » d'un onglet à
     l'autre donnerait une grille vide sans qu'on comprenne pourquoi. */
  const pickKind = (next: Kind) => {
    setKind(next);
    setLanguage(ANY_LANGUAGE);
    setLimit(PAGE);
  };

  /* Repartir du haut à chaque filtre : garder « voir 240 de plus » d'une
     langue à l'autre reposerait tout le DOM qu'on vient d'éviter. */
  const pickLanguage = (next: string) => {
    setLanguage(next);
    setLimit(PAGE);
  };

  const current = kind === 'poster' ? chosen?.poster : chosen?.backdrop;
  const fallback = kind === 'poster' ? defaultPoster : defaultBackdrop;

  /**
   * L'image retenue, en attente de confirmation.
   *
   * Un objet et pas un simple chemin : `undefined` est un choix valable — il
   * désigne l'image d'origine — donc « rien de retenu » ne peut pas s'écrire
   * `undefined` sans confondre les deux.
   *
   * `kind` voyage avec : une affiche retenue appartient à l'onglet des
   * affiches. Passer aux arrière-plans la met de côté sans l'effacer, et
   * revenir la retrouve — on va souvent comparer les deux avant de trancher,
   * et perdre son choix en chemin serait une punition.
   */
  const [draft, setDraft] = useState<{ kind: Kind; path: string | undefined } | null>(null);
  const staged = draft?.kind === kind ? draft : null;

  /* Cliquer ce qui sert déjà ne retient rien : il n'y aurait rien à
     confirmer, et la barre s'ouvrirait sur un geste sans effet. */
  const stage = (path: string | undefined) => setDraft(path === current ? null : { kind, path });

  const confirm = () => {
    if (!staged) return;
    if (kind === 'poster') setPoster(key, staged.path);
    else setBackdrop(key, staged.path);
    setDraft(null);
  };

  /**
   * Ce qui s'affiche, l'image d'origine comprise et à sa place.
   *
   * Une seule liste plutôt qu'une vignette « Default » traitée à part : la
   * visionneuse s'y déplace à la flèche, et l'image d'origine doit être dans
   * le parcours — c'est souvent celle à laquelle on compare les autres.
   *
   * `w780` et `w1280` en grand format, pas `original` : une affiche s'affiche
   * au plus sur la hauteur de l'écran, soit environ 600 px de large, là où un
   * `original` pèse plusieurs mégaoctets pour le même résultat.
   */
  const tiles = useMemo(
    () => [
      {
        path: undefined as string | undefined,
        language: null as string | null,
        thumb: fallback ?? undefined,
        big: fallback ?? undefined,
      },
      ...shown.map((image) => ({
        path: image.file_path,
        language: image.iso_639_1,
        thumb: artUrl(image.file_path, kind === 'poster' ? 'w185' : 'w300'),
        big: artUrl(image.file_path, kind === 'poster' ? 'w780' : 'w1280'),
      })),
    ],
    [shown, fallback, kind],
  );

  /* Un index dans `tiles`, pas l'image elle-même : les flèches ont besoin de
     savoir OÙ l'on est, pas seulement ce qu'on regarde. */
  const [preview, setPreview] = useState<number | null>(null);
  const shot = preview !== null ? tiles[preview] : undefined;

  /* La vignette retenue peut avoir quitté la grille — un filtre de langue
     posé après coup, ou un « Show more » pas encore cliqué. On la retrouve
     dans la liste complète pour que la barre montre bien de quoi on parle. */
  const stagedTile = staged ? tiles.find((t) => t.path === staged.path) : undefined;

  return (
    <>
      <div className={own.bar}>
        <div className={own.tabs} role="group" aria-label="Artwork kind">
          <button
            type="button"
            className={own.tab}
            aria-pressed={kind === 'poster'}
            onClick={() => pickKind('poster')}
          >
            Poster{data && ` (${data.posters.length})`}
          </button>
          <button
            type="button"
            className={own.tab}
            aria-pressed={kind === 'backdrop'}
            onClick={() => pickKind('backdrop')}
          >
            Backdrop{data && ` (${data.backdrops.length})`}
          </button>
        </div>

        <Select
          label="Language"
          value={language}
          disabled={languages.length < 2}
          onChange={pickLanguage}
        >
          <option value={ANY_LANGUAGE}>{languageLabel(ANY_LANGUAGE)}</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {languageLabel(l.code)} ({l.count})
            </option>
          ))}
        </Select>
      </div>

      {/* Sans clé TMDB, le bouton qui ouvre cette fenêtre n'existe pas :
          inutile de prévoir ici un cas que l'appelant a déjà écarté. */}
      {isPending && <p className="faint">Loading artwork…</p>}
      {isError && <p className="muted">TMDB didn’t answer. Try again later.</p>}
      {!isPending && !isError && !data && (
        <p className="muted">No alternative artwork found for this title on TMDB.</p>
      )}

      {data && (
        <ul className={`${own.grid} ${kind === 'backdrop' ? own.wideGrid : ''}`}>
          {/* La grille s'arrête à `limit`, la visionneuse parcourt TOUT :
              feuilleter en grand ne coûte qu'une image à la fois, et c'est de
              toute façon la bonne façon de traverser deux cents affiches. */}
          {tiles.slice(0, limit).map((tile, index) => {
            /* L'image d'origine est en tête : revenir en arrière ne doit pas
               se chercher. */
            const isDefault = index === 0;
            const inUse = isDefault ? !current : current === tile.path;
            const isStaged = staged !== null && staged.path === tile.path;
            const name = isDefault
              ? 'the default artwork'
              : `this ${kind}, ${languageLabel(tile.language || 'none')}`;

            /* Deux boutons FRÈRES, pas imbriqués : un bouton dans un bouton est
               du HTML invalide et les navigateurs en font ce qu'ils veulent. La
               case porte le choix, la loupe se pose par-dessus. */
            return (
              <li key={tile.path ?? 'default'} className={own.cell}>
                <button
                  type="button"
                  className={`${own.tile} ${isStaged ? own.staged : ''}`}
                  aria-pressed={inUse}
                  aria-label={`${isStaged ? 'Selected' : 'Select'} ${name}`}
                  onClick={() => stage(tile.path)}
                >
                  {tile.thumb ? (
                    <img src={tile.thumb} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className={`${own.empty} placeholder`} />
                  )}
                  {isDefault && (
                    <span className={own.badge}>
                      <RotateCcw size={13} strokeWidth={2.4} aria-hidden />
                      Default
                    </span>
                  )}
                  {/* Coché = ce qui sert. Entouré = ce qui attend d'être
                      confirmé. Les deux ne peuvent pas coexister sur une même
                      vignette : on ne retient pas ce qui sert déjà. */}
                  {inUse && (
                    <span className={own.mark} aria-hidden>
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className={own.zoom}
                  aria-label={`View ${name} larger`}
                  onClick={() => setPreview(index)}
                >
                  <Expand size={14} strokeWidth={2.4} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {data && shown.length === 0 && (
        <p className="faint">Nothing in this language — try another.</p>
      )}

      {tiles.length > limit && (
        <ShowMore
          onClick={() => setLimit((n) => n + PAGE)}
          loading={false}
          label={`Show more (${tiles.length - limit} left)`}
        />
      )}

      {/* La confirmation. Elle n'apparaît qu'une fois une image retenue, et
          ferme la fenêtre par le bas : c'est la dernière chose qu'on lit. */}
      {staged && (
        <div className={own.confirm}>
          <img className={own.confirmThumb} src={stagedTile?.thumb} alt="" />
          <span className={own.confirmText}>
            Replace the {kind} with {staged.path ? 'this one' : 'the default'}?
          </span>
          <button type="button" className="btn btn--quiet" onClick={() => setDraft(null)}>
            Cancel
          </button>
          <button type="button" className="btn btn--accent" onClick={confirm}>
            <Check size={16} strokeWidth={2.4} aria-hidden />
            Confirm
          </button>
        </div>
      )}

      <Lightbox
        open={shot !== undefined}
        onOpenChange={(next) => !next && setPreview(null)}
        src={shot?.big}
        title={kind === 'poster' ? 'Poster' : 'Backdrop'}
        caption={preview !== null && `${preview + 1} / ${tiles.length}`}
        onPrev={preview !== null && preview > 0 ? () => setPreview(preview - 1) : undefined}
        onNext={
          preview !== null && preview < tiles.length - 1 ? () => setPreview(preview + 1) : undefined
        }
        /* Retenir SANS refermer : on compare en allant et venant entre deux
           images, et se faire éjecter au premier choix casse la comparaison.
           La confirmation attend en dessous, une fois la visionneuse refermée. */
        action={{
          label: `Select this ${kind}`,
          done: shot ? shot.path === current || staged?.path === shot.path : false,
          doneLabel: shot && shot.path === current ? 'In use' : 'Selected',
          onClick: () => shot && stage(shot.path),
        }}
      />
    </>
  );
}
