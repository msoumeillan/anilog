/**
 * Empreinte courte et stable d'une chaîne.
 *
 * Sert à mettre le TEXTE d'une requête dans sa clé de cache : ajouter un champ
 * change la clé tout seul. C'est la version automatique du compteur qu'il
 * fallait penser à incrémenter à la main — et qu'on a oublié une fois, ce qui
 * a servi des données à l'ancienne forme au nouveau code.
 *
 * djb2 : pas cryptographique, et ce n'est pas le sujet. On veut seulement que
 * deux textes différents donnent deux clés différentes.
 */
export function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
