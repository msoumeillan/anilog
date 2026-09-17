/**
 * Retire les doublons d'une liste, en gardant le premier vu.
 *
 * AniList renvoie régulièrement deux fois la même œuvre dans une connexion —
 * la production d'un studio, les apparitions d'un personnage. Les afficher en
 * double n'apprend rien et casse l'unicité des clés React.
 */
export function dedupeBy<T>(items: T[], key: (item: T) => number | string): T[] {
  const seen = new Set<number | string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
