import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { buildFacturX, channelOf, eReportingPayload, validateEInvoice } from "@/lib/einvoice";
import { provider } from "@/lib/einvoice-providers";

export const maxDuration = 30;
const digits = (s?: string | null) => String(s || "").replace(/\D/g, "");

export async function GET() {
  const p = provider();
  return NextResponse.json({ name: p.name, real: p.real });
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { action, docId } = await req.json();
  const { data: co } = await s.from("companies").select("*").single();
  if (!co) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  const p = provider();
  const log = (row: any) => s.from("einvoice_events").insert({ provider: p.name, ...row });

  try {
    if (action === "activate") {
      if (digits(co.siret).length < 9) return NextResponse.json({ error: "Renseignez et vérifiez d'abord votre SIRET." }, { status: 400 });
      const r = await p.activate({ siren: digits(co.siret).slice(0, 9), name: co.name, email: co.email });
      await s.from("companies").update({ einvoice_enabled: true, einvoice_account_id: r.accountId, einvoice_mandate_at: new Date().toISOString() }).eq("id", co.id);
      await log({ kind: "activation", status: "ok", message: r.message || "Compte activé" });
      return NextResponse.json({ ok: true });
    }
    if (action === "deactivate") {
      await s.from("companies").update({ einvoice_enabled: false }).eq("id", co.id);
      await log({ kind: "activation", status: "off", message: "Transmission automatique désactivée" });
      return NextResponse.json({ ok: true });
    }

    const { data: doc } = await s.from("documents").select("*").eq("id", docId).single();
    if (!doc) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    if (!co.einvoice_enabled) return NextResponse.json({ error: "Activez d'abord la facture électronique dans Mon entreprise." }, { status: 400 });
    const channel = channelOf(doc);
    const update = (patch: any) => s.from("documents").update({ ...patch, einvoice_channel: channel, einvoice_updated_at: new Date().toISOString() }).eq("id", doc.id).select().single();

    if (action === "send") {
      const errors = validateEInvoice(doc, co);
      if (errors.length) return NextResponse.json({ error: `Informations manquantes : ${errors.join(", ")}.` }, { status: 400 });
      const r = channel === "b2b"
        ? await p.send({ xml: buildFacturX(doc, co), number: doc.number, siren: digits(co.siret).slice(0, 9), buyerSiren: digits(doc.client_snapshot?.siret).slice(0, 9) })
        : await p.ereport(eReportingPayload(doc, co));
      const { data } = await update({ einvoice_status: r.status, einvoice_id: r.id });
      await log({ document_id: doc.id, kind: channel === "b2b" ? "envoi" : "ereporting", status: r.status, message: r.message });
      return NextResponse.json({ ok: true, doc: data, message: r.message });
    }
    if (action === "payment") {
      if (!doc.einvoice_id) return NextResponse.json({ ok: true, skipped: true });
      const r = channel === "b2b"
        ? await p.reportPayment({ id: doc.einvoice_id, number: doc.number, amount: Number(doc.total_ttc), date: (doc.paid_at || new Date().toISOString()).slice(0, 10) })
        : await p.ereport({ ...eReportingPayload(doc, co), kind: "paiement" });
      const { data } = await update({ einvoice_status: channel === "b2b" ? r.status : "ereporting_ok" });
      await log({ document_id: doc.id, kind: "paiement", status: r.status, message: r.message });
      return NextResponse.json({ ok: true, doc: data });
    }
    if (action === "refresh") {
      if (!doc.einvoice_id) return NextResponse.json({ ok: true });
      const r = await p.status(doc.einvoice_id);
      if (r.status && r.status !== doc.einvoice_status && doc.einvoice_status !== "encaissee") {
        const { data } = await update({ einvoice_status: r.status });
        await log({ document_id: doc.id, kind: "statut", status: r.status, message: r.message });
        return NextResponse.json({ ok: true, doc: data });
      }
      return NextResponse.json({ ok: true, doc });
    }
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    await log({ document_id: docId || null, kind: "erreur", status: "erreur", message: e.message });
    return NextResponse.json({ error: e.message || "Erreur de transmission" }, { status: 502 });
  }
}
