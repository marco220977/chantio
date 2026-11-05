"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";

const items = [
  ["/app/chiffre-affaires", "📈", "Chiffre d'affaires"], ["/app/clients", "👥", "Clients"], ["/app/entretien", "🔧", "Contrats et attestations d'entretien"], ["/app/catalogue", "📚", "Catalogue"], ["/app/scan", "📷", "Scanner une plaque"],
  ["/app/parametres", "🏢", "Mon entreprise"], ["/app/abonnement", "⭐", "Abonnement"], ["/app/export", "📊", "Export comptable"],
];

export default function Menu() {
  const router = useRouter();
  return (
    <>
      <Header title="Menu" />
      <div className="space-y-2 p-4">
        {items.map(([h, i, l]) => (
          <Link key={h} href={h} className="card flex items-center gap-3"><span className="text-xl">{i}</span><span className="font-semibold">{l}</span><span className="ml-auto text-slate-300">›</span></Link>
        ))}
        <button className="btn-danger mt-6 w-full" onClick={async () => { await sb().auth.signOut(); router.replace("/connexion"); }}>Se déconnecter</button>
      </div>
    </>
  );
}
