/**
 * Les requêtes LiveChart.
 *
 * Des FABRIQUES et non des constantes, parce qu'elles sont groupées par alias :
 * une requête porte dix séries, pas une. C'est ce qui garde le calendrier sous
 * le seuil de Cloudflare — voir `client.ts`.
 *
 * Les identifiants passent par des VARIABLES, jamais collés dans le texte : ils
 * viennent du réseau, et une requête ne se construit pas avec ce qu'on n'a pas
 * vérifié.
 *
 * Les alias sont l'identifiant ANILIST — `a21`, `l21` pour One Piece. La
 * réponse se range donc directement dans le vocabulaire de l'app, sans table de
 * correspondance à l'envers.
 */

/**
 * LiveChart refuse toute requête de complexité supérieure à 10 000 — avec
 * « Query has complexity of N », ce qui a permis de MESURER le coût de chaque
 * forme au lieu de le deviner.
 *
 * Une recherche coûte 202 : 53 d'un coup ont été refusées (10 706). Quarante
 * font 8 080.
 */
export const SEARCH_BATCH = 40;

/**
 * Un calendrier coûte environ 860 — 842 mesurés sans `applicableToViewer`,
 * sur 40 séries. Le poids vient de `first` : c'est le nombre de calendriers
 * que LiveChart suppose pour chaque série, et il le multiplie.
 *
 * `first: 20` et pas moins : One Piece en a 17, et ceux qui comptent n'ont
 * aucune raison d'être en tête. Dix séries font ~8 600.
 */
export const SCHEDULES_BATCH = 10;

export interface SearchItem {
  /** L'identifiant AniList, qui sert d'alias. */
  id: number;
  /** Le titre cherché — le romaji d'AniList, le plus proche du leur. */
  title: string;
}

/**
 * Retrouver des séries chez LiveChart.
 *
 * Par le TITRE, parce que c'est la seule entrée qu'offre leur recherche. Mais
 * chaque résultat porte son lien AniList, et c'est LUI qui décide — voir
 * `lib/livechart` : la recherche propose, l'identifiant tranche.
 */
export function searchQuery(items: readonly SearchItem[]): {
  query: string;
  variables: Record<string, string>;
} {
  const decl = items.map((s) => `$t${s.id}: String!`).join(', ');
  const corps = items
    .map((s) => `  a${s.id}: anime(term: $t${s.id}) { nodes { databaseId anilistUrl } }`)
    .join('\n');
  return {
    query: `query LcSearch(${decl}) {\n${corps}\n}`,
    variables: Object.fromEntries(items.map((s) => [`t${s.id}`, s.title])),
  };
}

export interface SchedulesItem {
  /** L'identifiant AniList, qui sert d'alias. */
  id: number;
  /** L'identifiant LiveChart, trouvé par `searchQuery`. */
  lc: string;
}

const RELEASE = 'date timeIsApproximate numberRange { minNumber size }';

/**
 * Les calendriers de sortie de quelques séries.
 *
 * `applicableToViewer` fait le tri géographique à notre place : LiveChart le
 * calcule sur l'adresse de celui qui demande. Pour One Piece, depuis la France,
 * seuls ADN et Crunchyroll en VOSTF sortent sur dix-sept calendriers ; pour
 * Ghost in the Shell, un seul des cinq de Prime Video. Mesuré sans compte : ce
 * champ que la documentation de tiers dit réservé aux comptes répond à tous.
 *
 * `numberRange` rattache une sortie à SON épisode. Sans lui, la VF de
 * l'épisode 13 de Re:Zero, sortie le même jour que la VOSTF du 16, se
 * collerait sur le 16.
 */
export function schedulesQuery(items: readonly SchedulesItem[]): {
  query: string;
  variables: Record<string, string>;
} {
  const decl = items.map((s) => `$i${s.id}: ID!`).join(', ');
  const corps = items
    .map(
      (s) =>
        `  l${s.id}: singleAnime(id: $i${s.id}) { releaseSchedules(first: 20) { nodes { applicableToViewer network { name } tracks { type languageCode } releaseState { nextRelease { ${RELEASE} } previousRelease { ${RELEASE} } } } } }`,
    )
    .join('\n');
  return {
    query: `query LcSchedules(${decl}) {\n${corps}\n}`,
    variables: Object.fromEntries(items.map((s) => [`i${s.id}`, s.lc])),
  };
}
