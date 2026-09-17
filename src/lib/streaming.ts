/**
 * Les épisodes qu'AniList attache à une fiche (`streamingEpisodes`).
 *
 * Ils viennent des plateformes de diffusion, et sur une fiche de SUITE ils
 * listent régulièrement les épisodes de la PREMIÈRE saison — la page
 * Crunchyroll de la franchise commence au début :
 *
 *   Attack on Titan saison 2   12 épisodes annoncés, 25 listés (ceux de la S1)
 *   Jujutsu Kaisen saison 2    23 annoncés, 24 listés
 *   Demon Slayer, arc Quartier 11 annoncés, 26 listés
 *
 * Le nombre est le seul indice fiable : plus d'épisodes listés que la fiche
 * n'en compte, et ce ne sont pas les siens. On préfère alors n'en garder
 * aucun — une autre source prendra le relais — plutôt que d'illustrer une
 * saison avec les images de la précédente.
 *
 * Ce défaut est antérieur à TMDB. Il ne se voyait pas, parce que le reste
 * était vide aussi.
 */

export interface StreamingEpisode {
  title: string | null;
  thumbnail: string | null;
}

export interface StreamingInfo {
  title?: string;
  thumbnail?: string;
}

/** « Episode 12 - Le titre » — le seul format qu'AniList emploie ici. */
const LABEL = /Episode\s+(\d+)\s*[-–]\s*(.*)/i;

/**
 * Indexe les épisodes par numéro, ou renvoie une table vide si le compte
 * trahit une fiche de suite.
 *
 * @param total Nombre d'épisodes de la FICHE, pas de la franchise.
 */
export function indexStreaming(
  episodes: StreamingEpisode[] | undefined,
  total: number,
): Map<number, StreamingInfo> {
  const out = new Map<number, StreamingInfo>();
  if (!episodes?.length) return out;

  // Sans total connu on ne peut rien vérifier : on s'abstient de juger.
  if (total > 0 && episodes.length > total) return out;

  for (const episode of episodes) {
    const m = LABEL.exec(episode.title ?? '');
    if (!m) continue;
    out.set(Number(m[1]), {
      title: m[2]?.trim() || undefined,
      thumbnail: episode.thumbnail ?? undefined,
    });
  }
  return out;
}
