import LegalPage, { V } from "../LegalPage";
import { LEGAL as L } from "@/lib/legal";

export const metadata = { title: `Confidentialité — ${L.app}` };

export default function Page() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        Cette politique explique comment <V>{L.editor}</V> traite les données personnelles dans le cadre du service {L.app}, conformément au Règlement
        général sur la protection des données (RGPD) et à la loi Informatique et Libertés.
      </p>

      <h2>1. Deux rôles distincts</h2>
      <ul>
        <li><b>Données des Abonnés</b> (les professionnels inscrits) : l'Éditeur est <b>responsable de traitement</b>.</li>
        <li><b>Données des clients des Abonnés</b> (particuliers et entreprises figurant sur les devis, factures, contrats, photos de chantier, signatures) : l'Abonné est responsable de traitement, l'Éditeur est <b>sous-traitant</b> et agit uniquement sur ses instructions (voir l'accord de sous-traitance).</li>
      </ul>

      <h2>2. Données des Abonnés traitées par l'Éditeur</h2>
      <ul>
        <li>Identification et contact : nom, e-mail, entreprise, coordonnées professionnelles, mentions légales.</li>
        <li>Abonnement : historique de paiement (les données de carte bancaire sont traitées uniquement par Stripe).</li>
        <li>Données techniques : journaux de connexion nécessaires à la sécurité.</li>
      </ul>

      <h2>3. Finalités et bases légales</h2>
      <ul>
        <li>Fournir le Service et gérer le compte — exécution du contrat.</li>
        <li>Facturer l'abonnement et tenir la comptabilité — obligation légale.</li>
        <li>Assurer la sécurité et prévenir la fraude — intérêt légitime.</li>
        <li>Envoyer des informations sur le Service (évolutions, échéances) — intérêt légitime ; aucun e-mail publicitaire de tiers.</li>
      </ul>

      <h2>4. Durées de conservation</h2>
      <ul>
        <li>Compte : pendant l'abonnement, puis 30 jours après sa fin (export possible), puis suppression.</li>
        <li>Pièces comptables liées à l'abonnement : 10 ans.</li>
        <li>Journaux techniques : 12 mois maximum.</li>
      </ul>

      <h2>5. Destinataires et sous-traitants</h2>
      <ul>
        <li>Supabase Inc. — base de données et stockage des fichiers (serveurs dans l'Union européenne, Francfort).</li>
        <li>Vercel Inc. — hébergement de l'application (États-Unis / réseau mondial).</li>
        <li>Sendinblue SAS (Brevo), Paris — envoi des e-mails.</li>
        <li>Stripe Payments Europe Ltd, Irlande — paiement des abonnements.</li>
        <li>Anthropic PBC, États-Unis — lecture automatique des plaques signalétiques (seule la photo de la plaque est transmise).</li>
      </ul>
      <p>
        Les transferts hors de l'Union européenne sont encadrés par les clauses contractuelles types de la Commission européenne et, le cas échéant,
        par le cadre de protection des données UE–États-Unis. Les données ne sont jamais vendues.
      </p>

      <h2>6. Cookies</h2>
      <p>
        Le Service n'utilise que des cookies strictement nécessaires à son fonctionnement (maintien de la connexion). Aucun cookie publicitaire ni de mesure
        d'audience n'est déposé ; aucun consentement n'est donc requis.
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Connexions chiffrées (HTTPS), mots de passe chiffrés, cloisonnement strict des données entre Abonnés au niveau de la base de données,
        photos de chantier privées accessibles uniquement par liens temporaires, sauvegardes quotidiennes.
      </p>

      <h2>8. Vos droits</h2>
      <p>
        Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données, ainsi que du droit de
        définir des directives sur leur sort après votre décès. Pour les exercer : <V>{L.email}</V>. Réponse sous un mois.
      </p>
      <p>
        Si vous êtes client d'un Abonné (vos données figurent sur un devis ou une facture), adressez votre demande directement à l'entreprise concernée ;
        l'Éditeur l'aidera à y répondre.
      </p>
      <p>Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).</p>
    </LegalPage>
  );
}
