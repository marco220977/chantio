import Link from "next/link";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Chantio";

const features = [
  ["✍️", "Signature sur place", "Le client signe au doigt sur votre téléphone, ou à distance via un lien."],
  ["⚡", "Devis → facture en 1 clic", "Numérotation légale automatique, sans trou, facture verrouillée après émission."],
  ["📷", "Scan de plaque chaudière", "Une photo et la marque, le modèle et la puissance sont reconnus."],
  ["📄", "PDF conformes", "Mentions obligatoires, TVA 5,5 / 10 / 20 %, assurance décennale, pénalités."],
  ["🗓️", "Planning", "Vos interventions et celles de votre équipe, jour par jour."],
  ["📚", "Catalogue", "Vos prestations et fournitures avec prix d'achat pour suivre la marge."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-orange-50">
      <div className="mx-auto max-w-3xl px-5 pb-16">
        <nav className="flex items-center justify-between py-5">
          <span className="text-2xl font-extrabold text-ink">
            {APP.slice(0, -2)}<span className="text-flame">{APP.slice(-2)}</span>
          </span>
          <Link href="/connexion" className="btn-ghost !py-2 text-sm">Se connecter</Link>
        </nav>

        <section className="pt-8 text-center">
          <span className="chip bg-flame-light text-flame">★ Fait pour la plomberie et le chauffage</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Vos devis et factures <span className="bg-gradient-to-r from-brand to-flame bg-clip-text text-transparent">depuis le chantier</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
            Créez le devis devant le client, faites-le signer sur votre téléphone, transformez-le en facture en un clic.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/connexion?mode=signup" className="btn bg-gradient-to-r from-ink to-brand py-4 text-lg text-white">
              Essai gratuit 14 jours →
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">Sans carte bancaire. Annulable à tout moment.</p>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2">
          {features.map(([icon, t, d]) => (
            <div key={t} className="card">
              <div className="text-2xl">{icon}</div>
              <h3 className="mt-2 font-bold">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 card text-center">
          <h2 className="text-2xl font-extrabold">Un seul tarif, tout compris</h2>
          <p className="mt-3 text-4xl font-extrabold">29 €<span className="text-base font-medium text-slate-500"> HT / mois</span></p>
          <p className="mt-2 text-slate-600">Devis et factures illimités, signature, planning, scan de plaque.</p>
          <Link href="/connexion?mode=signup" className="btn-brand mt-6 w-full py-3.5">Commencer gratuitement</Link>
        </section>

        <footer className="mt-16 space-y-2 text-center text-xs text-slate-400">
          <p className="flex flex-wrap justify-center gap-4">
            <Link href="/legal/mentions-legales">Mentions légales</Link>
            <Link href="/legal/cgv">CGU / CGV</Link>
            <Link href="/legal/confidentialite">Confidentialité</Link>
            <Link href="/legal/sous-traitance">Sous-traitance RGPD</Link>
          </p>
          <p>© {new Date().getFullYear()} {APP}</p>
        </footer>
      </div>
    </main>
  );
}
