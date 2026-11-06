"use client";
import { useEffect, useState } from "react";
import { callEInvoice } from "@/lib/einvoice-client";
import type { Company } from "@/lib/types";

export default function EInvoiceSettings({ company, reload }: { company: Company; reload: () => void }) {
  const co: any = company;
  const [prov, setProv] = useState<{ name: string; real: boolean } | null>(null);
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

  async function act(a: string) {
    setBusy(true); setMsg("");
    try { await callEInvoice(a); reload(); setMsg(a === "activate" ? "✅ Facture électronique activée" : "Désactivée"); }
    catch (e: any) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false);
  }

  return (
    <section id="facture-electronique" className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold">📡 Facture électronique</h2>
        <span className={`chip ${co.einvoice_enabled ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{co.einvoice_enabled ? "Activée" : "Non activée"}</span>
      </div>
      <p className="text-xs text-slate-600">
        Obligatoire pour l'émission à partir du 1er septembre 2027 (TPE/PME). Vos factures aux <b>professionnels</b> sont transmises au format Factur-X via une plateforme agréée ;
        pour les <b>particuliers</b>, seules les données de vente et d'encaissement sont transmises (e-reporting).
      </p>
      {prov && !prov.real && <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">🧪 Mode simulation : aucune donnée n'est envoyée à l'administration. Le raccordement à la plateforme agréée partenaire sera activé prochainement.</p>}
      {prov?.real && <p className="text-xs text-slate-500">Plateforme agréée : <b>{prov.name}</b></p>}
      <ul className="space-y-1 text-sm">{checks.map(([ok, l]) => <li key={l}>{ok ? "✅" : "⬜"} {l}</li>)}</ul>
      {!co.einvoice_enabled ? (
        <>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>J'autorise l'application à transmettre en mon nom mes factures et données de vente à la plateforme agréée partenaire, et à recevoir les statuts de traitement (mandat).</span>
          </label>
          <button className="btn-primary w-full" disabled={!agree || busy || !checks[0][0]} onClick={() => act("activate")}>{busy ? "…" : "Activer la facture électronique"}</button>
          {!checks[0][0] && <p className="text-xs text-amber-700">Vérifiez d'abord votre SIRET ci-dessus.</p>}
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">Mandat donné le {co.einvoice_mandate_at ? new Date(co.einvoice_mandate_at).toLocaleDateString("fr-FR") : "—"}. Les factures sont transmises automatiquement à leur émission, et l'encaissement est déclaré quand vous marquez une facture payée.</p>
          <button className="btn-ghost w-full text-sm" disabled={busy} onClick={() => act("deactivate")}>Désactiver la transmission automatique</button>
        </>
      )}
      {msg && <p className="text-xs">{msg}</p>}
    </section>
  );
}
