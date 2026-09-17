import { describe, expect, it } from 'vitest';
import { firstEpisode, remoteThemes, themeMarks, themesInOrder, themesOf, weight } from './themes';
import type { RawAnimeScopes, RawAnimeThemes } from '../api/animethemes/client';

/**
 * La forme d'AnimeThemes est pleine de nuls déclarés — `sequence` revient bel
 * et bien nul sur un ending unique, mesuré sur Assassination Classroom. Ces
 * tests partent de la forme RÉELLE, pas d'une forme supposée : c'est
 * exactement l'erreur qui avait fait échouer le premier import MyAnimeList.
 */

const video = (
  over: Partial<{ link: string; resolution: number; nc: boolean; size: number }> = {},
) => ({
  link: 'https://v.animethemes.moe/x.webm',
  resolution: 1080,
  nc: true,
  subbed: false,
  size: 66_000_000,
  ...over,
});

const reponse = (animethemes: unknown[]): RawAnimeThemes =>
  JSON.parse(JSON.stringify({ findAnimeByExternalSite: [{ animethemes }] }));

const theme = (over: Record<string, unknown> = {}) => ({
  type: 'OP',
  sequence: 1,
  slug: 'OP1',
  song: { title: { romaji: 'Seishun Satsubatsu-ron' }, performances: [] },
  animethemeentries: [
    { version: 1, episodes: '1-6', spoiler: false, videos: { nodes: [video()] } },
  ],
  ...over,
});

describe('firstEpisode', () => {
  it('prend le plus petit nombre d’une plage', () => {
    expect(firstEpisode('1-6')).toBe(1);
    expect(firstEpisode('7-8')).toBe(7);
    expect(firstEpisode('13')).toBe(13);
    expect(firstEpisode('7-8, 10')).toBe(7);
    // Vu chez eux : une plage écrite à l'envers.
    expect(firstEpisode('12-9')).toBe(9);
  });

  it('ne devine RIEN quand il n’y a pas de nombre', () => {
    /* Un repère faux serait pire qu'un repère absent : il déplacerait un
       souvenir. */
    for (const brut of [null, undefined, '', '-', 'ONA', '0']) {
      expect(firstEpisode(brut), String(brut)).toBeNull();
    }
  });
});

describe('themesOf', () => {
  it('met en forme un thème complet', () => {
    const r = themesOf(reponse([theme()]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      slug: 'OP1',
      kind: 'OP',
      title: 'Seishun Satsubatsu-ron',
      versions: [{ version: 1, episodes: '1-6', start: 1, spoiler: false }],
    });
  });

  it('dédoublonne les artistes', () => {
    /* Mesuré : le même nom cinq fois sur l'opening d'Assassination Classroom,
       une occurrence par rôle. */
    const cinq = Array.from({ length: 5 }, () => ({ artist: { name: { main: 'Utatan' } } }));
    const r = themesOf(reponse([theme({ song: { title: { romaji: 'X' }, performances: cinq } })]));
    expect(r[0]?.artists).toEqual(['Utatan']);
  });

  it('écarte un thème SANS vidéo : la demande était les vidéos', () => {
    const r = themesOf(
      reponse([theme({ animethemeentries: [{ version: 1, videos: { nodes: [] } }] })]),
    );
    expect(r).toEqual([]);
  });

  it('préfère la définition, puis la version sans crédits', () => {
    const r = themesOf(
      reponse([
        theme({
          animethemeentries: [
            {
              version: 1,
              episodes: '1',
              videos: {
                nodes: [
                  video({ resolution: 720, nc: true }),
                  video({ resolution: 1080, nc: false, link: 'https://v/hd.webm' }),
                ],
              },
            },
          ],
        }),
      ]),
    );
    expect(r[0]?.versions[0]?.videos[0]?.link).toBe('https://v/hd.webm');
  });

  it('encaisse les nuls que leur schéma déclare partout', () => {
    // `sequence` nul sur un ending unique : c'est le cas réel, pas un cas d'école.
    const r = themesOf(
      reponse([
        {
          type: 'ED',
          sequence: null,
          slug: 'ED',
          song: null,
          animethemeentries: [
            { version: null, episodes: null, spoiler: null, videos: { nodes: [video()] } },
          ],
        },
      ]),
    );
    expect(r[0]).toMatchObject({ kind: 'ED', title: 'Untitled', slug: 'ED' });
    expect(r[0]?.versions[0]).toMatchObject({ version: 1, start: null, spoiler: false });
  });

  it('range les openings avant les endings', () => {
    const r = themesOf(
      reponse([
        theme({ type: 'ED', slug: 'ED1', sequence: 1 }),
        theme({ type: 'OP', slug: 'OP2', sequence: 2 }),
        theme({ type: 'OP', slug: 'OP1', sequence: 1 }),
      ]),
    );
    expect(r.map((t) => t.slug)).toEqual(['OP1', 'OP2', 'ED1']);
  });

  it('rend une liste vide quand l’anime est inconnu du catalogue', () => {
    expect(themesOf(undefined)).toEqual([]);
    expect(themesOf({ findAnimeByExternalSite: [] })).toEqual([]);
    expect(themesOf({ findAnimeByExternalSite: null })).toEqual([]);
  });
});

