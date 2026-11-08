"use client";
import { useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import ReferralCard from "@/components/ReferralCard";
import { dateFr } from "@/lib/calc";
import { TIERS, type Tier } from "@/lib/plans";

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
  const tier = ((company as any).tier || "solo") as Tier;
  const free = company.plan === "free" && (!company.free_until || new Date(company.free_until).getTime() > Date.now());
  const trialEnded = new Date(company.trial_ends_at || 0).getTime() < Date.now();

  return (
    <>
      <Header back title="Abonnement" />
      <div className="space-y-4 p-4">
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {msg && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

        <div className="card text-center">
          <p className="label">Formule actuelle</p>
          <p className="text-2xl font-extrabold">{free ? (company.free_until ? "Accès offert 🎁" : "Accès illimité offert 🎁") : pro ? `Formule ${TIERS[tier].name} ⭐` : company.plan === "canceled" ? "Résilié" : trialEnded ? "Essai terminé" : "Essai gratuit"}</p>
          {!pro && !free && company.plan !== "canceled" && <p className="text-sm text-slate-500">{trialEnded ? "Terminé le" : "Fin de l'essai :"} {dateFr(company.trial_ends_at)}</p>}
          {!pro && (company as any).trial_note && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{(company as any).trial_note}</p>}
          {pro && company.cancel_at && <p className="text-sm font-semibold text-amber-700">Résiliation programmée : accès jusqu'au {dateFr(company.cancel_at)}</p>}
        </div>

        {free && <p className="card text-center text-sm text-slate-600">Ce compte bénéficie d'un accès offert{company.free_until ? ` jusqu'au ${dateFr(company.free_until)}` : " sans limite de durée"} : toutes les fonctionnalités sont disponibles, sans abonnement.{company.free_until ? " Vous pourrez ensuite vous abonner ici." : ""}</p>}

        {!free && (
          <div className="space-y-3">
            <p className="font-bold">{pro ? "Changer de formule" : "Choisissez votre formule"}</p>
            {!pro && company.plan !== "canceled" && !trialEnded && <p className="text-xs text-slate-500">Pendant l'essai, toutes les fonctions (formule Équipe) sont incluses. Aucun moyen de paiement n'est enregistré : sans abonnement, l'essai s'arrête simplement à sa date de fin.</p>}
            {(Object.keys(TIERS) as Tier[]).map((k) => {
              const t = TIERS[k]; const current = pro && tier === k;
              return (
                <div key={k} className={`card space-y-2 ${current ? "border-2 border-flame" : k === "pro" ? "border-2 border-slate-300" : ""}`}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-xl font-extrabold">{t.name}{k === "pro" && !pro && <span className="chip ml-2 bg-orange-100 align-middle text-xs text-orange-800">Le plus choisi</span>}</p>
                    <p className="text-2xl font-extrabold">{t.price} €<span className="text-sm font-medium text-slate-500"> HT/mois</span></p>
                  </div>
                  <p className="text-sm text-slate-500">{t.tagline}</p>
                  <ul className="space-y-0.5 text-sm">{t.includes.map((x) => <li key={x}>✅ {x}</li>)}</ul>
                  {current ? <p className="text-center text-sm font-semibold text-flame">Votre formule actuelle</p>
                    : pro ? <button className="btn-ghost w-full" disabled={busy || !!company.cancel_at} onClick={async () => {
                        if (!confirm(`Passer à la formule ${t.name} (${t.price} € HT/mois) ? La différence est calculée au prorata sur votre prochaine facture.`)) return;
                        const j = await call("/api/stripe/change", { tier: k }); if (j) { setMsg(`✅ Formule ${t.name} activée.`); reload(); } }}>Passer à {t.name}</button>
                    : <button className={`${k === "pro" ? "btn-brand" : "btn-ghost"} w-full py-3`} disabled={busy} onClick={() => call("/api/stripe/checkout", { tier: k })}>{busy ? "…" : `S'abonner à ${t.name}`}</button>}
                </div>
              );
            })}
            <p className="text-center text-xs text-slate-500">Sans engagement, résiliable à tout moment. <a href="/legal/cgv" className="text-brand underline">Conditions générales</a></p>
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

        <ReferralCard company={company} />

        <p className="pt-4 text-center text-sm text-slate-500">Vous voulez effacer toutes vos données ? <Link href="/app/parametres#suppression" className="text-brand underline">Supprimer mon compte</Link></p>
      </div>
    </>
  );
}
