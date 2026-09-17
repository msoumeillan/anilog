import { isSongKey, parseSongKey, songKey } from './ids';
import type { PlayableSong } from '../store/player';
import type { SongJudgement } from '../store/songs';
import { kindRank, type RemoteTheme, type Theme, type ThemeKind } from './themes';
import type { LibraryEntry } from '../types/library';

/**
 * La bibliothèque, vue comme une liste de chansons.
 *
 * Le croisement se fait ICI et pas dans la page : filtrer et trier deux mille
 * lignes est exactement le genre de code qu'on croit trivial et qu'on écrit de
 * travers. Pur, donc testable.
 */

export interface SongRow extends PlayableSong {
  /** L'année de sortie de l'anime, quand la bibliothèque la connaît. */
  year?: number;
  /**
   * L'affiche de l'anime — la vignette de la ligne.
   *
   * Elle ne vient pas du même endroit selon la provenance : de la copie locale
   * pour la bibliothèque, du catalogue d'AnimeThemes pour tout le reste. La
   * ligne, elle, n'a pas à le savoir.
   */
  cover?: string | null;
  score?: number;
  favourite: boolean;
}

/**
 * Une ligne par générique de la bibliothèque.
 *
 * On part des ENTRÉES et non du catalogue : le catalogue peut contenir des
 * anime qu'on ne suit plus — on ne l'élague pas, un cache n'a pas à l'être —
 * et l'onglet ne doit montrer que ce qu'on suit.
 *
 * Une seule vidéo par générique, celle de la première version. Les autres
 * versions restent sur la fiche, avec leur plage d'épisodes : ici on écoute,
 * là-bas on regarde le détail.
 */
export function buildSongs(
  entries: readonly LibraryEntry[],
  themesFor: (anilistId: number) => readonly Theme[],
  judgements: Readonly<Record<string, SongJudgement>>,
): SongRow[] {
  const rows: SongRow[] = [];

  for (const e of entries) {
    if (e.media !== 'anime') continue;
    const id = e.ids.anilist;
    if (typeof id !== 'number' || id <= 0) continue;

    for (const t of themesFor(id)) {
      const lien = t.versions[0]?.videos[0]?.link;
      if (!lien) continue;

      const key = songKey(id, t.slug);
      const avis = judgements[key];
      rows.push({
        key,
        anilistId: id,
        slug: t.slug,
        kind: t.kind,
        title: t.title,
        artists: t.artists,
        anime: e.title,
        link: lien,
        year: e.seasonYear,
        cover: e.cover ?? null,
        score: avis?.score,
        favourite: Boolean(avis?.favourite),
      });
    }
  }

  return rows;
}

export type SongKind = 'all' | ThemeKind;
export type SongSort = 'found' | 'anime' | 'title' | 'score' | 'year';

const LABELS: Record<SongSort, string> = {
  found: 'As found',
  anime: 'By anime',
  title: 'Song A–Z',
  score: 'My score',
  year: 'Release year',
};

/**
 * Les tris proposés, selon d'où vient la liste.
 *
 * Deux différences, et chacune a sa raison :
 *
 *   « As found » n'existe QUE sur une liste distante, et y est le défaut. Sur
 *   une recherche, l'ordre du serveur est la PERTINENCE — c'est lui qui met
 *   « unravel » de Tokyo Ghoul avant les vingt titres qui contiennent
 *   « travel ». Le remplacer d'office par l'alphabet perdrait la seule chose
 *   que le serveur sait et que nous ne savons pas.
 *
 *   « My score » n'existe QUE sur une liste locale. Trier trente résultats
 *   distants par une note qu'on n'a donnée à aucun d'eux rangerait tout dans
 *   le même sac, ce qui ressemble à une panne.
 */
export function songSorts(remote: boolean): { value: SongSort; label: string }[] {
  const ordre: SongSort[] = remote
    ? ['found', 'anime', 'title', 'year']
    : ['anime', 'title', 'score', 'year'];
  return ordre.map((value) => ({ value, label: LABELS[value] }));
}

/** Le tri par défaut, qui n'est pas le même des deux côtés — voir `songSorts`. */
export function defaultSongSort(remote: boolean): SongSort {
  return remote ? 'found' : 'anime';
}

/** Une valeur venue de l'URL est-elle un tri connu ici ? `null` sinon. */
export function asSongSort(value: string | null | undefined, remote = false): SongSort | null {
  return songSorts(remote).find((s) => s.value === value)?.value ?? null;
}

export interface SongFilters {
  kind: SongKind;
  favouritesOnly: boolean;
  /** Texte libre : titre de chanson, d'anime, ou nom d'artiste. */
  q: string;
}

/**
 * Le filtre.
 *
 * La recherche porte sur les TROIS champs qu'on a en tête quand on cherche un
 * générique : son titre, l'anime, l'artiste. Ne chercher que dans le titre
 * obligerait à se souvenir du nom japonais de la chanson, ce que personne ne
 * fait.
 */
