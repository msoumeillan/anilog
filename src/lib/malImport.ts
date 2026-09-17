import type { MediaType, TrackStatus } from '../types/library';

/**
 * L'export MyAnimeList, lu.
 *
 * MAL rend un XML — souvent gzippé — depuis « Export your list ». Un fichier
 * par média : la liste d'anime et celle de manga s'exportent séparément, et
 * `user_export_type` dit laquelle on tient (1 = anime, 2 = manga).
 *
 * Ce fichier ne fait QUE lire. Le pont vers AniList — les identifiants de MAL
 * ne sont pas les nôtres — et l'écriture dans la bibliothèque sont ailleurs :
 * une analyse qui ne demande rien au réseau se teste, et c'est là que se
 * cachent les pièges de format.
 */

export interface MalEntry {
  /** L'identifiant MyAnimeList. Il faudra le traduire — voir l'import. */
  malId: number;
  title: string;
  status: TrackStatus;
  /** 1 à 10. Absente quand MAL écrit 0, qui veut dire « pas noté ». */
  score?: number;
  episodes?: number;
  chapters?: number;
  volumes?: number;
  /** Total annoncé par MAL, utile quand AniList ne le connaît pas. */
  total?: number;
  startedAt?: string;
  finishedAt?: string;
  tags: string[];
  /** Le commentaire personnel de MAL — notre « review ». */
  comments?: string;
  /** Nombre de revisionnages déclaré. Zéro la plupart du temps. */
  rewatched?: number;
}

export interface MalExport {
  media: MediaType;
  entries: MalEntry[];
  /** Le pseudo MAL, quand le fichier le porte. */
  username?: string;
}

export type MalParse = { ok: true; export: MalExport } | { ok: false; raison: string };

/**
 * Les statuts de MAL vers les nôtres.
 *
 * Écrits en toutes lettres dans l'export — « Plan to Watch », « On-Hold » —
 * et pas de la même façon selon le média. La comparaison se fait donc en
 * minuscules, sans tirets ni espaces : c'est ce qui évite qu'un « On Hold »
 * sans tiret, vu dans de vieux exports, tombe à côté.
 */
const STATUTS: Record<string, TrackStatus> = {
  watching: 'current',
  reading: 'current',
  completed: 'completed',
  onhold: 'paused',
  dropped: 'dropped',
  plantowatch: 'planned',
  plantoread: 'planned',
};

function statutDe(brut: string): TrackStatus {
  /* Défaut « planned » plutôt qu'un rejet : un statut inconnu ne doit pas
     faire perdre l'œuvre, et « à voir » est le moins engageant des cinq. */
  return STATUTS[brut.toLowerCase().replace(/[\s-]/g, '')] ?? 'planned';
}

/**
 * Une date de MAL vers une date ISO, ou rien.
 *
 * MAL écrit `0000-00-00` pour « pas de date », et parfois une date partielle
 * comme `2019-00-00`. Les deux passeraient dans `new Date()` en donnant
 * n'importe quoi ; on exige donc les trois nombres.
 *
 * Midi et non minuit : une date à minuit UTC se lit la veille dans la moitié
 * ouest du monde, et le journal l'afficherait un jour trop tôt.
 */
export function malDate(brut: string | null | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((brut ?? '').trim());
  if (!m) return undefined;
  const [, a, mo, j] = m;
  if (a === '0000' || mo === '00' || j === '00') return undefined;
  return `${a}-${mo}-${j}T12:00:00.000Z`;
}

