# Publier Chantio sur Google Play

Chantio est une PWA (appli web installable). Google Play l'accepte sous forme de « Trusted Web Activity » (TWA).

1. Créez un compte développeur : https://play.google.com/console (25 $ une seule fois).
2. Allez sur https://www.pwabuilder.com, entrez l'adresse de l'appli (https://chantio-alpha.vercel.app ou votre domaine).
3. Cliquez « Package for stores » → **Android** → « Generate ».
   - Package ID : `app.vercel.chantio_alpha.twa` (ou celui de votre domaine).
   - Téléchargez le .zip : il contient le fichier **.aab** et le fichier **assetlinks.json**.
4. Remplacez le contenu de `public/.well-known/assetlinks.json` par celui fourni par PWABuilder (empreinte SHA-256), puis redéployez.
   Sans cette étape, l'appli s'ouvre avec une barre d'adresse.
5. Dans la Play Console : « Créer une application » → importez le .aab dans « Tests internes », remplissez la fiche
   (description, captures d'écran, icône 512 px : `public/icon-512.png`), la politique de confidentialité
   (`/legal/confidentialite`) et le questionnaire de contenu.
6. Les nouveaux comptes personnels doivent faire un test fermé avec 12 testeurs pendant 14 jours avant la mise en production.

Conseil : utilisez un nom de domaine à vous (ex. chantio.fr) avant de publier : changer de domaine ensuite oblige à republier l'appli.
