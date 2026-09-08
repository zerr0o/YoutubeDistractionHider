# Validation de la V1

La validation distingue les tests reproductibles, les captures de pages de test et les vérifications limitées sur YouTube réel.

## Tests automatisés

| Suite | Vérifications réussies pour la V1 |
| --- | ---: |
| Planning et service worker (`npm test`) | 21 |
| Extension réellement chargée dans Chromium (`npm run test:browser`) | 17 |

Les tests couvrent les limites horaires, les chevauchements, les créneaux de nuit, les changements d’heure, les pauses, les alarmes, la sauvegarde et les valeurs invalides.

Les tests navigateur couvrent le masquage classique et moderne, les Shorts, les recommandations, le flou de tout le bloc d’informations, le survol et le focus clavier, les liens, les cartes ajoutées dynamiquement, la restauration à l’arrêt et une vraie lecture HTML vidéo.

La géométrie native des miniatures est comparée avec et sans filtre. Les fenêtres active, inactive, planifiée et en pause restent sous la limite de 600 px de Chrome. L’interface est aussi vérifiée sans débordement horizontal à 1440, 768 et 420 px.

## Captures publiques

- `docs/images/popup.png` et `planning.png` montrent l’extension réellement chargée.
- `youtube-home.png` et `youtube-watch.png` montrent des **pages HTML locales de test**, et non un compte YouTube réel. La mention « LOCAL QA FIXTURE · NOT LIVE YOUTUBE » est visible dans les images.
- `hero.svg` est une illustration de présentation, pas une capture.

Ces pages synthétiques permettent de reproduire plusieurs structures YouTube et de vérifier des états sans exposer l’historique ou les abonnements d’une personne.

## Vérifications sur YouTube réel

Des pages publiques de recherche et de lecture ont aussi été ouvertes dans un profil temporaire, sans connexion à un compte et après refus du consentement facultatif. Le masquage, le flou des informations et une lecture vidéo non interrompue ont été observés. Une capture finale a confirmé le centrage des miniatures de recherche après réparation du maintien du ratio natif.

L’accueil sans compte et sans historique peut ne proposer aucune vidéo. Il ne valide donc pas une page d’accueil personnalisée. Ces essais ne couvrent pas toutes les expériences de YouTube, tous les comptes ou tous les formats publicitaires.

## Revue visuelle

Deux passes ont été examinées par deux agents critiques distincts, sur leurs propres captures. La seconde a conclu à l’absence de correction bloquante dans les vues vérifiées. Il s’agit d’une revue de développement, **pas d’une certification Chrome Web Store ou d’accessibilité**.

Les diagnostics bruts restent locaux dans `validation/`, exclu de Git. Les commandes et la procédure de reproduction sont dans le [guide de développement](DEVELOPMENT.md).

[Retour au README](../README.md)
