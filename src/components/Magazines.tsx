import { Link } from 'react-router-dom';
import { magazineHref } from '../lib/routes';
import type { Magazine } from '../lib/mal';

/**
 * Les magazines, liés à leur page DANS l'app.
 *
 * Sortir vers MyAnimeList était le premier réflexe, et c'était un aveu :
 * AniList n'a pas la notion de sérialisation, donc rien à parcourir de ce
 * côté-ci. Sauf que MyAnimeList sait lister un magazine et qu'AniList sait
 * retrouver une fiche depuis un identifiant MyAnimeList — les deux mis bout à
 * bout, la liste rentre à la maison. Voir `api/magazine/hooks.ts`.
 *
 * Un magazine sans identifiant reste du texte plutôt qu'un lien mort.
 */
export function Magazines({ list }: { list: Magazine[] }) {
  return (
    <>
      {list.map((m, i) => (
        <span key={m.name}>
          {i > 0 && ' · '}
          {m.malId > 0 ? <Link to={magazineHref(m.malId, m.name)}>{m.name}</Link> : m.name}
        </span>
      ))}
    </>
  );
}
