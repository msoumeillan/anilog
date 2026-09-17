import { describe, expect, it } from 'vitest';
import { readHint } from './mediaHint';

describe('readHint', () => {
  it('lit un indice complet', () => {
    expect(readHint({ title: 'Attack on Titan', cover: 'https://x/y.jpg' })).toEqual({
      title: 'Attack on Titan',
      cover: 'https://x/y.jpg',
    });
  });

  it('accepte un titre sans affiche', () => {
    expect(readHint({ title: 'Monster' })).toEqual({ title: 'Monster', cover: undefined });
  });

  /* Tout ce qui suit arrive vraiment : URL collée, rechargement, retour
     arrière sur une entrée écrite par une version précédente de l'app. */
  it('ne rend rien quand il n’y a pas d’état', () => {
    expect(readHint(null)).toBeNull();
    expect(readHint(undefined)).toBeNull();
  });

  it('ne rend rien sur un état qui n’est pas un objet', () => {
    expect(readHint('Attack on Titan')).toBeNull();
    expect(readHint(42)).toBeNull();
  });

  it('refuse un état sans titre exploitable — c’est lui qui porte l’affichage', () => {
    expect(readHint({})).toBeNull();
    expect(readHint({ cover: 'https://x/y.jpg' })).toBeNull();
    expect(readHint({ title: '' })).toBeNull();
    expect(readHint({ title: '   ' })).toBeNull();
    expect(readHint({ title: 123 })).toBeNull();
  });

  it('ignore une affiche mal formée plutôt que de la passer à un `src`', () => {
    expect(readHint({ title: 'Monster', cover: 42 })).toEqual({
      title: 'Monster',
      cover: undefined,
    });
    expect(readHint({ title: 'Monster', cover: '' })).toEqual({
      title: 'Monster',
      cover: undefined,
    });
  });

  it('laisse passer les clés que react-router ajoute pour son compte', () => {
    /* `idx` et `key` cohabitent dans `history.state` ; `useGoBack` en dépend,
       et lire l'indice ne doit surtout pas s'en formaliser. */
    expect(readHint({ title: 'Monster', idx: 3, key: 'abc' })).toEqual({
      title: 'Monster',
      cover: undefined,
    });
  });
});
