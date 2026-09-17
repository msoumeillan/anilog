import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibrary, watchedCount } from './library';
import { entryKey } from '../lib/ids';
import type { EpisodeRecord } from '../types/library';

/**
 * Tests du store.
 *
 * Trois des bugs réellement rencontrés sur ce projet vivaient ici : les clics
 * rapides sur « + » qui n'en comptaient qu'un, la progression qui reculait
 * quand on cochait un vieil épisode, et les fonctions d'épisode appelées avec
 * le mauvais nombre d'arguments. Chacun a son test ci-dessous.
 */

const KEY = entryKey('anime', 20755);
const lib = () => useLibrary.getState();

beforeEach(() => {
  useLibrary.setState({ entries: {} });
  lib().upsertEntry('anime', 20755, { title: 'Assassination Classroom' });
});

afterEach(() => {
  vi.useRealTimers();
});

function progression(): number {
  const e = lib().entries[KEY];
  if (!e || e.progress.kind !== 'anime') throw new Error('entrée absente ou mauvais média');
  return e.progress.episodes;
}

function episode(n: number): EpisodeRecord {
  const r = lib().entries[KEY]?.episodes?.[n];
  if (!r) throw new Error(`épisode ${n} absent`);
  return r;
}

describe('progression', () => {
  it('accumule les incréments successifs', () => {
    /* Le bug d'origine : le composant faisait `setProgress(valeurLue + 1)`,
       et trois clics rapides lisaient tous la même valeur de rendu. */
    lib().bumpProgress(KEY, 1);
    lib().bumpProgress(KEY, 1);
    lib().bumpProgress(KEY, 1);
    expect(progression()).toBe(3);
  });

  it('ne descend jamais sous zéro', () => {
    lib().bumpProgress(KEY, -5);
    expect(progression()).toBe(0);
  });

  it('arrondit et borne ce qu’on lui pose', () => {
    lib().setProgress(KEY, 7.6);
    expect(progression()).toBe(8);
    lib().setProgress(KEY, -3);
    expect(progression()).toBe(0);
  });
});

describe('épisodes', () => {
  it('tire la progression vers le haut, jamais vers le bas', () => {
    lib().setEpisodeWatched(KEY, 5, true);
    expect(progression()).toBe(5);
    lib().setEpisodeWatched(KEY, 3, true);
    expect(progression()).toBe(5);
  });

  it('ne recule qu’en décochant le dernier épisode atteint', () => {
    lib().setEpisodeWatched(KEY, 5, true);
    lib().setEpisodeWatched(KEY, 3, true);

    lib().setEpisodeWatched(KEY, 3, false);
    expect(progression()).toBe(5);

    lib().setEpisodeWatched(KEY, 5, false);
    expect(progression()).toBe(4);
  });

  it('ajoute une date par visionnage — un revisionnage n’écrase pas le premier', () => {
    lib().setEpisodeWatched(KEY, 1, true);
    lib().setEpisodeWatched(KEY, 1, true);
    expect(episode(1).watchedAt).toHaveLength(2);

    lib().setEpisodeWatched(KEY, 1, false);
    expect(episode(1).watchedAt).toHaveLength(1);
  });

  it('accepte note, commentaire et favori sur un épisode jamais vu', () => {
    // Ces trois-là plantaient : appelées avec deux arguments au lieu de trois.
    lib().rateEpisode(KEY, 4, 8);
    lib().setEpisodeNote(KEY, 4, '  le meilleur  ');
    lib().toggleEpisodeFavorite(KEY, 4);
    expect(episode(4)).toMatchObject({ score: 8, note: 'le meilleur', favorite: true });
  });

  it('efface une note vide plutôt que d’enregistrer du blanc', () => {
    lib().setEpisodeNote(KEY, 2, '   ');
    expect(episode(2).note).toBeUndefined();
  });
});

describe('watchedCount', () => {
  it('compte les épisodes vus, pas les visionnages', () => {
    lib().setEpisodeWatched(KEY, 1, true);
    lib().setEpisodeWatched(KEY, 1, true);
    lib().setEpisodeWatched(KEY, 2, true);
    expect(watchedCount(lib().entries[KEY])).toBe(2);
  });

  it('ignore un épisode noté mais jamais vu', () => {
    lib().rateEpisode(KEY, 9, 10);
    expect(watchedCount(lib().entries[KEY])).toBe(0);
  });
});

