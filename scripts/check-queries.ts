/**
 * Vérifie TOUTES les requêtes GraphQL — AniList, AnimeThemes, LiveChart —
 * contre les API réelles.
 *
 *   node --experimental-strip-types scripts/check-queries.ts
 *
 * À relancer chaque fois qu'on touche à un queries.ts : une requête qui compile
 * n'est pas une requête qui répond. L'audit signale celles qui manquent ici.
 */
import { anilist, AniListError, lastRateLimit } from '../src/api/anilist/client.ts';
import {
  ANIME_DETAIL,
  MANGA_DETAIL,
  BROWSE,
  UP_NEXT,
  CHARACTER_DETAIL,
  STAFF_DETAIL,
  STUDIO_DETAIL,
  AIRING_SCHEDULE,
  CHARACTERS_PAGE,
  STAFF_PAGE,
  CHARACTER_MEDIA_PAGE,
  STAFF_MEDIA_PAGE,
  STAFF_CHARACTERS_PAGE,
  STUDIO_MEDIA_PAGE,
  MAGAZINE_MEDIA,
  MAL_BRIDGE,
  WEEK_SCHEDULE,
  LINK_SOURCES,
  QUICK_SEARCH,
  SEARCH_RESULTS,
  CHARACTER_SEARCH_PAGE,
  STAFF_SEARCH_PAGE,
  STUDIO_SEARCH_PAGE,
} from '../src/api/anilist/queries.ts';
import {
  animeThemes,
  type RawAnimeIndex,
  type RawAnimeScope,
  type RawAnimeScopes,
  type RawAnimeThemes,
  type RawAnimeThemesBatch,
  type RawArtistIndex,
  type RawArtistScope,
  type RawMusicSearch,
  type RawRemoteTheme,
  type RawSeriesIndex,
  type RawSeriesScope,
  type RawStudioIndex,
  type RawStudioScope,
  type RawThemeIndex,
  type RawThemeInfo,
  type RawThemeShuffle,
} from '../src/api/animethemes/client.ts';
import {
  ANIME_INDEX,
  ANIME_SCOPE,
  ANIME_SCOPES,
  ANIME_THEMES,
  ANIME_THEMES_BATCH,
  ARTIST_INDEX,
  ARTIST_SCOPE,
  MUSIC_SEARCH,
  SERIES_INDEX,
  SERIES_SCOPE,
  STUDIO_INDEX,
  STUDIO_SCOPE,
  THEME_INDEX,
  THEME_INFO,
  THEMES_SHUFFLE,
} from '../src/api/animethemes/queries.ts';
import {
  liveChart,
  LiveChartError,
  type RawLcSchedules,
  type RawLcSearch,
} from '../src/api/livechart/client.ts';
import { schedulesQuery, searchQuery } from '../src/api/livechart/queries.ts';

const ok = (s: string) => `  \x1b[32mOK\x1b[0m   ${s}`;
const ko = (s: string) => `  \x1b[31mKO\x1b[0m   ${s}`;
let failures = 0;
let total = 0;

/**
 * Le quota AniList — 30 requetes par minute — est plus petit que ce script.
 * Vingt-trois verifications, dont certaines en tirent plusieurs : il le depasse
 * TOUT SEUL, et rendait alors sept « echecs » qui ne disaient rien du code.
 *
 * Un 429 n'est donc pas un echec ici, c'est une attente : AniList dit lui-meme
 * combien de secondes. On attend, on rejoue — jusqu'a trois fois, parce qu'une
 * seule ne suffisait pas quand plusieurs verifications se suivent —, et le
 * rapport redevient lisible. Un garde-fou qui echoue toujours ne protege de rien.
 */
async function patiente(e: unknown): Promise<boolean> {
  if (!(e instanceof AniListError) || e.status !== 429) return false;
  const secondes = (e.retryAfter ?? 60) + 1;
  console.log(`  \x1b[90m… quota atteint, ${secondes} s d'attente\x1b[0m`);
  await new Promise((r) => setTimeout(r, secondes * 1000));
  return true;
}

async function run(label: string, fn: () => Promise<string[]>) {
  total++;
  const t0 = Date.now();
  try {
    let lines: string[] = [];
    for (let essai = 0; ; essai++) {
      try {
        lines = await fn();
        break;
      } catch (e) {
        if (essai >= 2 || !(await patiente(e))) throw e;
      }
    }
    console.log(`\n▸ ${label}  \x1b[90m(${Date.now() - t0} ms)\x1b[0m`);
    lines.forEach((l) => console.log(ok(l)));
  } catch (e) {
    failures++;
    console.log(`\n▸ ${label}`);
    console.log(ko(e instanceof Error ? e.message : String(e)));
  }
}

const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);

