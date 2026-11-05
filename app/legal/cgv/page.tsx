import LegalPage, { V } from "../LegalPage";
import { LEGAL as L } from "@/lib/legal";

export const metadata = { title: `Conditions générales — ${L.app}` };

export default function Page() {
  return (
    <LegalPage title="Conditions générales d'utilisation et de vente">
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent l'accès et l'utilisation du logiciel en ligne {L.app} (le « Service »), édité par <V>{L.editor}</V> (l'« Éditeur »),
        par les professionnels du bâtiment (l'« Abonné »). Le Service permet notamment de créer des devis, factures, contrats d'entretien, attestations,
        procès-verbaux de réception et bons d'intervention, de recueillir des signatures et de suivre des chantiers.
      </p>
      <p>Le Service est réservé aux professionnels agissant dans le cadre de leur activité. La création d'un compte vaut acceptation des présentes conditions.</p>

      <h2>2. Compte</h2>
      <p>
        L'Abonné fournit des informations exactes et les tient à jour, en particulier ses mentions légales (SIRET, assurance, TVA), qui apparaissent sur ses documents.
        Il est responsable de la confidentialité de ses identifiants et de toute utilisation de son compte.
      </p>

      <h2>3. Essai gratuit et abonnement</h2>
      <ul>
        <li>Tout nouveau compte bénéficie d'un essai gratuit de 14 jours, sans engagement ni moyen de paiement.</li>
        <li>À l'issue de l'essai, l'accès complet nécessite un abonnement au prix de {L.price}, payable mensuellement et d'avance par carte bancaire via le prestataire Stripe.</li>
        <li>L'abonnement est sans engagement de durée. Il est reconduit chaque mois et peut être résilié à tout moment depuis l'espace « Abonnement » ; la résiliation prend effet à la fin de la période payée. Aucun remboursement au prorata n'est dû.</li>
        <li>En cas d'échec de paiement, l'Éditeur peut suspendre l'accès après relance restée sans effet pendant 15 jours.</li>
        <li>L'Éditeur peut modifier ses tarifs moyennant un préavis de 30 jours par e-mail ; l'Abonné peut résilier avant l'entrée en vigueur du nouveau tarif.</li>
        <li>Une facture est émise pour chaque paiement.</li>
      </ul>

      <h2>4. Responsabilité de l'Abonné sur ses documents</h2>
      <p>
        Le Service est un outil. L'Abonné reste seul responsable du contenu de ses devis, factures, contrats et attestations, des prix, des taux de TVA appliqués,
        de leur conformité à la réglementation (mentions obligatoires, numérotation, conservation pendant 10 ans, réglementation de l'entretien des équipements,
        droit de la consommation) et de leurs relations avec ses propres clients. Les modèles et mentions proposés par le Service sont fournis à titre d'aide et ne
        constituent pas un conseil juridique ou comptable.
      </p>
      <p>
        Facturation électronique : le Service n'est pas une plateforme agréée au sens de la réforme de la facturation électronique entre entreprises. Il appartient à
        l'Abonné de recourir à une plateforme agréée lorsque la réglementation l'impose.
      </p>
      <p>
        La lecture automatique des plaques signalétiques repose sur une intelligence artificielle : les informations obtenues doivent être vérifiées par l'Abonné.
      </p>

      <h2>5. Signature électronique</h2>
      <p>
        Le Service propose une signature électronique simple (signature manuscrite sur écran, nom, date et heure, et le cas échéant photo du signataire avec son accord).
        Sa valeur probante est appréciée par le juge au regard des éléments conservés. Pour des engagements importants, l'Abonné peut compléter ce dispositif par tout
        autre moyen de preuve. L'Abonné recueille le consentement du signataire avant toute prise de photo.
      </p>

      <h2>6. Disponibilité et sauvegardes</h2>
      <p>
        L'Éditeur met en œuvre les moyens raisonnables pour assurer l'accès au Service 24 h/24, sans garantie de disponibilité continue. Des interruptions pour
        maintenance peuvent intervenir, si possible en dehors des heures ouvrées. Les données sont sauvegardées quotidiennement par l'hébergeur.
        L'Abonné est invité à télécharger régulièrement ses documents (PDF) et l'export comptable (CSV).
      </p>

      <h2>7. Données de l'Abonné</h2>
      <p>
        L'Abonné reste propriétaire de ses données. Pour les données personnelles de ses clients, l'Éditeur agit en qualité de sous-traitant au sens du RGPD,
        selon l'accord de sous-traitance qui fait partie des présentes conditions. À la fin de l'abonnement, les données restent accessibles en lecture et à l'export
        pendant 30 jours, puis sont supprimées, sauf obligation légale contraire. Il appartient à l'Abonné de conserver ses factures pendant la durée légale.
      </p>

      <h2>8. Responsabilité de l'Éditeur</h2>
      <p>
        L'Éditeur est tenu d'une obligation de moyens. Sa responsabilité ne peut être engagée qu'en cas de faute prouvée et est limitée, tous préjudices confondus,
        au montant payé par l'Abonné au cours des 12 mois précédant le fait générateur. L'Éditeur n'est pas responsable des dommages indirects (perte de chiffre
        d'affaires, de clientèle ou de données imputable à l'Abonné), ni des conséquences du contenu des documents établis par l'Abonné.
      </p>

      <h2>9. Suspension et résiliation</h2>
      <p>
        L'Éditeur peut suspendre ou résilier un compte en cas d'utilisation frauduleuse, illicite ou contraire aux présentes conditions, après mise en demeure
        restée sans effet pendant 8 jours, sauf urgence.
      </p>

      <h2>10. Propriété intellectuelle</h2>
      <p>L'Abonné bénéficie d'un droit d'utilisation personnel et non exclusif du Service pendant la durée de son abonnement. Le logiciel reste la propriété de l'Éditeur.</p>

      <h2>11. Modification des conditions</h2>
      <p>L'Éditeur peut faire évoluer les présentes conditions. L'Abonné est informé par e-mail au moins 30 jours avant l'entrée en vigueur d'une modification substantielle.</p>

      <h2>12. Droit applicable et litiges</h2>
      <p>
        Les présentes conditions sont soumises au droit français. En cas de litige, les parties recherchent d'abord une solution amiable. À défaut, compétence
        est attribuée aux tribunaux du ressort de <V>{L.city}</V>.
      </p>

      <h2>Contact</h2>
      <p><V>{L.email}</V></p>
    </LegalPage>
  );
}
