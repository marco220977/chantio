import LegalPage, { V } from "../LegalPage";
import { LEGAL as L } from "@/lib/legal";

export const metadata = { title: `Accord de sous-traitance — ${L.app}` };

export default function Page() {
  return (
    <LegalPage title="Accord de sous-traitance des données (article 28 du RGPD)">
      <p>
        Le présent accord fait partie des conditions générales du service {L.app}. Il est conclu entre l'Abonné (le « Responsable de traitement ») et
        <V>{" " + L.editor}</V> (le « Sous-traitant »). Il s'applique aux données personnelles des clients de l'Abonné traitées au moyen du Service.
      </p>

      <h2>1. Description du traitement</h2>
      <ul>
        <li><b>Objet et finalité</b> : gestion commerciale de l'Abonné — devis, factures, contrats d'entretien, attestations, procès-verbaux de réception, SAV, planning, suivi de chantier, envoi des documents par e-mail.</li>
        <li><b>Durée</b> : durée de l'abonnement, plus 30 jours.</li>
        <li><b>Personnes concernées</b> : clients et prospects de l'Abonné, signataires, personnes figurant sur les photos de chantier.</li>
        <li><b>Données</b> : nom, adresse, téléphone, e-mail, SIRET, adresse des travaux, caractéristiques des équipements, montants, signatures manuscrites numérisées, photos du signataire (facultatives), photos de chantier, notes.</li>
        <li><b>Opérations</b> : hébergement, stockage, consultation, génération de documents, envoi d'e-mails, sauvegarde, suppression.</li>
      </ul>

      <h2>2. Obligations du Sous-traitant</h2>
      <ul>
        <li>Traiter les données uniquement pour la finalité ci-dessus et sur instruction documentée de l'Abonné (l'utilisation du Service vaut instruction).</li>
        <li>Garantir la confidentialité : seules les personnes habilitées, soumises à une obligation de confidentialité, peuvent accéder aux données, et uniquement pour l'assistance ou la maintenance.</li>
        <li>Mettre en œuvre des mesures de sécurité appropriées : chiffrement des connexions, cloisonnement des données par Abonné, contrôle d'accès, sauvegardes, stockage privé des photos.</li>
        <li>Ne faire appel à des sous-traitants ultérieurs que dans les conditions de l'article 3.</li>
        <li>Aider l'Abonné à répondre aux demandes d'exercice des droits des personnes concernées.</li>
        <li>Notifier à l'Abonné toute violation de données le concernant dans un délai maximal de 48 heures après en avoir pris connaissance, avec les informations utiles.</li>
        <li>Aider l'Abonné, le cas échéant, à réaliser une analyse d'impact.</li>
        <li>En fin de contrat, permettre l'export des données pendant 30 jours puis les supprimer, copies de sauvegarde comprises dans le cycle normal de rotation.</li>
        <li>Mettre à disposition les informations nécessaires pour démontrer le respect du présent accord et permettre des audits raisonnables, à la charge de l'Abonné, avec un préavis de 30 jours.</li>
      </ul>

      <h2>3. Sous-traitants ultérieurs</h2>
      <p>L'Abonné autorise le recours aux sous-traitants suivants :</p>
      <ul>
        <li>Supabase Inc. — hébergement de la base de données et des fichiers (Union européenne).</li>
        <li>Vercel Inc. — hébergement de l'application.</li>
        <li>Sendinblue SAS (Brevo) — envoi des e-mails.</li>
        <li>Anthropic PBC — lecture des photos de plaques signalétiques (aucune donnée client transmise).</li>
      </ul>
      <p>
        Le Sous-traitant informe l'Abonné de tout ajout ou remplacement au moins 30 jours à l'avance ; l'Abonné peut s'y opposer en résiliant son abonnement.
        Les transferts hors Union européenne sont encadrés par les clauses contractuelles types de la Commission européenne.
      </p>

      <h2>4. Obligations de l'Abonné</h2>
      <ul>
        <li>Disposer d'une base légale pour traiter les données de ses clients et les informer (mention d'information sur ses devis ou conditions générales).</li>
        <li>Recueillir le consentement du signataire avant toute photo lors d'une signature, et des personnes éventuellement visibles sur les photos de chantier.</li>
        <li>Ne saisir que les données nécessaires ; ne pas saisir de données sensibles (santé, etc.) dans les notes.</li>
        <li>Respecter les durées de conservation applicables à son activité.</li>
      </ul>

      <h2>5. Contact</h2>
      <p>Pour toute question relative aux données : <V>{L.email}</V></p>
    </LegalPage>
  );
}
