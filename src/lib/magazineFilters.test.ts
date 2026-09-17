import { describe, expect, it } from 'vitest';
import { activeCount, magazinePath, NO_FILTERS, TYPES } from './magazineFilters';

const path = (over = {}) => magazinePath(83, 1, 25, { ...NO_FILTERS, ...over });

describe('magazinePath', () => {
  it('ordonne par popularité tant qu’on ne demande rien d’autre', () => {
    // Le classement de MyAnimeList est la raison d'être de la page.
    expect(path()).toBe('/manga?magazines=83&limit=25&page=1&order_by=members&sort=desc');
  });

  it('n’écrit pas les filtres vides', () => {
    expect(path()).not.toContain('type=');
    expect(path()).not.toContain('status=');
    expect(path()).not.toContain('start_date=');
  });

  it('traduit un tri en couple ordre + sens', () => {
    expect(path({ sort: 'oldest' })).toContain('order_by=start_date&sort=asc');
    expect(path({ sort: 'title' })).toContain('order_by=title&sort=asc');
  });

  it('retombe sur la popularité si le tri est inconnu', () => {
    expect(path({ sort: 'bogus' })).toContain('order_by=members&sort=desc');
  });

  it('ne borne QUE le début : « from » n’est pas une année', () => {
    /* MyAnimeList a un `end_date`, mais il borne la FIN de parution. Mesuré
       sur la Shounen Jump : start_date seul rend 248 titres, avec end_date il
       en reste 7 — ceux commencés ET terminés dans l'année. */
    const p = path({ from: '2020' });
    expect(p).toContain('start_date=2020-01-01');
    expect(p).not.toContain('end_date');
  });

  it('pose le type et l’état tels que MyAnimeList les nomme', () => {
    expect(path({ type: 'oneshot', status: 'complete' })).toContain('type=oneshot');
    expect(path({ type: 'oneshot', status: 'complete' })).toContain('status=complete');
  });

  it('dit « lightnovel », pas « novel » comme le reste de l’app', () => {
    /* Mesuré : sur Dragon Magazine, `novel` rend zéro et `lightnovel` rend 36
       — reprendre notre vocabulaire ici donnerait un filtre muet. */
    expect(TYPES.find((t) => t.label === 'Light novel')?.value).toBe('lightnovel');
  });
});

describe('activeCount', () => {
  it('ne compte pas le tri : il y en a toujours un', () => {
    expect(activeCount(NO_FILTERS)).toBe(0);
    expect(activeCount({ ...NO_FILTERS, sort: 'score' })).toBe(0);
  });

  it('compte ce qui restreint vraiment', () => {
    expect(activeCount({ ...NO_FILTERS, type: 'manga', from: '2015' })).toBe(2);
  });
});
