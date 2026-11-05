import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

export const maxDuration = 30;

const eur = (n: number) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const dfr = (d?: string) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function POST(req: Request) {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM)
    return NextResponse.json({ error: "L'envoi d'e-mails n'est pas encore configuré (BREVO_API_KEY / EMAIL_FROM)." }, { status: 503 });

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });

  const { docId, pdfBase64, to, origin } = await req.json();
  const { data: doc } = await s.from("documents").select("*").eq("id", docId).single();
  if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  const { data: co } = await s.from("companies").select("*").single();
  if (!co) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  const email = String(to || doc.client_snapshot?.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Adresse e-mail du client invalide." }, { status: 400 });
  if (doc.kind !== "quote" && doc.status === "draft") return NextResponse.json({ error: "Émettez la facture avant de l'envoyer." }, { status: 400 });

  const isQuote = doc.kind === "quote";
  const label = isQuote ? "devis" : doc.kind === "credit" ? "avoir" : "facture";
  const signUrl = `${process.env.NEXT_PUBLIC_APP_URL || origin}/signer/${doc.public_token}`;
  const name = doc.client_snapshot?.name || "";

  const body = isQuote
    ? `<p>Bonjour ${esc(name)},</p>
       <p>Veuillez trouver ci-joint notre devis n° <b>${esc(doc.number)}</b>${doc.title ? ` — ${esc(doc.title)}` : ""}, d'un montant de <b>${eur(doc.total_ttc)} TTC</b>${doc.valid_until ? `, valable jusqu'au ${dfr(doc.valid_until)}` : ""}.</p>
       ${["draft", "sent"].includes(doc.status) ? `<p style="margin:24px 0"><a href="${signUrl}" style="background:#ea7a0c;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Consulter et signer le devis</a></p>` : ""}`
    : `<p>Bonjour ${esc(name)},</p>
       <p>Veuillez trouver ci-joint notre ${label} n° <b>${esc(doc.number)}</b> du ${dfr(doc.issue_date)}, d'un montant de <b>${eur(doc.total_ttc)} TTC</b>${doc.kind === "invoice" && doc.due_date ? `, à régler avant le ${dfr(doc.due_date)}` : ""}.</p>
       ${doc.kind === "invoice" && co.iban ? `<p>Règlement par virement : IBAN ${esc(co.iban)}${co.bic ? ` — BIC ${esc(co.bic)}` : ""}</p>` : ""}`;

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1b2d;max-width:560px">
    ${co.logo_url ? `<img src="${co.logo_url}" alt="" style="max-height:60px;margin-bottom:16px">` : ""}
    ${body}
    <p>Pour toute question, répondez simplement à cet e-mail${co.phone ? ` ou appelez-nous au ${esc(co.phone)}` : ""}.</p>
    <p>Cordialement,<br><b>${esc(co.name)}</b></p></div>`;

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: co.name, email: process.env.EMAIL_FROM },
      replyTo: co.email ? { email: co.email, name: co.name } : undefined,
      to: [{ email, name: name || email }],
      bcc: co.email ? [{ email: co.email }] : undefined,
      subject: `${label.charAt(0).toUpperCase() + label.slice(1)} n° ${doc.number} — ${co.name}`,
      htmlContent: html,
      attachment: pdfBase64 ? [{ name: `${doc.number}.pdf`, content: pdfBase64 }] : undefined,
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ error: `Envoi refusé : ${j.message || r.status}` }, { status: 502 });
  }

  const patch: any = { sent_at: new Date().toISOString(), sent_to: email };
  if (isQuote && doc.status === "draft") patch.status = "sent";
  const { data: updated } = await s.from("documents").update(patch).eq("id", doc.id).select().single();
  return NextResponse.json({ ok: true, doc: updated });
}
