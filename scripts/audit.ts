/**
 * Audit de santé du code.
 *
 * Ce qui pourrit un projet ne casse ni le compilateur ni les tests : des
 * classes CSS que plus personne n'utilise, des exports que plus personne
 * n'importe, des requêtes orphelines, des dépendances installées pour rien.
 * Rien de tout ça n'est une erreur — c'est pour ça qu'il faut aller le
 * chercher.
 *
 *   npm run audit
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    /* Les copies de conflit de l'outil de synchronisation, ignorées par git et
       par le compilateur : lues ici, elles feraient passer pour vivant un export
       que seule une copie périmée utilise encore. */
    if (name.includes('# Edit conflict')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path.split(sep).join('/'));
  }
})('src');

const code = files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
const read = (f: string) => readFileSync(f, 'utf8');
const allCode = code.map(read).join('\n');

/**
 * Quels fichiers importent quelle feuille de style.
 *
 * Résolu par CHEMIN et non par nom : deux feuilles peuvent porter le même nom
 * dans deux dossiers, et une feuille est souvent importée par une autre page
 * que celle dont elle porte le nom.
 */
const importers = new Map<string, string[]>();
for (const f of code) {
  const dir = f.slice(0, f.lastIndexOf('/'));
  for (const m of read(f).matchAll(/from\s+'([^']+\.module\.css)'/g)) {
    /* Résolution à la main des `./` et `../` : `path.resolve` rendrait un
       chemin absolu, alors que la liste des fichiers est relative à `src`. */
    const segments: string[] = [];
    for (const part of `${dir}/${m[1]}`.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') segments.pop();
      else segments.push(part);
    }
    const cible = segments.join('/');
    importers.set(cible, [...(importers.get(cible) ?? []), f]);
  }
}

/** Mot entier, sans dépendre des limites de mots des regex. */
const usesWord = (name: string, haystack: string) =>
  new RegExp(`[^A-Za-z0-9_$]${name}[^A-Za-z0-9_$]`).test(haystack);

let problems = 0;
const section = (titre: string) => console.log('\n=== ' + titre + ' ===');
const report = (lines: string[]) => {
  if (lines.length === 0) {
    console.log('  rien à signaler');
    return;
  }
  for (const l of lines) console.log('  ' + l);
  problems += lines.length;
};

// ── Classes CSS jamais référencées ─────────────────────────
section('CLASSES CSS MORTES');
{
  const dead: string[] = [];
  for (const css of files.filter((f) => f.endsWith('.module.css'))) {
    const classes = new Set<string>();
    for (const line of read(css).split('\n')) {
      if (!line.startsWith('.')) continue;
      const m = /^.([A-Za-z][A-Za-z0-9_-]*)/.exec(line);
      if (m?.[1]) classes.add(m[1]);
    }
    /* On cherche `quelquechose.maClasse` dans LES FICHIERS QUI IMPORTENT CETTE
       FEUILLE, quel que soit l'alias (`styles.`, `own.`, `entity.`).

       Chercher dans tout le projet évitait les faux positifs des alias, mais
       créait un faux négatif : `.row` existait dans TROIS feuilles, si bien
       qu'aucune ne pouvait mourir sans qu'une autre la couvre. Elle est restée
       morte dans `AnimeDetail.module.css` sans que l'audit bronche. */
    const portee = (importers.get(css) ?? []).map(read).join('\n');
    const unused = [...classes].filter(
      (c) => !new RegExp(`[A-Za-z_$][A-Za-z0-9_$]*\\.${c}[^A-Za-z0-9_-]`).test(portee),
    );
    if (unused.length) dead.push(`${css} : ${unused.join(', ')}`);
  }
  report(dead);
}

// ── Classes CSS appelées mais absentes ─────────────────────
section('CLASSES CSS INTROUVABLES');
{
  /**
   * L'inverse de la section précédente : `styles.maClasse` dans le code, sans
   * `.maClasse` dans la feuille importée.
   *
   * Le compilateur ne le voit pas — une feuille de module se type comme un
   * dictionnaire de chaînes, et une clé absente rend `undefined`, qui s'écrit
   * `class="undefined"` sans un mot. La page perd son style en silence. Ajoutée
   * le 14 septembre 2026, avant de découper `Library.module.css` : déplacer une
   * règle vers une autre feuille sans renommer son appel donne exactement ça.
   *
   * On lit TOUTES les classes d'une feuille, pas seulement celles qui ouvrent
   * une ligne : une classe qui n'apparaît qu'en descendante — `.table td.note` —
   * existe bel et bien.
   */
  const definies = new Map<string, Set<string>>();
  const classesDe = (css: string) => {
    let set = definies.get(css);
    if (!set) {
      const sansCommentaires = read(css).replace(/\/\*[\s\S]*?\*\//g, '');
      set = new Set(
        [...sansCommentaires.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]!),
      );
      definies.set(css, set);
    }
    return set;
  };

  const absentes: string[] = [];
  for (const f of code) {
    const source = read(f);
    const dir = f.slice(0, f.lastIndexOf('/'));
    for (const m of source.matchAll(/import (\w+) from '([^']+\.module\.css)'/g)) {
      const [, alias, chemin] = m;
      if (!alias || !chemin) continue;
      const segments: string[] = [];
      for (const part of `${dir}/${chemin}`.split('/')) {
        if (part === '.' || part === '') continue;
        if (part === '..') segments.pop();
        else segments.push(part);
      }
      const css = segments.join('/');
      if (!files.includes(css)) continue;
      const connues = classesDe(css);
      const appelees = new Set(
        [
          ...source.matchAll(
            new RegExp(`(?<![A-Za-z0-9_$.])${alias}\\.([A-Za-z][A-Za-z0-9_]*)`, 'g'),
          ),
        ].map((a) => a[1]!),
      );
      const manquent = [...appelees].filter((c) => !connues.has(c));
      if (manquent.length) absentes.push(`${f} → ${css} : ${manquent.join(', ')}`);
    }
  }
  report(absentes);
}