await run('1. Fiche anime — Vinland Saga', async () => {
  const d = await anilist<any>(ANIME_DETAIL, { id: 101348 });
  const m = d.Media;
  return [
    `titre           ${m.title.romaji}  (idMal ${m.idMal})`,
    `format          ${m.format} · ${m.episodes} ép. · ${m.season} ${m.seasonYear}`,
    `score           ${m.averageScore}/100 · ${m.popularity} membres`,
    `studios         ${m.studios.edges
      .filter((e: any) => e.isMain)
      .map((e: any) => e.node.name)
      .join(', ')}`,
    `genres/tags     ${n(m.genres)} genres · ${n(m.tags)} tags`,
    `personnages     ${n(m.characters.edges)} / ~${m.characters.pageInfo.total} (seiyuu : ${m.characters.edges[0]?.voiceActors?.find((v: any) => v.languageV2 === 'Japanese')?.name.full ?? '—'} · FR : ${m.characters.edges[0]?.voiceActors?.find((v: any) => v.languageV2 === 'French')?.name.full ?? 'aucun'})`,
    `staff           ${n(m.staff.edges)} / ~${m.staff.pageInfo.total}`,
    `relations       ${m.relations.edges.map((e: any) => `${e.relationType}:${e.node.type}`).join(' ')}`,
    `recommandations ${n(m.recommendations.edges)}`,
    `épisodes stream ${n(m.streamingEpisodes)} (miniature : ${m.streamingEpisodes[0]?.thumbnail ? 'oui' : 'non'})`,
    `distribution    ${n(m.stats.scoreDistribution)} paliers`,
    `liens externes  ${m.externalLinks.map((l: any) => `${l.type}:${l.site}`).join(' · ')}`,
  ];
});

await run('2. Fiche manga — Vinland Saga', async () => {
  const d = await anilist<any>(MANGA_DETAIL, { id: 30642 });
  const m = d.Media;
  return [
    `titre           ${m.title.romaji}  (idMal ${m.idMal})`,
    `format          ${m.format} · ${m.chapters} ch. · ${m.volumes} tomes · ${m.status}`,
    `pays            ${m.countryOfOrigin}`,
    `score           ${m.averageScore}/100`,
    `staff           ${m.staff.edges.map((e: any) => `${e.node.name.full} (${e.role})`).join(', ')}`,
    `genres/tags     ${n(m.genres)} genres · ${n(m.tags)} tags`,
    `personnages     ${n(m.characters.edges)}`,
    `relations       ${m.relations.edges.map((e: any) => `${e.relationType}:${e.node.type}`).join(' ')}`,
    `distribution    ${n(m.stats.scoreDistribution)} paliers`,
  ];
});

await run('3. Parcourir — seinen 2019, trié par score', async () => {
  const d = await anilist<any>(BROWSE, {
    type: 'ANIME',
    sort: ['SCORE_DESC'],
    genres: ['Drama'],
    seasonYear: 2019,
    perPage: 5,
  });
  const p = d.Page;
  return [
    `pagination      ${p.pageInfo.total} résultats · page ${p.pageInfo.currentPage}/${p.pageInfo.lastPage}`,
    ...p.media.map(
      (m: any) => `                ${String(m.averageScore).padStart(3)} · ${m.title.romaji}`,
    ),
  ];
});

await run('4. File « À voir » — 4 séries suivies', async () => {
  const d = await anilist<any>(UP_NEXT, { ids: [101348, 154587, 171018, 5081] });
  return d.Page.media.map((m: any) => {
    const next = m.nextAiringEpisode
      ? `prochain ép. ${m.nextAiringEpisode.episode} dans ${Math.round(m.nextAiringEpisode.timeUntilAiring / 3600)} h`
      : `terminé (${m.episodes} ép.)`;
    return `${m.title.romaji.padEnd(34)} ${next}`;
  });
});

await run('5. Personnage — Thorfinn', async () => {
  const d = await anilist<any>(CHARACTER_DETAIL, { id: 10138 });
  const c = d.Character;
  const e0 = c.media.edges[0];
  return [
    `nom             ${c.name.full} (${c.name.native})`,
    `favoris         ${c.favourites}`,
    `apparitions     ${n(c.media.edges)} / ~${c.media.pageInfo.total}`,
    `premiere        ${e0?.node.title.romaji} (${e0?.characterRole})`,
    `doubleurs       ${(e0?.voiceActors ?? [])
      .map((v: any) => `${v.name.full} [${v.languageV2}]`)
      .slice(0, 3)
      .join(' · ')}`,
  ];
});

await run('6. Staff — Yuuto Uemura (seiyuu de Thorfinn)', async () => {
  const d = await anilist<any>(STAFF_DETAIL, { id: 118498 });
  const s = d.Staff;
  return [
    `nom             ${s.name.full} (${s.name.native})`,
    `metiers         ${(s.primaryOccupations ?? []).join(', ') || '—'}`,
    `origine         ${s.homeTown ?? '—'} · actif depuis ${s.yearsActive?.[0] ?? '—'}`,
    `oeuvres         ${n(s.staffMedia.edges)} / ~${s.staffMedia.pageInfo.total}`,
    `premier role    ${s.staffMedia.edges[0]?.node.title.romaji} — ${s.staffMedia.edges[0]?.staffRole}`,
    `personnages     ${n(s.characters.nodes)} : ${s.characters.nodes
      .slice(0, 4)
      .map((x: any) => x.name.full)
      .join(', ')}`,
  ];
});

