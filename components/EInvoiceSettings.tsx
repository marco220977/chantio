"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { callEInvoice } from "@/lib/einvoice-client";
import { KNOWN_PA } from "@/lib/einvoice";
import type { Company } from "@/lib/types";

export default function EInvoiceSettings({ company, reload }: { company: Company; reload: () => void }) {
  const co: any = company;
  const [prov, setProv] = useState<{ name: string; real: boolean } | null>(null);
  const [mode, setMode] = useState<"partner" | "own">(co.einvoice_mode === "own" ? "own" : "partner");
  const [paName, setPaName] = useState(co.own_pa_name || "");
  const [paEmail, setPaEmail] = useState(co.own_pa_email || "");
  const [auto, setAuto] = useState(co.own_pa_auto !== false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/einvoice").then((r) => r.json()).then(setProv).catch(() => {}); }, []);

  const checks: [boolean, string][] = [
    [!!co.siret_verified_at, "SIRET vérifié au registre"],
    [!!co.vat_exempt || /^FR[0-9A-Z]{2}\d{9}$/.test(String(co.vat_number || "").replace(/\s/g, "")), "N° de TVA intracommunautaire (ou franchise en base)"],
    [!!(co.address && co.zip && co.city), "Adresse complète"],
    [!!co.iban, "IBAN (recommandé)"],
  ];
  const activeMode = co.einvoice_enabled ? (co.einvoice_mode === "own" ? "own" : "partner") : null;

  async function activatePartner() {
    setBusy(true); setMsg("");
    try {
      await sb().from("companies").update({ einvoice_mode: "partner" }).eq("id", co.id);
      await callEInvoice("activate"); reload(); setMsg("✅ Facture électronique activée");
    } catch (e: any) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false);
  }
  async function saveOwn() {
    if (!paName.trim()) return setMsg("⚠️ Indiquez le nom de votre plateforme.");
    if (paEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paEmail.trim())) return setMsg("⚠️ Adresse e-mail de dépôt invalide.");
    setBusy(true); setMsg("");
    const { error } = await sb().from("companies").update({
      einvoice_mode: "own", own_pa_name: paName.trim(), own_pa_email: paEmail.trim() || null, own_pa_auto: auto && !!paEmail.trim(),
      einvoice_enabled: true, einvoice_mandate_at: co.einvoice_mandate_at || new Date().toISOString(),
    }).eq("id", co.id);
    if (!error) await sb().from("einvoice_events").insert({ kind: "activation", status: "ok", provider: paName.trim(), message: `Plateforme du client : ${paName.trim()}${paEmail ? ` (dépôt ${paEmail.trim()})` : " (dépôt manuel)"}` });
    setBusy(false); setMsg(error ? `⚠️ ${error.message}` : "✅ Enregistré"); reload();
  }
  async function deactivate() {
    setBusy(true);
    await sb().from("companies").update({ einvoice_enabled: false }).eq("id", co.id);
    setBusy(false); reload(); setMsg("Désactivée");
  }

  return (
    <section id="facture-electronique" className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold">📡 Facture électronique</h2>
        <span className={`chip ${co.einvoice_enabled ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
          {activeMode === "own" ? `Via ${co.own_pa_name}` : activeMode === "partner" ? "Activée" : "Non activée"}
        </span>
      </div>
      <p className="text-xs text-slate-600">
        Obligatoire pour l'émission à partir du 1er septembre 2027 (TPE/PME). Vos factures aux <b>professionnels</b> partent au format Factur-X via une plateforme agréée ;
        pour les <b>particuliers</b>, seules les données de vente sont transmises (e-reporting).
      </p>
      <ul className="space-y-1 text-sm">{checks.map(([ok, l]) => <li key={l}>{ok ? "✅" : "⬜"} {l}</li>)}</ul>

      <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
        {[["partner", "Plateforme de l'appli"], ["own", "J'ai déjà ma plateforme"]].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k as any)} className={`rounded-lg py-2 text-xs font-semibold ${mode === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
        ))}
      </div>

      {mode === "partner" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">Tout est automatique : transmission à l'émission, statuts, encaissements et e-reporting des particuliers.</p>
          {prov && !prov.real && <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">🧪 Mode simulation : aucune donnée n'est envoyée à l'administration. Le raccordement à la plateforme partenaire sera activé prochainement.</p>}
          {prov?.real && <p className="text-xs text-slate-500">Plateforme agréée partenaire : <b>{prov.name}</b></p>}
          {activeMode !== "partner" && (
            <>
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>J'autorise l'application à transmettre en mon nom mes factures et données de vente à la plateforme agréée partenaire, et à recevoir les statuts de traitement (mandat).</span>
              </label>
              <button className="btn-primary w-full" disabled={!agree || busy || !checks[0][0]} onClick={activatePartner}>{busy ? "…" : "Activer avec la plateforme de l'appli"}</button>
              {!checks[0][0] && <p className="text-xs text-amber-700">Vérifiez d'abord votre SIRET ci-dessus.</p>}
            </>
          )}
        </div>
      )}

      {mode === "own" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">L'appli prépare vos factures au format officiel (XML Factur-X EN 16931) et les dépose sur votre plateforme par e-mail, ou vous les téléchargez pour un dépôt manuel. Les statuts et l'e-reporting des particuliers restent gérés dans votre plateforme.</p>
          <div><label className="label">Ma plateforme agréée</label>
            <input className="input" list="pa-list" placeholder="Ex : Pennylane" value={paName} onChange={(e) => setPaName(e.target.value)} />
            <datalist id="pa-list">{KNOWN_PA.map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label className="label">Adresse e-mail de dépôt des factures (facultatif)</label>
            <input className="input" type="email" placeholder="adresse fournie par votre plateforme" value={paEmail} onChange={(e) => setPaEmail(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Dans votre plateforme, cherchez « dépôt par e-mail » ou « adresse d'import ». Autorisez aussi l'expéditeur de l'appli si la plateforme le demande. Sans adresse, vous téléchargez le fichier et le déposez vous-même.</p></div>
          {paEmail && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Envoyer automatiquement chaque facture pro à l'émission</label>}
          <button className="btn-primary w-full" disabled={busy} onClick={saveOwn}>{busy ? "…" : activeMode === "own" ? "Enregistrer" : "Utiliser ma plateforme"}</button>
        </div>
      )}

      {co.einvoice_enabled && <button className="btn-ghost w-full text-sm" disabled={busy} onClick={deactivate}>Désactiver la facture électronique</button>}
      {msg && <p className="text-xs">{msg}</p>}
    </section>
  );
}
