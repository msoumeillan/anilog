/**
 * La seule requête AnimeThemes.
 *
 * `findAnimeByExternalSite` prend une LISTE d'identifiants et rend un tableau
 * — on ne lui en donne qu'un ici, mais c'est ce qui permettra un jour une page
 * qui balaie la bibliothèque sans une requête par titre.
 *
 * Deux formes du schéma valent d'être signalées, parce qu'elles surprennent :
 * les titres sont des objets (`title { romaji }`, `name { main }`) et les
 * vidéos passent par une connexion (`videos { nodes { … } }`).
 *
 * `size` est demandé exprès : un opening pèse une soixantaine de méga-octets
 * en 1080p Blu-ray, et l'écran l'affiche avant qu'on clique.
 */
export const ANIME_THEMES = /* GraphQL */ `
  query AnimeThemes($id: [Int!]) {
    findAnimeByExternalSite(site: ANILIST, id: $id) {
      animethemes {
        type
        sequence
        slug
        song {
          title {
            romaji
          }
          performances {
            artist {
              name {
                main
              }
            }
          }
        }
        animethemeentries {
          version
          episodes
          spoiler
          videos {
            nodes {
              link
              resolution
              nc
              subbed
              size
            }
          }
        }
      }
    }
  }
`;

/**
 * La meme chose, pour PLUSIEURS anime a la fois.
 *
 * `resources` est demande ici et pas dans la requete d'une fiche : la reponse
 * ne dit PAS a quel identifiant demande chaque anime correspond, et sans ce
 * retour on ne saurait pas quoi ranger ou. C'est aussi ce qui permet de noter
 * « cet anime n'a aucun generique chez eux » plutot que de le redemander a
 * chaque ouverture.
 */
export const ANIME_THEMES_BATCH = /* GraphQL */ `
  query AnimeThemesBatch($id: [Int!]) {
    findAnimeByExternalSite(site: ANILIST, id: $id) {
      resources {
        nodes {
          site
          externalId
        }
      }
      animethemes {
        type
        sequence
        slug
        song {
          title {
            romaji
          }
          performances {
            artist {
              name {
                main
              }
            }
          }
        }
        animethemeentries {
          version
          episodes
          spoiler
          videos {
            nodes {
              link
              resolution
              nc
              subbed
              size
            }
          }
        }
      }
    }
  }
`;

/**
 * L'IDENTITE d'un anime : de quoi le nommer, l'illustrer, et l'ouvrir.
 *
 * `resources(site: ANILIST)` est indispensable partout ou un theme se note :
 * sans l'identifiant AniList, on ne sait ni ouvrir la fiche, ni fabriquer la
 * cle sous laquelle la note sera rangee. Un generique sans identite ne se note
 * pas — voir `remoteThemes`.
 *
 * Le filtre `site:` se fait cote serveur : un anime porte une dizaine de
 * ressources externes — MAL, Kitsu, AniDB, ANN, le site officiel… — et nous
 * n'en lisons qu'une. `site` reste demande pour que la reponse dise laquelle.
 *
 * Les images ne sont PAS filtrees par facette, et c'est mesure : un studio n'a
 * parfois qu'un `LARGE_COVER`, un artiste parfois aucune image. Demander
 * `facet: SMALL_COVER` rendrait une liste vide plutot qu'une vignette un peu
 * plus lourde — le choix se fait donc a l'arrivee, dans `lib/musicBrowse`.
 */
const ANIME_REF = `
  slug
  title { romaji }
  year
  images { nodes { link facet } }
  resources(site: ANILIST) { nodes { site externalId } }
`;

/** Un generique seul : sa chanson, ses versions, ses videos. */
const THEME_SEUL = `
  slug
  type
  sequence
  song {
    title { romaji }
    performances { artist { name { main } } }
  }
  animethemeentries {
    version
    episodes
    spoiler
    videos { nodes { link resolution nc subbed size } }
  }
`;

/** Le meme, avec l'anime auquel il appartient — une ligne se lit sans contexte. */
const THEME_AVEC_ANIME = `
  ${THEME_SEUL}
  anime { ${ANIME_REF} }
`;

