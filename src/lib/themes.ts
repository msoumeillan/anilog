import type {
  RawAnimeTheme,
  RawAnimeThemes,
  RawAnimeThemesBatch,
  RawArtistScope,
  RawAtGroup,
  RawAtImage,
  RawAtScopedAnime,
  RawRemoteTheme,
} from '../api/animethemes/client';

/**
 * Les openings et endings d'un anime, mis en forme.
 *
 * La réponse d'AnimeThemes est faite pour un catalogue : des titres qui sont
 * des objets, des vidéos derrière une connexion, un artiste répété autant de
 * fois qu'il a de rôles sur la chanson. Ce fichier la ramène à ce que l'écran
 * a besoin de savoir, et rien d'autre.
 *
 * Tout est PUR ici : c'est ce qui rend testable la partie où l'on se trompe
 * vraiment — la lecture des plages d'épisodes.
 */

export interface ThemeVideo {
  link: string;
  /** 1080, 720… `null` quand la fiche ne le dit pas. */
  resolution: number | null;
  /** Sans crédits — la version « propre », sans le générique par-dessus. */
  nc: boolean;
  /** Octets. Affiché AVANT le clic : un opening pèse 60 Mo. */
  size: number | null;
}

export interface ThemeVersion {
  /** 1 quand la fiche ne numérote pas. */
  version: number;
  /** Le texte d'origine : « 1-6 », « 7-8, 10 », parfois rien. */
  episodes: string | null;
  /** Le plus petit épisode de la plage — l'endroit où cette version COMMENCE. */
  start: number | null;
  spoiler: boolean;
  /**
   * Les fichiers de cette version, LA MEILLEURE EN TÊTE.
   *
   * Une liste et non un fichier, depuis qu'on peut choisir : AnimeThemes en
   * publie souvent deux — la diffusion web en 720p, le Blu-ray 1080p sans
   * crédits — et n'en garder qu'un jetait l'information avant même de l'avoir
   * affichée. Ce qu'on JOUE par défaut reste le premier ; le reste est là pour
   * qui veut l'autre.
   */
  videos: ThemeVideo[];
}

/**
 * Les trois familles de générique.
 *
 * `IN` — les chansons d'insert, celles qui passent DANS un épisode — existait
 * déjà chez AnimeThemes et se faisait ranger ici parmi les openings : tout ce
 * qui n'était pas `ED` devenait `OP`. Invisible tant que l'onglet ne montrait
 * que la bibliothèque, le raccourci est devenu un mensonge affiché dès qu'on a
 * ouvert le catalogue entier, où elles sont des milliers.
 */
export type ThemeKind = 'OP' | 'ED' | 'IN';

export interface Theme {
  /** « OP1 », « ED2 », ou un repli construit — sert de clé de rendu. */
  slug: string;
  kind: ThemeKind;
  sequence: number | null;
  title: string;
  artists: string[];
  versions: ThemeVersion[];
}

/**
 * Le premier épisode d'une plage.
 *
 * AnimeThemes écrit des choses comme « 1-6 », « 7-8, 10 », « 13 », et parfois
 * rien du tout. On prend le plus PETIT nombre présent : c'est l'épisode où
 * cette version apparaît, et c'est tout ce dont la liste d'épisodes a besoin
 * pour poser son repère.
 *
 * Rien plutôt qu'un pari quand le texte ne contient aucun nombre : un repère
 * faux serait pire qu'un repère absent — il déplacerait un souvenir.
 */