describe('entrées', () => {
  it('fusionne sans perdre la date d’ajout', () => {
    const ajoutee = lib().entries[KEY]?.addedAt;
    lib().upsertEntry('anime', 20755, { score: 9 });
    expect(lib().entries[KEY]?.addedAt).toBe(ajoutee);
    expect(lib().entries[KEY]?.title).toBe('Assassination Classroom');
    expect(lib().entries[KEY]?.score).toBe(9);
  });

  it('ignore silencieusement une clé inconnue', () => {
    expect(() => lib().setScore('anime:999999', 7)).not.toThrow();
    expect(lib().entries['anime:999999']).toBeUndefined();
  });

  it('horodate chaque modification', () => {
    /* Horloge pilotée : `updatedAt` est à la milliseconde, et deux écritures
       d'affilée tombent dans la même. Sans ça le test passerait par hasard
       le jour où la machine est lente. */
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    useLibrary.setState({ entries: {} });
    lib().upsertEntry('anime', 20755, { title: 'X' });
    const avant = lib().entries[KEY]?.updatedAt;

    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
    lib().setStatus(KEY, 'current');

    expect(lib().entries[KEY]?.updatedAt).toBe('2026-01-01T00:00:05.000Z');
    expect(avant).toBe('2026-01-01T00:00:00.000Z');
    expect(lib().entries[KEY]?.startedAt).toBe('2026-01-01T00:00:05.000Z');
  });

  it('supprime', () => {
    lib().removeEntry(KEY);
    expect(lib().entries[KEY]).toBeUndefined();
  });
});

describe('visionnages datés', () => {
  const JOUR = (j: string) => `2026-0${j}T12:00:00.000Z`;

  it('enregistre à la date choisie, pas à celle du jour', () => {
    lib().logEpisodeWatch(KEY, 3, JOUR('5-02'));
    expect(episode(3).watchedAt).toEqual([JOUR('5-02')]);
    expect(progression()).toBe(3);
  });

  it('garde les dates triées quand on saisit un visionnage après coup', () => {
    /* Un revisionnage noté avec une date ancienne ne doit pas passer pour le
       dernier : c'est le dernier élément qui fait foi partout ailleurs. */
    lib().logEpisodeWatch(KEY, 1, JOUR('3-10'));
    lib().logEpisodeWatch(KEY, 1, JOUR('1-05'));
    expect(episode(1).watchedAt).toEqual([JOUR('1-05'), JOUR('3-10')]);
  });

  it('retire le dernier visionnage par défaut, sans toucher aux autres', () => {
    lib().logEpisodeWatch(KEY, 2, JOUR('1-01'));
    lib().logEpisodeWatch(KEY, 2, JOUR('2-01'));
    lib().unlogEpisodeWatch(KEY, 2);
    expect(episode(2).watchedAt).toEqual([JOUR('1-01')]);
    // Toujours vu une fois : la progression ne bouge pas.
    expect(progression()).toBe(2);
  });

  it('retire un visionnage précis par son rang', () => {
    lib().logEpisodeWatch(KEY, 2, JOUR('1-01'));
    lib().logEpisodeWatch(KEY, 2, JOUR('2-01'));
    lib().unlogEpisodeWatch(KEY, 2, 0);
    expect(episode(2).watchedAt).toEqual([JOUR('2-01')]);
  });

  it('ne recule la progression qu’une fois le dernier visionnage retiré', () => {
    lib().logEpisodeWatch(KEY, 4, JOUR('1-01'));
    lib().logEpisodeWatch(KEY, 4, JOUR('2-01'));
    expect(progression()).toBe(4);
    lib().unlogEpisodeWatch(KEY, 4);
    expect(progression()).toBe(4);
    lib().unlogEpisodeWatch(KEY, 4);
    expect(progression()).toBe(3);
  });
});

describe('étiquettes personnelles', () => {
  it('enregistre et remplace', () => {
    lib().setTags(KEY, ['Comfort', 'Peak']);
    expect(lib().entries[KEY]?.tags).toEqual(['Comfort', 'Peak']);
    lib().setTags(KEY, ['Peak']);
    expect(lib().entries[KEY]?.tags).toEqual(['Peak']);
  });

  it('efface le champ plutôt que d’enregistrer une liste vide', () => {
    lib().setTags(KEY, ['Comfort']);
    lib().setTags(KEY, []);
    expect(lib().entries[KEY]?.tags).toBeUndefined();
  });
});