await run('7. Studio — Wit Studio', async () => {
  const d = await anilist<any>(STUDIO_DETAIL, { id: 858 });
  const st = d.Studio;
  return [
    `nom             ${st.name} · studio d'animation : ${st.isAnimationStudio}`,
    `oeuvres         ${n(st.media.nodes)} chargées (suite : ${st.media.pageInfo.hasNextPage})`,
    ...st.media.nodes
      .slice(0, 5)
      .map(
        (m: any) =>
          `                ${String(m.averageScore ?? '--').padStart(3)} · ${m.title.romaji}`,
      ),
  ];
});

await run('8. Calendrier annoncé — One Piece', async () => {
  const d = await anilist<any>(AIRING_SCHEDULE, { id: 21 });
  const slots = d.Page.airingSchedules;
  const premier = slots[0];
  const jour = premier ? new Date(premier.airingAt * 1000).toISOString().slice(0, 10) : '?';
  return [
    `à venir         ${n(slots)} épisodes annoncés`,
    `prochain        ép. ${premier?.episode} le ${jour}`,
  ];
});

/* Les six requêtes paginées. L'app ne les tire jamais seules — toujours à
   partir de la page 2 — donc c'est ici qu'on vérifie qu'elles répondent, et
   surtout qu'elles gardent la FORME attendue par leur `connection` : un
   `edges` devenu `nodes` ne se verrait nulle part ailleurs avant l'écran. */
const pagees: [string, string, Record<string, unknown>, (d: any) => any][] = [
  ['personnages d’un anime', CHARACTERS_PAGE, { id: 16498, page: 2 }, (d) => d.Media.characters],
  ['staff d’un anime', STAFF_PAGE, { id: 16498, page: 2 }, (d) => d.Media.staff],
  [
    'apparitions d’un personnage',
    CHARACTER_MEDIA_PAGE,
    { id: 17, page: 2 },
    (d) => d.Character.media,
  ],
  ['crédits d’un staff', STAFF_MEDIA_PAGE, { id: 95015, page: 2 }, (d) => d.Staff.staffMedia],
  ['rôles d’un staff', STAFF_CHARACTERS_PAGE, { id: 95015, page: 2 }, (d) => d.Staff.characters],
  ['production d’un studio', STUDIO_MEDIA_PAGE, { id: 858, page: 2 }, (d) => d.Studio.media],
];

for (const [label, query, variables, pick] of pagees) {
  await run(`9. Page 2 — ${label}`, async () => {
    const c = pick(await anilist<any>(query, variables));
    const items = c.edges ?? c.nodes;
    if (!Array.isArray(items)) throw new Error('ni edges ni nodes dans la réponse');
    if (typeof c.pageInfo?.hasNextPage !== 'boolean')
      throw new Error('pageInfo.hasNextPage absent');
    return [`${items.length} éléments · suite : ${c.pageInfo.hasNextPage}`];
  });
}

await run('10. Fiches depuis des ids MyAnimeList - Weekly Shounen Jump', async () => {
  /* Le pont qui ramene la liste d'un magazine dans le vocabulaire de l'app.
     Ces cinq-la sont One Piece, Naruto, Death Note, Hunter x Hunter et
     Vagabond ; si `idMal_in` cessait de repondre, la page magazine se
     viderait sans bruit. */
  const ids = [13, 11, 21, 26, 656];
  const d = await anilist<any>(MAGAZINE_MEDIA, { idMal: ids });
  const media = d.Page.media;
  if (media.length !== ids.length)
    throw new Error(`${media.length} fiches pour ${ids.length} identifiants`);
  return [
    `${media.length}/${ids.length} retrouvees · ${media.map((m: any) => m.idMal + ' -> ' + m.id).join(' ')}`,
  ];
});

await run('11. Pont MyAnimeList — import de liste, anime et manga', async () => {
  /* L'import ne porte que des identifiants MAL. Si `idMal_in` cessait de
     répondre pour un des deux médias, l'import ne ramènerait plus rien et
     annoncerait « introuvable » sur toute la liste — un échec silencieux qui
     ressemblerait à un problème chez l'utilisateur. */
  const lignes: string[] = [];

  for (const [type, ids] of [
    ['ANIME', [21, 1535, 5114]],
    ['MANGA', [13, 11, 21]],
  ] as const) {
    const d = await anilist<any>(MAL_BRIDGE, { type, idMal: [...ids] });
    const media = d.Page.media;
    if (media.length !== ids.length)
      throw new Error(`${type} : ${media.length} fiches pour ${ids.length} identifiants`);

    /* Le titre et l'affiche font partie du contrat : sans eux, l'entrée
       importée serait muette dans la bibliothèque. */
    for (const m of media) {
      if (!m.title?.romaji) throw new Error(`${type} : idMal ${m.idMal} sans titre`);
      if (!m.coverImage?.large) throw new Error(`${type} : idMal ${m.idMal} sans affiche`);
    }

    lignes.push(
      `${type} ${media.length}/${ids.length} · ${media.map((m: any) => m.idMal + ' -> ' + m.id).join(' ')}`,
    );
  }

  return lignes;
});

