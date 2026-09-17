import { synopsisParagraphs } from '../lib/synopsis';
import styles from './Synopsis.module.css';

/**
 * Le résumé d'une œuvre, en paragraphes.
 *
 * Les trois fiches écrivaient ce bloc chacune de leur côté, et elles avaient
 * fini par diverger : MangaBaka découpait, AniList non. Le texte y arrivait
 * pourtant avec ses sauts — `synopsisText` les recolle avec `\n\n` — mais dans
 * un seul `<p>` sans `white-space`, où ils s'écrasent. Le résumé et sa ligne de
 * source, « Source: VIZ Media », se collaient donc en un pavé.
 *
 * Un composant plutôt qu'une correction en trois endroits : la prochaine
 * décision sur la mise en page du résumé n'aura qu'un seul endroit où se
 * prendre.
 */
export function Synopsis({ text }: { text: string | null | undefined }) {
  const paragraphes = synopsisParagraphs(text);
  if (paragraphes.length === 0) return null;

  return (
    <>
      {paragraphes.map((para, i) => (
        /* L'indice suffit : la liste ne se réordonne jamais et ne porte aucun
           état. Le texte en ferait une clé fragile — deux paragraphes peuvent
           commencer pareil. */
        <p key={i} className={styles.synopsis}>
          {para}
        </p>
      ))}
    </>
  );
}