/** Une ligne d'index d'anime : l'identite, plus « TV · Spring 2023 · 2 themes ». */
const CARTE_ANIME = `
  ${ANIME_REF}
  seasonLocalized
  formatLocalized
  animethemes { id }
`;

const CARTE_ARTISTE = `
  slug
  name { main }
  images { nodes { link facet } }
`;

const CARTE_SERIE = `
  slug
  name
  anime { pageInfo { total } }
`;

const CARTE_STUDIO = `
  ${CARTE_SERIE}
  images { nodes { link facet } }
`;

/**
 * La recherche, qui repond pour TOUTES les categories d'un coup.
 *
 * Une seule requete la ou l'on pourrait en ecrire cinq, et ce n'est pas de
 * l'economie : leur `search` interroge un index unique, et le decouper en cinq
 * appels donnerait cinq fois la meme attente pour la meme reponse.
 *
 * Les `@include` servent l'autre moitie : quand une seule categorie est
 * ouverte, on ne rapatrie pas les quatre autres. Une section ABSENTE de la
 * reponse n'est donc pas une section vide — c'est une section qu'on n'a pas
 * demandee, et `lib/musicBrowse` fait la difference.
 *
 * `animethemePagination(search:)` aurait permis de filtrer et trier cote
 * serveur, ce que celle-ci ne fait pas. Mesure du 12 septembre 2026 : elle rend
 * ZERO resultat sur « unravel », et « Internal server error » des qu'on lui
 * passe la recherche par variable. C'est donc `search` qui cherche, et
 * `animethemePagination` qui parcourt — chacune ce qu'elle sait faire.
 */
export const MUSIC_SEARCH = /* GraphQL */ `
  query MusicSearch(
    $q: String!
    $first: Int
    $page: Int
    $themes: Boolean!
    $anime: Boolean!
    $artists: Boolean!
    $series: Boolean!
    $studios: Boolean!
  ) {
    search(search: $q, first: $first, page: $page) {
      animethemes @include(if: $themes) { ${THEME_AVEC_ANIME} }
      anime @include(if: $anime) { ${CARTE_ANIME} }
      artists @include(if: $artists) { ${CARTE_ARTISTE} }
      series @include(if: $series) { ${CARTE_SERIE} }
      studios @include(if: $studios) { ${CARTE_STUDIO} }
    }
  }
`;

/**
 * Les INDEX : parcourir le catalogue quand on ne cherche rien de precis.
 *
 * `paginatorInfo.total` est ce que la recherche ne sait pas dire, et c'est lui
 * qui permet d'ecrire « 1 — 25 sur 214 » plutot qu'un bouton « suivant » qui
 * pourrait ne mener nulle part.
 *
 * La premiere lettre passe par `_like` et un motif SQL — « a% ». Leur API n'a
 * pas de filtre alphabetique ; celui-la en tient lieu et se comporte comme on
 * l'attend, y compris sur les titres qui commencent par un chiffre.
 */
export const ANIME_INDEX = /* GraphQL */ `
  query AnimeIndex(
    $letter: String
    $season: AnimeSeason
    $year: Int
    $format: AnimeFormat
    $sort: [AnimeSort!]
    $first: Int
    $page: Int
  ) {
    animePagination(
      titleRomaji_like: $letter
      season: $season
      year: $year
      format: $format
      sort: $sort
      first: $first
      page: $page
    ) {
      paginatorInfo { total hasMorePages }
      data { ${CARTE_ANIME} }
    }
  }
`;

/**
 * L'index des generiques.
 *
 * Pas de premiere lettre ici, et ce n'est pas un oubli : le titre d'une chanson
 * vit dans une AUTRE table que le generique, et leur filtre `_like` ne la
 * traverse pas. Le type et le tri, eux, sont bien du ressort du generique —
 * c'est ce qu'on peut demander honnetement.
 */