await run('12. Recherche de l en-tete — cinq categories en une requete', async () => {
  /* Quatre termes, chacun attendu dans SA catégorie : si un alias cessait de
     répondre — `studios` renommé, `SEARCH_MATCH` refusé sur le staff —, la
     recherche afficherait « No results » sans rien casser de visible. */
  const attendus: [string, (d: any) => any[], string][] = [
    ['oshi no ko', (d) => d.anime.media, 'OSHI NO KO'],
    ['oshi no ko', (d) => d.manga.media, '[Oshi no Ko]'],
    ['ufotable', (d) => d.studios.studios, 'ufotable'],
    ['Hoshino Ruby', (d) => d.characters.characters, 'Ruby Hoshino'],
    ['Miyazaki', (d) => d.staff.staff, 'Hayao Miyazaki'],
  ];
  const reponses = new Map<string, any>();
  const lignes: string[] = [];

  for (const [terme, categorie, nom] of attendus) {
    if (!reponses.has(terme))
      reponses.set(terme, await anilist<any>(QUICK_SEARCH, { search: terme }));
    const items = categorie(reponses.get(terme));
    const noms = items.map(
      (x: any) => x.title?.english ?? x.title?.romaji ?? x.name?.full ?? x.name,
    );
    if (!noms.includes(nom))
      throw new Error(`« ${terme} » : ${nom} absent (${noms.join(', ') || 'rien'})`);
    lignes.push(`« ${terme} »`.padEnd(18) + ` ${nom} parmi ${items.length}`);
  }

  const ruby = reponses
    .get('Hoshino Ruby')
    .characters.characters.find((c: any) => c.name.full === 'Ruby Hoshino');
  /* L'œuvre d'un personnage fait partie du contrat : c'est elle qui distingue
     les homonymes dans le panneau. */
  if (!ruby.media.nodes[0]?.title) throw new Error('Ruby Hoshino sans oeuvre');
  lignes.push(`personnage       Ruby Hoshino — ${ruby.media.nodes[0].title.romaji}`);

  /* Les synonymes des mangas aussi : c'est par eux que le panneau garde
     Attack on Titan sur « snk », qu'aucun de ses titres ne contient. */
  const snk = await anilist<any>(QUICK_SEARCH, { search: 'snk' });
  const aot = snk.manga.media.find((m: any) => m.synonyms?.includes('SnK'));
  if (!aot) throw new Error('« snk » : aucun manga ne porte le synonyme SnK');
  lignes.push(`synonyme         SnK — ${aot.title.english ?? aot.title.romaji}`);
  return lignes;
});

await run('12 bis. Page de tous les resultats — premiere page, puis la suite', async () => {
  /* « miyazaki » remplit personnages et staff au-delà d'une page : la
     première page doit annoncer la suite, et les requêtes de suite rendre la
     même forme — un `staff` devenu `nodes` ne se verrait qu'à l'écran, au clic
     sur « Show more ». */
  const d = await anilist<any>(SEARCH_RESULTS, { search: 'miyazaki' });
  const lignes = ['anime', 'manga', 'characters', 'staff', 'studios'].map((k) => {
    const c = d[k];
    const liste = c.media ?? c[k];
    if (!Array.isArray(liste)) throw new Error(`${k} : pas de liste`);
    if (typeof c.pageInfo?.hasNextPage !== 'boolean') throw new Error(`${k} : pageInfo absent`);
    return `${k.padEnd(11)} ${liste.length} · suite : ${c.pageInfo.hasNextPage}`;
  });
  if (!d.characters.pageInfo.hasNextPage || !d.staff.pageInfo.hasNextPage)
    throw new Error('« miyazaki » devrait avoir une page 2 de personnages et de staff');
  /* Les synonymes des mangas de la page 1 : ils reconnaissent les séries de
     MangaBaka trouvées par une abréviation. `null` est une réponse, un champ
     absent non. */
  if (!d.manga.media.every((m: any) => m.synonyms === null || Array.isArray(m.synonyms)))
    throw new Error('manga : synonymes absents');

  const suites: [string, string, string, (r: any) => any[]][] = [
    ['personnages', CHARACTER_SEARCH_PAGE, 'miyazaki', (r) => r.Page.characters],
    ['staff', STAFF_SEARCH_PAGE, 'miyazaki', (r) => r.Page.staff],
    ['studios', STUDIO_SEARCH_PAGE, 'studio', (r) => r.Page.studios],
  ];
  for (const [label, requete, terme, liste] of suites) {
    const r = await anilist<any>(requete, { search: terme, page: 2 });
    const items = liste(r);
    if (!Array.isArray(items) || items.length === 0) throw new Error(`${label} : page 2 vide`);
    if (typeof r.Page.pageInfo?.hasNextPage !== 'boolean')
      throw new Error(`${label} : pageInfo absent`);
    lignes.push(
      `page 2 ${label.padEnd(12)} ${items.length} · ${items[0].name?.full ?? items[0].name}`,
    );
  }
  return lignes;
});

await run('17. Semaine de diffusion — les sept prochains jours', async () => {
  const from = Math.floor(Date.now() / 1000);
  const d = await anilist<any>(WEEK_SCHEDULE, { start: from, end: from + 7 * 86400 });
  const slots = d.Page.airingSchedules;
  return [
    `diffusions      ${slots.length} (page suivante : ${d.Page.pageInfo.hasNextPage ? 'oui' : 'non'})`,
    ...slots
      .slice(0, 3)
      .map(
        (s: any) =>
          `${new Date(s.airingAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}  ${s.media.title.romaji} EP${s.episode} · ${s.media.format} · ${(s.media.externalLinks ?? []).filter((l: any) => l.type === 'STREAMING').length} plateforme(s)`,
      ),
  ];
});