describe('importEntries', () => {
  beforeEach(() => {
    useLibrary.setState({ entries: {} });
  });

  const ligne = (id: number, patch = {}) => ({
    media: 'anime' as const,
    anilistId: id,
    patch: { title: 'Titre ' + id, status: 'completed' as const, score: 8, ...patch },
  });

  it('ajoute ce qui n’existe pas', () => {
    const r = lib().importEntries([ligne(1), ligne(2)], false);
    expect(r).toEqual({ ajoutees: 2, misesAJour: 0, ignorees: 0 });
    expect(lib().entries[entryKey('anime', 1)]?.title).toBe('Titre 1');
  });

  it('LAISSE ce qui est deja suivi, par defaut', () => {
    /* Ecraser une note qu'on a mise ici avec celle d'un export vieux de six
       mois est une perte que rien n'annonce. */
    lib().importEntries([ligne(1, { score: 10 })], false);
    const r = lib().importEntries([ligne(1, { score: 3 })], false);
    expect(r).toEqual({ ajoutees: 0, misesAJour: 0, ignorees: 1 });
    expect(lib().entries[entryKey('anime', 1)]?.score).toBe(10);
  });

  it('ecrase quand on le demande', () => {
    lib().importEntries([ligne(1, { score: 10 })], false);
    const r = lib().importEntries([ligne(1, { score: 3 })], true);
    expect(r).toEqual({ ajoutees: 0, misesAJour: 1, ignorees: 0 });
    expect(lib().entries[entryKey('anime', 1)]?.score).toBe(3);
  });

  it('garde la date d’ajout d’origine en ecrasant', () => {
    // On met a jour une entree, on n'en cree pas une neuve.
    lib().importEntries([ligne(1)], false);
    const avant = lib().entries[entryKey('anime', 1)]?.addedAt;
    lib().importEntries([ligne(1, { score: 2 })], true);
    expect(lib().entries[entryKey('anime', 1)]?.addedAt).toBe(avant);
  });

  it('fusionne les identifiants au lieu de les remplacer', () => {
    /* L'entree peut deja porter un identifiant MangaBaka ou MAL : l'import ne
       doit pas le faire disparaitre en apportant le sien. */
    lib().importEntries([{ media: 'anime', anilistId: 1, patch: { ids: { mal: 77 } } }], false);
    expect(lib().entries[entryKey('anime', 1)]?.ids).toEqual({ anilist: 1, mal: 77 });
  });

  it('encaisse une liste vide', () => {
    expect(lib().importEntries([], false)).toEqual({ ajoutees: 0, misesAJour: 0, ignorees: 0 });
  });
});

describe('une écriture correspond à un changement', () => {
  /* Le défaut vécu : ouvrir la critique d'une œuvre, ne rien y toucher, et la
     voir remonter en tête de « Last completed ». Le champ s'enregistrait à la
     perte du focus, `updatedAt` avançait, et le classement suivait. */

  const dateDe = () => lib().entries[KEY]?.updatedAt ?? '';

  it('ne touche pas à `updatedAt` quand rien ne change', async () => {
    lib().setReview(KEY, 'Excellent.');
    const avant = dateDe();

    await new Promise((r) => setTimeout(r, 5));
    lib().setReview(KEY, 'Excellent.');

    expect(dateDe()).toBe(avant);
  });

  it('ne compte pas un espace de plus comme un changement', async () => {
    // `setReview` rogne : le texte enregistré est le même.
    lib().setReview(KEY, 'Excellent.');
    const avant = dateDe();

    /* L'attente n'est pas decorative : sans elle, deux ecritures dans la meme
       milliseconde donneraient la meme date et le test passerait meme sans la
       garde. Verifie en la desactivant. */
    await new Promise((r) => setTimeout(r, 5));
    lib().setReview(KEY, '  Excellent.  ');

    expect(dateDe()).toBe(avant);
  });

  it('vaut pour tout ce qui passe par une entrée, pas que la critique', async () => {
    lib().setScore(KEY, 8);
    lib().setStatus(KEY, 'completed');
    lib().setTags(KEY, ['shonen']);
    const avant = dateDe();

    await new Promise((r) => setTimeout(r, 5));
    lib().setScore(KEY, 8);
    lib().setStatus(KEY, 'completed');
    lib().setTags(KEY, ['shonen']);

    expect(dateDe()).toBe(avant);
  });

  it('écrit, évidemment, dès qu’il y a un vrai changement', async () => {
    lib().setReview(KEY, 'Bien.');
    const avant = dateDe();

    await new Promise((r) => setTimeout(r, 5));
    lib().setReview(KEY, 'Très bien.');

    expect(dateDe()).not.toBe(avant);
    expect(lib().entries[KEY]?.review).toBe('Très bien.');
  });

  it('efface une critique vidée : c’est un changement', () => {
    lib().setReview(KEY, 'Bof.');
    lib().setReview(KEY, '   ');
    expect(lib().entries[KEY]?.review).toBeUndefined();
  });
});

