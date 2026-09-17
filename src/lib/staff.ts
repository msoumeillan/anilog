/**
 * Classement des crédits de staff.
 *
 * AniList ne hiérarchise rien : il renvoie les crédits dans un ordre à lui,
 * avec des intitulés libres. Attack on Titan en compte 200 pour 168 rôles
 * distincts — « Key Animation (ep 9) », « Assistant Chief Animation Director
 * (ep 4) », « Theme Song Composition (OP) »… Bruts, ils sont inutilisables :
 * ni pour choisir six noms à mettre en avant, ni pour filtrer.
 *
 * Deux opérations, donc : ramener un intitulé à sa forme de base, et le
 * ranger dans une famille.
 */

export interface StaffCredit {
  role: string;
  node: { id: number; name: { full: string }; image: { medium: string | null } };
}

/**
 * L'intitulé sans sa précision entre parenthèses.
 *
 * « Key Animation (ep 9) » → « Key Animation ». C'est ce qui permet de
 * regrouper quarante crédits d'épisodes sous un seul rôle.
 */
export function baseRole(role: string): string {
  const cut = role.indexOf('(');
  return (cut === -1 ? role : role.slice(0, cut)).trim();
}

// ─────────────────────────────────────────────────────────────
//  Les six mis en avant sur la fiche
// ─────────────────────────────────────────────────────────────

/**
 * Les quatre qu'on cherche en arrivant sur une fiche : qui a écrit l'œuvre,
 * qui l'a dirigée, qui a dessiné les personnages, qui a composé.
 */
const MAIN_ROLES = ['Original Creator', 'Director', 'Character Design', 'Music'];

/**
 * Ceux des quatre qui manquent encore à l'appel.
 *
 * Même trié par pertinence, AniList ne garantit pas de tous les mettre dans
 * sa première page : sur Attack on Titan le compositeur est en 26e position,
 * sur Demon Slayer en 33e — juste derrière la frontière des 25. La fiche s'en
 * sert pour décider si elle doit demander une page de plus.
 */
export function missingMainRoles(credits: StaffCredit[]): string[] {
  return MAIN_ROLES.filter((role) => !credits.some((c) => baseRole(c.role) === role));
}

/**
 * Ordre de priorité, et ce n'est pas l'ordre d'AniList.
 *
 * Les quatre principaux d'abord ; les suivants complètent quand l'un d'eux
 * manque vraiment — Death Note n'a aucun crédit « Original Creator ».
 */
const STAFF_PRIORITY = [
  ...MAIN_ROLES,
  'Series Composition',
  'Script',
  'Sound Director',
  'Chief Animation Director',
  'Art Director',
];

/**
 * Les `count` crédits à montrer en aperçu.
 *
 * On prend les rôles prioritaires dans l'ordre ci-dessus, puis on complète
 * avec l'ordre d'AniList — une fiche pauvre en crédits ne doit pas afficher
 * quatre cases vides.
 *
 * Une personne n'apparaît qu'une fois : sur beaucoup de séries, le réalisateur
 * est aussi storyboardeur, et le voir trois fois dans six cases n'apprend rien.
 */
export function priorityStaff<T extends StaffCredit>(credits: T[], count: number): T[] {
  const chosen: T[] = [];
  const seen = new Set<number>();

  const take = (credit: T) => {
    if (seen.has(credit.node.id) || chosen.length >= count) return;
    seen.add(credit.node.id);
    chosen.push(credit);
  };

  /* Un seul nom par rôle prioritaire. Demon Slayer crédite deux compositeurs :
     les prendre tous les deux mangeait une place et évinçait le scénariste,
     alors qu'on cherche « le » compositeur, pas la liste complète. */
  for (const role of STAFF_PRIORITY) {
    const premier = credits.find((c) => baseRole(c.role) === role);
    if (premier) take(premier);
  }

  // Puis on complète dans l'ordre d'AniList, si des places restent.
  for (const c of credits) take(c);

  return chosen;
}

// ─────────────────────────────────────────────────────────────
//  Familles de rôles
// ─────────────────────────────────────────────────────────────

export type FamilyKey =
  'story' | 'direction' | 'design' | 'key' | 'animation' | 'sound' | 'production' | 'dub' | 'other';

/**
 * Les familles, dans l'ordre où elles se lisent — de la conception vers la
 * fabrication, puis la diffusion. `key` a la sienne parce que c'est la liste
 * qu'on vient chercher : les animateurs clés, l'équivalent du 原画 japonais.
 *
 * L'ordre des tests compte : « Chief Animation Director » doit tomber dans
 * `animation`, pas dans `direction` parce qu'il contient « Director ».
 */
const FAMILIES: { key: FamilyKey; label: string; test: RegExp }[] = [
  { key: 'key', label: 'Key animation', test: /key animation/i },
  { key: 'dub', label: 'Dub', test: /^adr|dubbing/i },
  {
    key: 'story',
    label: 'Story',
    test: /original creator|original story|script|series composition|screenplay/i,
  },
  { key: 'design', label: 'Design', test: /design|art director|color|背景/i },
  {
    key: 'animation',
    label: 'Animation',
    test: /animation|in-between|finishing|effects animation/i,
  },
  { key: 'sound', label: 'Sound & music', test: /music|sound|song|audio|recording/i },
  { key: 'direction', label: 'Direction', test: /director|storyboard|direction/i },
  { key: 'production', label: 'Production', test: /producer|production|planning/i },
];

export const FAMILY_LABELS: Record<FamilyKey, string> = {
  ...Object.fromEntries(FAMILIES.map((f) => [f.key, f.label])),
  other: 'Other',
} as Record<FamilyKey, string>;

/**
 * Une valeur venue de l'URL est-elle une famille connue ?
 *
 * `?role=` est écrit par l'utilisateur autant que par nos liens : on vérifie
 * plutôt que d'affirmer au compilateur qu'on sait.
 */
export function isFamilyKey(value: string): value is FamilyKey {
  return value in FAMILY_LABELS;
}

export function roleFamily(role: string): FamilyKey {
  const base = baseRole(role);
  return FAMILIES.find((f) => f.test.test(base))?.key ?? 'other';
}

/** Les familles réellement présentes, dans l'ordre de lecture. */
export function staffFamilies(credits: StaffCredit[]): FamilyKey[] {
  const present = new Set(credits.map((c) => roleFamily(c.role)));
  const ordered: FamilyKey[] = [
    'story',
    'direction',
    'design',
    'key',
    'animation',
    'sound',
    'production',
    'dub',
    'other',
  ];
  return ordered.filter((f) => present.has(f));
}

export function filterByFamily<T extends StaffCredit>(credits: T[], family: string): T[] {
  if (!family) return credits;
  return credits.filter((c) => roleFamily(c.role) === family);
}