await run('17 bis. Plateformes de streaming — logos du calendrier', async () => {
  const d = await anilist<any>(LINK_SOURCES, {});
  const sources = d.ExternalLinkSourceCollection ?? [];
  /* Les quatre plateformes françaises qu'AniList connaît : si l'une perdait son
     icône, sa carte repasserait au nom écrit sans que rien ne casse. */
  const attendues = ['Crunchyroll', 'Netflix', 'Prime Video', 'Disney Plus'];
  const manquantes = attendues.filter((a) => !sources.some((s: any) => s.site === a && s.icon));
  if (manquantes.length) throw new Error(`sans icône : ${manquantes.join(', ')}`);
  return [`plateformes     ${sources.length} · ${attendues.join(', ')} ont leur icône`];
});

/* AnimeThemes, et pas AniList : la seule requete de l'app qui parle a un autre
   service. Elle est ici parce qu'elle PEUT etre verifiee — leur endpoint
   repond a node, contrairement a AniList qui rend 403 hors navigateur.

   On lit la reponse BRUTE plutot que de passer par `themesOf` : ce script
   verifie une REQUETE contre le schema vivant, la mise en forme a ses propres
   tests. Importer `src/lib` ici l'entrainerait dans la resolution de modules
   des scripts, qui exige des extensions que l'app n'ecrit pas. */
await run('18. Openings & endings — Assassination Classroom', async () => {
  const d = await animeThemes<RawAnimeThemes>(ANIME_THEMES, { id: [20755] });
  const themes = d.findAnimeByExternalSite?.[0]?.animethemes ?? [];
  return [
    `themes          ${themes.length} (${themes.map((t) => t.slug).join(', ')})`,
    ...themes.map((t) => {
      const v = t.animethemeentries?.[0]?.videos?.nodes?.[0];
      const noms = new Set(
        (t.song?.performances ?? []).map((p) => p.artist?.name?.main).filter(Boolean),
      );
      return `${(t.slug ?? '?').padEnd(4)}            ${t.song?.title?.romaji ?? '?'} — ${[...noms].join(', ') || 'artiste inconnu'} · ${t.animethemeentries?.length ?? 0} version(s) · ${v?.resolution ?? '?'}p · ${Math.round((v?.size ?? 0) / 1e6)} Mo`;
    }),
    `plages          ${themes
      .flatMap((t) => (t.animethemeentries ?? []).map((e) => e.episodes))
      .filter(Boolean)
      .join(' | ')}`,
  ];
});

await run('18 bis. Generiques de la bibliotheque, par lot — deux anime d un coup', async () => {
  /* La source « My library » de Musiques : les generiques de tout ce qu'on
     suit, par lots. La reponse ne dit PAS a quel identifiant demande chaque
     anime correspond — c'est `resources` qui le dit, et sans lui le lot ne se
     range nulle part. Absente de ce script jusqu'a l'audit du 14 septembre
     2026 : elle marchait, mais rien ne l'aurait signale le jour ou non. */
  const ids = [20755, 150672];
  const d = await animeThemes<RawAnimeThemesBatch>(ANIME_THEMES_BATCH, { id: ids });
  const rendus = (d.findAnimeByExternalSite ?? []).map((a) => ({
    id: (a.resources?.nodes ?? []).find((r) => r.site === 'ANILIST')?.externalId ?? null,
    themes: (a.animethemes ?? []).map((t) => t.slug).join(', '),
  }));
  const perdus = ids.filter((id) => !rendus.some((r) => r.id === id));
  if (perdus.length > 0)
    throw new Error(`sans ressource AniList, impossible a ranger : ${perdus.join(', ')}`);
  return rendus.map((r) => `AniList ${String(r.id).padEnd(8)} ${r.themes}`);
});

/* L'onglet Musiques parle a AnimeThemes par NEUF requetes : une recherche, un
   tirage, cinq index et quatre portees. Elles sont ici parce que deux d'entre
   elles ont deja piege, et qu'aucune ne se verifie en compilant :

     `type` est une LISTE — `[ThemeType!]` — sur le tirage, et un scalaire sur
     l'index. Ecrit en dur dans une requete, GraphQL convertit `OP` en `[OP]`
     sans rien dire ; passe par une variable, il refuse.

     un filtre absent doit etre ABSENT DE L'OBJET. Mesure du 12 septembre 2026 :
     `season: null` passe par variable rend zero resultat au lieu de tout. C'est
     `indexVariables` qui construit les variables ici comme dans l'app — ce que
     ce fichier verifie donc aussi. */
const nomme = (t: RawRemoteTheme) =>
  `${(t.slug ?? '?').padEnd(4)} ${t.song?.title?.romaji ?? '?'} — ${t.anime?.title?.romaji ?? '?'} (${t.anime?.year ?? '?'})`;

/** Un nom, cadre a la meme largeur pour que les listes se lisent en colonne. */
const cadre = (nom: string | null | undefined) => (nom ?? '?').padEnd(34).slice(0, 34);