describe('refreshCache', () => {
  /* Ouvrir une fiche recopie ce qu'elle sait — titre, jaquette, studio — pour
     que la bibliothèque s'affiche hors ligne. Ce n'est PAS un geste de suivi :
     une œuvre terminée il y a six mois ne doit pas remonter en tête de
     « Last completed » parce qu'on l'a regardée. */

  const entree = () => {
    const e = lib().entries[KEY];
    if (!e) throw new Error('entrée absente');
    return e;
  };

  it('complète l’entrée sans toucher à `updatedAt`', async () => {
    const avant = entree().updatedAt;

    await new Promise((r) => setTimeout(r, 5));
    lib().refreshCache(KEY, { studio: 'Lerche', seasonYear: 2015 });

    expect(entree().studio).toBe('Lerche');
    expect(entree().seasonYear).toBe(2015);
    expect(entree().updatedAt).toBe(avant);
  });

  it('n’efface jamais ce qu’on sait déjà', () => {
    /* Une fiche ne porte pas toujours tout — le studio d'un manga, la saison
       d'un film. Un `{ ...entrée, ...cache }` les remettrait à rien. */
    lib().refreshCache(KEY, { studio: 'Lerche' });
    lib().refreshCache(KEY, { title: 'Assassination Classroom' });
    expect(entree().studio).toBe('Lerche');
  });

  it('ne crée rien : ouvrir une fiche n’est pas suivre une œuvre', () => {
    const inconnue = entryKey('anime', 999999);
    lib().refreshCache(inconnue, { title: 'Jamais suivi' });
    expect(lib().entries[inconnue]).toBeUndefined();
  });

  it('laisse `updatedAt` tranquille même quand il n’y a rien à écrire', async () => {
    lib().refreshCache(KEY, { studio: 'Lerche' });
    const avant = entree().updatedAt;

    await new Promise((r) => setTimeout(r, 5));
    lib().refreshCache(KEY, { studio: 'Lerche' });

    expect(entree().updatedAt).toBe(avant);
  });
});

describe('un correctif complète, il n’efface pas', () => {
  /* Mesuré avant correction : un import de remplacement dont AniList ignorait
     le studio faisait disparaître un « Bones » qu'on avait déjà. `{ ...base,
     ...patch }` écrase avec les `undefined` du correctif. */

  it('garde ce que le correctif ne porte pas, à l’import de remplacement', () => {
    lib().upsertEntry('anime', 20755, { studio: 'Lerche', genres: ['Comedy'], seasonYear: 2015 });
    lib().importEntries(
      [
        {
          media: 'anime',
          anilistId: 20755,
          patch: { title: 'Assassination Classroom', studio: undefined, genres: undefined },
        },
      ],
      true,
    );
    const e = lib().entries[KEY];
    expect(e?.studio).toBe('Lerche');
    expect(e?.genres).toEqual(['Comedy']);
    expect(e?.seasonYear).toBe(2015);
    expect(e?.title).toBe('Assassination Classroom');
  });

  it('écrase quand même ce que le correctif porte VRAIMENT', () => {
    // Compléter n'est pas refuser une correction.
    lib().upsertEntry('anime', 20755, { studio: 'Lerche' });
    lib().upsertEntry('anime', 20755, { studio: 'Bones' });
    expect(lib().entries[KEY]?.studio).toBe('Bones');
  });

  it('vaut aussi pour `upsertEntry`, pas seulement pour l’import', () => {
    lib().upsertEntry('anime', 20755, { score: 8 });
    lib().upsertEntry('anime', 20755, { title: 'Titre', score: undefined });
    expect(lib().entries[KEY]?.score).toBe(8);
  });
});
