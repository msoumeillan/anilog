import { Fragment, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { MaybeLink } from './MaybeLink';
import styles from '../pages/Entity.module.css';

/**
 * Description AniList.
 *
 * Le texte arrive en markdown, avec des liens vers d'autres fiches AniList
 * du type `[Fern](https://anilist.co/character/183965/Fern)`. Affichés bruts
 * ils polluent la lecture ; on les convertit donc en navigation interne —
 * cliquer sur « Fern » ouvre la fiche personnage de l'app, pas anilist.co.
 *
 * Les liens vraiment externes restent des liens externes, marqués comme tels.
 */

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** URL AniList → route interne. `undefined` si ce n'est pas une fiche AniList. */
function internalRoute(url: string): string | null | undefined {
  const m = url.match(/anilist\.co\/(character|staff|anime|manga|studio)\/(\d+)/i);
  if (!m) return undefined;
  const kind = m[1]?.toLowerCase();
  const id = m[2];
  if (!kind || !id) return undefined;
  // Le mode manga n'existe pas encore : lien inerte plutôt que page d'erreur.
  if (kind === 'manga') return null;
  return `/${kind}/${id}`;
}

/** Retire les marqueurs d'emphase et de spoiler, garde le texte. */
function clean(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/~!([\s\S]*?)!~/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1$2')
    .trim();
}

function render(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;

  for (const m of text.matchAll(LINK)) {
    /* Les deux groupes sont garantis par LINK ; les valeurs par défaut évitent
       de le promettre au compilateur sans preuve. */
    const [whole = '', label = '', url = ''] = m;
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));

    const route = internalRoute(url);
    if (route === undefined) {
      out.push(
        <a key={i++} href={url} target="_blank" rel="noopener" className={styles.bioLink}>
          {label}
          <ExternalLink size={11} strokeWidth={2} aria-hidden />
        </a>,
      );
    } else {
      out.push(
        <MaybeLink key={i++} to={route} className={styles.bioLink}>
          {label}
        </MaybeLink>,
      );
    }
    last = at + whole.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Bio({ text }: { text: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const body = text ? clean(text) : '';
  if (!body) return null;

  const long = body.length > 420;

  return (
    <>
      <p className={`${styles.bio} ${long && !open ? styles.bioClamped : ''}`}>
        {render(body).map((node, i) => (
          <Fragment key={i}>{node}</Fragment>
        ))}
      </p>
      {long && (
        <button type="button" className={styles.bioToggle} onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  );
}
