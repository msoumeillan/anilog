import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useLibrary } from '../store/library';
import { useBrowseInfinite } from '../api/anilist/hooks';
import { pickable } from '../lib/lists';
import { entryKey } from '../lib/ids';
import { displayTitle } from '../lib/title';
import type { EntryKey, MediaType, WorkSnapshot } from '../types/library';
import styles from '../pages/library/Library.module.css';

/**
 * Choisir des titres à ajouter quelque part.
 *
 * Les listes et les tier lists posent exactement la même question ; deux
 * copies de ce sélecteur auraient divergé au premier ajustement, et c'est la
 * façon dont la v1 est morte.
 *
 * DEUX SOURCES, et l'ordre compte. Ce qu'on suit d'abord, sans réseau et sans
 * attente — c'est de là que vient la plupart de ce qu'on range. Le catalogue
 * ensuite, pour tout le reste : une liste « à voir un jour » n'a par
 * définition rien de suivi dedans, et s'en tenir à la bibliothèque rendait
 * l'écran inutile pour ce cas-là.
 *
 * Une œuvre venue du catalogue emporte son titre et son affiche — voir
 * `WorkSnapshot`. Sans cette copie, la liste n'aurait rien à montrer d'une
 * œuvre qu'on ne suit pas.
 */

/** Ce qu'un choix rend : la clé, et sa copie de secours si elle en a besoin. */
export interface PickedTitle {
  key: EntryKey;
  snapshot?: WorkSnapshot;
}

/**
 * Attente avant d'interroger AniList.
 *
 * 350 ms : le temps d'une frappe, pas celui d'une hésitation. Sans elle, taper
 * « chainsaw » lance huit requêtes sur un quota de trente par minute.
 */
const ATTENTE = 350;

export function TitlePicker({
  ouvert,
  media,
  deja,
  onAdd,
  onClose,
}: {
  ouvert: boolean;
  media: MediaType;
  /** Ce qui est déjà pris : on ne le propose plus. */
  deja: readonly EntryKey[];
  onAdd: (choix: PickedTitle) => void;
  onClose: () => void;
}) {
  const entries = useLibrary((s) => s.entries);
  const [q, setQ] = useState('');
  const [differe, setDiffere] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDiffere(q.trim()), ATTENTE);
    return () => clearTimeout(t);
  }, [q]);

  const pris = useMemo(() => new Set(deja), [deja]);
  const suivis = pickable(entries, media, deja, q);

  /* Le catalogue n'est interrogé qu'à partir de deux caractères, et seulement
     quand la fenêtre est ouverte : une seule lettre ramène tout et rien. */
  const assez = differe.length >= 2;
  const recherche = useBrowseInfinite(
    {
      type: media === 'manga' ? 'MANGA' : 'ANIME',
      perPage: 30,
      sort: ['SEARCH_MATCH'],
      search: differe,
    },
    ouvert && assez,
  );

  const catalogue = (recherche.data?.pages[0]?.media ?? [])
    .map((m) => ({
      key: entryKey(media, m.id),
      title: displayTitle(m.title),
      cover: m.coverImage.large ?? undefined,
    }))
    /* Ni ce qui est déjà pris, ni ce que la colonne du dessus montre déjà :
       le même titre deux fois dans une liste de choix fait douter. */
    .filter((m) => !pris.has(m.key) && !entries[m.key]);

  return (
    <Modal
      open={ouvert}
      onOpenChange={(o) => !o && onClose()}
      title="Add titles"
      subtitle="Your library first, the catalogue next"
      wide
    >
      <div className={styles.editor}>
        <input
          className={styles.input}
          value={q}
          placeholder={`Search ${media}`}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
        />

        <div className={styles.candidats}>
          {suivis.length > 0 && <p className="label">In your library</p>}
          {suivis.slice(0, 40).map((e) => (
            <Choix
              key={e.key}
              titre={e.title}
              cover={e.cover}
              onClick={() => onAdd({ key: e.key })}
            />
          ))}

          {assez && <p className="label">Catalogue</p>}
          {assez && recherche.isPending && <p className="faint">Searching…</p>}
          {assez && recherche.error && <p className="muted">Couldn’t reach AniList.</p>}
          {assez &&
            catalogue.map((m) => (
              <Choix
                key={m.key}
                titre={m.title}
                cover={m.cover}
                onClick={() =>
                  /* La copie de secours part AVEC l'ajout : cette œuvre n'est
                     pas suivie, rien d'autre ne saura la nommer. */
                  onAdd({ key: m.key, snapshot: { title: m.title, cover: m.cover } })
                }
              />
            ))}

          {suivis.length === 0 && !assez && (
            <p className="muted">
              {q ? 'Nothing you track matches.' : 'Type two letters to search.'}
            </p>
          )}
          {assez && !recherche.isPending && catalogue.length === 0 && (
            <p className="muted">Nothing else in the catalogue.</p>
          )}
        </div>

        <div className={styles.dialogActions}>
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Une proposition. La fenêtre reste ouverte après un clic : on en met
 * plusieurs à la suite, et le titre choisi quitte la liste, ce qui suffit à
 * dire que c'est fait.
 */
function Choix({
  titre,
  cover,
  onClick,
}: {
  titre: string;
  cover: string | undefined;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.candidat} onClick={onClick}>
      <span className="poster">{cover ? <img src={cover} alt="" loading="lazy" /> : <span />}</span>
      <span className={styles.candidatNom}>{titre}</span>
    </button>
  );
}