export const THEME_INDEX = /* GraphQL */ `
  query ThemeIndex($type: ThemeType, $sort: [AnimeThemeSort!], $first: Int, $page: Int) {
    animethemePagination(type: $type, sort: $sort, first: $first, page: $page) {
      paginatorInfo { total hasMorePages }
      data { ${THEME_AVEC_ANIME} }
    }
  }
`;

export const ARTIST_INDEX = /* GraphQL */ `
  query ArtistIndex($letter: String, $sort: [ArtistSort!], $first: Int, $page: Int) {
    artistPagination(nameMain_like: $letter, sort: $sort, first: $first, page: $page) {
      paginatorInfo { total hasMorePages }
      data { ${CARTE_ARTISTE} }
    }
  }
`;

export const SERIES_INDEX = /* GraphQL */ `
  query SeriesIndex($letter: String, $sort: [SeriesSort!], $first: Int, $page: Int) {
    seriesPagination(titleRomaji_like: $letter, sort: $sort, first: $first, page: $page) {
      paginatorInfo { total hasMorePages }
      data { ${CARTE_SERIE} }
    }
  }
`;

export const STUDIO_INDEX = /* GraphQL */ `
  query StudioIndex($letter: String, $sort: [StudioSort!], $first: Int, $page: Int) {
    studioPagination(name_like: $letter, sort: $sort, first: $first, page: $page) {
      paginatorInfo { total hasMorePages }
      data { ${CARTE_STUDIO} }
    }
  }
`;

/**
 * Les PORTEES : la musique d'un anime, d'un artiste, d'une serie, d'un studio.
 *
 * C'est ce qui empeche les index d'etre des listes mortes. Cliquer une ligne
 * doit mener quelque part, et dans un onglet Musiques cet endroit ne peut etre
 * qu'une file de lecture : tout ce que YOASOBI a chante, tout ce qu'A-1
 * Pictures a produit.
 *
 * Les series et les studios sont PLAFONNES a un nombre d'anime — A-1 Pictures
 * en a 134, soit cinq cents generiques et autant de videos. On prend les plus
 * recents et on dit combien il y en a en tout : une liste honnetement coupee
 * vaut mieux qu'une attente de dix secondes.
 */
const ANIME_PORTEE = `
  ${ANIME_REF}
  animethemes { ${THEME_SEUL} }
`;

export const ANIME_SCOPE = /* GraphQL */ `
  query AnimeScope($slug: String!) {
    anime(slug: $slug) { ${ANIME_PORTEE} }
  }
`;

/**
 * La meme portee pour TOUTE une page d'anime, en une requete : c'est ce qui
 * fait passer la file de lecture d'un anime au suivant.
 *
 * Par identifiants AniList, faute de mieux : `anime(slug:)` n'en prend qu'un,
 * et trente requetes pour une page seraient trente attentes. Mesure du 13
 * septembre 2026 sur l'ete 2023 — trente anime, 66 generiques : 1,6 s et 47 Ko,
 * contre 0,4 s pour un anime seul. Les anime reviennent dans l'ordre du
 * SERVEUR, pas dans celui demande : `slug` sert a les remettre dans l'ordre de
 * la liste — voir `themesInOrder`.
 */
export const ANIME_SCOPES = /* GraphQL */ `
  query AnimeScopes($id: [Int!]) {
    findAnimeByExternalSite(site: ANILIST, id: $id) { ${ANIME_PORTEE} }
  }
`;

export const ARTIST_SCOPE = /* GraphQL */ `
  query ArtistScope($slug: String!, $first: Int) {
    artist(slug: $slug) {
      name { main }
      images { nodes { link facet } }
      performances(first: $first) {
        song { animethemes { ${THEME_SEUL} anime { ${ANIME_REF} } } }
      }
    }
  }
`;

export const SERIES_SCOPE = /* GraphQL */ `
  query SeriesScope($slug: String!, $first: Int) {
    series(slug: $slug) {
      name
      anime(first: $first, sort: [YEAR_DESC]) {
        pageInfo { total }
        nodes { ${ANIME_PORTEE} }
      }
    }
  }
`;

