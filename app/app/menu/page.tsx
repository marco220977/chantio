"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";
import { memberName, ROLE_LABEL, useCompany } from "@/components/CompanyContext";

const SUP = [
  ["/app/equipe", "👥", "Équipe (superviseurs et techniciens)"],
  ["/app/clients", "📇", "Clients"], ["/app/planning", "🗓", "Planning"], ["/app/sav", "🛠", "SAV (après-vente)"],
  ["/app/quitus", "✅", "Quitus / PV de réception"], ["/app/entretien", "🔧", "Contrats et attestations d'entretien"],
  ["/app/chiffre-affaires", "📈", "Chiffre d'affaires"], ["/app/catalogue", "📚", "Catalogue"], ["/app/scan", "🩺", "Plaque et diagnostic de panne"],
  ["/app/parametres", "🏢", "Mon entreprise"], ["/app/abonnement", "⭐", "Abonnement / se désabonner"], ["/app/export", "📊", "Export comptable"],
  ["/app/suggestions", "💡", "Suggestions & problèmes"],
  ["/legal/cgv", "⚖️", "CGU, confidentialité, mentions légales"],
];
const TECH = [
  ["/app/clients", "📇", "Clients"], ["/app/quitus", "✅", "Quitus / PV de réception"], ["/app/scan", "🩺", "Plaque et diagnostic de panne"],
  ["/app/parametres", "👤", "Mon profil"], ["/app/suggestions", "💡", "Suggestions & problèmes"], ["/legal/confidentialite", "⚖️", "Confidentialité"],
];

export default function Menu() {
  const router = useRouter();
  const { me, isSup, company, has } = useCompany();
  const lockOf = (h: string) => (h === "/app/entretien" || h === "/app/sav" ? !has("entretien") : h === "/app/scan" ? !has("ia") : false);
  const [admin, setAdmin] = useState(false);
  useEffect(() => { sb().rpc("is_platform_admin").then(({ data }) => setAdmin(!!data)); }, []);
  return (
    <>
      <Header title="Menu" />
      <div className="space-y-2 p-4">
        {me && <div className="card bg-slate-50 text-sm"><p className="font-semibold">{memberName(me)}</p><p className="text-slate-500">{ROLE_LABEL[me.role]} · {company?.name}</p></div>}
        {admin && <Link href="/app/admin" className="card flex items-center gap-3 border-2 border-flame"><span className="text-xl">📊</span><span className="font-semibold">Tableau de bord des abonnés</span><span className="ml-auto text-slate-300">›</span></Link>}
        {(isSup ? SUP : TECH).map(([h, i, l]) => (
          <Link key={h} href={h} className="card flex items-center gap-3"><span className="text-xl">{i}</span><span className="font-semibold">{l}</span>{lockOf(h) && <span className="chip ml-1 bg-slate-100 text-[10px] text-slate-500">🔒 Pro</span>}<span className="ml-auto text-slate-300">›</span></Link>
        ))}
        <button className="btn-danger mt-6 w-full" onClick={async () => { await sb().auth.signOut(); router.replace("/connexion"); }}>Se déconnecter</button>
      </div>
    </>
  );
}
