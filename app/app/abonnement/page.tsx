"use client";
import { useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import { dateFr } from "@/lib/calc";

export default function Abonnement() {
  const { company, reload } = useCompany();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function call(path: string, body?: any) {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({}));
      if (j.url) { location.href = j.url; return null; }
      if (!r.ok) { setErr(j.error || "Le service de paiement n'est pas disponible pour le moment."); setBusy(false); return null; }
      setBusy(false); return j;
    } catch { setErr("Connexion impossible. Vérifiez votre réseau."); setBusy(false); return null; }
  }

  async function unsubscribe() {
    if (!confirm("Se désabonner ? Vous gardez l'accès jusqu'à la fin de la période déjà payée, puis l'abonnement s'arrête sans autre prélèvement.")) return;
    const j = await call("/api/stripe/cancel", { resume: false });
    if (j) { setMsg(`Abonnement résilié. Accès conservé jusqu'au ${dateFr(j.cancel_at)}.`); reload(); }
  }
  async function resume() {
    const j = await call("/api/stripe/cancel", { resume: true });
    if (j) { setMsg("✅ Abonnement réactivé."); reload(); }
  }

  if (!company) return null;
  const pro = company.plan === "pro";
  const trialEnded = new Date(company.trial_ends_at || 0).getTime() < Date.now();

  return (
    <>
      <Header back title="Abonnement" />
      <div className="space-y-4 p-4">
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {msg && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

        <div className="card text-center">
          <p className="label">Formule actuelle</p>
          <p className="text-2xl font-extrabold">{pro ? "Pro ⭐" : company.plan === "canceled" ? "Résilié" : trialEnded ? "Essai terminé" : "Essai gratuit"}</p>
          {!pro && company.plan !== "canceled" && <p className="text-sm text-slate-500">{trialEnded ? "Terminé le" : "Fin de l'essai :"} {dateFr(company.trial_ends_at)}</p>}
          {pro && company.cancel_at && <p className="text-sm font-semibold text-amber-700">Résiliation programmée : accès jusqu'au {dateFr(company.cancel_at)}</p>}
        </div>

        {!pro && (
          <div className="card space-y-3 text-center">
            <p className="text-4xl font-extrabold">29 €<span className="text-base font-medium text-slate-500"> HT/mois</span></p>
            <ul className="space-y-1 text-left text-sm">
              {["Devis et factures illimités", "Signature électronique sur place et à distance", "Contrats et attestations d'entretien", "Suivi de chantier, quitus et SAV", "Scan de plaque chaudière", "Export comptable"].map((x) => <li key={x}>✅ {x}</li>)}
            </ul>
            <p className="text-xs text-slate-500">Sans engagement, résiliable à tout moment. <a href="/legal/cgv" className="text-brand underline">Conditions générales</a></p>
            <button className="btn-brand w-full py-3.5" disabled={busy} onClick={() => call("/api/stripe/checkout")}>{busy ? "…" : "S'abonner"}</button>
            {company.plan !== "canceled" && <p className="text-xs text-slate-500">Pendant l'essai, aucun moyen de paiement n'est enregistré : il n'y a rien à résilier. Sans abonnement, l'essai s'arrête simplement à sa date de fin.</p>}
          </div>
        )}

        {pro && (
          <div className="space-y-2">
            <button className="btn-ghost w-full" disabled={busy} onClick={() => call("/api/stripe/portal")}>💳 Carte bancaire et factures</button>
            {company.cancel_at
              ? <button className="btn-primary w-full" disabled={busy} onClick={resume}>Annuler la résiliation</button>
              : <button className="btn-danger w-full" disabled={busy} onClick={unsubscribe}>Se désabonner</button>}
          </div>
        )}

        <p className="pt-4 text-center text-sm text-slate-500">Vous voulez effacer toutes vos données ? <Link href="/app/parametres#suppression" className="text-brand underline">Supprimer mon compte</Link></p>
      </div>
    </>
  );
}