export function firstEpisode(episodes: string | null | undefined): number | null {
  if (!episodes) return null;
  const nombres = [...episodes.matchAll(/\d+/g)]
    .map((m) => Number(m[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nombres.length > 0 ? Math.min(...nombres) : null;
}

/**
 * Les vidéos d'une version, DE LA MEILLEURE À LA MOINS BONNE.
 *
 * L'ordre : la définition d'abord, puis la version SANS crédits, puis celle qui
 * n'est pas sous-titrée. Un générique incrusté et des sous-titres gravés sont
 * deux couches de texte sur une image qu'on regarde pour l'image.
 *
 * Longtemps cette fonction rendait UNE vidéo — la meilleure —, parce qu'il n'y
 * en a presque toujours qu'une : mesuré sur Assassination Classroom et Attack
 * on Titan, une seule, 1080p Blu-ray. C'était vrai et c'était quand même une
 * perte : [Oshi no Ko] en a deux par version, et l'écran ne pouvait pas les
 * proposer puisqu'on les avait déjà jetées.
 */
function videosTriees(
  nodes: {
    link: string | null;
    resolution: number | null;
    nc: boolean | null;
    subbed: boolean | null;
    size: number | null;
  }[],
): ThemeVideo[] {
  const jouables = nodes.filter((v): v is typeof v & { link: string } => Boolean(v.link));

  const note = (v: (typeof jouables)[number]) =>
    (v.resolution ?? 0) * 10 + (v.nc ? 2 : 0) + (v.subbed ? 0 : 1);

  return [...jouables]
    .sort((a, b) => note(b) - note(a))
    .map((v) => ({
      link: v.link,
      resolution: v.resolution,
      nc: v.nc ?? false,
      size: v.size,
    }));
}

/** Les artistes, sans doublon. */
function artistes(
  performances: { artist: { name: { main: string | null } | null } | null }[] | null | undefined,
): string[] {
  const vus = new Set<string>();
  for (const p of performances ?? []) {
    /* Un artiste revient autant de fois qu'il a de rôles sur la chanson :
       mesuré, cinq fois le même nom sur l'opening d'Assassination Classroom. */
    const nom = p.artist?.name?.main?.trim();
    if (nom) vus.add(nom);
  }
  return [...vus];
}

/**
 * La réponse d'AnimeThemes, ramenée à des thèmes affichables.
 *
 * Ce qui n'a AUCUNE vidéo disparaît : la demande était les vidéos, et une
 * carte qui ne se lit pas est une promesse non tenue.
 *
 * L'ordre est celui de la lecture — les openings d'abord, dans leur ordre
 * d'apparition, puis les endings. AnimeThemes ne le garantit pas.
 */
export function themesOf(brut: RawAnimeThemes | undefined): Theme[] {
  const anime = brut?.findAnimeByExternalSite?.[0];
  return anime ? shapeThemes(anime.animethemes) : [];
}

/**
 * Les themes d'UN anime, mis en forme. Partage entre la fiche et le lot.
 */
function shapeThemes(bruts: RawAnimeTheme[] | null | undefined): Theme[] {
  const out: Theme[] = [];

  for (const t of bruts ?? []) {
    const kind: ThemeKind = t.type === 'ED' ? 'ED' : t.type === 'IN' ? 'IN' : 'OP';

    const versions: ThemeVersion[] = [];
    for (const e of t.animethemeentries ?? []) {
      const videos = videosTriees(e.videos?.nodes ?? []);
      if (videos.length === 0) continue;
      versions.push({
        version: e.version ?? 1,
        episodes: e.episodes ?? null,
        start: firstEpisode(e.episodes),
        spoiler: e.spoiler ?? false,
        videos,
      });
    }
    if (versions.length === 0) continue;

    versions.sort((a, b) => a.version - b.version);

    out.push({
      slug: t.slug ?? `${kind}${t.sequence ?? ''}`,
      kind,
      sequence: t.sequence,
      title: t.song?.title?.romaji?.trim() || 'Untitled',
      artists: artistes(t.song?.performances),
      versions,
    });
  }

  /* Les openings avant les endings, les inserts en dernier, puis par numéro.
     Un ED sans numéro — fréquent quand il n'y en a qu'un — passe en tête de sa
     famille. */
  return out.sort(
    (a, b) => kindRank(a.kind) - kindRank(b.kind) || (a.sequence ?? 0) - (b.sequence ?? 0),
  );
}

/**
 * Un fichier qu'on peut jouer, nommé pour être CHOISI.
 *
 * Le lecteur joue le premier par défaut — la meilleure vidéo de la première
 * version sans spoiler. Les autres existent et valent parfois mieux : la
 * diffusion web garde le générique incrusté, que certains préfèrent au Blu-ray
 * sans crédits, et une version remontée en cours de saison n'est pas celle
 * qu'on a vue.
 */
export interface ThemeSource {
  link: string;
  /** « v2 · 1080p · NC », ce qui tient sur un bouton. */
  label: string;
  /** La plage d'épisodes de la version — « 2-10 », « 11 ». */
  episodes: string | null;
  size: number | null;
}

/**
 * Tous les fichiers d'un générique, à plat.
 *
 * Prend la réponse BRUTE et non un `Theme` : le panneau du lecteur interroge
 * les versions d'un seul générique — voir `THEME_INFO` —, et repasser par la
 * mise en forme complète demanderait d'inventer un type et un titre dont
 * personne n'a besoin ici. La mise en forme des vidéos, elle, reste celle de
 * tout le monde : `shapeThemes`, donc le même ordre et le même tri.
 *
 * À PLAT et non groupés par version, parce que c'est un fichier qu'on choisit,
 * pas une version : demander deux clics — la version, puis la définition — pour
 * un menu qui porte le plus souvent deux lignes serait une hiérarchie posée
 * pour elle-même.
 *
 * Le numéro de version n'apparaît QUE s'il y en a plusieurs : écrire « v1 »
 * partout ailleurs ferait croire à un choix qui n'existe pas.
 */
export function themeSources(
  entries: RawAnimeTheme['animethemeentries'] | undefined,
): ThemeSource[] {
  const [theme] = shapeThemes([
    { type: null, sequence: null, slug: null, song: null, animethemeentries: entries ?? null },
  ]);
  const plusieurs = (theme?.versions.length ?? 0) > 1;
  const out: ThemeSource[] = [];

  for (const v of theme?.versions ?? []) {
    for (const video of v.videos) {
      const morceaux = [
        plusieurs ? `v${v.version}` : null,
        video.resolution ? `${video.resolution}p` : null,
        video.nc ? 'NC' : null,
      ].filter(Boolean);
      out.push({
        link: video.link,
        label: morceaux.join(' · ') || 'Video',
        episodes: v.episodes,
        size: video.size,
      });
    }
  }

  return out;
}

export interface ThemeMark {
  slug: string;
  kind: ThemeKind;
  title: string;
  version: number;
  /** Vrai quand ce n'est pas la première version du thème. */
  isVersion: boolean;
}

/**
 * L'ordre d'écoute : les openings, les endings, les inserts.
 *
 * Un rang nommé plutôt qu'un ternaire : à deux familles il tenait sur une
 * ligne, à trois il devenait illisible, et c'est exactement là qu'on écrit un
 * comparateur faux sans le voir.
 */
export function kindRank(kind: ThemeKind): number {
  return kind === 'OP' ? 0 : kind === 'ED' ? 1 : 2;
}

/**
 * Où chaque version commence, par numéro d'épisode.
 *
 * C'est ce qui permet à la liste des épisodes de dire « à partir d'ici,
 * l'opening change ». Un repère UNIQUEMENT au changement, jamais sur chaque
 * ligne : une pastille répétée sur mille épisodes n'est plus une information,
 * c'est du décor.
 *
 * Les versions sans plage d'épisodes ne posent pas de repère — c'est le cas de
 * la plupart des endings uniques, dont personne n'a saisi la plage.
 */
export function themeMarks(themes: readonly Theme[]): Map<number, ThemeMark[]> {
  const par = new Map<number, ThemeMark[]>();

  for (const t of themes) {
    for (const v of t.versions) {
      if (v.start === null) continue;
      const marque: ThemeMark = {
        slug: t.slug,
        kind: t.kind,
        title: t.title,
        version: v.version,
        isVersion: v.version > 1,
      };
      const liste = par.get(v.start);
      if (liste) liste.push(marque);
      else par.set(v.start, [marque]);
    }
  }

  return par;
}

/** « 66 Mo », pour le dire avant qu'on clique. */
export function weight(size: number | null | undefined): string | null {
  if (!size || size <= 0) return null;
  const mo = size / 1_000_000;
  return mo >= 1000 ? `${(mo / 1000).toFixed(1)} GB` : `${Math.round(mo)} MB`;
}

/**
 * Le lot, range par identifiant AniList.
 *
 * On lit l'identifiant dans les `resources` de chaque anime : la reponse ne
 * dit pas a quelle demande elle repond, et se fier a l'ordre serait un pari.
 *
 * Les anime qu'AnimeThemes ne connait pas ne figurent tout simplement pas dans
 * la reponse. C'est a l'appelant de le remarquer et d'en garder trace, sans
 * quoi ils seraient redemandes a chaque passage — voir `store/themes`.
 */
export function themesByAnilistId(brut: RawAnimeThemesBatch | undefined): Map<number, Theme[]> {
  const par = new Map<number, Theme[]>();

  for (const anime of brut?.findAnimeByExternalSite ?? []) {
    const ressource = (anime.resources?.nodes ?? []).find((r) => r.site === 'ANILIST');
    const id = ressource?.externalId;
    if (typeof id !== 'number' || id <= 0) continue;
    par.set(id, shapeThemes(anime.animethemes));
  }

  return par;
}

/** Un generique venu du catalogue entier, avec l'anime auquel il appartient. */
export interface RemoteTheme {
  anilistId: number;
  anime: string;
  year: number | null;
  /** L'affiche de l'anime, pour la vignette de la ligne. */
  cover: string | null;
  theme: Theme;
}

/**
 * L'image a montrer, parmi celles que le catalogue porte.
 *
 * La PETITE d'abord : c'est une vignette de quarante pixels, et la grande pese
 * dix fois plus pour le meme resultat. Mais on ne la demande pas seule a l'API
 * — mesure : un studio n'a parfois qu'un `LARGE_COVER`, un artiste parfois
 * aucune image. Filtrer la facette dans la requete rendait alors une liste
 * vide la ou une image existait.
 */
export function coverOf(images: { nodes: RawAtImage[] } | null | undefined): string | null {
  const nodes = images?.nodes ?? [];
  const petite = nodes.find((i) => i.facet === 'SMALL_COVER' && i.link);
  const grande = nodes.find((i) => i.link);
  return petite?.link ?? grande?.link ?? null;
}

/**
 * Les resultats d'une recherche ou d'un tirage, mis en forme.
 *
 * Ce qui n'a pas d'identifiant ANILIST est ECARTE, et c'est une decision :
 * sans identite, on ne sait ni ouvrir la fiche ni ranger une note quelque part.
 * Mieux vaut ne pas le montrer que de montrer une ligne sur laquelle aucun
 * geste ne marche.
 */
export function remoteThemes(bruts: RawRemoteTheme[] | null | undefined): RemoteTheme[] {
  const out: RemoteTheme[] = [];

  for (const brut of bruts ?? []) {
    const ressource = (brut.anime?.resources?.nodes ?? []).find((r) => r.site === 'ANILIST');
    const anilistId = ressource?.externalId;
    if (typeof anilistId !== 'number' || anilistId <= 0) continue;

    /* La mise en forme est celle de la fiche, a l'identique : un theme trouve
       par la recherche et le meme theme vu sur sa fiche doivent etre le meme
       objet, sinon les deux ecrans divergeraient. */
    const [theme] = shapeThemes([brut]);
    if (!theme) continue;

    out.push({
      anilistId,
      anime: brut.anime?.title?.romaji?.trim() || `#${anilistId}`,
      year: brut.anime?.year ?? null,
      cover: coverOf(brut.anime?.images),
      theme,
    });
  }

  return out;
}

/**
 * Les generiques d'UNE portee — un anime, un artiste, une serie, un studio.
 *
 * Trois fonctions et non une seule parce que la reponse n'a pas la meme forme
 * selon la racine interrogee ; toutes rendent le MEME objet, et c'est ce qui
 * compte : la liste, le lecteur et la notation ne doivent pas savoir si ce
 * qu'ils manipulent vient d'une recherche, d'un index ou d'un studio.
 */
export function scopedAnimeThemes(anime: RawAtScopedAnime | null | undefined): RemoteTheme[] {
  if (!anime) return [];
  /* On reconstruit une ligne `RawRemoteTheme` en recollant l'anime a chacun de
     ses themes : la portee le donne une fois pour toutes, la mise en forme le
     veut sur chaque theme. Un seul chemin de mise en forme, donc un seul
     endroit ou se tromper. */
  return remoteThemes((anime.animethemes ?? []).map((t) => ({ ...t, anime })));
}

/**
 * Tout ce qu'un artiste a chante.
 *
 * Les doublons sont ecartes : un artiste credite deux fois sur la meme chanson
 * — chanteur et parolier — la ferait apparaitre deux fois dans la file, et la
 * meme chanson peut aussi servir d'opening a deux saisons.
 */
export function artistThemes(raw: RawArtistScope | undefined): RemoteTheme[] {
  const out: RemoteTheme[] = [];
  const vus = new Set<string>();

  for (const p of raw?.artist?.performances ?? []) {
    for (const t of p.song?.animethemes ?? []) {
      const [ligne] = remoteThemes([t]);
      if (!ligne) continue;
      const cle = `${ligne.anilistId}:${ligne.theme.slug}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      out.push(ligne);
    }
  }

  return out;
}

/** Tout ce qu'une serie ou un studio a produit, anime par anime. */
export function groupThemes(group: RawAtGroup | null | undefined): RemoteTheme[] {
  return (group?.anime?.nodes ?? []).flatMap((a) => scopedAnimeThemes(a));
}

/**
 * Les generiques de plusieurs anime, remis dans l'ORDRE D'UNE LISTE.
 *
 * La requete groupee rend les anime dans l'ordre du serveur — mesure sur une
 * page de trente : pas celui demande. La file de lecture, elle, suit ce qu'on
 * voit : Oshi no Ko, puis sa saison 2, puis sa saison 3. Un anime absent de la
 * reponse est saute ; un anime rendu sans avoir ete demande, ignore.
 */
export function themesInOrder(
  anime: RawAtScopedAnime[] | null | undefined,
  slugs: readonly string[],
): RemoteTheme[] {
  const parSlug = new Map<string, RawAtScopedAnime>();
  for (const a of anime ?? []) if (a.slug) parSlug.set(a.slug, a);
  return slugs.flatMap((slug) => scopedAnimeThemes(parSlug.get(slug)));
}
