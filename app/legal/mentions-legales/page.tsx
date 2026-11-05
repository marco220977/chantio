import LegalPage, { V } from "../LegalPage";
import { LEGAL as L } from "@/lib/legal";

export const metadata = { title: `Mentions légales — ${L.app}` };

export default function Page() {
  return (
    <LegalPage title="Mentions légales">
      <h2>Éditeur du service</h2>
      <p>
        Le service {L.app}, accessible à l'adresse {L.url}, est édité par <V>{L.editor}</V>, <V>{L.form}</V>
        {L.capital ? `, au capital de ${L.capital}` : ""}, immatriculée sous le numéro SIRET <V>{L.siret}</V> (<V>{L.rcs}</V>),
        dont le siège est situé <V>{L.address}</V>. TVA : <V>{L.vat}</V>.
      </p>
      <p>Directeur de la publication : <V>{L.director}</V>. Contact : <V>{L.email}</V>.</p>

      <h2>Hébergement</h2>
      <ul>
        <li>Application : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com</li>
        <li>Base de données et fichiers : Supabase Inc. (serveurs situés dans l'Union européenne, Francfort, Allemagne) — supabase.com</li>
      </ul>

      <h2>Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments du service (logiciel, textes, interface, logo) est la propriété de l'éditeur. Toute reproduction ou
        exploitation sans autorisation écrite est interdite. Les documents et données saisis par les utilisateurs restent leur propriété.
      </p>

      <h2>Données personnelles</h2>
      <p>Le traitement des données personnelles est décrit dans la politique de confidentialité et dans l'accord de sous-traitance.</p>
    </LegalPage>
  );
}
