import { beforeEach, describe, expect, it } from 'vitest';
import { useToast } from './toast';

const toast = () => useToast.getState();

beforeEach(() => {
  useToast.setState({ message: null });
});

describe('le bandeau de confirmation', () => {
  it('remplace le message précédent plutôt que d’empiler', () => {
    toast().show('Idol was added to “A”');
    toast().show('Idol was added to “B”');
    expect(toast().message?.text).toBe('Idol was added to “B”');
  });

  it('donne un nouvel identifiant à un message identique', () => {
    /* C'est l'identifiant qui relance le minuteur : deux fois le même geste
       doit se confirmer deux fois, pas s'effacer au bout du premier délai. */
    toast().show('Idol was removed from “A”');
    const premier = toast().message?.id;
    toast().show('Idol was removed from “A”');
    expect(toast().message?.id).not.toBe(premier);
  });

  it('n’efface pas le message qui a remplacé celui dont le délai expire', () => {
    toast().show('Idol was added to “A”');
    const ancien = toast().message?.id ?? 0;
    toast().show('Mephisto was added to “A”');

    toast().dismiss(ancien);
    expect(toast().message?.text).toBe('Mephisto was added to “A”');

    toast().dismiss(toast().message?.id ?? 0);
    expect(toast().message).toBeNull();
  });
});