describe('themeMarks', () => {
  it('pose un repère au DÉBUT de chaque version, et nulle part ailleurs', () => {
    /* Une pastille répétée sur mille épisodes n'informe plus, elle décore. */
    const themes = themesOf(
      reponse([
        theme({
          animethemeentries: [
            { version: 1, episodes: '1-6', videos: { nodes: [video()] } },
            { version: 2, episodes: '7-8', videos: { nodes: [video()] } },
          ],
        }),
      ]),
    );
    const marks = themeMarks(themes);
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([1, 7]);
    expect(marks.get(7)?.[0]).toMatchObject({ slug: 'OP1', version: 2, isVersion: true });
    expect(marks.get(1)?.[0]?.isVersion).toBe(false);
  });

  it('groupe un opening et un ending qui commencent au même épisode', () => {
    const themes = themesOf(
      reponse([theme({ slug: 'OP1' }), theme({ type: 'ED', slug: 'ED1', sequence: 1 })]),
    );
    expect(
      themeMarks(themes)
        .get(1)
        ?.map((m) => m.slug),
    ).toEqual(['OP1', 'ED1']);
  });

  it('ne pose rien pour une version sans plage d’épisodes', () => {
    const themes = themesOf(
      reponse([theme({ animethemeentries: [{ version: 1, videos: { nodes: [video()] } }] })]),
    );
    expect(themeMarks(themes).size).toBe(0);
  });
});

describe('weight', () => {
  it('dit le poids avant qu’on clique', () => {
    expect(weight(66_000_000)).toBe('66 MB');
    expect(weight(1_200_000_000)).toBe('1.2 GB');
  });

  it('ne dit rien quand la taille est absente', () => {
    for (const v of [null, undefined, 0, -1]) expect(weight(v)).toBeNull();
  });
});

