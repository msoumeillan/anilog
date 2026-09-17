/**
 * Liens vers des sites tiers.
 *
 * Un seul endroit : ces adresses sont des devinettes éclairées sur des
 * conventions d'URL qui ne nous appartiennent pas, et elles casseront un jour.
 * Mieux vaut une fonction à corriger que des gabarits éparpillés dans le JSX.
 */

/**
 * Le relevé d'animation clé d'un titre sur keyframe-staff-list.com.
 *
 * Le site indexe par titre romaji transformé en slug :
 *
 *   « Shingeki no Kyojin Season 3 » → /staff/shingeki-no-kyojin-season-3
 *
 * ⚠️ Cette règle est déduite d'UN exemple. Le site est derrière Cloudflare,
 * qui répond 403 à toute requête automatisée — y compris sur une URL
 * volontairement inexistante — donc il est impossible de vérifier les autres
 * titres autrement qu'à la main dans un navigateur. Les titres à ponctuation
 * (« Fate/stay night [Heaven's Feel] ») sont les plus susceptibles de ne pas
 * tomber juste.
 */
export function keyframeStaffListUrl(romaji: string | null | undefined): string | null {
  if (!romaji) return null;

  const slug = romaji
    // Sépare les accents de leurs lettres, puis retire les accents seuls.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Tout ce qui n'est ni lettre ni chiffre devient un séparateur unique.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug ? `https://keyframe-staff-list.com/staff/${slug}` : null;
}
