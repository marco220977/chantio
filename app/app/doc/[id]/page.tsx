"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase";
import { addDays, computeTotals, dateFr, eur, STATUS_COLOR, STATUS_LABEL, VAT_RATES } from "@/lib/calc";
import { buildPdf, pdfBase64, sharePdf } from "@/lib/pdf";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import PdfPreview from "@/components/PdfPreview";
import Modal from "@/components/Modal";
import SignaturePad from "@/components/SignaturePad";
import SiretField from "@/components/SiretField";
import EInvoiceSection from "@/components/EInvoiceSection";
import { callEInvoice } from "@/lib/einvoice-client";
import { channelOf } from "@/lib/einvoice";
import type { CatalogItem, Client, Doc, Line } from "@/lib/types";

const emptyLine = (): Line => ({ label: "", qty: 1, unit: "u", unit_price: 0, vat_rate: 10 });

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { company } = useCompany();
  const isNew = id === "nouveau";

  const [doc, setDoc] = useState<Doc | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [preview, setPreview] = useState<null | (() => Promise<any>)>(null);
  const [modal, setModal] = useState<"" | "catalog" | "client" | "sign" | "send" | "pay">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [catQ, setCatQ] = useState("");
  const [catCat, setCatCat] = useState("all");
  const [supRes, setSupRes] = useState<CatalogItem[]>([]);
  useEffect(() => {
    if (modal !== "catalog" || catQ.trim().length < 2) { setSupRes([]); return; }
    const t = setTimeout(async () => {
      let qy = sb().from("catalog_items").select("*").not("supplier", "is", null);
      for (const w of catQ.trim().split(/\s+/)) qy = qy.or(`label.ilike.%${w.replace(/[%,()]/g, "")}%,ref.ilike.%${w.replace(/[%,()]/g, "")}%`);
      const { data } = await qy.order("label").limit(30);
      setSupRes(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [catQ, modal]);
  const [newClient, setNewClient] = useState<Partial<Client>>({ type: "particulier" });
  const [toast, setToast] = useState("");
  const [amendments, setAmendments] = useState<Doc[]>([]);
  const [parent, setParent] = useState<Doc | null>(null);
  const [showMargin, setShowMargin] = useState(false);

  useEffect(() => {
    const s = sb();
    s.from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    s.from("catalog_items").select("*").is("supplier", null).order("category").order("label").then(({ data }) => setCatalog(data || []));
    if (isNew) {
      const kind = (params.get("kind") as Doc["kind"]) || "quote";
      let dup: Partial<Doc> = {};
      try { dup = JSON.parse(sessionStorage.getItem("dup") || "{}"); sessionStorage.removeItem("dup"); } catch {}
      setDoc({ id: "", kind, status: "draft", lines: [], issue_date: addDays(0), client_id: params.get("client") || undefined, ...dup });
    } else {
      s.from("documents").select("*").eq("id", id).single().then(async ({ data }) => {
        setDoc(data);
        if (data?.kind === "quote") {
          const rootId = data.amends_id || data.id;
          const { data: av } = await s.from("documents").select("*").eq("amends_id", rootId).order("amendment_no");
          setAmendments(av || []);
          if (data.amends_id) { const { data: p } = await s.from("documents").select("*").eq("id", data.amends_id).single(); setParent(p); }
        }
      });
    }
  }, [id, isNew, params]);

  // valeurs par défaut dépendant de l'entreprise
  useEffect(() => {
    if (!doc || !company || doc.id) return;
    if (doc.kind === "quote" && !doc.valid_until) setDoc({ ...doc, valid_until: addDays(company.quote_validity_days ?? 30) });
    if (doc.kind !== "quote" && !doc.due_date) setDoc({ ...doc, due_date: addDays(company.payment_terms_days ?? 30) });
  }, [doc, company]);

  const totals = useMemo(() => computeTotals(doc?.lines || [], doc?.discount_pct, company?.vat_exempt), [doc, company]);
  const margin = useMemo(() => {
    if (!doc) return null;
    const cost = doc.lines.reduce((s, l) => s + (Number(l.cost_price) || 0) * (Number(l.qty) || 0), 0);
    return cost > 0 ? { cost, value: totals.ht - cost, pct: totals.ht ? ((totals.ht - cost) / totals.ht) * 100 : 0 } : null;
  }, [doc, totals]);

  if (!doc || !company) return <><Header title="…" back /><p className="p-6 text-center text-slate-400">Chargement…</p></>;

  const isQuote = doc.kind === "quote";
  const editable = doc.status === "draft" || (isQuote && doc.status === "sent");
  const set = (patch: Partial<Doc>) => setDoc({ ...doc, ...patch });
  const setLine = (i: number, patch: Partial<Line>) => set({ lines: doc.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const client = clients.find((c) => c.id === doc.client_id);
  const publicUrl = `${typeof window !== "undefined" ? location.origin : ""}/signer/${doc.public_token}`;

  async function save(extra: Partial<Doc> = {}): Promise<Doc | null> {
    setBusy(true); setErr("");
    const s = sb();
    const cur = { ...doc!, ...extra };
    const snap = client ? { name: client.name, email: client.email, phone: client.phone, address: client.address, zip: client.zip, city: client.city, siret: client.siret, type: client.type } : cur.client_snapshot;
    const payload: any = {
      kind: cur.kind, status: cur.status, client_id: cur.client_id || null, client_snapshot: snap || null,
      title: cur.title, site_address: cur.site_address, issue_date: cur.issue_date, due_date: cur.due_date || null,
      valid_until: cur.valid_until || null, lines: cur.lines, discount_pct: cur.discount_pct || 0,
      deposit_pct: cur.deposit_pct || 0, total_ht: totals.ht, total_vat: totals.vat, total_ttc: totals.ttc,
      notes: cur.notes, source_quote_id: cur.source_quote_id || null,
      signed_at: cur.signed_at || null, signer_name: cur.signer_name || null, signature_data: cur.signature_data || null, signer_photo: cur.signer_photo || null,
      paid_at: cur.paid_at || null, payment_method: cur.payment_method || null, number: cur.number || null,
    };
    if (cur.amends_id && ["draft", "sent"].includes(cur.status)) {
      const { data: p } = await s.from("documents").select("number, issue_date, signed_at, total_ttc").eq("id", cur.amends_id).single();
      const { data: sib } = await s.from("documents").select("id, total_ttc, status, amendment_no").eq("amends_id", cur.amends_id);
      const prev = (sib || []).filter((x: any) => x.id !== cur.id && ["signed", "invoiced"].includes(x.status) && (x.amendment_no || 0) < (cur.amendment_no || 0))
        .reduce((a: number, x: any) => a + Number(x.total_ttc), 0);
      if (p) payload.amend_meta = { parent_number: p.number, parent_date: p.issue_date, parent_signed_at: p.signed_at, base_ttc: Number(p.total_ttc), previous_ttc: prev };
    }
    const locked = cur.id && cur.kind !== "quote" && doc!.status !== "draft";
    if (locked) {
      for (const k of Object.keys(payload)) if (!["status", "paid_at", "payment_method"].includes(k)) delete payload[k];
    }
    if (!cur.id && cur.kind === "quote") {
      const { data: num, error } = await s.rpc("next_number", { p_kind: "D" });
      if (error) { setErr(error.message); setBusy(false); return null; }
      payload.number = num;
    }
    const q = cur.id ? s.from("documents").update(payload).eq("id", cur.id).select().single()
                     : s.from("documents").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { setErr(error.message); return null; }
    setDoc(data);
    if (!cur.id) router.replace(`/app/doc/${data.id}`);
    return data;
  }

  async function issueInvoice() {
    if (!doc!.client_id && !doc!.client_snapshot) return setErr("Choisissez un client.");
    if (!doc!.lines.length) return setErr("Ajoutez au moins une ligne.");
    if (!confirm("Émettre la facture ? Elle recevra un numéro définitif et ne pourra plus être modifiée.")) return;
    const { data: num, error } = await sb().rpc("next_number", { p_kind: doc!.kind === "credit" ? "A" : "F" });
    if (error) return setErr(error.message);
    const issued = await save({ number: num as string, status: "issued", issue_date: addDays(0) });
    const co: any = company;
    const ownAuto = co?.einvoice_mode === "own" && co?.own_pa_auto && co?.own_pa_email && channelOf(issued as Doc) === "b2b";
    if (issued && co?.einvoice_enabled && (co?.einvoice_mode !== "own" || ownAuto)) {
      try {
        let j: any;
        if (ownAuto) {
          const { data: { session } } = await sb().auth.getSession();
          const r = await fetch("/api/einvoice", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ action: "send", docId: issued.id, pdfBase64: await pdfBase64(issued, company!) }) });
          j = await r.json(); if (!r.ok) throw new Error(j.error);
        } else j = await callEInvoice("send", issued.id);
        if (j.doc) setDoc(j.doc);
      }
      catch (e: any) { setErr(`Facture émise, mais non transmise à la plateforme : ${e.message}`); }
    }
    if (issued) await sendEmail(issued);
  }

  async function toInvoice() {
    const saved = doc!.id ? doc! : await save();
    if (!saved) return;
    const s = sb();
    const signedAv = saved.amends_id ? [] : amendments.filter((a) => a.status === "signed");
    const bake = (lines: Line[], disc?: number) => lines.map((l) => ({ ...l, unit_price: Math.round(Number(l.unit_price) * (1 - (Number(disc) || 0) / 100) * 100) / 100 }));
    const lines = signedAv.length
      ? [...bake(saved.lines, saved.discount_pct), ...signedAv.flatMap((a) => bake(a.lines, a.discount_pct).map((l) => ({ ...l, label: `Avenant n° ${a.amendment_no} — ${l.label}` })))]
      : saved.lines;
    const t = computeTotals(lines, signedAv.length ? 0 : saved.discount_pct, company!.vat_exempt);
    const refs = [`devis n° ${saved.number}${saved.signed_at ? ` accepté le ${dateFr(saved.signed_at)}` : ""}`,
      ...signedAv.map((a) => `avenant n° ${a.amendment_no} (${a.number}) accepté le ${dateFr(a.signed_at)}`)];
    const { data, error } = await s.from("documents").insert({
      kind: "invoice", status: "draft", client_id: saved.client_id, client_snapshot: saved.client_snapshot,
      title: saved.title, site_address: saved.site_address, lines, discount_pct: signedAv.length ? 0 : saved.discount_pct,
      total_ht: t.ht, total_vat: t.vat, total_ttc: t.ttc,
      issue_date: addDays(0), due_date: addDays(company!.payment_terms_days ?? 30),
      notes: `Facture établie selon ${refs.join(" et ")}.`,
      source_quote_id: saved.id,
    }).select().single();
    if (error) return setErr(error.message);
    await s.from("documents").update({ status: "invoiced" }).in("id", [saved.id, ...signedAv.map((a) => a.id)]);
    router.push(`/app/doc/${data.id}`);
  }

  async function createAmendment() {
    const root = parent || doc!;
    const n = Math.max(0, ...amendments.map((a) => a.amendment_no || 0)) + 1;
    const prev = amendments.filter((a) => ["signed", "invoiced"].includes(a.status)).reduce((x, a) => x + Number(a.total_ttc), 0);
    const { data, error } = await sb().from("documents").insert({
      kind: "quote", status: "draft", amends_id: root.id, amendment_no: n, number: `${root.number}-AV${n}`,
      client_id: root.client_id, client_snapshot: root.client_snapshot, site_address: root.site_address,
      title: `Avenant n° ${n} au devis ${root.number}${root.title ? ` — ${root.title}` : ""}`,
      issue_date: addDays(0), valid_until: addDays(company!.quote_validity_days ?? 30), lines: [],
      amend_meta: { parent_number: root.number, parent_date: root.issue_date, parent_signed_at: root.signed_at, base_ttc: Number(root.total_ttc), previous_ttc: prev },
    }).select().single();
    if (error) return setErr(error.message);
    location.href = `/app/doc/${data.id}`;
  }

  async function depositInvoice() {
    const pct = Number(prompt("Pourcentage d'acompte ?", String(doc!.deposit_pct || 30)));
    if (!pct) return;
    const k = pct / 100;
    const { data, error } = await sb().from("documents").insert({
      kind: "invoice", status: "draft", client_id: doc!.client_id, client_snapshot: doc!.client_snapshot,
      title: `Acompte ${pct} % — ${doc!.title || ""}`, site_address: doc!.site_address,
      lines: doc!.lines.map((l) => ({ ...l, label: `Acompte ${pct} % — ${l.label}`, unit_price: Math.round(l.unit_price * k * 100) / 100 })),
      discount_pct: doc!.discount_pct, total_ht: Math.round(totals.ht * k * 100) / 100,
      total_vat: Math.round(totals.vat * k * 100) / 100, total_ttc: Math.round(totals.ttc * k * 100) / 100,
      issue_date: addDays(0), due_date: addDays(0),
      notes: `Facture d'acompte de ${pct} % sur devis n° ${doc!.number}.`, source_quote_id: doc!.id,
    }).select().single();
    if (error) return setErr(error.message);
    router.push(`/app/doc/${data.id}`);
  }

  async function creditNote() {
    if (!confirm("Créer un avoir qui annule totalement cette facture ?")) return;
    const s = sb();
    const { data, error } = await s.from("documents").insert({
      kind: "credit", status: "draft", client_id: doc!.client_id, client_snapshot: doc!.client_snapshot,
      title: `Avoir sur facture ${doc!.number}`, site_address: doc!.site_address,
      lines: doc!.lines.map((l) => ({ ...l, qty: -Number(l.qty) })), discount_pct: doc!.discount_pct,
      total_ht: -Number(doc!.total_ht), total_vat: -Number(doc!.total_vat), total_ttc: -Number(doc!.total_ttc),
      issue_date: addDays(0), notes: `Avoir annulant la facture n° ${doc!.number} du ${dateFr(doc!.issue_date)}.`,
      source_quote_id: doc!.id,
    }).select().single();
    if (error) return setErr(error.message);
    await s.from("documents").update({ status: "canceled" }).eq("id", doc!.id);
    router.push(`/app/doc/${data.id}`);
  }

  async function duplicate() {
    sessionStorage.setItem("dup", JSON.stringify({ lines: doc!.lines, title: doc!.title, discount_pct: doc!.discount_pct, client_id: doc!.client_id, site_address: doc!.site_address }));
    location.href = `/app/doc/nouveau?kind=quote`;
  }

  async function remove() {
    if (!confirm("Supprimer ce brouillon ?")) return;
    const { error } = await sb().from("documents").delete().eq("id", doc!.id);
    if (error) return setErr(error.message);
    router.replace(isQuote ? "/app/devis" : "/app/factures");
  }

  async function addClient() {
    if (!newClient.name) return;
    const { data, error } = await sb().from("clients").insert(newClient).select().single();
    if (error) return setErr(error.message);
    setClients([...clients, data]); set({ client_id: data.id, site_address: doc!.site_address || [data.address, data.zip, data.city].filter(Boolean).join(" ") });
    setNewClient({ type: "particulier" }); setModal("");
  }

  async function updateClient(patch: Partial<Client>) {
    if (!client) return;
    const { data } = await sb().from("clients").update(patch).eq("id", client.id).select().single();
    if (data) setClients(clients.map((c) => (c.id === data.id ? data : c)));
  }

  async function sendEmail(target?: Doc) {
    let d = target || doc!;
    if (d.kind === "quote" && editable) { const saved = await save(); if (!saved) return; d = saved; }
    let to = client?.email || d.client_snapshot?.email || "";
    if (!to) {
      to = (prompt("Adresse e-mail du client ?") || "").trim();
      if (!to) return;
      await updateClient({ email: to });
    }
    if (!confirm(`Envoyer ${d.kind === "quote" ? "le devis" : d.kind === "credit" ? "l'avoir" : "la facture"} ${d.number} à ${to} ?`)) return;
    setBusy(true); setErr("");
    try {
      const { data: { session } } = await sb().auth.getSession();
      const r = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ docId: d.id, to, origin: location.origin, pdfBase64: await pdfBase64(d, company!) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Échec de l'envoi");
      else { if (j.doc) setDoc(j.doc); setModal(""); setToast(`✅ Envoyé à ${to}`); setTimeout(() => setToast(""), 4000); }
    } catch { setErr("Échec de l'envoi (réseau)"); }
    setBusy(false);
  }

  const title = doc.amends_id ? `Avenant ${doc.amendment_no}` : doc.kind === "quote" ? "Devis" : doc.kind === "credit" ? "Avoir" : "Facture";
  const relance = () => {
    const body = `Bonjour,\n\nSauf erreur de notre part, la facture ${doc.number} du ${dateFr(doc.issue_date)} d'un montant de ${eur(doc.total_ttc)} arrivée à échéance le ${dateFr(doc.due_date)} reste impayée.\n\nMerci de procéder au règlement${company.iban ? ` par virement (IBAN ${company.iban})` : ""}.\n\nCordialement,\n${company.name}`;
    location.href = `mailto:${client?.email || doc.client_snapshot?.email || ""}?subject=${encodeURIComponent(`Relance facture ${doc.number}`)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <Header back title={`${title} ${doc.number || "(nouveau)"}`}
        right={<span className={`chip ${STATUS_COLOR[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="fixed inset-x-4 top-4 z-50 rounded-xl bg-red-600 p-3 text-center text-sm font-semibold text-white shadow-lg">⚠️ {err}<span className="block text-xs font-normal opacity-80">Appuyez pour fermer</span></p>}
        {toast && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-ink p-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</p>}

        {doc.amends_id && (
          <Link href={`/app/doc/${doc.amends_id}`} className="card block border-orange-200 bg-flame-light text-sm">
            📎 Avenant n° {doc.amendment_no} au devis <b>{doc.amend_meta?.parent_number || parent?.number}</b>
            {doc.amend_meta?.base_ttc != null && <> · devis initial {eur(doc.amend_meta.base_ttc)} TTC{doc.amend_meta.previous_ttc ? ` + avenants ${eur(doc.amend_meta.previous_ttc)}` : ""}</>}
            <span className="block text-xs text-slate-600">Ajoutez seulement les changements : une quantité négative retire une prestation du devis initial.</span>
          </Link>
        )}
        {isQuote && !doc.amends_id && amendments.length > 0 && (
          <section className="card space-y-2">
            <h2 className="font-bold">Avenants</h2>
            {amendments.map((a) => (
              <Link key={a.id} href={`/app/doc/${a.id}`} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                <span>N° {a.amendment_no} · {a.number}</span>
                <span className="flex items-center gap-2"><b>{eur(a.total_ttc)}</b><span className={`chip ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span></span>
              </Link>
            ))}
            <div className="flex justify-between border-t pt-2 text-sm font-bold">
              <span>Total du marché (devis + avenants signés)</span>
              <span>{eur(Number(doc.total_ttc) + amendments.filter((a) => ["signed", "invoiced"].includes(a.status)).reduce((x, a) => x + Number(a.total_ttc), 0))}</span>
            </div>
          </section>
        )}
        {/* Client */}
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="label !mb-0">Client</span>
            {editable && <button className="text-sm font-semibold text-brand" onClick={() => setModal("client")}>＋ Nouveau client</button>}
          </div>
          {editable ? (
            <select className="input" value={doc.client_id || ""} onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              set({ client_id: e.target.value, site_address: doc.site_address || (c ? [c.address, c.zip, c.city].filter(Boolean).join(" ") : "") });
            }}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
            </select>
          ) : (
            <p className="font-semibold">{doc.client_snapshot?.name}<br /><span className="text-sm font-normal text-slate-500">{[doc.client_snapshot?.address, doc.client_snapshot?.zip, doc.client_snapshot?.city].filter(Boolean).join(" ")}</span></p>
          )}
          {client && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Téléphone</label>
                <div className="flex gap-1">
                  <input className="input" type="tel" inputMode="tel" defaultValue={client.phone || ""} key={`p${client.id}`}
                    onBlur={(e) => e.target.value !== (client.phone || "") && updateClient({ phone: e.target.value })} />
                  {client.phone && <a href={`tel:${client.phone}`} className="btn-ghost !px-2">📞</a>}
                </div>
              </div>
              <div>
                <label className="label">E-mail</label>
                <input className="input" type="email" inputMode="email" defaultValue={client.email || ""} key={`e${client.id}`}
                  onBlur={(e) => e.target.value !== (client.email || "") && updateClient({ email: e.target.value.trim() })} />
              </div>
            </div>
          )}
          {!client && doc.client_snapshot && (doc.client_snapshot.phone || doc.client_snapshot.email) && (
            <p className="text-sm text-slate-500">{[doc.client_snapshot.phone, doc.client_snapshot.email].filter(Boolean).join(" · ")}</p>
          )}
          {doc.sent_at && <p className="text-xs text-green-700">📧 Envoyé le {new Date(doc.sent_at).toLocaleString("fr-FR")} à {doc.sent_to}</p>}
          {isQuote && (doc as any).viewed_at && <p className="text-xs text-blue-700">👁 Consulté par le client le {new Date((doc as any).viewed_at).toLocaleString("fr-FR")}{(doc as any).view_count > 1 ? ` · ${(doc as any).view_count} ouvertures, dernière le ${new Date((doc as any).last_viewed_at).toLocaleString("fr-FR")}` : ""}</p>}
          {isQuote && doc.status === "sent" && !(doc as any).viewed_at && <p className="text-xs text-slate-500">👁 Pas encore ouvert par le client</p>}
          <div><label className="label">Objet</label><input className="input" disabled={!editable} placeholder="Ex : Remplacement chaudière gaz" value={doc.title || ""} onChange={(e) => set({ title: e.target.value })} /></div>
          <div><label className="label">Adresse du chantier</label><input className="input" disabled={!editable} value={doc.site_address || ""} onChange={(e) => set({ site_address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date</label><input type="date" className="input" disabled={!editable} value={doc.issue_date || ""} onChange={(e) => set({ issue_date: e.target.value })} /></div>
            {isQuote
              ? <div><label className="label">Valable jusqu'au</label><input type="date" className="input" disabled={!editable} value={doc.valid_until || ""} onChange={(e) => set({ valid_until: e.target.value })} /></div>
              : <div><label className="label">Échéance</label><input type="date" className="input" disabled={!editable} value={doc.due_date || ""} onChange={(e) => set({ due_date: e.target.value })} /></div>}
          </div>
        </section>

        {/* Lignes */}
        <section className="space-y-3">
          <h2 className="font-bold">Prestations</h2>
          {doc.lines.map((l, i) => (
            <div key={i} className="card space-y-2">
              {editable ? (
                <>
                  <div className="flex gap-2">
                    <input className="input font-semibold" placeholder="Désignation" value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
                    <button className="px-2 text-xl text-red-500" onClick={() => set({ lines: doc.lines.filter((_, j) => j !== i) })} aria-label="Supprimer">🗑</button>
                  </div>
                  <textarea className="input text-sm" rows={2} placeholder="Description (optionnel)" value={l.description || ""} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <div className="grid grid-cols-4 gap-2">
                    <div><label className="label">Qté</label><input className="input !px-2" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(",", ".") as any })} /></div>
                    <div><label className="label">Unité</label><input className="input !px-2" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></div>
                    <div><label className="label">PU HT</label><input className="input !px-2" inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value.replace(",", ".") as any })} /></div>
                    <div><label className="label">TVA</label>
                      <select className="input !px-1" value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: Number(e.target.value) })}>
                        {VAT_RATES.map((r) => <option key={r} value={r}>{String(r).replace(".", ",")}%</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-right text-sm font-semibold">{eur(Number(l.qty) * Number(l.unit_price))} HT</p>
                </>
              ) : (
                <div className="flex justify-between gap-3">
                  <div><p className="font-semibold">{l.label}</p>{l.description && <p className="text-sm text-slate-500">{l.description}</p>}
                    <p className="text-xs text-slate-400">{l.qty} {l.unit} × {eur(l.unit_price)} · TVA {l.vat_rate}%</p></div>
                  <p className="whitespace-nowrap font-semibold">{eur(Number(l.qty) * Number(l.unit_price))}</p>
                </div>
              )}
            </div>
          ))}
          {editable && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => setModal("catalog")}>📚 Catalogue</button>
              <button className="btn-ghost" onClick={() => set({ lines: [...doc.lines, emptyLine()] })}>＋ Ligne libre</button>
            </div>
          )}
        </section>

        {/* Totaux */}
        <section className="card space-y-2">
          {editable && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Remise %</label><input className="input" inputMode="decimal" value={doc.discount_pct || ""} onChange={(e) => set({ discount_pct: e.target.value.replace(",", ".") as any })} /></div>
              {isQuote && <div><label className="label">Acompte %</label><input className="input" inputMode="decimal" value={doc.deposit_pct || ""} onChange={(e) => set({ deposit_pct: e.target.value.replace(",", ".") as any })} /></div>}
            </div>
          )}
          <div className="flex justify-between text-sm"><span>Total HT</span><span>{eur(totals.ht)}</span></div>
          {Object.entries(totals.byRate).filter(([r]) => Number(r) > 0).map(([r, v]) => (
            <div key={r} className="flex justify-between text-sm text-slate-500"><span>TVA {r.replace(".", ",")} %</span><span>{eur(v.vat)}</span></div>
          ))}
          <div className="flex justify-between border-t pt-2 text-lg font-extrabold"><span>Total TTC</span><span>{eur(totals.ttc)}</span></div>
          {margin && (
            <button type="button" className="ml-auto block text-right text-xs text-slate-400"
              onClick={() => { setShowMargin(true); setTimeout(() => setShowMargin(false), 5000); }}>
              {showMargin ? `Marge : ${eur(margin.value)} (${margin.pct.toFixed(0)} %)` : "•••"}
            </button>
          )}
          <div><label className="label mt-2">Notes / conditions</label><textarea className="input text-sm" rows={2} disabled={!editable} value={doc.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></div>
        </section>

        {doc.kind !== "quote" && (doc.id || doc.status !== "draft") && <EInvoiceSection doc={doc} company={company} onDoc={(d) => setDoc(d)} />}

        {/* Signature */}
        {doc.signature_data && (
          <section className="card">
            <p className="label">Signé par {doc.signer_name} le {new Date(doc.signed_at!).toLocaleString("fr-FR")}</p>
            <div className="flex items-center gap-4">
              {doc.signer_photo && <img src={doc.signer_photo} alt="Signataire" className="h-24 w-24 rounded-xl object-cover" />}
              <img src={doc.signature_data} alt="Signature" className="h-24" />
            </div>
          </section>
        )}
        {doc.status === "paid" && <p className="card text-sm text-green-800">✅ Payée le {dateFr(doc.paid_at)} ({doc.payment_method})</p>}

        {/* Actions */}
        <section className="space-y-2">
          {editable && <button className="btn-primary w-full py-3.5" disabled={busy} onClick={() => save()}>{busy ? "Enregistrement…" : "💾 Enregistrer"}</button>}
          {!doc.id && doc.lines.length > 0 && <button className="btn-ghost w-full" onClick={() => setPreview(() => () => buildPdf({ ...doc, client_snapshot: client ? { ...client } : doc.client_snapshot }, company))}>👁 Aperçu du PDF</button>}

          {doc.id && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => setPreview(() => () => buildPdf({ ...doc, client_snapshot: client ? { ...client } : doc.client_snapshot }, company))}>👁 Aperçu</button>
              <button className="btn-ghost" onClick={() => sharePdf(doc, company)}>📤 Partager PDF</button>
            </div>
          )}

          {doc.id && isQuote && editable && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-brand" onClick={async () => { if (await save()) setModal("sign"); }}>✍️ Faire signer</button>
              <button className="btn-ghost" onClick={async () => { if (await save()) setModal("send"); }}>📧 Envoyer</button>
            </div>
          )}
          {doc.id && isQuote && ["signed", "sent", "draft"].includes(doc.status) && (
            <button className="btn-primary w-full" onClick={toInvoice}>⚡ Transformer en facture</button>
          )}
          {doc.id && isQuote && ["signed", "sent"].includes(doc.status) && (
            <button className="btn-ghost w-full" onClick={depositInvoice}>Facture d'acompte</button>
          )}
          {doc.id && !isQuote && doc.status === "draft" && (
            <button className="btn-brand w-full py-3.5" onClick={issueInvoice}>✅ Émettre et envoyer {doc.kind === "credit" ? "l'avoir" : "la facture"}</button>
          )}
          {doc.kind === "invoice" && doc.status === "issued" && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-brand" onClick={() => setModal("pay")}>💶 Marquer payée</button>
              <button className="btn-ghost" onClick={relance}>📧 Relancer</button>
            </div>
          )}
          {doc.kind !== "quote" && doc.status !== "draft" && (
            <button className="btn-primary w-full" disabled={busy} onClick={() => sendEmail()}>📧 {doc.sent_at ? "Renvoyer" : "Envoyer"} par e-mail</button>
          )}
          {doc.kind === "invoice" && ["issued", "paid"].includes(doc.status) && (
            <button className="btn-ghost w-full" onClick={creditNote}>Créer un avoir</button>
          )}
          {doc.id && isQuote && <button className="btn-ghost w-full" onClick={duplicate}>Dupliquer</button>}
          {doc.id && isQuote && editable && <button className="btn-ghost w-full" onClick={() => save({ status: "refused" })}>Marquer refusé</button>}
          {doc.id && doc.status === "draft" && <button className="btn-danger w-full" onClick={remove}>Supprimer le brouillon</button>}
          {doc.id && isQuote && ["signed", "invoiced"].includes(doc.status) && <button className="btn-brand w-full" onClick={createAmendment}>➕ Créer un avenant (travaux en plus ou en moins)</button>}
          {doc.id && isQuote && !doc.amends_id && ["signed", "invoiced"].includes(doc.status) && <Link href={`/app/chantiers/nouveau?doc=${doc.id}`} className="btn-ghost w-full">🏗️ Ouvrir le suivi de chantier</Link>}
          {doc.id && doc.client_id && <Link href={`/app/planning?doc=${doc.id}&client=${doc.client_id}`} className="btn-ghost w-full">🗓 Planifier l'intervention</Link>}
        </section>
      </div>

      {/* Modales */}
      {preview && <PdfPreview build={preview} filename={`${doc.number || "brouillon"}.pdf`} onClose={() => setPreview(null)} />}
      {modal === "catalog" && (
        <Modal title="Catalogue" onClose={() => setModal("")}>
          <input className="input mb-3" placeholder="Rechercher (prestation, article, référence fournisseur)…" value={catQ} onChange={(e) => setCatQ(e.target.value)} />
          {supRes.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="label">Tarifs fournisseurs</p>
              {supRes.map((c: any) => (
                <button key={c.id} className="card w-full text-left" onClick={() => {
                  set({ lines: [...doc.lines, { label: c.label, description: c.description, qty: 1, unit: c.unit, unit_price: Number(c.unit_price), vat_rate: Number(c.vat_rate), cost_price: Number(c.cost_price) || 0 }] });
                  setModal("");
                }}>
                  <p className="text-xs text-slate-400">🏭 {c.supplier} · {c.ref}</p>
                  <div className="flex justify-between gap-2"><span className="font-semibold">{c.label}</span><span className="whitespace-nowrap">{eur(c.unit_price)}</span></div>
                </button>
              ))}
              <p className="label pt-2">Mes prestations</p>
            </div>
          )}
          {catalog.length === 0 && (
            <button className="btn-primary w-full" onClick={async () => { await sb().rpc("complete_my_catalog"); const { data } = await sb().from("catalog_items").select("*").order("category").order("label"); setCatalog(data || []); }}>
              📚 Charger le catalogue type
            </button>
          )}
          {catalog.length > 0 && (
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {["all", ...Array.from(new Set(catalog.map((c) => c.category)))].map((c) => (
                <button key={c} onClick={() => setCatCat(c)} className={`chip whitespace-nowrap border py-1.5 ${catCat === c ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{c === "all" ? "Tout" : c}</button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {catalog.filter((c) => (catCat === "all" || c.category === catCat) && (!catQ || `${c.label} ${c.category}`.toLowerCase().includes(catQ.toLowerCase()))).map((c) => (
              <button key={c.id} className="card w-full text-left" onClick={() => {
                set({ lines: [...doc.lines, { label: c.label, description: c.description, qty: 1, unit: c.unit, unit_price: Number(c.unit_price), vat_rate: Number(c.vat_rate), cost_price: Number(c.cost_price) || 0 }] });
                setModal("");
              }}>
                <p className="text-xs text-slate-400">{c.category}</p>
                <div className="flex justify-between"><span className="font-semibold">{c.label}</span><span>{eur(c.unit_price)}</span></div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal === "client" && (
        <Modal title="Nouveau client" onClose={() => setModal("")}>
          <div className="space-y-3">
            <select className="input" value={newClient.type} onChange={(e) => setNewClient({ ...newClient, type: e.target.value })}>
              <option value="particulier">Particulier</option><option value="professionnel">Professionnel</option>
            </select>
            <input className="input" placeholder="Nom / raison sociale *" value={newClient.name || ""} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
            <input className="input" placeholder="Téléphone" inputMode="tel" value={newClient.phone || ""} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
            <input className="input" placeholder="E-mail" type="email" value={newClient.email || ""} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
            <input className="input" placeholder="Adresse" value={newClient.address || ""} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input className="input" placeholder="CP" inputMode="numeric" value={newClient.zip || ""} onChange={(e) => setNewClient({ ...newClient, zip: e.target.value })} />
              <input className="input col-span-2" placeholder="Ville" value={newClient.city || ""} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} />
            </div>
            {newClient.type === "professionnel" && (
              <SiretField label="SIRET du client" value={newClient.siret || ""} onChange={(v) => setNewClient({ ...newClient, siret: v })}
                onVerified={(i) => setNewClient({ ...newClient, siret: i.siret || newClient.siret, siret_verified_at: new Date().toISOString(),
                  name: newClient.name || i.name, address: newClient.address || i.address, zip: newClient.zip || i.zip, city: newClient.city || i.city })} />
            )}
            <button className="btn-primary w-full" onClick={addClient}>Ajouter</button>
          </div>
        </Modal>
      )}

      {modal === "sign" && (
        <Modal title={`Signature — ${eur(totals.ttc)} TTC`} onClose={() => setModal("")}>
          <SignaturePad defaultName={client?.name || ""} onCancel={() => setModal("")}
            onDone={async (name, sig, photo) => { setModal(""); await save({ status: "signed", signer_name: name, signature_data: sig, signer_photo: photo, signed_at: new Date().toISOString() }); }} />
        </Modal>
      )}

      {modal === "send" && (
        <Modal title="Envoyer le devis à signer" onClose={() => setModal("")}>
          <p className="mb-3 text-sm text-slate-600">Le client ouvre le lien, consulte le devis et signe depuis son téléphone.</p>
          <input className="input mb-3 text-xs" readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
          <div className="grid gap-2">
            <button className="btn-brand" disabled={busy} onClick={() => sendEmail()}>📧 Envoyer par e-mail{client?.email ? ` à ${client.email}` : ""}</button>
            <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(publicUrl); await save({ status: "sent" }); alert("Lien copié"); }}>📋 Copier le lien</button>
            <a className="btn-ghost" onClick={() => save({ status: "sent" })} target="_blank" rel="noreferrer"
              href={`https://wa.me/${(client?.phone || "").replace(/\D/g, "").replace(/^0/, "33")}?text=${encodeURIComponent(`Bonjour, voici votre devis ${doc.number} de ${company.name} (${eur(totals.ttc)} TTC). Vous pouvez le consulter et le signer ici : ${publicUrl}`)}`}>💬 WhatsApp</a>
            <a className="btn-ghost" onClick={() => save({ status: "sent" })}
              href={`sms:${client?.phone || ""}?body=${encodeURIComponent(`Votre devis ${company.name} : ${publicUrl}`)}`}>📱 SMS</a>
          </div>
        </Modal>
      )}

      {modal === "pay" && (
        <Modal title="Enregistrer le paiement" onClose={() => setModal("")}>
          <div className="grid gap-2">
            {["Virement", "Chèque", "Espèces", "Carte bancaire"].map((m) => (
              <button key={m} className="btn-ghost" onClick={async () => {
                setModal(""); const paid = await save({ status: "paid", paid_at: new Date().toISOString(), payment_method: m });
                if (paid && (paid as any).einvoice_id) { try { const j = await callEInvoice("payment", paid.id); if (j.doc) setDoc(j.doc); } catch {} }
              }}>{m}</button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Page() { return <Suspense><Editor /></Suspense>; }
