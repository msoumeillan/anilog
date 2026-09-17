import { describe, expect, it } from 'vitest';
import {
  baseRole,
  filterByFamily,
  priorityStaff,
  roleFamily,
  staffFamilies,
  type StaffCredit,
} from './staff';

const credit = (role: string, id: number, full = 'Nom ' + id): StaffCredit => ({
  role,
  node: { id, name: { full }, image: { medium: null } },
});

describe('baseRole', () => {
  it('retire la précision entre parenthèses', () => {
    expect(baseRole('Key Animation (ep 9)')).toBe('Key Animation');
    expect(baseRole('Theme Song Composition (OP)')).toBe('Theme Song Composition');
    expect(baseRole('ADR Director (English; eps. 16-22)')).toBe('ADR Director');
  });

  it('laisse intact un intitulé simple', () => {
    expect(baseRole('Original Creator')).toBe('Original Creator');
  });
});

describe('priorityStaff', () => {
  /* Ordre volontairement mélangé : c'est ce que renvoie AniList. */
  const credits = [
    credit('Sound Director', 1),
    credit('Character Design', 2),
    credit('Original Creator', 3),
    credit('Music', 4),
    credit('Storyboard (ep 20)', 5),
    credit('Director', 6),
    credit('Script', 7),
    credit('Producer (English)', 8),
  ];

  it('remonte les rôles clés dans l’ordre voulu', () => {
    expect(priorityStaff(credits, 4).map((c) => c.role)).toEqual([
      'Original Creator',
      'Director',
      'Character Design',
      'Music',
    ]);
  });

  it('complète avec les suivants de la liste de priorité', () => {
    expect(priorityStaff(credits, 6).map((c) => c.role)).toEqual([
      'Original Creator',
      'Director',
      'Character Design',
      'Music',
      'Script',
      'Sound Director',
    ]);
  });

  it('complète avec l’ordre d’AniList quand la priorité est épuisée', () => {
    const maigre = [
      credit('Storyboard (ep 1)', 1),
      credit('Director', 2),
      credit('Key Animation', 3),
    ];
    expect(priorityStaff(maigre, 6).map((c) => c.role)).toEqual([
      'Director',
      'Storyboard (ep 1)',
      'Key Animation',
    ]);
  });

  it('ne montre pas deux fois la même personne', () => {
    /* Cas courant : le réalisateur est aussi storyboardeur et scénariste. */
    const cumul = [
      credit('Director', 10),
      credit('Script', 10),
      credit('Storyboard (ep 1)', 10),
      credit('Music', 11),
    ];
    const six = priorityStaff(cumul, 6);
    expect(six).toHaveLength(2);
    expect(six.map((c) => c.node.id)).toEqual([10, 11]);
  });

  it('ne retient qu’un nom par rôle prioritaire', () => {
    /* Demon Slayer crédite deux compositeurs. Les prendre tous les deux
       mangeait une place et évinçait le scénariste. */
    const deuxCompositeurs = [
      credit('Original Creator', 1),
      credit('Director', 2),
      credit('Character Design', 3),
      credit('Music', 4, 'Yuki Kajiura'),
      credit('Music', 5, 'Gou Shiina'),
      credit('Series Composition', 6),
      credit('Sound Director', 7),
    ];
    const six = priorityStaff(deuxCompositeurs, 6);
    expect(six.filter((c) => c.role === 'Music')).toHaveLength(1);
    expect(six[3]?.node.name.full).toBe('Yuki Kajiura');
    expect(six.map((c) => c.role)).toContain('Series Composition');
  });

  it('ne dépasse jamais le nombre demandé', () => {
    expect(priorityStaff(credits, 3)).toHaveLength(3);
    expect(priorityStaff([], 6)).toHaveLength(0);
  });
});

describe('roleFamily', () => {
  it('reconnaît l’animation clé, quel que soit le suffixe', () => {
    expect(roleFamily('Key Animation')).toBe('key');
    expect(roleFamily('Key Animation (ep 9)')).toBe('key');
    expect(roleFamily('2nd Key Animation (ep 25)')).toBe('key');
  });

  it('ne range pas « Chief Animation Director » dans la réalisation', () => {
    /* Le piège : l'intitulé contient « Director ». L'ordre des tests décide. */
    expect(roleFamily('Chief Animation Director')).toBe('animation');
    expect(roleFamily('Assistant Chief Animation Director (ep 4)')).toBe('animation');
    expect(roleFamily('Director')).toBe('direction');
    expect(roleFamily('Episode Director (ep 1)')).toBe('direction');
  });

  it('range les grandes familles', () => {
    expect(roleFamily('Original Creator')).toBe('story');
    expect(roleFamily('Series Composition')).toBe('story');
    expect(roleFamily('Character Design')).toBe('design');
    expect(roleFamily('Music')).toBe('sound');
    expect(roleFamily('Theme Song Composition (OP)')).toBe('sound');
    expect(roleFamily('Executive Producer')).toBe('production');
    expect(roleFamily('ADR Director (English)')).toBe('dub');
  });

  it('retombe sur « other » plutôt que d’inventer', () => {
    expect(roleFamily('Subtitle Timing')).toBe('other');
  });
});

describe('staffFamilies', () => {
  it('ne renvoie que les familles présentes, dans l’ordre de lecture', () => {
    const credits = [
      credit('Music', 1),
      credit('Key Animation (ep 3)', 2),
      credit('Original Creator', 3),
    ];
    expect(staffFamilies(credits)).toEqual(['story', 'key', 'sound']);
  });

  it('renvoie une liste vide sans crédits', () => {
    expect(staffFamilies([])).toEqual([]);
  });
});

describe('filterByFamily', () => {
  const credits = [
    credit('Key Animation (ep 1)', 1),
    credit('Director', 2),
    credit('2nd Key Animation', 3),
  ];

  it('isole une famille', () => {
    expect(filterByFamily(credits, 'key').map((c) => c.node.id)).toEqual([1, 3]);
  });

  it('ne filtre rien sans famille demandée', () => {
    expect(filterByFamily(credits, '')).toHaveLength(3);
  });
});
