# Chantio — SaaS devis & factures pour plombiers chauffagistes

Next.js 14 · Supabase (comptes + base de données + stockage) · Stripe (abonnements) · Claude (scan de plaque) · Vercel (hébergement)

## Fonctions
- Inscription / connexion, une entreprise par compte, données isolées (RLS)
- Essai gratuit 14 jours puis abonnement Stripe (29 € HT/mois, modifiable dans Stripe)
- Clients, catalogue (catalogue de départ plomberie/chauffage en 1 clic), marge par devis
- Devis : lignes, TVA 5,5/10/20 %, remise, acompte, numérotation D-2026-0001
- Signature au doigt sur place, ou lien à distance (WhatsApp, SMS, e-mail)
- Devis → facture en 1 clic, facture d'acompte, avoir
- Facture numérotée sans trou (F-2026-0001) et verrouillée après émission
- PDF avec mentions légales (décennale, pénalités, 40 €, TVA réduite, art. 293 B)
- Paiement enregistré, relance par e-mail, factures en retard signalées
- Planning hebdo des interventions + itinéraire
- Scan de plaque chaudière/PAC par photo
- Export CSV pour le comptable
- Installable sur l'écran d'accueil (PWA)

## Mise en ligne (tout depuis le téléphone)

### 1. Supabase
1. supabase.com → New project (région Europe — Paris ou Francfort).
2. SQL Editor → New query → coller tout `supabase/schema.sql` → Run.
3. Authentication → URL Configuration → Site URL = l'adresse Vercel (étape 3).
4. Project Settings → API : noter `Project URL`, `anon public`, `service_role`.

### 2. Clé Anthropic (scan de plaque)
console.anthropic.com → API Keys → créer une clé.

### 3. Vercel
1. vercel.com → Add New → Project → importer le dépôt GitHub.
2. Environment Variables : remplir toutes les variables de `.env.example`.
3. Deploy.

### 4. Stripe
1. dashboard.stripe.com → Catalogue de produits → créer « Abonnement Pro », 29 € HT mensuel → copier le `price_...` dans `STRIPE_PRICE_ID`.
2. Développeurs → Webhooks → Ajouter un endpoint : `https://TON-SITE/api/stripe/webhook`,
   événements `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → copier le secret `whsec_...` dans `STRIPE_WEBHOOK_SECRET`.
3. Paramètres → Portail client → activer (pour que les clients gèrent leur abonnement).
4. Redéployer sur Vercel après avoir ajouté les variables.

## À faire avant de vendre
- CGV/CGU, mentions légales et politique de confidentialité (RGPD) du SaaS.
- Réforme de la facture électronique : à partir de septembre 2026 toutes les entreprises doivent pouvoir recevoir des factures électroniques, et l'émission devient obligatoire pour les TPE/PME en septembre 2027, via une plateforme agréée (PA). Prévoir un partenariat API avec une plateforme agréée et la génération Factur-X (V2).
- Faire valider par un expert-comptable l'obligation de certification anti-fraude TVA (art. 286 I-3° bis du CGI), puisque l'appli enregistre des paiements de particuliers.
