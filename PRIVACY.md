# Confidentialité — WORK TIME V1

WORK TIME réduit visuellement les distractions sur YouTube. L’extension n’exploite aucun serveur et ne transmet aucune donnée à son développeur ou à un tiers.

## Données locales

Seuls les réglages nécessaires au fonctionnement sont conservés dans `chrome.storage.local` : mode d’activation, option de flou, planning hebdomadaire et date de fin de pause. Ils restent sur cet appareil. Aucun mécanisme de synchronisation ou d’export automatique n’est utilisé.

L’extension consulte le DOM de la page YouTube pour repérer les miniatures et blocs d’informations à modifier visuellement. Elle ne stocke ni ne transmet les titres, les recherches, l’historique, les URL regardées ou les identifiants du compte.

## Réseau

Aucune requête réseau, police externe, publicité, analyse d’usage ou code distant n’est ajouté par l’extension. Les requêtes normales de YouTube restent soumises aux règles de YouTube ; masquer une miniature ne bloque pas son téléchargement par le site.

## Permissions

- `storage` : enregistrer les réglages locaux.
- `alarms` : actualiser l’état planifié et le badge.
- Scripts de contenu sur `https://www.youtube.com/*` et `https://youtube.com/*` : modifier uniquement la présentation du site.

## Suppression

Désinstaller l’extension depuis `chrome://extensions` supprime ses réglages locaux. Vous pouvez aussi effacer son stockage avec les outils de développement de Chrome.

WORK TIME est un outil de personnalisation de l’affichage de YouTube.
