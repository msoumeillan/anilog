const BASE = 'https://gw.api.animationdigitalnetwork.fr';

/**
 * Client ADN — Animation Digital Network.
 *
 * Longtemps la seule source de sorties FRANÇAISES que l'app savait atteindre ;
 * c'est LiveChart qui tient ce rôle désormais — voir `api/livechart/client`,
 * qui couvre 75 séries d'une semaine là où ADN en couvre 8. Pour mémoire, ce
 * qui avait été mesuré ailleurs :
 *
 *   animeschedule.net  — CORS refusé depuis le navigateur
 *   Crunchyroll (FR)   — CORS refusé, page comme flux RSS, et leur API demande
 *                        une authentification
 *   Jikan / Tenrai     — donnent le jour de diffusion japonais, rien de français
 *   AniList            — ses liens de streaming ne portent AUCUNE langue :
 *                        mesuré sur une semaine entière, `language` est
 *                        renseigné sur les réseaux sociaux et jamais sur les
 *                        plateformes
 *
 * ADN reste branché comme SECOURS. C'est une API ouverte, qui répond en
 * ~150 ms sans clé avec les en-têtes CORS : si LiveChart — privé, gardé par
 * Cloudflare — tombe, les séries ADN gardent leur heure française. Les deux
 * s'accordent : sur la semaine du 7 septembre 2026, les 8 heures ADN que donne
 * LiveChart sont identiques à la minute à celles-ci. Le titre français de
 * l'épisode, qu'ADN donne aussi, n'est pas affiché : l'interface est en
 * anglais.
 */

/** Une requête toutes les 300 ms : leur API est publique et ne l'a pas demandé. */
const MIN_INTERVAL_MS = 300;

export class AdnError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdnError';
    this.status = status;
  }
}

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

function slot(): Promise<void> {
  const next = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  chain = next.catch(() => {});
  return next;
}

export async function adn<T>(path: string, signal?: AbortSignal): Promise<T> {
  await slot();

  const res = await fetch(BASE + path, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new AdnError(`ADN responded ${res.status}.`, res.status);

  return (await res.json()) as T;
}

/**
 * Une mise en ligne, telle qu'ADN la décrit.
 *
 * Tout est facultatif du point de vue du compilateur : ce qui vient du réseau
 * n'a jamais été vérifié, et le prétendre est la seule vraie erreur possible
 * ici.
 */
export interface AdnVideo {
  id: number | null;
  /** « Épisode 11 ». */
  number: string | null;
  /** « 11 » — le numéro seul, celui qu'on compare. */
  shortNumber: string | null;
  /** Le titre FRANÇAIS de l'épisode. */
  name: string | null;
  /** ISO, heure de mise en ligne en France. */
  releaseDate: string | null;
  /** `vostf`, `vf` — sous-titré ou doublé. */
  languages: string[] | null;
  url: string | null;
  show: {
    id: number | null;
    title: string | null;
    originalTitle: string | null;
    shortTitle: string | null;
    url: string | null;
  } | null;
}

export interface AdnCalendar {
  videos: AdnVideo[] | null;
}
