# Développer WORK TIME

Le dossier racine peut être chargé directement dans Chrome. Il n’y a aucune compilation ni dépendance JavaScript à l’exécution. Node.js **20 ou plus** est nécessaire seulement pour les outils et les tests.

## Installation des outils

Depuis le dossier source complet (pas l’archive allégée de la release) :

```bash
npm ci
npx playwright install chromium
```

Sous Linux ou en CI, installez aussi les dépendances système du navigateur :

```bash
npx playwright install --with-deps chromium
```

## Commandes

| Commande | Résultat |
| --- | --- |
| `npm test` | Tests unitaires du planning et du service worker avec `node:test`. |
| `npm run test:browser` | Extension chargée réellement dans Chromium ; tests sur des pages YouTube locales. |
| `npm run screenshots -- --skip-live --out validation/verification` | Captures reproductibles de l’extension et des pages de test, sans tentative YouTube en réseau réel. |
| `npm run package` | Archive `dist/work-time-v1.0.0.zip`, limitée aux fichiers d’exécution et à la documentation d’installation. |

Les tests et captures utilisent un **profil Chromium temporaire**, supprimé à la fermeture. Ils ne touchent pas au profil Chrome personnel.

Par défaut, Playwright utilise sa propre version de Chromium. Pour un autre exécutable, définissez `WORK_TIME_CHROMIUM` avec son chemin complet. `HEADED=1` permet d’afficher le navigateur. Ne pointez pas vers un profil personnel.

### Tentative réseau facultative

`npm run screenshots -- --out validation/verification` effectue, en plus des captures locales, une tentative limitée sur le vrai site YouTube. Le consentement, la connexion ou le réseau peuvent la limiter. Le résultat est consigné dans le rapport ; une page incomplète n’est pas présentée comme un test réussi de toutes les recommandations.

Cette activité réseau appartient **aux outils de développement**. L’extension elle-même n’ajoute aucune requête réseau.

### Fichiers générés

- `validation/` : rapports, captures et diagnostics locaux.
- `dist/` : archives distribuables.
- `node_modules/` : dépendances de développement.

Ces dossiers sont exclus de Git. Les captures publiques sont sélectionnées explicitement dans `docs/images/`, sans profil, cookies, journaux ou données personnelles.

## Architecture

```text
manifest.json              Déclaration Chrome Manifest V3 et permissions
background.js              Service worker : badge et alarmes
shared/schedule.js         Préférences, normalisation et calcul du planning
shared/ui.js / ui.css       État et styles partagés de l’interface
popup/                     Contrôle rapide
options/                   Planning hebdomadaire et aperçu
content/                   Filtre visuel YouTube
assets/                    Icônes locales

tests/                     Tests unitaires et navigateur
tests/fixtures/            Pages YouTube synthétiques
tools/                     Captures, navigateur de test, packaging
docs/                      Documentation et captures publiques
```

### Contrat de réglages

La clé `workTimeSettings` est conservée dans `chrome.storage.local`. L’interface, le service worker et le script de contenu utilisent le même moteur `WorkTime`.

- `mode` : `auto`, `on` ou `off`.
- `blurTitles` : nom historique conservé pour compatibilité ; contrôle désormais **tout le bloc d’informations**.
- `pauseUntil` : date de fin de pause, en millisecondes Unix.
- `schedule` : sept jours, index JavaScript de 0 (dimanche) à 6 (samedi), chacun avec `enabled` et jusqu’à trois couples `start` / `end` au format `HH:MM`.

Le calcul utilise l’heure locale. Les créneaux peuvent traverser minuit et se chevaucher. Les valeurs invalides sont normalisées ; les heures identiques ne représentent pas une journée complète.

### Modifier les sélecteurs YouTube

1. Reproduisez le format concerné dans `tests/fixtures/`.
2. Préservez les liens, les noms accessibles, les dimensions et le lecteur en cours.
3. Ne modifiez pas le pseudo-élément **`ytd-thumbnail::before`** : certaines versions de YouTube l’utilisent comme élément en flux pour maintenir le ratio de l’image. Le masque opaque utilise `::after`.
4. Le flou s’applique au conteneur d’informations le plus extérieur, pas à ses enfants en plus, pour éviter un double flou.
5. Vérifiez le survol, le focus clavier, les changements dynamiques et la restauration après désactivation.
6. Lancez les tests et comparez les captures avant de proposer le changement.

## Vérification manuelle

- Accueil : miniatures remplacées, puis informations floutées lorsque l’option est activée.
- Défilement : nouvelles cartes et Shorts pris en charge.
- Recherche et clic vers une vidéo utile : navigation et lecture accessibles.
- Page vidéo : lecteur, titre, chaîne et informations de la vidéo regardée intacts ; recommandations atténuées.
- Survol et clavier : informations temporairement lisibles.
- Pause, reprise et désactivation : affichage normal restauré.
- Planning : activation et arrêt autour d’un créneau défini à l’heure actuelle.

Après toute modification du code, rechargez l’extension dans `chrome://extensions`, puis l’onglet YouTube.

## Proposer une amélioration

Ouvrez une issue décrivant le problème ou une pull request ciblée. Ajoutez un test de non-régression lorsque possible. N’incluez ni cookies, jetons, profils navigateur, journaux privés ou captures de comptes non anonymisées.

[Retour au README](../README.md)
