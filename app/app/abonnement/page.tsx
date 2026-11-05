"use client";
import { useState } from "react";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import { dateFr } from "@/lib/calc";

export default function Abonnement() {
  const { company } = useCompany();
  const [busy, setBusy] = useState(false);
  async function go(path: string) {
    setBusy(true);
    const r = await fetch(path, { method: "POST" });
    const j = await r.json();
    if (j.url) location.href = j.url; else { alert(j.error || "Erreur"); setBusy(false); }
  }
  if (!company) return null;
  const pro = company.plan === "pro";
  return (
    <>
      <Header back title="Abonnement" />
      <div className="space-y-4 p-4">
        <div className="card text-center">
          <p className="label">Formule actuelle</p>
          <p className="text-2xl font-extrabold">{pro ? "Pro ⭐" : company.plan === "canceled" ? "Résilié" : "Essai gratuit"}</p>
          {!pro && <p className="text-sm text-slate-500">Fin de l'essai : {dateFr(company.trial_ends_at)}</p>}
        </div>
        {!pro ? (
          <div className="card space-y-3 text-center">
            <p className="text-4xl font-extrabold">29 €<span className="text-base font-medium text-slate-500"> HT/mois</span></p>
            <ul className="space-y-1 text-left text-sm">
              {["Devis et factures illimités", "Signature électronique sur place et à distance", "Scan de plaque chaudière", "Planning et catalogue", "Export comptable"].map((x) => <li key={x}>✅ {x}</li>)}
            </ul>
            <button className="btn-brand w-full py-3.5" disabled={busy} onClick={() => go("/api/stripe/checkout")}>S'abonner</button>
          </div>
        ) : (
          <button className="btn-ghost w-full" disabled={busy} onClick={() => go("/api/stripe/portal")}>Gérer mon abonnement / factures</button>
        )}
      </div>
    </>
  );
}