describe('remoteThemes', () => {
  /* La recherche et le tirage rendent des thèmes AVEC leur anime. C'est
     l'identifiant AniList caché dans `resources` qui les rend utilisables. */

  const distant = (over: Record<string, unknown> = {}) => ({
    ...theme(),
    anime: {
      slug: 'tokyo_ghoul',
      title: { romaji: 'Tokyo Ghoul' },
      year: 2014,
      images: { nodes: [{ link: 'https://i/tg-small.avif', facet: 'SMALL_COVER' }] },
      resources: {
        nodes: [
          { site: 'MAL', externalId: 22319 },
          { site: 'ANILIST', externalId: 20605 },
        ],
      },
    },
    ...over,
  });

  it('retrouve l’identifiant AniList dans les ressources', () => {
    const r = remoteThemes([distant()]);
    expect(r[0]).toMatchObject({
      anilistId: 20605,
      anime: 'Tokyo Ghoul',
      year: 2014,
      cover: 'https://i/tg-small.avif',
    });
    expect(r[0]?.theme.slug).toBe('OP1');
  });

  it('ÉCARTE ce qui n’a pas d’identifiant AniList', () => {
    /* Sans identité, on ne sait ni ouvrir la fiche ni ranger une note : une
       ligne sur laquelle aucun geste ne marche vaut mieux absente. */
    const sansAniList = distant({
      anime: {
        slug: 'x',
        title: { romaji: 'X' },
        year: null,
        images: null,
        resources: { nodes: [{ site: 'MAL', externalId: 1 }] },
      },
    });
    expect(remoteThemes([sansAniList])).toEqual([]);
    expect(remoteThemes([distant({ anime: null })])).toEqual([]);
  });

  it('nomme par son identifiant un anime sans titre', () => {
    const r = remoteThemes([
      distant({
        anime: {
          slug: null,
          title: null,
          year: null,
          images: null,
          resources: { nodes: [{ site: 'ANILIST', externalId: 7 }] },
        },
      }),
    ]);
    expect(r[0]?.anime).toBe('#7');
  });

  it('encaisse une réponse vide', () => {
    expect(remoteThemes(null)).toEqual([]);
    expect(remoteThemes(undefined)).toEqual([]);
  });
});

describe('themesInOrder', () => {
  /* La requête groupée d'une page d'anime rend les anime dans l'ordre du
     SERVEUR. La file de lecture, elle, doit suivre la liste affichée. */

  const anime = (slug: string, id: number, generiques: [string, number][]) => ({
    slug,
    title: { romaji: slug },
    year: 2023,
    images: null,
    resources: { nodes: [{ site: 'ANILIST', externalId: id }] },
    animethemes: generiques.map(([type, sequence]) =>
      theme({ type, sequence, slug: `${type}${sequence}` }),
    ),
  });

  /* Un aller-retour JSON, comme une vraie réponse : la forme brute est ce
     qu'on teste, pas un objet déjà typé à la main. */
  const reponseGroupee = (liste: unknown[]): RawAnimeScopes['findAnimeByExternalSite'] =>
    JSON.parse(JSON.stringify(liste));

  const lire = (liste: ReturnType<typeof themesInOrder>) =>
    liste.map((r) => `${r.anime} ${r.theme.slug}`);

  it('remet les anime dans l’ordre de la liste, génériques compris', () => {
    const serveur = reponseGroupee([
      anime('oshi_no_ko_s3', 3, [['OP', 1]]),
      anime('oshi_no_ko', 1, [
        ['OP', 1],
        ['ED', 1],
      ]),
      anime('oshi_no_ko_s2', 2, [['OP', 1]]),
    ]);
    expect(lire(themesInOrder(serveur, ['oshi_no_ko', 'oshi_no_ko_s2', 'oshi_no_ko_s3']))).toEqual([
      'oshi_no_ko OP1',
      'oshi_no_ko ED1',
      'oshi_no_ko_s2 OP1',
      'oshi_no_ko_s3 OP1',
    ]);
  });

  it('saute un anime absent de la réponse, ignore un anime non demandé', () => {
    const serveur = reponseGroupee([
      anime('rendu', 1, [['OP', 1]]),
      anime('en_trop', 2, [['OP', 1]]),
    ]);
    expect(lire(themesInOrder(serveur, ['absent', 'rendu']))).toEqual(['rendu OP1']);
  });

  it('encaisse une réponse vide', () => {
    expect(themesInOrder(null, ['oshi_no_ko'])).toEqual([]);
    expect(themesInOrder(undefined, [])).toEqual([]);
  });
});