export function filterSongs(rows: readonly SongRow[], f: SongFilters): SongRow[] {
  const q = f.q.trim().toLowerCase();

  return rows.filter((r) => {
    if (f.kind !== 'all' && r.kind !== f.kind) return false;
    if (f.favouritesOnly && !r.favourite) return false;
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.anime.toLowerCase().includes(q) ||
      r.artists.some((a) => a.toLowerCase().includes(q))
    );
  });
}

const parTitre = (a: SongRow, b: SongRow) =>
  a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Le tri.
 *
 * Deux règles, les mêmes que pour la bibliothèque — voir `libraryOrder` :
 * à égalité on départage par titre, et ce qui n'a pas la valeur demandée va à
 * la FIN. Une chanson sans note n'est pas une chanson mal notée.
 *
 * « By anime » groupe par série ET garde l'ordre des génériques à l'intérieur :
 * OP1, OP2, ED1. C'est l'ordre dans lequel on les a entendus.
 */
export function sortSongs(rows: readonly SongRow[], tri: SongSort): SongRow[] {
  const copie = [...rows];

  switch (tri) {
    case 'found':
      /* L'ordre de la source, intact. La copie sert quand même : l'appelant ne
         doit pas recevoir le tableau qu'il nous a donné. */
      return copie;

    case 'title':
      return copie.sort(parTitre);

    case 'score':
      return copie.sort((a, b) => {
        if (a.score === undefined && b.score === undefined) return parTitre(a, b);
        if (a.score === undefined) return 1;
        if (b.score === undefined) return -1;
        return b.score - a.score || parTitre(a, b);
      });

    case 'year':
      return copie.sort((a, b) => {
        if (a.year === undefined && b.year === undefined) return parTitre(a, b);
        if (a.year === undefined) return 1;
        if (b.year === undefined) return -1;
        return b.year - a.year || a.anime.localeCompare(b.anime) || ordreGenerique(a, b);
      });

    case 'anime':
    default:
      return copie.sort(
        (a, b) =>
          a.anime.localeCompare(b.anime, undefined, { numeric: true, sensitivity: 'base' }) ||
          ordreGenerique(a, b),
      );
  }
}

/** OP1, OP2, puis ED1, puis les inserts : l'ordre dans lequel on les entend. */
function ordreGenerique(a: SongRow, b: SongRow): number {
  return (
    kindRank(a.kind) - kindRank(b.kind) ||
    a.slug.localeCompare(b.slug, undefined, { numeric: true })
  );
}

// ─────────────────────────────────────────────────────────────
//  Ce que la page Stats en tire
// ─────────────────────────────────────────────────────────────

export interface SongStats {
  total: number;
  rated: number;
  favourites: number;
  /** Sur 10, une décimale. `null` quand rien n'est noté. */
  mean: number | null;
}

export function songStats(rows: readonly SongRow[]): SongStats {
  let somme = 0;
  let rated = 0;
  let favourites = 0;

  for (const r of rows) {
    if (r.favourite) favourites += 1;
    if (typeof r.score === 'number' && r.score >= 1 && r.score <= 10) {
      somme += r.score;
      rated += 1;
    }
  }

  return {
    total: rows.length,
    rated,
    favourites,
    mean: rated > 0 ? Math.round((somme / rated) * 10) / 10 : null,
  };
}

export interface ArtistCount {
  artist: string;
  count: number;
  /** La moyenne des notes de SES chansons. `null` si aucune n'est notée. */
  mean: number | null;
}

/**
 * Les interprètes les plus présents, et la note qu'on leur donne.
 *
 * Les COMPOSITEURS seraient plus intéressants — c'est souvent le même homme
 * derrière trente génériques qu'on aime sans le savoir — mais AnimeThemes ne
 * les porte pas. AniSongDB si ; le jour où on le branchera à côté, c'est la
 * première chose qu'il apportera.
 *
 * Une chanson compte pour CHACUN de ses interprètes : un duo compte deux fois,
 * et la somme dépasse le nombre de chansons. Même raisonnement que les genres.
 */
export function topArtists(rows: readonly SongRow[], limit = 10): ArtistCount[] {
  const par = new Map<string, { count: number; somme: number; notes: number }>();

  for (const r of rows) {
    for (const brut of r.artists) {
      const nom = brut.trim();
      if (!nom) continue;
      const acc = par.get(nom) ?? { count: 0, somme: 0, notes: 0 };
      acc.count += 1;
      if (typeof r.score === 'number' && r.score >= 1 && r.score <= 10) {
        acc.somme += r.score;
        acc.notes += 1;
      }
      par.set(nom, acc);
    }
  }

  return [...par.entries()]
    .map(([artist, a]) => ({
      artist,
      count: a.count,
      mean: a.notes > 0 ? Math.round((a.somme / a.notes) * 10) / 10 : null,
    }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist))
    .slice(0, limit);
}