// ── Exports que personne n'importe ─────────────────────────
section('EXPORTS JAMAIS IMPORTÉS AILLEURS');
{
  const orphans: string[] = [];
  for (const f of code) {
    if (f.endsWith('main.tsx') || f.endsWith('App.tsx') || f.endsWith('.test.ts')) continue;
    const names = [
      ...read(f).matchAll(/^export (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)/gm),
    ]
      .map((m) => m[1])
      .filter((n): n is string => Boolean(n));
    const others = code
      .filter((o) => o !== f)
      .map(read)
      .join('\n');
    const unused = names.filter((n) => !usesWord(n, others));
    if (unused.length) orphans.push(`${f} : ${unused.join(', ')}`);
  }
  report(orphans);
}

// ── Requêtes GraphQL ───────────────────────────────────────
section('REQUÊTES GRAPHQL');
{
  /**
   * TOUTES les API GraphQL, et plus seulement AniList.
   *
   * Cette section ne lisait que `api/anilist/queries.ts` : son « 18 / 18 »
   * rassurait pendant que deux requêtes AnimeThemes que l'app utilise n'étaient
   * vérifiées par personne — trouvé à l'audit du 14 septembre 2026. Une requête,
   * c'est une constante `/* GraphQL *\/`, ou une fonction qui en fabrique une,
   * comme `searchQuery` chez LiveChart ; les tailles de lot rangées à côté n'en
   * sont pas.
   *
   * Une requête que `check:queries` ne vérifie pas est désormais un POINT, et
   * non plus une statistique : une requête qui compile n'est pas une requête
   * qui répond. `usesWord` et non `includes` : `ANIME_SCOPE` se lisait dans
   * `ANIME_SCOPES`, et une requête passait pour vérifiée par sa voisine.
   */
  const fichiers = code.filter((f) => /^src\/api\/[^/]+\/queries\.ts$/.test(f));
  const consumers = code
    .filter((f) => !fichiers.includes(f))
    .map(read)
    .join('\n');
  const checks = read('scripts/check-queries.ts');
  const points: string[] = [];
  const couverture: string[] = [];

  for (const f of fichiers) {
    const source = read(f);
    const noms = [
      ...source.matchAll(/^export const ([A-Z_0-9]+) = \/\* GraphQL \*\//gm),
      ...source.matchAll(/^export function ([A-Za-z0-9]+Query)\(/gm),
    ]
      .map((m) => m[1])
      .filter((n): n is string => Boolean(n));

    for (const n of noms) {
      if (!usesWord(n, consumers)) points.push(`${f} : ${n} n'est utilisée nulle part`);
      if (!usesWord(n, checks)) points.push(`${f} : ${n} n'est pas vérifiée par check:queries`);
    }
    const verifiees = noms.filter((n) => usesWord(n, checks)).length;
    couverture.push(`${f.split('/')[2]} ${verifiees}/${noms.length}`);
  }

  report(points);
  console.log(`  vérifiées par check:queries : ${couverture.join(' · ')}`);
}

// ── Dépendances installées jamais importées ────────────────
section('DÉPENDANCES NON IMPORTÉES');
{
  const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
  const unused = Object.keys(pkg.dependencies ?? {}).filter((d) => !allCode.includes(`'${d}`));
  // Elles ne pèsent rien tant qu'on ne les importe pas ; c'est une veille, pas une erreur.
  if (unused.length) for (const d of unused) console.log('  ' + d);
  else console.log('  rien à signaler');
}

// ── Casts ──────────────────────────────────────────────────
section('CASTS');
{
  /**
   * Un cast est une promesse que personne ne vérifie. La règle du projet est
   * qu'il n'y en a pas sur une réponse d'API : sinon un changement de requête
   * devient un plantage à l'exécution au lieu d'une erreur de compilation.
   *
   * Cette section a longtemps cherché `d as {` et rien d'autre. Elle annonçait
   * donc « rien à signaler » quoi qu'il arrive — ni `as T`, ni `as Promise<T>`,
   * ni `as LibraryData` ne lui parlaient. Un garde-fou qui ne peut pas échouer
   * ne protège de rien ; il rassure, ce qui est pire.
   *
   * Les CONVERSIONS DE FRONTIÈRE restent légitimes : quelque part, il faut bien
   * dire de quel type est ce qui sort d'un `res.json()` ou d'un disque. Elles
   * sont nommées une par une ci-dessous, avec leur raison. Tout le reste — le
   * code qui CONSOMME la donnée : pages, composants, stores, hooks — est
   * signalé.
   *
   * Limite assumée : un cast AJOUTÉ dans un fichier de frontière passe
   * inaperçu. La liste se relit à la main, elle est courte pour ça.
   */
  const FRONTIERES: Record<string, string> = {
    'src/api/anilist/client.ts': 'res.json() — le point de conversion unique',
    'src/api/mal/client.ts': 'res.json()',
    'src/api/mangabaka/client.ts': 'res.json()',
    'src/api/animethemes/client.ts': 'res.json()',
    'src/api/adn/client.ts': 'res.json()',
    'src/api/livechart/client.ts': 'res.json()',
    'src/api/tmdb/client.ts': 'res.json()',
    'src/api/tmdb/hooks.ts': 'la table TMDB, fichier statique livré avec l’app',
    'src/platform/storage.ts': 'relecture du disque',
    'src/lib/migrate.ts': 'migrations — par définition, une entrée non vérifiée',
    'src/lib/versioned.ts': 'idem',
    'src/lib/backup.ts': 'relecture d’un fichier de sauvegarde depose a la main',
    'src/store/favourites.ts': 'sa migration 0 → 1',
    'src/lib/staff.ts': 'Object.fromEntries perd les clés littérales',
    'src/components/Select.tsx': 'le DOM ne rend que des chaînes',
  };

  /*
   * Un nom de type — donc une majuscule — plus `any`, `unknown` et `never` :
   * les trois façons d'abandonner explicitement. `as const` et `import * as X`
   * sortent.
   *
   * `never` a été ajouté après coup, et pour une bonne raison : un
   * `key as never` écrit ici même a traversé la section sans être vu. C'est le
   * cast le plus malhonnête des trois — il fait taire le compilateur en lui
   * promettant une valeur qui ne peut pas exister.
   *
   * GAP CONNU, et assumé : `as string`, `as keyof T`, `as number` passent. Les
   * inclure a été essayé et rendait cinq résultats, dont « Mark as watched »
   * lu dans du JSX et trois frictions de TypeScript sur de la donnée locale.
   * Un rapport qu'on cesse de lire ne vaut pas mieux qu'un rapport vide — et
   * la forme qu'on cherche vraiment, mentir sur la FORME d'une réponse, porte
   * toujours un nom de type.
   */
  const CAST = /(?<![A-Za-z0-9_$])as\s+(?:[A-Z][A-Za-z0-9_$]*|any\b|unknown\b|never\b)/g;

  /**
   * Le code, commentaires blanchis — mêmes lignes, mêmes colonnes.
   *
   * Sans ça, la section se signalait elle-même : ce projet EXPLIQUE ses casts
   * en prose, et les quatre seuls « problèmes » du premier jet étaient des
   * commentaires disant pourquoi il n'y avait justement pas de cast.
   *
   * Un `//` dans une chaîne — une URL — blanchit la fin de sa ligne. C'est un
   * oubli possible, jamais une fausse alerte, et le cas ne s'est pas présenté.
   */
  const sansCommentaires = (source: string): string => {
    let out = '';
    let mode: 'code' | 'ligne' | 'bloc' = 'code';

    for (let i = 0; i < source.length; i += 1) {
      const c = source[i]!;
      const suivant = source[i + 1];

      if (mode === 'code') {
        if (c === '/' && (suivant === '/' || suivant === '*')) {
          mode = suivant === '/' ? 'ligne' : 'bloc';
          out += '  ';
          i += 1;
        } else out += c;
      } else if (mode === 'ligne') {
        if (c === '\n') mode = 'code';
        out += c === '\n' ? '\n' : ' ';
      } else if (c === '*' && suivant === '/') {
        mode = 'code';
        out += '  ';
        i += 1;
      } else out += c === '\n' ? '\n' : ' ';
    }

    return out;
  };

  const trouves: string[] = [];
  let tolérés = 0;

  for (const f of code) {
    if (f.includes('.test.')) continue;
    for (const [i, ligne] of sansCommentaires(read(f)).split('\n').entries()) {
      if (/^\s*(import|export)\s/.test(ligne)) continue;
      for (const m of ligne.matchAll(CAST)) {
        if (FRONTIERES[f]) tolérés += 1;
        else trouves.push(`${f}:${i + 1} — ${m[0]}`);
      }
    }
  }

  report(trouves);
  console.log(`  ${tolérés} conversion(s) de frontière, déclarées et non comptées`);
}

console.log('');
console.log(problems === 0 ? 'Aucun point à traiter.' : `${problems} point(s) à regarder.`);
