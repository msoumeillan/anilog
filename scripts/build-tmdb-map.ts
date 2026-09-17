/**
 * Construit la table AniList → TMDB.
 *
 *   npm run build:tmdb-map
 *
 * À relancer de temps en temps : les deux sources sont mises à jour en
 * continu. Le résultat est commité, pour qu'un build normal n'ait jamais
 * besoin du réseau.
 *
 * Deux sources :
 *
 *   Fribb/anime-lists      identifiant TMDB, numéro de saison, et surtout
 *                          `episode_offset.tmdb` — le décalage EXPRIMÉ DANS
 *                          LA NUMÉROTATION TMDB, qui fait autorité ici
 *   Kometa-Team/Anime-IDs  un décalage TVDB, en dernier recours seulement
 *
 * Le décalage est indispensable : TMDB range les quatre saisons d'Oshi no Ko
 * dans UNE saison de 35 épisodes, et seule cette valeur dit où commence
 * chacune. Sans elle, les saisons 2 et 3 affichaient les épisodes de la
 * première — c'était le cas jusqu'ici, faute d'avoir lu ce champ.
 *
 * Ne jamais convertir un décalage TVDB en décalage TMDB à la légère : les
 * deux bases ne découpent pas les saisons pareil. Oshi no Ko saison 2 est la
 * saison 2 chez TVDB et la saison 1 chez TMDB.
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const FRIBB = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const KOMETA = 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';
const SORTIE = 'src/data/tmdbMap.json';

interface FribbEntry {
  anilist_id?: number;
  themoviedb_id?: number | { tv?: number } | string;
  season?: { tvdb?: number; tmdb?: number };
  /** Le décalage d'épisodes, par base. `tmdb` est celui qui nous intéresse. */
  episode_offset?: { tvdb?: number; tmdb?: number };
}

interface KometaEntry {
  anilist_id?: number;
  tvdb_season?: number;
  tvdb_epoffset?: number;
}

const load = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
};

const tmdbTv = (entry: FribbEntry): number | undefined => {
  const raw = entry.themoviedb_id;
  return raw && typeof raw === 'object' ? raw.tv : undefined;
};

const [fribb, kometa] = await Promise.all([
  load<FribbEntry[]>(FRIBB),
  load<Record<string, KometaEntry>>(KOMETA),
]);

const decalages = new Map<number, KometaEntry>();
for (const entry of Object.values(kometa)) {
  if (entry.anilist_id) decalages.set(entry.anilist_id, entry);
}

/**
 * `[tmdbId]`                  la fiche AniList couvre la série entière
 * `[tmdbId, saison]`          elle couvre une saison
 * `[tmdbId, saison, décalage]` elle couvre une PARTIE de saison
 */
const table: Record<number, number[]> = {};
let entieres = 0;
let avecDecalage = 0;
let decalagesEcartes = 0;

for (const entry of fribb) {
  const anilist = entry.anilist_id;
  const tmdb = tmdbTv(entry);
  if (!anilist || !tmdb) continue;

  const saison = entry.season?.tmdb;
  if (typeof saison !== 'number' || saison < 1) {
    table[anilist] = [tmdb];
    entieres++;
    continue;
  }

  /* Priorité absolue au décalage exprimé en numérotation TMDB : c'est le seul
     qui soit directement applicable. */
  const propre = entry.episode_offset?.tmdb;
  if (typeof propre === 'number' && propre > 0) {
    table[anilist] = [tmdb, saison, propre];
    avecDecalage++;
    continue;
  }

  /* À défaut, celui de Kometa — mais il vient du monde TVDB, et on ne le
     reporte que si les deux bases numérotent la saison pareil. Sinon on
     préfère pas de décalage à un décalage faux, qui décalerait TOUTE la liste
     sans le dire. */
  const emprunte = decalages.get(anilist)?.tvdb_epoffset ?? 0;
  if (emprunte && entry.season?.tvdb !== saison) {
    decalagesEcartes++;
    table[anilist] = [tmdb, saison];
    continue;
  }

  table[anilist] = emprunte ? [tmdb, saison, emprunte] : [tmdb, saison];
  if (emprunte) avecDecalage++;
}

const json = JSON.stringify(table);
writeFileSync(SORTIE, json + '\n');

console.log(`${SORTIE} écrit`);
console.log(`  entrées            : ${Object.keys(table).length}`);
console.log(`  séries entières    : ${entieres}`);
console.log(`  avec décalage      : ${avecDecalage}`);
console.log(`  décalages écartés  : ${decalagesEcartes} (saison TVDB ≠ saison TMDB)`);
console.log(
  `  poids              : ${Math.round(json.length / 1024)} Ko, ${Math.round(gzipSync(json).length / 1024)} Ko gzippé`,
);
