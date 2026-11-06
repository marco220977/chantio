"use client";
import { useEffect, useState } from "react";
import type { Company } from "@/lib/types";

export default function PaymentSettings({ company, reload }: { company: Company; reload: () => void }) {
  const co: any = company;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const call = async (action: string) => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.url) { location.href = j.url; return; }
    if (!r.ok) setMsg(`⚠️ ${j.error || "Erreur"}`); else { reload(); setMsg(j.ready ? "✅ Compte prêt à encaisser" : "Vérification en cours chez Stripe : terminez l'inscription."); }
  };
  useEffect(() => { if (co.stripe_account_id && !co.stripe_account_ready && location.search.includes("stripe=retour")) call("status"); }, []);

  return (
    <section id="paiement" className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold">💳 Paiement en ligne de vos clients</h2>
        <span className={`chip ${co.stripe_account_ready ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{co.stripe_account_ready ? "Actif" : "Inactif"}</span>
      </div>
      <p className="text-xs text-slate-600">Vos clients paient vos factures et acomptes par carte, depuis le lien reçu par e-mail. L'argent arrive directement sur votre compte bancaire (frais Stripe : environ 1,5 % + 0,25 € par paiement européen).</p>
      {!co.stripe_account_ready ? (
        <button className="btn-primary w-full" disabled={busy} onClick={() => call("onboard")}>{busy ? "…" : co.stripe_account_id ? "Terminer mon inscription Stripe" : "Activer le paiement par carte"}</button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost text-sm" disabled={busy} onClick={() => call("dashboard")}>Mes encaissements</button>
          <button className="btn-ghost text-sm" disabled={busy} onClick={() => call("status")}>Actualiser</button>
        </div>
      )}
      {co.stripe_account_id && !co.stripe_account_ready && <button className="w-full text-xs text-brand underline" onClick={() => call("status")}>J'ai terminé, vérifier mon compte</button>}
      {msg && <p className="text-xs">{msg}</p>}
    </section>
  );
}
