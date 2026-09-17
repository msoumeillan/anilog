import { describe, expect, it } from 'vitest';
import { keyframeStaffListUrl } from './external';

describe('keyframeStaffListUrl', () => {
  it('reproduit l’exemple de référence', () => {
    /* Le seul cas vérifié à la main : le site est derrière Cloudflare et
       refuse toute requête automatisée, y compris sur une URL inexistante. */
    expect(keyframeStaffListUrl('Shingeki no Kyojin Season 3')).toBe(
      'https://keyframe-staff-list.com/staff/shingeki-no-kyojin-season-3',
    );
  });

  it('met en minuscules et relie par des tirets', () => {
    expect(keyframeStaffListUrl('Ansatsu Kyoushitsu')).toBe(
      'https://keyframe-staff-list.com/staff/ansatsu-kyoushitsu',
    );
  });

  it('réduit une suite de séparateurs à un seul tiret', () => {
    expect(keyframeStaffListUrl('Fate/stay night: Heaven’s Feel')).toBe(
      'https://keyframe-staff-list.com/staff/fate-stay-night-heaven-s-feel',
    );
  });

  it('ne laisse pas de tiret au bord', () => {
    expect(keyframeStaffListUrl('  Steins;Gate  ')).toBe(
      'https://keyframe-staff-list.com/staff/steins-gate',
    );
  });

  it('retire les accents plutôt que de les jeter', () => {
    expect(keyframeStaffListUrl('Pokémon')).toBe('https://keyframe-staff-list.com/staff/pokemon');
  });

  it('garde les chiffres', () => {
    expect(keyframeStaffListUrl('86: Eighty Six')).toBe(
      'https://keyframe-staff-list.com/staff/86-eighty-six',
    );
  });

  it('renvoie null quand il n’y a pas de titre romaji', () => {
    expect(keyframeStaffListUrl(null)).toBeNull();
    expect(keyframeStaffListUrl('')).toBeNull();
    /* Un titre entièrement japonais ne donne aucun slug : mieux vaut pas de
       lien qu'un lien vers /staff/. */
    expect(keyframeStaffListUrl('進撃の巨人')).toBeNull();
  });
});
