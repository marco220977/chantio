"use client";
import { useState } from "react";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import { dateFr } from "@/lib/calc";

export default function Abonnement() {
  const { company } = useCompany();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go(path: string) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(path, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j.url) { location.href = j.url; return; }
      setErr(j.error || "Le paiement n'est pas disponible pour le moment. Réessayez plus tard.");
    } catch {
      setErr("Connexion impossible. Vérifiez votre réseau.");
    }
    setBusy(false);
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
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {!pro ? (
          <div className="card space-y-3 text-center">
            <p className="text-4xl font-extrabold">29 €<span className="text-base font-medium text-slate-500"> HT/mois</span></p>
            <ul className="space-y-1 text-left text-sm">
              {["Devis et factures illimités", "Signature électronique sur place et à distance", "Scan de plaque chaudière", "Planning et catalogue", "Export comptable"].map((x) => <li key={x}>✅ {x}</li>)}
            </ul>
            <p className="text-xs text-slate-500">Sans engagement, résiliable à tout moment. <a href="/legal/cgv" className="text-brand underline">Conditions générales</a></p>
            <button className="btn-brand w-full py-3.5" disabled={busy} onClick={() => go("/api/stripe/checkout")}>{busy ? "Redirection…" : "S'abonner"}</button>
          </div>
        ) : (
          <button className="btn-ghost w-full" disabled={busy} onClick={() => go("/api/stripe/portal")}>Gérer mon abonnement / factures</button>
        )}
      </div>
    </>
  );
}
