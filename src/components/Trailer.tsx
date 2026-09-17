import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import styles from './Trailer.module.css';

/**
 * Bande-annonce.
 *
 * Façade cliquable plutôt qu'iframe d'emblée : un lecteur YouTube pèse
 * plusieurs centaines de kilo-octets et pose ses traceurs au chargement.
 * Ici on n'affiche qu'une image tant que personne n'a cliqué, et on charge
 * le lecteur sur `youtube-nocookie.com` seulement à ce moment-là.
 */

export interface TrailerProps {
  /** Identifiant de la vidéo chez le fournisseur. */
  id: string;
  /** « youtube », « dailymotion »… */
  site: string;
  thumbnail?: string | null;
  title?: string;
}

export function Trailer({ id, site, thumbnail, title }: TrailerProps) {
  const [playing, setPlaying] = useState(false);
  const [poster, setPoster] = useState<string | null>(null);

  /* AniList renvoie parfois un identifiant sali — celui d'Attack on Titan
     porte une tabulation finale, ce qui produit une URL invalide. */
  const videoId = id.trim();
  if (!videoId) return null;

  const isYouTube = site === 'youtube';
  const watchUrl = isYouTube
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://www.dailymotion.com/video/${videoId}`;

  // maxresdefault est en 16/9 ; la vignette fournie par AniList est en 4/3.
  const initialPoster =
    poster ??
    (isYouTube ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : (thumbnail ?? null));

  if (!isYouTube) {
    return (
      <a className={styles.fallback} href={watchUrl} target="_blank" rel="noopener">
        <Play size={16} strokeWidth={2} aria-hidden />
        Watch the trailer on {site}
        <ExternalLink size={13} strokeWidth={1.8} aria-hidden className={styles.out} />
      </a>
    );
  }

  if (playing) {
    return (
      <div className={styles.frame}>
        <iframe
          className={styles.iframe}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title ? `${title} — trailer` : 'Trailer'}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button type="button" className={styles.facade} onClick={() => setPlaying(true)}>
      {initialPoster && (
        <img
          className={styles.poster}
          src={initialPoster}
          alt=""
          loading="lazy"
          /* maxresdefault n'existe pas pour toutes les vidéos : on retombe
             alors sur la vignette qu'AniList nous a donnée. */
          onError={() => setPoster(thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)}
        />
      )}
      <span className={styles.veil} />
      <span className={styles.play}>
        <Play size={22} strokeWidth={2.2} aria-hidden />
      </span>
      <span className={styles.caption}>Play trailer</span>
    </button>
  );
}
