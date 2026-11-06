"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { sb } from "@/lib/supabase";
import { eur } from "@/lib/calc";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import PdfPreview from "@/components/PdfPreview";
import { buildPoPdf, type PoLine, type PurchaseOrder } from "@/lib/pdf-po";
import { pdfToBase64 } from "@/lib/pdf-maintenance";
import { askEmail, sendMail } from "@/lib/send";
import type { Doc } from "@/lib/types";

type Row = PoLine & { key: string; supplier: string; include: boolean };

export default function Commandes() {
  const { docId } = useParams<{ docId: string }>();
  const { company } = useCompany();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [preview, setPreview] = useState<null | (() => Promise<any>)>(null);
  const [msg, setMsg] = useState("");

  const loadPos = () => sb().from("purchase_orders").select("*").eq("document_id", docId).order("created_at", { ascending: false }).then(({ data }) => setPos(data || []));
  useEffect(() => {
    (async () => {
      const { data: d } = await sb().from("documents").select("*").eq("id", docId).single();
      setDoc(d);
      const { data: sp } = await sb().from("suppliers").select("name, email").order("name");
      setSuppliers(sp || []);
      const out: Row[] = [];
      (d?.lines || []).forEach((l: any, i: number) => {
        if (l.components?.length) l.components.forEach((c: any, j: number) => {
          if (c.supplier || Number(c.cost_price) > 0) out.push({ key: `${i}-${j}`, supplier: c.supplier || "", ref: c.ref, label: c.label, qty: Math.round(Number(l.qty) * Number(c.qty) * 100) / 100, unit: c.unit, cost_price: Number(c.cost_price) || 0, include: !!c.supplier });
        });
        else if (l.supplier || (Number(l.cost_price) > 0 && !["h", "heure", "forfait"].includes(String(l.unit).toLowerCase())))
          out.push({ key: `${i}`, supplier: l.supplier || "", ref: l.ref, label: l.label, qty: Number(l.qty), unit: l.unit, cost_price: Number(l.cost_price) || 0, include: !!l.supplier });
      });
      setRows(out);
      loadPos();
    })();
  }, [docId]);

  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {};
    rows.filter((r) => r.include && r.supplier).forEach((r) => { (g[r.supplier] ??= []).push(r); });
    return g;
  }, [rows]);
  const set = (key: string, p: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function create(supplier: string) {
    const lines = groups[supplier].map(({ ref, label, qty, unit, cost_price }) => ({ ref, label, qty, unit, cost_price }));
    const total = Math.round(lines.reduce((a, l) => a + l.qty * l.cost_price, 0) * 100) / 100;
    const { data: num, error: e1 } = await sb().rpc("next_number", { p_kind: "B" });
    if (e1) return setMsg(e1.message);
    const { error } = await sb().from("purchase_orders").insert({ number: num, supplier, document_id: docId, lines, total_ht: total,
      delivery_address: doc?.site_address || null, notes: `Chantier : ${doc?.title || ""} — devis ${doc?.number} — client ${doc?.client_snapshot?.name || ""}` });
    if (error) return setMsg(error.message);
    setMsg(`✅ Bon de commande ${num} créé`); loadPos();
  }

  async function send(po: PurchaseOrder) {
    const sup = suppliers.find((x) => x.name === po.supplier);
    let to = sup?.email || "";
    if (!to) { to = (prompt(`Adresse e-mail de commande chez ${po.supplier} ?`) || "").trim(); if (!to) return; await sb().from("suppliers").update({ email: to }).eq("name", po.supplier); }
    if (!confirm(`Envoyer ${po.number} à ${to} ?`)) return;
    try { await sendMail({ type: "po", id: po.id, to, pdfBase64: pdfToBase64(await buildPoPdf(po, company!)) }); setMsg(`✅ Envoyé à ${to}`); loadPos(); }
    catch (e: any) { setMsg(`⚠️ ${e.message}`); }
  }

  if (!doc || !company) return <><Header back title="Bons de commande" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  const supplierNames = Array.from(new Set([...suppliers.map((x) => x.name), ...rows.map((r) => r.supplier).filter(Boolean)]));

  return (
    <>
      <Header back title="Bons de commande" />
      <div className="space-y-4 p-4">
        <p className="text-sm text-slate-600">Devis <b>{doc.number}</b> — {doc.client_snapshot?.name}. Les articles issus des tarifs fournisseurs sont pré-sélectionnés ; ajustez les quantités ou rattachez les autres fournitures à un fournisseur.</p>
        {msg && <p className="rounded-xl bg-slate-100 p-3 text-sm">{msg}</p>}
        <datalist id="sups">{supplierNames.map((n) => <option key={n} value={n} />)}</datalist>
        {rows.length === 0 && <p className="card text-sm text-slate-500">Aucune fourniture détectée dans ce devis. Ajoutez des articles depuis vos tarifs fournisseurs ou des ouvrages composés.</p>}
        {rows.map((r) => (
          <div key={r.key} className={`card space-y-2 ${r.include ? "" : "opacity-60"}`}>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={r.include} onChange={(e) => set(r.key, { include: e.target.checked })} />
              <span className="text-sm font-medium">{r.label}{r.ref ? <span className="block text-xs text-slate-400">Réf. {r.ref}</span> : null}</span></label>
            <div className="grid grid-cols-3 gap-2">
              <input className="input !py-1.5 text-sm" list="sups" placeholder="Fournisseur" value={r.supplier} onChange={(e) => set(r.key, { supplier: e.target.value, include: true })} />
              <input className="input !py-1.5 text-sm" inputMode="decimal" value={r.qty} onChange={(e) => set(r.key, { qty: Number(e.target.value.replace(",", ".")) || 0 })} />
              <span className="self-center text-right text-xs text-slate-500">{eur(r.cost_price)} / {r.unit}</span>
            </div>
          </div>
        ))}
        {Object.entries(groups).map(([sup, ls]) => (
          <div key={sup} className="card flex items-center justify-between gap-2">
            <div><p className="font-bold">🏭 {sup}</p><p className="text-xs text-slate-500">{ls.length} article(s) · {eur(ls.reduce((a, l) => a + l.qty * l.cost_price, 0))} HT</p></div>
            <button className="btn-brand !px-3 !py-2 text-sm" onClick={() => create(sup)}>Créer le bon</button>
          </div>
        ))}
        {pos.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">Bons de commande créés</h2>
            {pos.map((po) => (
              <div key={po.id} className="card space-y-2">
                <div className="flex justify-between"><span className="font-semibold">{po.number} · {po.supplier}</span><b>{eur(po.total_ht)} HT</b></div>
                {po.sent_at && <p className="text-xs text-green-700">📧 Envoyé le {new Date(po.sent_at).toLocaleString("fr-FR")} à {po.sent_to}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-ghost text-sm" onClick={() => setPreview(() => () => buildPoPdf(po, company))}>👁 Aperçu</button>
                  <button className="btn-primary text-sm" onClick={() => send(po)}>📧 Envoyer</button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
      {preview && <PdfPreview build={preview} filename="bon-de-commande.pdf" onClose={() => setPreview(null)} />}
    </>
  );
}