export const STUDIO_SCOPE = /* GraphQL */ `
  query StudioScope($slug: String!, $first: Int) {
    studio(slug: $slug) {
      name
      images { nodes { link facet } }
      anime(first: $first, sort: [YEAR_DESC]) {
        pageInfo { total }
        nodes { ${ANIME_PORTEE} }
      }
    }
  }
`;

/**
 * D'OU vient ce qu'on ecoute : l'anime, sa serie, son studio, ses interpretes.
 *
 * Interrogee par identifiant ANILIST et non par slug, et c'est ce qui la rend
 * utilisable partout : un generique de la bibliotheque vient d'un lot filtre
 * sur AniList et ne connait pas le slug d'AnimeThemes, alors que l'identifiant,
 * lui, est present sur CHAQUE ligne jouable — voir `SongRow`.
 *
 * Deux alias sur le meme champ, parce qu'on lui pose deux questions : combien
 * de generiques porte cet anime, et qui chante CELUI-LA. GraphQL refuserait de
 * selectionner `animethemes` deux fois sans les nommer.
 *
 * Les slugs des series, studios et artistes sont demandes exprès : sans eux, le
 * panneau serait une liste de noms morts, alors que chacun ouvre une portee.
 *
 * `animethemeentries` est demande ici et pas seulement sur les listes : c'est ce
 * qui permet au lecteur de proposer l'AUTRE fichier — la diffusion web en 720p
 * quand on joue le Blu-ray 1080p sans credits, ou la version remontee en cours
 * de saison. La file de lecture, elle, ne porte qu'un lien par generique :
 * la gonfler de tous les fichiers de toutes les chansons, pour un menu qu'on
 * ouvre une fois, serait payer partout ce qui ne sert qu'ici.
 */
export const THEME_INFO = /* GraphQL */ `
  query ThemeInfo($id: [Int!], $slug: String) {
    findAnimeByExternalSite(site: ANILIST, id: $id) {
      slug
      title {
        romaji
      }
      year
      seasonLocalized
      formatLocalized
      images {
        nodes {
          link
          facet
        }
      }
      themeCount: animethemes {
        id
      }
      series {
        nodes {
          slug
          name
        }
      }
      studios {
        nodes {
          slug
          name
          images {
            nodes {
              link
              facet
            }
          }
        }
      }
      current: animethemes(slug: $slug) {
        song {
          performances {
            artist {
              slug
              name {
                main
              }
              images {
                nodes {
                  link
                  facet
                }
              }
            }
          }
        }
        animethemeentries {
          version
          episodes
          spoiler
          videos {
            nodes {
              link
              resolution
              nc
              subbed
              size
            }
          }
        }
      }
    }
  }
`;

/**
 * Un tirage au hasard dans tout le catalogue.
 *
 * C'est l'affichage par defaut de l'onglet : une liste FINIE et differente a
 * chaque fois vaut mieux qu'un catalogue de dizaines de milliers de lignes
 * qu'on fait defiler sans intention.
 *
 * `spoiler: false` par defaut : un generique marque spoiler montre souvent la
 * fin de la serie, et personne n'a demande a la voir en ouvrant un onglet.
 * C'est la seule des trois sources qui sache l'ecarter cote serveur — d'ou son
 * maintien a cote de `THEME_INDEX`, qui ne le peut pas.
 *
 * `type` est une LISTE — `[ThemeType!]` — et pas un scalaire. Ecrit en dur dans
 * la requete, GraphQL convertit tout seul `OP` en `[OP]` et rien ne se voit ;
 * passe par une variable, il refuse. Mesure : « Variable $type of type
 * ThemeType used in position expecting type [ThemeType!] ». Noter que
 * `animethemePagination`, lui, attend bien un scalaire : les deux ne se
 * recopient pas.
 */
export const THEMES_SHUFFLE = /* GraphQL */ `
  query ThemeShuffle($type: [ThemeType!], $first: Int) {
    animethemeShuffle(type: $type, spoiler: false, first: $first) { ${THEME_AVEC_ANIME} }
  }
`;