/** Le podium : les mieux notées, les non notées exclues. */
export function bestSongs(rows: readonly SongRow[], limit = 5): SongRow[] {
  return sortSongs(
    rows.filter((r) => typeof r.score === 'number'),
    'score',
  ).slice(0, limit);
}

// ─────────────────────────────────────────────────────────────
//  Ce qui vient du catalogue entier
// ─────────────────────────────────────────────────────────────

/**
 * Les résultats d'une recherche ou d'un tirage, en lignes affichables.
 *
 * Même forme que celles de la bibliothèque, à dessein : la liste, le lecteur et
 * la notation ne doivent pas savoir d'où vient ce qu'ils manipulent. Seule la
 * PROVENANCE change, pas l'objet.
 */
/**
 * La version qu'on JOUE — et celle dont on annonce la plage d'épisodes.
 *
 * La première SANS spoiler, la première tout court à défaut. L'index général ne
 * sait pas écarter les spoilers côté serveur — seul le tirage le fait —, et un
 * générique de fin de série montre souvent la fin de la série. Rien plutôt
 * qu'un choix : une ligne dont toutes les versions spoilent reste jouable, on
 * ne la met simplement plus en avant.
 *
 * Exportée parce que DEUX écrans doivent répondre pareil : celui qui joue, et
 * celui qui écrit « ep. 1-11 · 1080p » sous une affiche. La même règle à deux
 * endroits est une divergence qui attend son heure.
 */
export function playableVersion(theme: Theme): Theme['versions'][number] | undefined {
  return theme.versions.find((v) => !v.spoiler) ?? theme.versions[0];
}

export function rowsFromRemote(
  remote: readonly RemoteTheme[],
  judgements: Readonly<Record<string, SongJudgement>>,
): SongRow[] {
  const rows: SongRow[] = [];

  for (const r of remote) {
    const version = playableVersion(r.theme);
    const lien = version?.videos[0]?.link;
    if (!lien) continue;

    const key = songKey(r.anilistId, r.theme.slug);
    const avis = judgements[key];
    rows.push({
      key,
      anilistId: r.anilistId,
      slug: r.theme.slug,
      kind: r.theme.kind,
      title: r.theme.title,
      artists: r.theme.artists,
      anime: r.anime,
      link: lien,
      year: r.year ?? undefined,
      cover: r.cover,
      score: avis?.score,
      favourite: Boolean(avis?.favourite),
    });
  }

  return rows;
}

/**
 * Les favoris, d'où qu'ils viennent.
 *
 * La bibliothèque d'abord — elle a le titre à jour et la vraie année — puis
 * l'instantané pris au moment où on a mis l'étoile. C'est ce qui permet de
 * garder un favori d'une série qu'on ne suit pas : sans lui, l'étoile
 * existerait sur le disque et l'écran n'aurait rien à montrer.
 */
export function favouriteRows(
  judgements: Readonly<Record<string, SongJudgement>>,
  fromLibrary: readonly SongRow[],
): SongRow[] {
  const connues = new Map(fromLibrary.map((r) => [r.key, r]));
  const rows: SongRow[] = [];

  for (const [key, avis] of Object.entries(judgements)) {
    if (!avis.favourite) continue;
    /* Les clés viennent du disque : `isSongKey` est un prédicat, pas un cast.
       Ce qui ne ressemble pas à une clé de chanson n'en est pas une, et on ne
       le promet pas au compilateur. */
    if (!isSongKey(key)) continue;

    const dansLaBibliotheque = connues.get(key);
    if (dansLaBibliotheque) {
      rows.push(dansLaBibliotheque);
      continue;
    }

    const snap = avis.snapshot;
    /* Un favori d'avant l'instantané, ou d'une œuvre retirée : on ne l'invente
       pas. Il reste sur le disque, et `orphanFavourites` dit où le retrouver. */
    if (!snap) continue;
    rows.push({ ...snap, key, score: avis.score, favourite: true });
  }

  return rows;
}

/**
 * Les anime des favoris qu'on ne sait pas afficher : sans instantané, et
 * absents de la bibliothèque.
 *
 * Ce sont eux qu'il faut redemander au catalogue. Mesuré : l'étoile du lecteur
 * posait ses favoris sans instantané, et Favourites affichait « 0 starred » sur
 * une table qui en contenait. Triés, pour qu'un même ensemble donne la même
 * requête — et le même cache.
 */
export function orphanFavourites(
  judgements: Readonly<Record<string, SongJudgement>>,
  fromLibrary: readonly SongRow[],
): number[] {
  const connues = new Set<string>(fromLibrary.map((r) => r.key));
  const ids = new Set<number>();

  for (const [key, avis] of Object.entries(judgements)) {
    if (!avis.favourite || avis.snapshot || connues.has(key)) continue;
    const cle = parseSongKey(key);
    if (cle) ids.add(cle.anilistId);
  }

  return [...ids].sort((a, b) => a - b);
}
