/**
 * Les quatre requêtes principales.
 *
 * Chacune correspond à un écran de l'app et se suffit à elle-même :
 * c'est tout l'intérêt de GraphQL ici, là où l'ancienne app faisait
 * 3 appels REST minimum pour une fiche, plus un par relation.
 */

/** Fragments partagés — évite de répéter les mêmes sélections. */
const COVER = `coverImage { medium large extraLarge color }`;
const TITLE = `title { romaji english native }`;
/*
 * Ce que la bulle de survol d'une carte demande. Un seul endroit, comme TITLE
 * et COVER : six listes de champs recopiees a la main divergeraient a la
 * premiere modification.
 *
 * L'argument isMain ET le champ isMain, les deux, parce qu'AniList ne
 * l'applique PAS partout — mesure sur Attack on Titan :
 *
 *   Page.media[].studios(isMain: true)        -> 1 studio, filtre respecte
 *   Character.media.edges[].node.studios(...) -> 7 studios, argument ignore
 *
 * L'argument fait donc economiser des octets la ou le serveur le respecte
 * (+3,1 Ko contre +11 Ko pour 25 titres), et le champ rend le tri client
 * correct partout. Se fier au seul premier element renverrait le distributeur
 * a la place du studio d'animation des que la requete est imbriquee.
 */
const TIP = `format season seasonYear episodes studios(isMain: true) { edges { isMain node { id name } } }`;

// ─────────────────────────────────────────────────────────────
//  1. Fiche anime
// ─────────────────────────────────────────────────────────────

