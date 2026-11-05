"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanyProvider, useCompany } from "@/components/CompanyContext";

const tabs = [
  { href: "/app", label: "Accueil", icon: "⌂" },
  { href: "/app/devis", label: "Devis", icon: "📝" },
  { href: "/app/factures", label: "Factures", icon: "💶" },
  { href: "/app/entretien", label: "Entretien", icon: "🔧" },
  { href: "/app/chantiers", label: "Chantiers", icon: "🏗️" },
  { href: "/app/menu", label: "Menu", icon: "☰" },
];

function TrialBanner() {
  const { company } = useCompany();
  if (!company || company.plan === "pro") return null;
  const days = Math.ceil((new Date(company.trial_ends_at || 0).getTime() - Date.now()) / 86400000);
  return (
    <Link href="/app/abonnement" className="block bg-gradient-to-r from-ink to-flame px-4 py-2 text-center text-sm font-semibold text-white">
      {days > 0 ? `Essai gratuit : ${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""} — S'abonner →` : "Essai terminé — Activez votre abonnement →"}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <CompanyProvider>
      <div className="mx-auto min-h-screen max-w-2xl pb-24">
        <TrialBanner />
        {children}
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
    </CompanyProvider>
  );
}