await run('19. Recherche generale — « unravel »', async () => {
  const d = await animeThemes<RawMusicSearch>(MUSIC_SEARCH, {
    q: 'unravel',
    first: 5,
    page: 1,
    themes: true,
    anime: false,
    artists: false,
    series: false,
    studios: false,
  });
  const themes = d.search?.animethemes ?? [];
  /* Les `@include` : seule la section demandee doit revenir. Une section de
     plus, et chaque recherche ramenerait quatre listes que personne ne lit. */
  const sections = Object.keys(d.search ?? {});
  return [
    `resultats       ${themes.length} · sections rendues : ${sections.join(', ') || 'aucune'}`,
    ...themes.slice(0, 3).map(nomme),
  ];
});

await run('20. Generiques — tirage au hasard, et index trie', async () => {
  const tire = await animeThemes<RawThemeShuffle>(THEMES_SHUFFLE, { type: ['OP'], first: 5 });
  const themes = tire.animethemeShuffle ?? [];
  const tousOP = themes.every((t) => t.type === 'OP');

  const index = await animeThemes<RawThemeIndex>(THEME_INDEX, {
    type: 'ED',
    sort: ['SONG_TITLE_ROMAJI'],
    first: 5,
    page: 1,
  });
  const page = index.animethemePagination;
  const tousED = (page?.data ?? []).every((t) => t.type === 'ED');

  return [
    `tires           ${themes.length}${tousOP ? ' — tous des openings' : ' — ATTENTION : pas que des OP'}`,
    ...themes.slice(0, 2).map(nomme),
    `index           ${page?.data?.length ?? 0} sur ${page?.paginatorInfo?.total ?? '?'}${tousED ? ' — tous des endings' : ' — ATTENTION : pas que des ED'}`,
    ...(page?.data ?? []).slice(0, 2).map(nomme),
  ];
});

await run('21. Index du catalogue — anime, artistes, series, studios', async () => {
  /* Les filtres poses sont ceux de l'ecran : une lettre, une saison, une annee.
     Noter ce qui n'est PAS ecrit — aucun `format: null` : un filtre absent doit
     etre absent de l'objet, et c'est ce que `indexVariables` garantit dans
     l'app. Le controle en est fait plus bas. */
  const anime = await animeThemes<RawAnimeIndex>(ANIME_INDEX, {
    letter: 'o%',
    season: 'SPRING',
    year: 2023,
    sort: ['TITLE_ROMAJI'],
    first: 5,
    page: 1,
  });
  const artistes = await animeThemes<RawArtistIndex>(ARTIST_INDEX, {
    letter: 'y%',
    sort: ['NAME_MAIN'],
    first: 3,
    page: 1,
  });
  const series = await animeThemes<RawSeriesIndex>(SERIES_INDEX, {
    letter: 'm%',
    sort: ['TITLE_ROMAJI'],
    first: 3,
    page: 1,
  });
  const studios = await animeThemes<RawStudioIndex>(STUDIO_INDEX, {
    letter: 'a%',
    sort: ['NAME'],
    first: 3,
    page: 1,
  });

  const premier = anime.animePagination?.data?.[0];
  const image = (premier?.images?.nodes ?? []).some((i) => i.link);
  const surAniList = (premier?.resources?.nodes ?? []).some((r) => r.site === 'ANILIST');

  return [
    `anime           ${anime.animePagination?.data?.length ?? 0} sur ${anime.animePagination?.paginatorInfo?.total ?? '?'} — O…, printemps 2023`,
    ...(anime.animePagination?.data ?? [])
      .slice(0, 2)
      .map(
        (a) =>
          `${cadre(a.title?.romaji)} ${a.formatLocalized ?? '?'} · ${a.seasonLocalized ?? '?'} ${a.year ?? '?'} · ${a.animethemes?.length ?? 0} generiques`,
      ),
    `affiche + id    ${image ? 'image OK' : 'AUCUNE IMAGE'} · ${surAniList ? 'AniList OK' : 'PAS D IDENTIFIANT ANILIST'}`,
    `artistes        ${artistes.artistPagination?.data?.length ?? 0} sur ${artistes.artistPagination?.paginatorInfo?.total ?? '?'} — ${(artistes.artistPagination?.data ?? []).map((a) => a.name?.main).join(', ')}`,
    `series          ${series.seriesPagination?.data?.length ?? 0} sur ${series.seriesPagination?.paginatorInfo?.total ?? '?'} — ${(series.seriesPagination?.data ?? []).map((x) => x.name).join(', ')}`,
    `studios         ${studios.studioPagination?.data?.length ?? 0} sur ${studios.studioPagination?.paginatorInfo?.total ?? '?'} — ${(studios.studioPagination?.data ?? []).map((x) => `${x.name} (${x.anime?.pageInfo?.total ?? '?'})`).join(', ')}`,
  ];
});

