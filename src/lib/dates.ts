/**
 * Conversions entre une date de calendrier et un horodatage stocké.
 *
 * Le stockage garde des ISO complètes — décision 1, elles arbitreront les
 * conflits de synchronisation. Un `<input type="date">` ne parle que
 * `YYYY-MM-DD`, et sans précaution l'aller-retour décale d'un jour :
 * `new Date('2026-08-28')` est minuit UTC, qui tombe le 27 au soir pour qui
 * vit à l'ouest de Greenwich.
 *
 * D'où midi local comme heure de convention : à douze heures de chaque bord,
 * aucun fuseau ni changement d'heure ne fait basculer la date.
 */

/** Aujourd'hui au format d'un `<input type="date">`, en heure locale. */
export function todayInput(): string {
  return inputFromDate(new Date());
}

/** `2026-08-28` → ISO du 28 août à midi, heure locale. */
export function isoFromInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  // Rejette les dates impossibles : le 31 février donnerait le 3 mars.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.toISOString();
}

/** ISO → `YYYY-MM-DD` local, pour repeupler le calendrier. */
export function inputFromIso(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : inputFromDate(date);
}

/**
 * Date lisible : « Aug 28, 2026 ».
 *
 * Le seul endroit de l'app qui met une date en forme. La liste d'épisodes
 * s'en sert aussi : sans ça, la date de diffusion et la date de visionnage
 * s'écrivaient différemment sur la même page.
 */
export function formatWatchDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function inputFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * `{ year: 2019, month: 1, day: 12 }` → `2019-01-12`.
 *
 * Les dates d'AniList sont « floues » : un mois sans jour, une année seule,
 * ou rien du tout sur une œuvre annoncée. Une date partielle ne vaut rien ici
 * — elle sert à VÉRIFIER un alignement au jour près — donc on ne rend rien
 * plutôt qu'un premier janvier inventé.
 */
export function isoDate(
  d: { year: number | null; month: number | null; day: number | null } | undefined,
): string | undefined {
  if (!d?.year || !d.month || !d.day) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}