/** Un entier, ou rien. `0` compte comme absent là où MAL s'en sert ainsi. */
function nombre(brut: string | null | undefined, zeroEstVide = false): number | undefined {
  const n = Number((brut ?? '').trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (n === 0 && zeroEstVide) return undefined;
  return n;
}

/**
 * Les cinq entites que XML impose d'echapper. MAL les ecrit toutes.
 */
const ENTITES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/**
 * La valeur d'une balise dans un bloc, ou la chaine vide.
 *
 * Un lecteur de texte plutot que `DOMParser`, et c'est un choix, pas un
 * raccourci : `DOMParser` n'existe pas dans l'environnement de test du projet,
 * et l'analyse d'un fichier d'import est precisement ce qu'il faut pouvoir
 * tester — les pieges y sont tous des pieges de FORMAT.
 *
 * C'est sur, parce que XML l'est : le contenu d'une balise ne peut pas
 * contenir `</balise>`, ni meme dans une section CDATA, qui se termine au
 * premier `]]>`. Le decoupage n'a donc pas d'ambiguite a lever.
 */
function champ(bloc: string, ...noms: string[]): string {
  let brut: string | undefined;
  for (const nom of noms) {
    /* `\\s` et non `\s` : dans un gabarit, `\s` s'évalue en « s » et le motif
       n'accepterait plus que des lettres s. */
    const m = new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`).exec(bloc);
    if (m && m[1] !== undefined) {
      brut = m[1];
      break;
    }
  }
  if (brut === undefined) return '';

  return (
    brut
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITES[e] ?? e)
      /* Les entites numeriques : rares dans un export, presentes des qu'un titre
       porte un caractere que l'outil d'export n'a pas su ecrire tel quel. */
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
      .trim()
  );
}

/** Les blocs `<anime>…</anime>` ou `<manga>…</manga>` d'un export. */
function blocs(xml: string, balise: string): string[] {
  return [...xml.matchAll(new RegExp(`<${balise}>([\\s\\S]*?)</${balise}>`, 'g'))].map(
    (m) => m[1] ?? '',
  );
}

/**
 * Lit un export MAL.
 */
export function parseMalXml(xml: string): MalParse {
  if (!/<myanimelist[\s>]/.test(xml)) {
    return { ok: false, raison: 'This isn’t a MyAnimeList export.' };
  }

  const info = /<myinfo>([\s\S]*?)<\/myinfo>/.exec(xml)?.[1] ?? '';
  const type = champ(info, 'user_export_type');

  const animes = blocs(xml, 'anime');
  const mangas = blocs(xml, 'manga');

  /* Le type annonce fait foi ; a defaut, c'est ce que le fichier contient qui
     tranche. Un export sans `myinfo` existe : certains outils tiers le
     retirent. */
  const media: MediaType =
    type === '2'
      ? 'manga'
      : type === '1'
        ? 'anime'
        : mangas.length > animes.length
          ? 'manga'
          : 'anime';
  const noeuds = media === 'manga' ? mangas : animes;

  const entries: MalEntry[] = [];
  for (const n of noeuds) {
    /* DEUX GRAPHIES, et c'est le piege qui a fait echouer le premier import
       manga : MAL prefixe ses champs par `manga_` dans l'export manga et par
       `series_` dans l'export anime — et de vieux fichiers, ou passes par un
       outil tiers, portent l'autre. On accepte les deux plutot que de parier. */
    const malId = nombre(
      media === 'manga'
        ? champ(n, 'manga_mangadb_id', 'series_mangadb_id')
        : champ(n, 'series_animedb_id', 'anime_animedb_id'),
    );
    if (!malId) continue;

    const titre = champ(n, media === 'manga' ? 'manga_title' : 'series_title', 'series_title');
    const tags = champ(n, 'my_tags')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const commentaire = champ(n, 'my_comments');

    entries.push({
      malId,
      /* Sans titre, l'ecran de rapport ne pourrait pas nommer ce qu'il n'a pas
         su relier : l'identifiant sert de nom de repli. */
      title: titre || `#${malId}`,
      status: statutDe(champ(n, 'my_status')),
      score: nombre(champ(n, 'my_score'), true),
      episodes: media === 'anime' ? nombre(champ(n, 'my_watched_episodes')) : undefined,
      chapters: media === 'manga' ? nombre(champ(n, 'my_read_chapters')) : undefined,
      volumes: media === 'manga' ? nombre(champ(n, 'my_read_volumes')) : undefined,
      total: nombre(
        media === 'manga'
          ? champ(n, 'manga_chapters', 'series_chapters')
          : champ(n, 'series_episodes', 'anime_episodes'),
        true,
      ),
      startedAt: malDate(champ(n, 'my_start_date')),
      finishedAt: malDate(champ(n, 'my_finish_date')),
      tags,
      comments: commentaire || undefined,
      rewatched: nombre(champ(n, media === 'manga' ? 'my_times_read' : 'my_times_watched'), true),
    });
  }

  /* Un fichier qui contient bien des blocs mais dont AUCUN n'a livre son
     identifiant : c'est une graphie qu'on ne connait pas, pas une liste vide.
     Le dire evite de chercher du cote de l'utilisateur un probleme qui est
     ici. */
  if (entries.length === 0 && noeuds.length > 0) {
    return {
      ok: false,
      raison: `${noeuds.length} ${media} found in the file, but not one readable id. The format isn’t the expected one — report it, it is an import bug.`,
    };
  }

  return {
    ok: true,
    export: { media, entries, username: champ(info, 'user_name') || undefined },
  };
}

/**
 * Le contenu d'un fichier d'export, décompressé au besoin.
 *
 * MAL livre un `.xml.gz`, et la plupart des gens le déposent tel quel. Le
 * décompresser dans la page évite de leur demander un outil : `gzip` se
 * reconnaît à ses deux premiers octets, `1f 8b`, plus sûrement qu'à son nom de
 * fichier — un `.xml` peut très bien être un gzip renommé.
 */
export async function readMalFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const tete = new Uint8Array(buffer.slice(0, 2));

  if (tete[0] === 0x1f && tete[1] === 0x8b) {
    const flux = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(flux).text();
  }
  return new TextDecoder().decode(buffer);
}
