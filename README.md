# AniLog

Journal personnel d'animes et de mangas : ce qu'on regarde, ce qu'on lit, où
on en est et ce qu'on en pense. Suivi par épisode et par chapitre, notes et
critiques, listes et tier lists, statistiques, calendrier des sorties en
France et lecteur de génériques.

Application web en React et TypeScript, **sans backend**. La bibliothèque est
stockée dans le navigateur ; les données publiques viennent directement des
API d'AniList, de MangaBaka et d'autres bases — voir « Sources de données ».

## Lancer

```bash
npm install
npm run dev
```

La clé TMDB est facultative : copier `.env.example` en `.env.local` et la
renseigner pour obtenir les vignettes d'épisodes et les affiches de rechange.

```bash
npm run check          # format, types, lint et tests
npm run build
npm run audit          # garde-fous du code, voir plus bas
npm run check:queries  # exécute chaque requête GraphQL contre les vraies API
```

## Architecture

```
src/
  api/         un dossier par source : client (quotas, erreurs), requêtes, hooks
  pages/       un écran par route ; library/ pour la bibliothèque
  components/  cartes, grilles, dialogues, lecteur vidéo, recherche
  store/       état de l'app (zustand) : bibliothèque, listes, affiches, lecteur
  lib/         logique pure, testée : migrations, tris, import MAL, recherche
  platform/    le seul accès au stockage
  styles/      tokens et styles de base
  types/       le schéma de la bibliothèque
scripts/       audit du code, vérification des requêtes, table AniList → TMDB
```

React 19, Vite, TypeScript en mode `strict` avec `noUncheckedIndexedAccess`,
TanStack Query pour le cache, React Router, zustand, Radix Dialog, dnd-kit
pour réordonner les listes, Vitest, Oxlint et Prettier.

### Sources de données

| Source                | Rôle                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| AniList (GraphQL)     | fiches anime et manga, recherche, personnages, staff, studios, saisons   |
| MangaBaka (REST)      | catalogue manga, romans web compris, et notes des autres bases           |
| AnimeThemes (GraphQL) | openings et endings, avec leurs vidéos                                   |
| LiveChart (GraphQL)   | heures de sortie en France, plateforme par plateforme — API non publique |
| ADN (REST)            | sorties françaises de son propre catalogue, en complément                |
| Tenrai, Jikan (REST)  | listes d'épisodes et magazines de prépublication, données MyAnimeList    |
| TMDB (REST)           | vignettes et synopsis d'épisodes, affiches de rechange — facultatif      |

## Décisions techniques

### Local-first, un seul accès au stockage

La bibliothèque — entrées, listes, favoris, affiches choisies — vit dans
IndexedDB, derrière `platform/storage.ts`, avec un repli sur `localStorage`
puis en mémoire quand le navigateur refuse. C'est le seul accès à ces données :
un futur backend ou une synchronisation ne changeraient que cette couche. Seuls
quelques réglages propres à l'appareil, comme le volume du lecteur, vont
directement dans `localStorage`.

Le compromis est l'absence de synchronisation entre appareils. L'écran de
sauvegarde exporte et restaure la bibliothèque dans un fichier, et chaque
entité porte déjà un `updatedAt` pour permettre une synchronisation plus tard.

### Un schéma versionné

Les données enregistrées portent une version, et `lib/migrate.ts` les fait
monter une version à la fois. Une bibliothèque écrite par une version plus
récente n'est jamais migrée à rebours : l'app la lit telle quelle plutôt que de
perdre des champs qu'elle ne connaît pas.

### Deux espaces de clés

Une entrée est identifiée par son média, `anime:21` ou `manga:21` : l'anime 21
et le manga 21 d'AniList sont deux œuvres. Les séries que seul MangaBaka
connaît ont leur propre préfixe, `manga:mb3397`, pour ne jamais être confondues
avec l'identifiant AniList du même nombre.

### Le quota d'AniList

AniList limite à 30 requêtes par minute. Chaque écran fait donc le moins
d'appels possible : une requête par fiche, cinq catégories de recherche en une
seule requête aliasée, 300 ms d'attente dans la frappe avant de chercher, et
des durées de cache longues. Une réponse 429 est traitée comme une attente :
la requête repart après le délai qu'indique AniList.

Le compromis est la fraîcheur : une fiche peut avoir jusqu'à une heure de
retard sur AniList.

### Le manga chez MangaBaka, enrichi par AniList

MangaBaka a le catalogue le plus large, dont des romans web qu'AniList ignore ;
AniList a les personnages, le staff et les relations. Une adresse de manga
AniList est résolue vers la fiche MangaBaka, et la recherche montre MangaBaka
d'abord puis complète avec AniList, sans doublon. La recherche de MangaBaka
étant large, un filtre de pertinence ne garde que les titres qui contiennent
chaque mot tapé, synonymes d'AniList compris. Si MangaBaka ne répond pas,
AniList prend le relais.

### Des garde-fous plutôt que des conventions

`npm run audit` signale les classes CSS mortes ou introuvables, les exports
jamais importés, les conversions de type forcées sur une réponse d'API et les
requêtes GraphQL qu'aucune vérification ne couvre. `npm run check:queries`
exécute chaque requête contre l'API réelle : une requête qui compile n'est pas
une requête qui répond.

## Tests

799 tests Vitest, dans un environnement Node sans DOM. Ils couvrent la logique
pure et les stores : la progression et les revisionnages, les migrations,
l'import MyAnimeList, la sauvegarde, les tris et filtres, la recherche et le
repli du stockage.

## Limites connues

- **Pas de synchronisation.** Un navigateur, une bibliothèque ; passer d'une
  machine à l'autre demande un export puis une restauration.
- **Dépendance à des API tierces**, notamment LiveChart, dont l'API n'est pas
  publique : un changement de leur côté priverait le calendrier des heures de
  sortie françaises.
- **Le quota d'AniList** se fait sentir en navigation intensive : les écrans
  attendent alors quelques secondes.
- **Aucun test de composant.** L'interface se vérifie à la main dans le
  navigateur.
- **Des adresses en `#/`**, choisies pour rester compatibles avec une version
  mobile empaquetée par Capacitor, qui n'existe pas encore.
- **Interface en anglais seulement**, commentaires du code en français.
