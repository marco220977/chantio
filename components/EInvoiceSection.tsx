"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { buildFacturX, channelOf, EINV_STATUS, validateEInvoice } from "@/lib/einvoice";
import { callEInvoice } from "@/lib/einvoice-client";
import type { Company, Doc } from "@/lib/types";
import Link from "next/link";

export default function EInvoiceSection({ doc, company, onDoc }: { doc: Doc; company: Company; onDoc: (d: Doc) => void }) {
  const [events, setEvents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const d: any = doc;
  const channel = channelOf(doc);
  const errors = validateEInvoice(doc, company);
  const enabled = !!(company as any).einvoice_enabled;

  const load = () => doc.id && sb().from("einvoice_events").select("*").eq("document_id", doc.id).order("created_at", { ascending: false }).limit(10).then(({ data }) => setEvents(data || []));
  useEffect(() => { load(); }, [doc.id, d.einvoice_status]);

  async function act(action: string) {
    setBusy(true); setMsg("");
    try { const j = await callEInvoice(action, doc.id); if (j.doc) onDoc(j.doc); if (j.message) setMsg(j.message); }
    catch (e: any) { setMsg(`⚠️ ${e.message}`); }
    setBusy(false); load();
  }

  function downloadXml() {
    const blob = new Blob([buildFacturX(doc, company)], { type: "application/xml" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${doc.number || "facture"}-facturx.xml`; a.click();
  }

  if (doc.kind === "quote") return null;
  const st = d.einvoice_status ? EINV_STATUS[d.einvoice_status] : null;

  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">📡 Facture électronique</h2>
          <p className="text-xs text-slate-500">{channel === "b2b" ? "Client professionnel : facture transmise via la plateforme agréée." : "Client particulier : pas de facture électronique, transmission des données de vente (e-reporting)."}</p>
        </div>
        {st && <span className={`chip whitespace-nowrap ${st[1]}`}>{st[0]}</span>}
      </div>

      {doc.status !== "draft" && errors.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-semibold">À compléter avant transmission :</p>
          <ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {doc.status === "draft" && channel === "b2b" && errors.filter((e) => !e.includes("émise")).length > 0 && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Avant d'émettre : {errors.filter((e) => !e.includes("émise")).join(", ")}.</p>
      )}

      {!enabled && doc.status !== "draft" && <p className="text-xs text-slate-500">Non activée. <Link href="/app/parametres#facture-electronique" className="text-brand underline">Activer dans Mon entreprise</Link></p>}

      {enabled && doc.status !== "draft" && (
        <div className="grid grid-cols-2 gap-2">
          {!d.einvoice_id
            ? <button className="btn-primary col-span-2" disabled={busy || errors.length > 0} onClick={() => act("send")}>{busy ? "…" : channel === "b2b" ? "📡 Transmettre la facture" : "📡 Transmettre l'e-reporting"}</button>
            : <button className="btn-ghost" disabled={busy} onClick={() => act("refresh")}>🔄 Actualiser le statut</button>}
          {d.einvoice_id && doc.status === "paid" && d.einvoice_status !== "encaissee" && channel === "b2b" && <button className="btn-ghost" disabled={busy} onClick={() => act("payment")}>💶 Déclarer l'encaissement</button>}
        </div>
      )}
      {doc.status !== "draft" && channel === "b2b" && <button className="w-full text-xs text-brand underline" onClick={downloadXml}>Télécharger le XML Factur-X (EN 16931)</button>}
      {msg && <p className="text-xs">{msg}</p>}

      {events.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-2">
          {events.map((e) => (
            <p key={e.id} className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {e.message || e.kind}{e.status && EINV_STATUS[e.status] ? ` (${EINV_STATUS[e.status][0]})` : ""}</p>
          ))}
        </div>
      )}
    </section>
  );
}
