import Link from "next/link";
import { TIERS, type Tier } from "@/lib/plans";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Chantio";

const features = [
  ["✍️", "Signature sur place", "Le client signe au doigt sur votre téléphone, ou à distance via un lien."],
  ["⚡", "Devis → facture en 1 clic", "Numérotation légale automatique, sans trou, facture verrouillée après émission."],
  ["📷", "Scan de plaque chaudière", "Une photo et la marque, le modèle et la puissance sont reconnus."],
  ["📄", "PDF conformes", "Mentions obligatoires, TVA 5,5 / 10 / 20 %, assurance décennale, pénalités."],
  ["🗓️", "Planning", "Vos interventions et celles de votre équipe, jour par jour."],
  ["🧾", "Facture électronique 2026", "Factures au format Factur-X transmises à la plateforme agréée, prêt pour l'obligation légale."],
  ["✨", "Devis par IA", "Dictez le chantier, les lignes du devis sont rédigées avec vos prix."],
  ["💳", "Paiement en ligne", "Vos clients paient factures et acomptes par carte, relances automatiques."],
  ["📚", "Catalogue", "Vos prestations et fournitures avec prix d'achat pour suivre la marge."],
];

export default function Home({ searchParams }: { searchParams: { compte?: string; parrain?: string } }) {
  const signup = `/connexion?mode=signup${searchParams?.parrain ? `&parrain=${encodeURIComponent(searchParams.parrain)}` : ""}`;
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-orange-50">
      <div className="mx-auto max-w-3xl px-5 pb-16">
        <nav className="flex items-center justify-between py-5">
          <span className="text-2xl font-extrabold text-ink">
            {APP.slice(0, -2)}<span className="text-flame">{APP.slice(-2)}</span>
          </span>
          <Link href="/connexion" className="btn-ghost !py-2 text-sm">Se connecter</Link>
        </nav>

        {searchParams?.compte === "supprime" && <p className="card mt-2 bg-green-50 text-center text-sm text-green-800">Votre compte et toutes vos données ont été supprimés.</p>}
        <section className="pt-8 text-center">
          <span className="chip bg-flame-light text-flame">★ Fait pour la plomberie et le chauffage</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Vos devis et factures <span className="bg-gradient-to-r from-brand to-flame bg-clip-text text-transparent">depuis le chantier</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
            Créez le devis devant le client, faites-le signer sur votre téléphone, transformez-le en facture en un clic.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={signup} className="btn bg-gradient-to-r from-ink to-brand py-4 text-lg text-white">
              Essai gratuit 14 jours →
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">{searchParams?.parrain ? "🎁 Parrainage : 30 jours d'essai offerts. " : ""}Sans carte bancaire. Annulable à tout moment.</p>
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

        <section className="mt-16 space-y-3">
          <h2 className="text-center text-2xl font-extrabold">3 formules, sans engagement</h2>
          <p className="text-center text-sm text-slate-600">Essai gratuit de 14 jours avec toutes les fonctions, sans carte bancaire.</p>
          {(Object.keys(TIERS) as Tier[]).map((k) => (
            <div key={k} className={`card ${k === "pro" ? "border-2 border-flame" : ""}`}>
              <div className="flex items-baseline justify-between"><h3 className="text-xl font-extrabold">{TIERS[k].name}</h3><p className="text-2xl font-extrabold">{TIERS[k].price} €<span className="text-sm font-medium text-slate-500"> HT/mois</span></p></div>
              <p className="text-sm text-slate-500">{TIERS[k].tagline}</p>
              <ul className="mt-2 space-y-0.5 text-sm">{TIERS[k].includes.map((x) => <li key={x}>✅ {x}</li>)}</ul>
            </div>
          ))}
          <Link href={signup} className="btn-brand w-full py-3.5">Commencer gratuitement</Link>
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
