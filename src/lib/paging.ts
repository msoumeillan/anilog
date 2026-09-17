/**
 * Jusqu'où le défilement charge tout seul.
 *
 * Au-delà de cinq pages — environ 250 résultats — continuer à faire défiler
 * n'est plus une recherche, c'est un filtre qui manque. Le bouton qui prend le
 * relais protège au passage le quota d'AniList (30 requêtes par minute) et
 * empêche le DOM d'enfler indéfiniment : c'était exactement le défaut de la
 * page Saison de la v1, qui empilait jusqu'à 360 cartes.
 *
 * UNE déclaration, et c'est le sujet de ce fichier. La valeur vivait dans cinq
 * fichiers, dont deux disaient en commentaire « même valeur et même raison que
 * sur Browse » — une copie qui se sait copie. Le cinquième portait 4 sans dire
 * pourquoi, ce qui ressemblait moins à une décision qu'à une dérive.
 */
export const AUTO_PAGES = 5;