await run('21 bis. Le piege du filtre nul — un index sans filtre rend TOUT', async () => {
  /* Mesure du 12 septembre 2026, et raison d'etre de `indexVariables` : une
     saison passee a `null` par variable ne veut pas dire « pas de filtre » chez
     eux, elle veut dire « la saison vaut nul » — et rend zero resultat. Le jour
     ou ils corrigeront ce comportement, cette verification le dira. */
  const sansFiltre = await animeThemes<RawAnimeIndex>(ANIME_INDEX, {
    sort: ['YEAR_DESC'],
    first: 1,
    page: 1,
  });
  const avecUnNul = await animeThemes<RawAnimeIndex>(ANIME_INDEX, {
    season: null,
    sort: ['YEAR_DESC'],
    first: 1,
    page: 1,
  });

  const tout = sansFiltre.animePagination?.paginatorInfo?.total ?? 0;
  const nul = avecUnNul.animePagination?.paginatorInfo?.total ?? 0;
  if (tout < 1000)
    throw new Error(`index sans filtre : ${tout} anime, le catalogue en a des milliers`);

  return [
    `sans filtre     ${tout} anime`,
    `season: null    ${nul}${nul === 0 ? ' — piege toujours actif, on continue de l omettre' : ' — leur API accepte desormais le nul'}`,
  ];
});

await run('22. Portees — un anime, un artiste, une serie, un studio', async () => {
  /* Celle de l'anime sert DEUX ecrans : la portee ouverte depuis le lecteur, et
     la table depliee sous une ligne d'index — d'ou les plages d'episodes et les
     definitions, qui s'y ecrivent avant le clic. La serie manquait ici
     jusqu'a l'audit du 14 septembre 2026. */
  const anime = await animeThemes<RawAnimeScope>(ANIME_SCOPE, { slug: 'oshi_no_ko' });
  const artiste = await animeThemes<RawArtistScope>(ARTIST_SCOPE, { slug: 'yoasobi', first: 60 });
  const serie = await animeThemes<RawSeriesScope>(SERIES_SCOPE, { slug: 'oshi_no_ko', first: 5 });
  const studio = await animeThemes<RawStudioScope>(STUDIO_SCOPE, {
    slug: 'a_1_pictures',
    first: 5,
  });
  if (!serie.series) throw new Error('la serie oshi_no_ko est introuvable');

  const chansons = (artiste.artist?.performances ?? []).flatMap((p) => p.song?.animethemes ?? []);
  const duStudio = (studio.studio?.anime?.nodes ?? []).flatMap((a) => a.animethemes ?? []);

  return [
    `${cadre(anime.anime?.title?.romaji)} ${anime.anime?.animethemes?.length ?? 0} generiques`,
    ...(anime.anime?.animethemes ?? []).map((t) => {
      const e = t.animethemeentries?.[0];
      const v = e?.videos?.nodes?.[0];
      return `${(t.slug ?? '?').padEnd(4)} ${cadre(t.song?.title?.romaji)} ep. ${e?.episodes ?? '—'} · ${v?.resolution ?? '?'}p · ${Math.round((v?.size ?? 0) / 1e6)} Mo`;
    }),
    `${cadre(serie.series.name)} ${serie.series.anime?.pageInfo?.total ?? '?'} anime : ${(serie.series.anime?.nodes ?? []).map((a) => `${a.slug} (${a.animethemes?.length ?? 0})`).join(', ')}`,
    `${cadre(artiste.artist?.name?.main)} ${chansons.length} generiques`,
    ...chansons
      .slice(0, 2)
      .map(
        (t) =>
          `${(t.slug ?? '?').padEnd(4)} ${t.song?.title?.romaji ?? '?'} — ${t.anime?.title?.romaji ?? '?'}`,
      ),
    `${cadre(studio.studio?.name)} ${duStudio.length} generiques sur ${studio.studio?.anime?.nodes?.length ?? 0} anime (catalogue : ${studio.studio?.anime?.pageInfo?.total ?? '?'})`,
    ...(studio.studio?.anime?.nodes ?? [])
      .slice(0, 2)
      .map(
        (a) => `${cadre(a.title?.romaji)} ${(a.animethemes ?? []).map((t) => t.slug).join(', ')}`,
      ),
  ];
});

await run('22 bis. D ou vient un generique — Tokyo Ghoul OP1', async () => {
  /* Le panneau du lecteur agrandi. Interroge par identifiant ANILIST et non par
     slug : un generique de la bibliotheque ne connait que celui-la. Les deux
     alias du meme champ — le decompte et la chanson en cours — sont ce que
     GraphQL refuserait sans les nommer. */
  const d = await animeThemes<RawThemeInfo>(THEME_INFO, { id: [20605], slug: 'OP1' });
  const a = d.findAnimeByExternalSite?.[0];
  if (!a) throw new Error('AnimeThemes ne connait pas l anime 20605');

  const artistes = (a.current?.[0]?.song?.performances ?? [])
    .map((p) => p.artist?.name?.main)
    .filter(Boolean);

  return [
    `${cadre(a.title?.romaji)} ${a.formatLocalized ?? '?'} · ${a.seasonLocalized ?? '?'} ${a.year ?? '?'} · ${a.themeCount?.length ?? 0} generiques`,
    `series          ${(a.series?.nodes ?? []).map((x) => x.name).join(', ') || 'aucune'}`,
    `studios         ${(a.studios?.nodes ?? []).map((x) => x.name).join(', ') || 'aucun'}`,
    `interpretes     ${artistes.join(', ') || 'aucun'}`,
    /* Les fichiers proposes au choix dans le lecteur : leur nombre depend de la
       version ET de la definition, et c'est tout l'interet du menu. */
    `fichiers        ${(a.current?.[0]?.animethemeentries ?? [])
      .map(
        (e) =>
          `v${e.version ?? 1} (${(e.videos?.nodes ?? []).map((v) => `${v.resolution ?? '?'}p${v.nc ? ' NC' : ''}`).join(', ')})`,
      )
      .join(' · ')}`,
  ];
});