export const ANIME_DETAIL = /* GraphQL */ `
  query AnimeDetail($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      ${TITLE}
      ${COVER}
      bannerImage
      description(asHtml: false)
      format
      status
      episodes
      duration
      season
      seasonYear
      startDate { year month day }
      averageScore
      meanScore
      popularity
      favourites
      genres
      tags { name rank isMediaSpoiler }
      studios { edges { isMain node { id name } } }
      trailer { id site thumbnail }
      externalLinks { site url type icon }
      nextAiringEpisode { episode airingAt timeUntilAiring }
      stats { scoreDistribution { score amount } }
      streamingEpisodes { title thumbnail url site }
      relations {
        edges {
          relationType
          node { id type format ${TITLE} ${COVER} }
        }
      }
      # 25 est le maximum par page sur une connexion imbriquée chez AniList.
      characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 25) {
        pageInfo { total hasNextPage }
        edges {
          role
          node { id name { full native } image { medium } }
          # Un seul champ, non filtré : deux alias du même champ avec des
          # arguments différents sont fusionnés par AniList et le dernier gagne
          # (un japanese/french aliasés renvoyaient tous deux du français).
          voiceActors { id name { full } image { medium } languageV2 }
        }
      }
      # RELEVANCE, sinon les credits arrivent dans un ordre interne ou les
      # roles principaux sont noyes : sans tri, le realisateur d'Attack on
      # Titan est 12e et l'auteur n'est pas dans la premiere page.
      staff(sort: [RELEVANCE], page: 1, perPage: 25) {
        pageInfo { total hasNextPage }
        edges { role node { id name { full } image { medium } } }
      }
      recommendations(sort: RATING_DESC, perPage: 8) {
        edges {
          node {
            rating
            mediaRecommendation { id type ${TITLE} ${COVER} averageScore }
          }
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  2. Fiche manga
// ─────────────────────────────────────────────────────────────

export const MANGA_DETAIL = /* GraphQL */ `
  query MangaDetail($id: Int) {
    Media(id: $id, type: MANGA) {
      id
      idMal
      ${TITLE}
      ${COVER}
      bannerImage
      # AniList porte un trailer sur une fiche MANGA aussi — celui de
      # l'adaptation. Mesure : 24 des 30 mangas les plus populaires en ont un.
      trailer { id site thumbnail }
      description(asHtml: false)
      format
      status
      chapters
      volumes
      countryOfOrigin
      startDate { year month day }
      endDate { year month day }
      averageScore
      meanScore
      popularity
      favourites
      genres
      tags { name rank isMediaSpoiler }
      externalLinks { site url type }
      stats { scoreDistribution { score amount } }
      relations {
        edges {
          relationType
          node { id type format ${TITLE} ${COVER} }
        }
      }
      characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 25) {
        pageInfo { total hasNextPage }
        edges { role node { id name { full native } image { medium } } }
      }
      staff(page: 1, perPage: 25) {
        pageInfo { total hasNextPage }
        edges { role node { id name { full } image { medium } } }
      }
      recommendations(sort: RATING_DESC, perPage: 8) {
        edges {
          node { rating mediaRecommendation { id type ${TITLE} ${COVER} averageScore } }
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  3. Parcourir — une seule requête pour Top + Saison + Genres + Recherche
// ─────────────────────────────────────────────────────────────

/**
 * Ce qu'une carte de catalogue demande — `BrowsePage` dans `hooks.ts`.
 *
 * Un fragment et non une liste recopiée : la page de résultats tire sa
 * première page par `SEARCH_RESULTS` et les suivantes par `BROWSE`. Deux
 * listes de champs divergeraient, et les cartes de la page 2 perdraient en
 * silence ce que la page 1 affichait.
 */
const BROWSE_MEDIA = `
        id
        idMal
        ${TITLE}
        ${COVER}
        ${TIP}
        status
        chapters
        volumes
        # startDate plutot que seasonYear seul pour le decoupage par annee :
        # les films et les OVA n'ont souvent pas de saison, et tomberaient
        # tous dans le groupe « TBA ».
        # Le mois et le jour servent a ranger dans une saison les oeuvres
        # qu'AniList n'y range pas — les donghua. Voir lib/season.ts.
        startDate { year month day }
        averageScore
        # popularity : le tri par defaut est POPULARITY_DESC, et les deux
        # listes d'une saison se rabattent l'une dans l'autre au client.
        popularity
        genres
        nextAiringEpisode { episode airingAt }`;

export const BROWSE = /* GraphQL */ `
  query Browse(
    $page: Int = 1
    $perPage: Int = 24
    $type: MediaType!
    $sort: [MediaSort] = [POPULARITY_DESC]
    $search: String
    $genres: [String]
    $tags: [String]
    $season: MediaSeason
    $seasonYear: Int
    # Bornes de date, en AAAAMMJJ. Elles remplacent le filtre par saison quand
    # il faut aussi ramener les oeuvres qu'AniList ne range dans aucune saison
    # — les donghua notamment. Voir lib/season.ts.
    $startFrom: FuzzyDateInt
    $startTo: FuzzyDateInt
    $formats: [MediaFormat]
    $status: MediaStatus
    $country: CountryCode
    # Pays a EXCLURE. Sert a la requete d'appoint d'une saison : sans elle,
    # la fenetre de dates se remplit de fiches japonaises datees a l'annee
    # seule, qui repoussent les donghua hors de la premiere page.
    $countryNotIn: [CountryCode]
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage perPage }
      media(
        type: $type
        sort: $sort
        search: $search
        genre_in: $genres
        tag_in: $tags
        season: $season
        seasonYear: $seasonYear
        startDate_greater: $startFrom
        startDate_lesser: $startTo
        format_in: $formats
        status: $status
        countryOfOrigin: $country
        countryOfOrigin_not_in: $countryNotIn
        isAdult: false
      ) {${BROWSE_MEDIA}
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  4. File « À voir » — état des séries en cours, en un appel
// ─────────────────────────────────────────────────────────────

/**
 * On envoie les identifiants des séries en cours dans la bibliothèque locale ;
 * AniList renvoie le total d'épisodes et le prochain à être diffusé.
 * Le calcul du « +N restants » se fait côté client en croisant avec la progression.
 */
export const UP_NEXT = /* GraphQL */ `
  query UpNext($ids: [Int], $perPage: Int = 50) {
    Page(page: 1, perPage: $perPage) {
      media(id_in: $ids, type: ANIME, sort: [POPULARITY_DESC]) {
        id
        idMal
        ${TITLE}
        ${COVER}
        episodes
        status
        nextAiringEpisode { episode airingAt timeUntilAiring }
        streamingEpisodes { title thumbnail url site }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  4 bis. Episodes a venir
//
//  `nextAiringEpisode` d'une fiche ne donne QUE le prochain. Cette requete
//  donne tout le calendrier annonce — 27 episodes d'avance sur One Piece.
//  C'est ce qui rend TMDB inutile pour les episodes futurs.
// ─────────────────────────────────────────────────────────────

export const AIRING_SCHEDULE = /* GraphQL */ `
  query AiringSchedule($id: Int, $perPage: Int = 50) {
    Page(page: 1, perPage: $perPage) {
      airingSchedules(mediaId: $id, notYetAired: true, sort: TIME) {
        episode
        airingAt
      }
    }
  }
`;

/**
 * La semaine de diffusion.
 *
 * Une fenetre de temps, et pas une liste de series : c'est AniList qui sait
 * quel episode tombe quand, et lui demander episode par episode couterait une
 * requete par titre — le defaut de la v1, ou la page saison tirait autant de
 * requetes qu'elle affichait de cartes.
 *
 * `mediaId_in` restreint aux series qu'on suit ; sans lui, la meme requete rend
 * TOUT ce qui passe cette semaine-la. Les deux vues de l'onglet n'ont donc
 * qu'une requete pour deux.
 *
 * `airingAt` est un horodatage UNIX en heure de diffusion JAPONAISE. C'est
 * l'ecran qui le ramene a l'heure d'ici — voir `lib/calendar`.
 */
export const WEEK_SCHEDULE = /* GraphQL */ `
  query WeekSchedule($ids: [Int], $start: Int, $end: Int, $page: Int = 1) {
    Page(page: $page, perPage: 50) {
      pageInfo {
        hasNextPage
      }
      airingSchedules(
        mediaId_in: $ids
        airingAt_greater: $start
        airingAt_lesser: $end
        sort: TIME
      ) {
        episode
        airingAt
        mediaId
        media {
          id
          ${TITLE}
          ${COVER}
          format
          episodes
          countryOfOrigin
          externalLinks {
            site
            url
            type
          }
        }
      }
    }
  }
`;

/**
 * Les plateformes de streaming, avec leur icône et leur couleur.
 *
 * Pour les logos du calendrier. LiveChart n'en sert plus : la route REST qui
 * les portait répond vide (204), et en GraphQL le seul champ qui y mène —
 * `action` — fait planter leur serveur (500), mesuré le 11 septembre 2026.
 * AniList les a tous, hébergés sur le CDN qui sert déjà les affiches : un
 * pictogramme blanc, à poser sur la couleur de la marque.
 *
 * Une seule requête pour tout le catalogue, et non les liens de chaque série :
 * une icône appartient à une plateforme, pas à un anime, et AniList ne liste
 * pas toutes les plateformes de toutes les séries.
 *
 * ADN n'y est pas — AniList ne référence pas cette plateforme française. Son
 * logo est embarqué dans l'app : voir `lib/livechart`.
 */
export const LINK_SOURCES = /* GraphQL */ `
  query LinkSources {
    ExternalLinkSourceCollection(mediaType: ANIME, type: STREAMING) {
      site
      icon
      color
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  5. Personnage
// ─────────────────────────────────────────────────────────────

export const CHARACTER_DETAIL = /* GraphQL */ `
  query CharacterDetail($id: Int) {
    Character(id: $id) {
      id
      name { full native alternative }
      image { large }
      description(asHtml: false)
      gender
      age
      bloodType
      dateOfBirth { year month day }
      favourites
      media(sort: [POPULARITY_DESC], perPage: 25) {
        pageInfo { total hasNextPage }
        edges {
          characterRole
          # Non filtré puis trié côté client : deux alias du même champ avec
          # des arguments différents sont fusionnés par AniList.
          voiceActors { id name { full } languageV2 image { medium } }
          node { id type ${TITLE} ${COVER} ${TIP} }
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  6. Staff (réalisateurs, seiyuu, compositeurs…)
// ─────────────────────────────────────────────────────────────

export const STAFF_DETAIL = /* GraphQL */ `
  query StaffDetail($id: Int) {
    Staff(id: $id) {
      id
      name { full native }
      image { large }
      description(asHtml: false)
      primaryOccupations
      gender
      age
      homeTown
      yearsActive
      dateOfBirth { year month day }
      favourites
      staffMedia(sort: [POPULARITY_DESC], perPage: 25) {
        pageInfo { total hasNextPage }
        edges {
          staffRole
          node { id type ${TITLE} ${COVER} ${TIP} }
        }
      }
      characters(sort: [FAVOURITES_DESC], page: 1, perPage: 25) {
        # Pas de total : sur une connexion imbriquee AniList renvoie un
        # plafond (500), pas le vrai nombre. Seul hasNextPage est fiable.
        pageInfo { hasNextPage }
        nodes { id name { full } image { medium } }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  7. Studio
// ─────────────────────────────────────────────────────────────

export const STUDIO_DETAIL = /* GraphQL */ `
  query StudioDetail($id: Int, $page: Int = 1) {
    Studio(id: $id) {
      id
      name
      isAnimationStudio
      favourites
      # Ordre serveur fixe. Le tri choisi par l'utilisateur est appliqué au
      # client : trier au serveur voudrait dire un cache et un catalogue
      # complet PAR tri, soit 16 requêtes à chaque changement sur un gros
      # studio, pour un quota de 30 par minute.
      media(sort: [START_DATE_DESC], page: $page, perPage: 25) {
        # Pas de total : plafonné à 500 sur une connexion imbriquée, il vaut 500
        # pour tous les studios mesurés, y compris ceux qui ont 103 titres.
        pageInfo { hasNextPage }
        # season, startDate, genres et popularity alimentent les filtres et le
        # groupement par année. AniList ne sait pas filtrer côté serveur sur
        # cette connexion : elle n'accepte que sort et isMain.
        nodes {
          id
          type
          ${TITLE}
          ${COVER}
          ${TIP}
          startDate { year }
          averageScore
          popularity
          genres
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  8. Connexions paginées
//
//  Chaque fiche embarque déjà sa première page (25 éléments, le maximum
//  d'AniList sur une connexion imbriquée). Ces requêtes ne servent qu'au
//  « Show more » : on ne les tire qu'au clic, à partir de la page 2, pour
//  ne pas payer trois requêtes à chaque ouverture de fiche.
// ─────────────────────────────────────────────────────────────

export const CHARACTERS_PAGE = /* GraphQL */ `
  query AnimeCharactersPage($id: Int, $page: Int) {
    Media(id: $id, type: ANIME) {
      characters(sort: [ROLE, RELEVANCE], page: $page, perPage: 25) {
        pageInfo {
          hasNextPage
        }
        edges {
          role
          node {
            id
            name {
              full
              native
            }
            image {
              medium
            }
          }
          voiceActors {
            id
            name {
              full
            }
            image {
              medium
            }
            languageV2
          }
        }
      }
    }
  }
`;

export const STAFF_PAGE = /* GraphQL */ `
  query AnimeStaffPage($id: Int, $page: Int) {
    Media(id: $id, type: ANIME) {
      # Meme tri que la fiche, obligatoirement : les pages suivantes se
      # concatenent a la premiere, deux ordres differents les melangeraient.
      staff(sort: [RELEVANCE], page: $page, perPage: 25) {
        pageInfo {
          hasNextPage
        }
        edges {
          role
          node {
            id
            name {
              full
            }
            image {
              medium
            }
          }
        }
      }
    }
  }
`;

export const CHARACTER_MEDIA_PAGE = /* GraphQL */ `
  query CharacterMediaPage($id: Int, $page: Int) {
    Character(id: $id) {
      media(sort: [POPULARITY_DESC], page: $page, perPage: 25) {
        pageInfo { hasNextPage }
        edges {
          characterRole
          voiceActors { id name { full } languageV2 image { medium } }
          node { id type ${TITLE} ${COVER} ${TIP} }
        }
      }
    }
  }
`;

export const STAFF_MEDIA_PAGE = /* GraphQL */ `
  query StaffMediaPage($id: Int, $page: Int) {
    Staff(id: $id) {
      staffMedia(sort: [POPULARITY_DESC], page: $page, perPage: 25) {
        pageInfo { hasNextPage }
        edges { staffRole node { id type ${TITLE} ${COVER} ${TIP} } }
      }
    }
  }
`;

export const STAFF_CHARACTERS_PAGE = /* GraphQL */ `
  query StaffCharactersPage($id: Int, $page: Int) {
    Staff(id: $id) {
      characters(sort: [FAVOURITES_DESC], page: $page, perPage: 25) {
        pageInfo {
          hasNextPage
        }
        nodes {
          id
          name {
            full
          }
          image {
            medium
          }
        }
      }
    }
  }
`;

export const STUDIO_MEDIA_PAGE = /* GraphQL */ `
  query StudioMediaPage($id: Int, $page: Int) {
    Studio(id: $id) {
      media(sort: [START_DATE_DESC], page: $page, perPage: 25) {
        pageInfo { hasNextPage }
        nodes {
          id
          type
          ${TITLE}
          ${COVER}
          ${TIP}
          startDate { year }
          averageScore
          popularity
          genres
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  15. Les œuvres d'un magazine de prépublication
// ─────────────────────────────────────────────────────────────

/**
 * Les fiches AniList correspondant à une poignée d'identifiants MyAnimeList.
 *
 * AniList n'a AUCUNE notion de sérialisation — vérifié par introspection du
 * type `Media` : seul `source` existe, et il désigne le support d'origine
 * d'une adaptation. La liste d'un magazine vient donc de MyAnimeList, et cette
 * requête est le pont qui la ramène dans le vocabulaire de l'app : des ids
 * AniList, seuls à ouvrir une fiche.
 *
 * `perPage: 50` pour une page MAL de 25 : la marge ne coûte rien et couvre le
 * jour où l'autre côté paginerait plus large.
 *
 * L'ordre du serveur n'est PAS celui de MyAnimeList ; `inMalOrder` le rétablit.
 */
export const MAGAZINE_MEDIA = /* GraphQL */ `
  query MagazineMedia($idMal: [Int]) {
    Page(page: 1, perPage: 50) {
      media(type: MANGA, idMal_in: $idMal, isAdult: false) {
        id
        idMal
        ${TITLE}
        ${COVER}
        ${TIP}
        status
        chapters
        volumes
        startDate { year month day }
        averageScore
        popularity
        genres
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  16. Le pont depuis MyAnimeList
// ─────────────────────────────────────────────────────────────

/**
 * Des identifiants MyAnimeList vers les nôtres, cinquante à la fois.
 *
 * Un import MAL ne porte que des identifiants MAL, qui ne sont pas ceux
 * d'AniList : sans ce pont, chaque œuvre demanderait une recherche par titre,
 * approximative et une requête par ligne. `idMal_in` en traduit cinquante en
 * un appel — le même mécanisme que les magazines, où il retrouvait 100 % des
 * titres sur trois revues.
 *
 * PAS de `isAdult: false`, contrairement à `MagazineMedia` : on importe la
 * liste de quelqu'un, et en écarter des lignes en silence serait un mensonge
 * sur ce qui a été repris.
 */
export const MAL_BRIDGE = /* GraphQL */ `
  query MalBridge($type: MediaType, $idMal: [Int]) {
    Page(page: 1, perPage: 50) {
      media(type: $type, idMal_in: $idMal) {
        id
        idMal
        ${TITLE}
        ${COVER}
        ${TIP}
        chapters
        # Ici et pas dans TIP : ces deux champs servent aux STATISTIQUES, pas a
        # la bulle de survol. Les ajouter au fragment les ferait voyager dans
        # les huit autres requetes qui n'en ont que faire. La duree revient
        # nulle sur du manga, ce qui est la reponse juste.
        # (Pas d'accent grave ici : on est DANS un gabarit.)
        genres
        duration
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  17. La recherche de l'en-tête
// ─────────────────────────────────────────────────────────────

/**
 * Anime, manga, personnages, staff et studios, en UNE requête.
 *
 * Cinq `Page` aliasées plutôt que cinq appels : la recherche part pendant la
 * frappe, et le quota est de 30 requêtes par minute. Mesuré sur « oshi no ko »,
 * « ufotable » et « One Piece » : 160 à 280 ms, moins de 3 Ko.
 *
 * Peu de résultats par catégorie — quatre animes, trois du reste : c'est un
 * aperçu pour sauter à une fiche, pas un catalogue. `SEARCH_MATCH` partout,
 * sans quoi AniList classe par identifiant et le titre exact se perd.
 *
 * L'œuvre la plus populaire d'un personnage vient avec lui : « Ruby Hoshino »
 * seul ne dit pas de quelle série, et les homonymes sont nombreux.
 *
 * Les mangas passent d'abord par MangaBaka — voir `useMbQuickSearch` —, et
 * ceux d'ici COMPLÈTENT la section : le classement de MangaBaka se perd vite,
 * celui d'AniList tient. Huit pour en garder quelques-uns une fois les
 * doublons et le bruit écartés : sur « oshi no ko », mesuré, ses cinq premiers
 * sont les bons, « Hoshi no Ko » arrive septième. Voir `lib/quickSearch`.
 *
 * Ces mangas portent leurs synonymes, pour ce même tri : « snk » trouve Attack
 * on Titan par eux, et aucun de ses titres ne le contient.
 */
export const QUICK_SEARCH = /* GraphQL */ `
  query QuickSearch($search: String) {
    anime: Page(perPage: 4) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
        id
        ${TITLE}
        coverImage { medium }
        format
        seasonYear
        startDate { year }
      }
    }
    manga: Page(perPage: 8) {
      media(search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {
        id
        ${TITLE}
        # Les abreviations - SnK, AoT - ne sont que la. Pas du cote anime : ses
        # resultats ne passent pas par le filtre de pertinence.
        synonyms
        coverImage { medium }
        format
        seasonYear
        startDate { year }
      }
    }
    characters: Page(perPage: 3) {
      characters(search: $search, sort: SEARCH_MATCH) {
        id
        name { full }
        image { medium }
        media(perPage: 1, sort: POPULARITY_DESC) { nodes { ${TITLE} } }
      }
    }
    staff: Page(perPage: 3) {
      staff(search: $search, sort: SEARCH_MATCH) {
        id
        name { full }
        image { medium }
        primaryOccupations
      }
    }
    studios: Page(perPage: 3) {
      studios(search: $search, sort: SEARCH_MATCH) {
        id
        name
        isAnimationStudio
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  18. La page de tous les résultats
// ─────────────────────────────────────────────────────────────

/** Ce qu'une carte de personnage montre : son nom, son visage, son œuvre. */
const SEARCH_CHARACTER = `
        id
        name { full }
        image { medium }
        media(perPage: 1, sort: POPULARITY_DESC) { nodes { id type ${TITLE} } }`;

const SEARCH_STAFF = `
        id
        name { full }
        image { medium }
        primaryOccupations`;

const SEARCH_STUDIO = `
        id
        name
        isAnimationStudio`;

/**
 * La première page de CHAQUE catégorie, en une requête.
 *
 * Même raison que `QUICK_SEARCH` : cinq appels à l'ouverture d'une page de
 * résultats en coûteraient cinq sur un quota de 30 par minute. Mesuré sur
 * « one piece » et « miyazaki » : 330 à 380 ms, 11 à 30 Ko, sans toucher la
 * limite de complexité d'AniList.
 *
 * Dix-huit par catégorie, trois rangées de cartes sur un écran large. La
 * suite passe par une requête par catégorie, au clic — `BROWSE` pour les
 * œuvres, les trois ci-dessous pour le reste —, et le fragment commun garantit
 * que la page 2 porte les mêmes champs que la page 1.
 *
 * Une exception, qui ne s'affiche pas : les synonymes des mangas de la page 1.
 * Ils disent quelles séries de MangaBaka répondent au terme, comme dans
 * `QUICK_SEARCH` ; MangaBaka ne rend qu'une page, la suite n'en a pas besoin.
 */
export const SEARCH_RESULTS = /* GraphQL */ `
  query SearchResults($search: String) {
    anime: Page(perPage: 18) {
      pageInfo { hasNextPage }
      media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {${BROWSE_MEDIA}
      }
    }
    manga: Page(perPage: 18) {
      pageInfo { hasNextPage }
      media(search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {${BROWSE_MEDIA}
        synonyms
      }
    }
    characters: Page(perPage: 18) {
      pageInfo { hasNextPage }
      characters(search: $search, sort: SEARCH_MATCH) {${SEARCH_CHARACTER}
      }
    }
    staff: Page(perPage: 18) {
      pageInfo { hasNextPage }
      staff(search: $search, sort: SEARCH_MATCH) {${SEARCH_STAFF}
      }
    }
    studios: Page(perPage: 18) {
      pageInfo { hasNextPage }
      studios(search: $search, sort: SEARCH_MATCH) {${SEARCH_STUDIO}
      }
    }
  }
`;

export const CHARACTER_SEARCH_PAGE = /* GraphQL */ `
  query CharacterSearchPage($search: String, $page: Int) {
    Page(page: $page, perPage: 18) {
      pageInfo { hasNextPage }
      characters(search: $search, sort: SEARCH_MATCH) {${SEARCH_CHARACTER}
      }
    }
  }
`;

export const STAFF_SEARCH_PAGE = /* GraphQL */ `
  query StaffSearchPage($search: String, $page: Int) {
    Page(page: $page, perPage: 18) {
      pageInfo { hasNextPage }
      staff(search: $search, sort: SEARCH_MATCH) {${SEARCH_STAFF}
      }
    }
  }
`;

export const STUDIO_SEARCH_PAGE = /* GraphQL */ `
  query StudioSearchPage($search: String, $page: Int) {
    Page(page: $page, perPage: 18) {
      pageInfo { hasNextPage }
      studios(search: $search, sort: SEARCH_MATCH) {${SEARCH_STUDIO}
      }
    }
  }
`;
