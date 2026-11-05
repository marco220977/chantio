"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CompanyProvider, useCompany } from "@/components/CompanyContext";
import { sb } from "@/lib/supabase";

const SUP_TABS = [
  { href: "/app", label: "Accueil", icon: "⌂" },
  { href: "/app/devis", label: "Devis", icon: "📝" },
  { href: "/app/factures", label: "Factures", icon: "💶" },
  { href: "/app/entretien", label: "Entretien", icon: "🔧" },
  { href: "/app/chantiers", label: "Chantiers", icon: "🏗️" },
  { href: "/app/menu", label: "Menu", icon: "☰" },
];
const TECH_TABS = [
  { href: "/app", label: "Ma journée", icon: "⌂" },
  { href: "/app/planning", label: "Planning", icon: "🗓" },
  { href: "/app/chantiers", label: "Chantiers", icon: "🏗️" },
  { href: "/app/entretien", label: "Entretien", icon: "🔧" },
  { href: "/app/sav", label: "SAV", icon: "🛠" },
  { href: "/app/menu", label: "Menu", icon: "☰" },
];
const SUP_ONLY = ["/app/devis", "/app/factures", "/app/doc", "/app/chiffre-affaires", "/app/export", "/app/abonnement", "/app/catalogue", "/app/equipe", "/app/scan-x"];

function TrialBanner() {
  const { company, isSup } = useCompany();
  if (!company || !isSup || company.plan === "pro") return null;
  const days = Math.ceil((new Date(company.trial_ends_at || 0).getTime() - Date.now()) / 86400000);
  return (
    <Link href="/app/abonnement" className="block bg-gradient-to-r from-ink to-flame px-4 py-2 text-center text-sm font-semibold text-white">
      {days > 0 ? `Essai gratuit : ${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""} — S'abonner →` : "Essai terminé — Activez votre abonnement →"}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { me, isSup, loaded } = useCompany();

  if (loaded && !me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-bold">Votre accès à cette entreprise a été retiré.</p>
        <button className="btn-primary" onClick={async () => { await sb().auth.signOut(); router.replace("/connexion"); }}>Se déconnecter</button>
      </div>
    );
  }
  const tabs = isSup ? SUP_TABS : TECH_TABS;
  const blocked = loaded && !isSup && SUP_ONLY.some((p) => path.startsWith(p));

  return (
    <>
      <div className="mx-auto min-h-screen max-w-2xl pb-24">
        <TrialBanner />
        {blocked ? (
          <div className="p-8 text-center">
            <p className="text-4xl">🔒</p>
            <p className="mt-3 font-bold">Accès réservé au superviseur</p>
            <Link href="/app" className="btn-primary mt-6">Retour à ma journée</Link>
          </div>
        ) : children}
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-2xl grid-cols-6">
          {tabs.map((t) => {
            const active = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={`flex flex-col items-center py-2 text-[10px] font-medium ${active ? "text-flame" : "text-slate-500"}`}>
                <span className="text-xl leading-6">{t.icon}</span>{t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <CompanyProvider><Shell>{children}</Shell></CompanyProvider>;
}