await run('22 ter. Toute une page d anime d un coup — la recherche « oshi no ko »', async () => {
  /* La file d'une table depliee : les generiques de chaque anime de la page, en
     une requete par identifiants AniList. Le serveur les rend dans SON ordre —
     d'ou la remise en ordre par slug, dont on verifie ici qu'elle a de quoi
     travailler : chaque slug demande doit revenir. */
  const page = await animeThemes<RawMusicSearch>(MUSIC_SEARCH, {
    q: 'oshi no ko',
    first: 30,
    page: 1,
    themes: false,
    anime: true,
    artists: false,
    series: false,
    studios: false,
  });
  const lignes = (page.search?.anime ?? []).map((a) => ({
    slug: a.slug,
    id: (a.resources?.nodes ?? []).find((r) => r.site === 'ANILIST')?.externalId ?? null,
  }));
  const ids = lignes.flatMap((l) => (typeof l.id === 'number' ? [l.id] : []));
  if (ids.length === 0)
    throw new Error('la recherche ne rend aucun anime avec un identifiant AniList');

  const d = await animeThemes<RawAnimeScopes>(ANIME_SCOPES, { id: ids });
  const rendus = d.findAnimeByExternalSite ?? [];
  const manquants = lignes
    .filter((l) => typeof l.id === 'number')
    .filter((l) => !rendus.some((a) => a.slug === l.slug))
    .map((l) => l.slug);
  if (manquants.length > 0)
    throw new Error(`anime demandes mais absents : ${manquants.join(', ')}`);

  return [
    `page            ${lignes.map((l) => l.slug).join(', ')}`,
    `rendus          ${rendus.map((a) => a.slug).join(', ')}`,
    ...rendus.map(
      (a) =>
        `${cadre(a.title?.romaji)} ${(a.animethemes ?? []).map((t) => `${t.slug} ${t.song?.title?.romaji ?? '?'}`).join(' · ')}`,
    ),
  ];
});

/* LiveChart : les heures de sortie francaises du calendrier. Pas d'introspection
   chez eux — le schema vient d'une documentation de tiers —, donc c'est ICI
   qu'on apprend qu'un champ a disparu, pas sur une carte vide.

   Cloudflare garde leur API et bloque les clients qui ne sont pas des
   navigateurs apres quelques requetes : un 403 dit alors « a verifier depuis
   l'app », pas « requete cassee ». */
const horsNavigateur = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof LiveChartError && e.status === 403) {
      throw new Error('403 — défi Cloudflare hors navigateur : à vérifier depuis l’app');
    }
    throw e;
  }
};

await run('23. LiveChart — retrouver One Piece par son titre', async () => {
  const { query, variables } = searchQuery([{ id: 21, title: 'ONE PIECE' }]);
  const d = await horsNavigateur(liveChart<RawLcSearch>(query, variables));
  const nodes = d.a21?.nodes ?? [];
  /* Le lien AniList tranche, pas le rang : « One Piece » rend aussi ses films
     et son remake. `(?!\d)` : 21 n'est pas 210. */
  const bon = nodes.find((x) => /anilist\.co\/anime\/21(?!\d)/.test(x.anilistUrl ?? ''));
  if (!bon) throw new Error(`aucun des ${nodes.length} résultats ne pointe vers AniList 21`);
  return [`résultats       ${nodes.length} · One Piece = LiveChart ${bon.databaseId}`];
});

await run('24. LiveChart — sorties françaises de One Piece', async () => {
  const { query, variables } = schedulesQuery([{ id: 21, lc: '321' }]);
  const d = await horsNavigateur(liveChart<RawLcSchedules>(query, variables));
  const nodes = d.l21?.releaseSchedules?.nodes ?? [];
  if (nodes.length === 0) throw new Error('aucun calendrier de sortie');
  /* `applicableToViewer` depend de l'adresse de la machine : depuis la France,
     ADN et Crunchyroll en VOSTF. Ailleurs, la liste change, et c'est normal. */
  const ici = nodes.filter((n) => n.applicableToViewer === true);
  const fr = ici.filter((n) =>
    (n.tracks ?? []).some((t) => /^fr(-fr)?$/i.test(t.languageCode ?? '')),
  );
  return [
    `calendriers     ${nodes.length} · disponibles ici : ${ici.length} · en français : ${fr.length}`,
    ...fr.map((n) => {
      const r = n.releaseState?.nextRelease ?? n.releaseState?.previousRelease;
      return `${(n.network?.name ?? 'TV').padEnd(26)} EP${r?.numberRange?.minNumber ?? '?'} · ${r?.date ?? '—'}`;
    }),
  ];
});

console.log(
  `\n\x1b[90mquota AniList : ${lastRateLimit.remaining ?? '?'}/${lastRateLimit.limit ?? '?'} restantes\x1b[0m`,
);
console.log(
  failures === 0
    ? `\n\x1b[32m${total}/${total} requêtes valides.\x1b[0m\n`
    : `\n\x1b[31m${failures} échec(s) sur ${total}.\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
