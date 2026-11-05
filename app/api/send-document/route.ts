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

  const input = await req.json();
  const { docId, pdfBase64, to, origin } = input;
  if (input.type === "invite") return sendInvite(s, input);
  if (["contract", "report", "renewal", "reception", "sav"].includes(input.type)) return sendMaintenance(s, input);
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

// ---------- Contrats, attestations et avis d'échéance ----------
const LABELS: Record<string, string> = {
  chaudiere_gaz: "chaudière gaz", chaudiere_fioul: "chaudière fioul", pac_air_eau: "pompe à chaleur air/eau",
  pac_air_air: "pompe à chaleur air/air", ballon_thermo: "chauffe-eau thermodynamique",
};

function addMonths(date: string, m: number) { const d = new Date(date); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); }
function nextTerm(c: any) {
  let end = addMonths(c.start_date, c.duration_months || 12);
  const today = new Date().toISOString().slice(0, 10);
  while (c.tacit_renewal && end < today) end = addMonths(end, 12);
  return end;
}

async function sendMaintenance(s: any, body: any) {
  const { type, id, to, pdfBase64 } = body;
  const table = ({ report: "maintenance_reports", reception: "receptions", sav: "sav_tickets" } as Record<string, string>)[type] || "contracts";
  const { data: row } = await s.from(table).select("*").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  const { data: co } = await s.from("companies").select("*").single();
  const email = String(to || row.client_snapshot?.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Adresse e-mail du client invalide." }, { status: 400 });
  const name = row.client_snapshot?.name || "";
  const equip = LABELS[row.equipment?.type] || "équipement";

  let subject = "", content = "";
  if (type === "contract") {
    subject = `Contrat d'entretien n° ${row.number} — ${co.name}`;
    content = `<p>Bonjour ${esc(name)},</p><p>Veuillez trouver ci-joint votre contrat d'entretien n° <b>${esc(row.number)}</b> pour votre ${equip}${row.price_ht ? `, au tarif de ${eur(row.price_ht)} HT par an` : ""}.</p>`;
  } else if (type === "report") {
    subject = `Attestation d'entretien n° ${row.number} — ${co.name}`;
    content = `<p>Bonjour ${esc(name)},</p><p>Suite à notre visite du ${dfr(row.visit_date)}, veuillez trouver ci-joint l'attestation d'entretien de votre ${equip}. Conservez-la au moins deux ans : elle peut vous être demandée par votre assureur.</p>${row.next_visit_date ? `<p>Prochaine visite conseillée : <b>${dfr(row.next_visit_date)}</b>.</p>` : ""}`;
  } else if (type === "reception") {
    subject = `Procès-verbal de réception des travaux n° ${row.number} — ${co.name}`;
    content = `<p>Bonjour ${esc(name)},</p><p>Veuillez trouver ci-joint le procès-verbal de réception de vos travaux, signé le ${dfr(row.signed_at || row.reception_date)}${row.with_reserves ? ", avec les réserves mentionnées" : ", sans réserve"}.</p><p>Ce document marque le point de départ de vos garanties. Conservez-le précieusement.</p>`;
  } else if (type === "sav") {
    subject = `Bon d'intervention SAV n° ${row.number} — ${co.name}`;
    content = `<p>Bonjour ${esc(name)},</p><p>Veuillez trouver ci-joint le bon de notre intervention${row.resolved_at ? ` du ${dfr(row.resolved_at)}` : ""}.</p>`;
  } else {
    if (row.status !== "active") return NextResponse.json({ error: "Le contrat n'est pas actif." }, { status: 400 });
    const term = nextTerm(row);
    subject = `Avis d'échéance de votre contrat d'entretien n° ${row.number}`;
    content = `<p>Bonjour ${esc(name)},</p>
      <p>Votre contrat d'entretien n° <b>${esc(row.number)}</b> pour votre ${equip} arrive à échéance le <b>${dfr(term)}</b>.</p>
      <p>Sauf avis contraire de votre part, il sera reconduit tacitement pour une durée de 12 mois${row.price_ht ? `, au tarif de ${eur(row.price_ht)} HT` : ""}.</p>
      <p>Conformément à l'article L215-1 du Code de la consommation, vous pouvez refuser cette reconduction en nous en informant par lettre recommandée ou par simple réponse à cet e-mail avant le ${dfr(term)}.</p>`;
  }

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1b2d;max-width:560px">
    ${co.logo_url ? `<img src="${co.logo_url}" alt="" style="max-height:60px;margin-bottom:16px">` : ""}${content}
    <p>Pour toute question, répondez simplement à cet e-mail${co.phone ? ` ou appelez-nous au ${esc(co.phone)}` : ""}.</p>
    <p>Cordialement,<br><b>${esc(co.name)}</b></p></div>`;

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: co.name, email: process.env.EMAIL_FROM }, replyTo: co.email ? { email: co.email, name: co.name } : undefined,
      to: [{ email, name: name || email }], bcc: co.email ? [{ email: co.email }] : undefined, subject, htmlContent: html,
      attachment: pdfBase64 ? [{ name: `${row.number}.pdf`, content: pdfBase64 }] : undefined,
    }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); return NextResponse.json({ error: `Envoi refusé : ${j.message || r.status}` }, { status: 502 }); }
  if (type === "renewal") {
    await s.from(table).update({ renewal_notice_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  const { data: updated } = await s.from(table).update({ sent_at: new Date().toISOString(), sent_to: email }).eq("id", id).select().single();
  return NextResponse.json({ ok: true, row: updated });
}

async function sendInvite(s: any, body: any) {
  const { data: inv } = await s.from("invitations").select("*").eq("id", body.id).single();
  if (!inv) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  const { data: co } = await s.from("companies").select("*").single();
  const link = `${process.env.NEXT_PUBLIC_APP_URL || body.origin}/rejoindre/${inv.token}`;
  const role = inv.role === "technician" ? "technicien" : "superviseur";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1b2d;max-width:560px">
    ${co.logo_url ? `<img src="${co.logo_url}" alt="" style="max-height:60px;margin-bottom:16px">` : ""}
    <p>Bonjour ${esc(inv.full_name || "")},</p>
    <p><b>${esc(co.name)}</b> vous invite à rejoindre son équipe sur l'application de gestion de chantiers, en tant que <b>${role}</b>.</p>
    <p style="margin:24px 0"><a href="${link}" style="background:#ea7a0c;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Créer mon accès</a></p>
    <p style="font-size:13px;color:#64748b">Ouvrez ce lien sur votre téléphone. Ensuite, ajoutez l'appli à votre écran d'accueil depuis le menu du navigateur.</p></div>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: co.name, email: process.env.EMAIL_FROM }, replyTo: co.email ? { email: co.email } : undefined,
      to: [{ email: inv.email, name: inv.full_name || inv.email }], subject: `${co.name} vous invite à rejoindre son équipe`, htmlContent: html }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); return NextResponse.json({ error: `Envoi refusé : ${j.message || r.status}` }, { status: 502 }); }
  await s.from("invitations").update({ sent_at: new Date().toISOString() }).eq("id", inv.id);
  return NextResponse.json({ ok: true });
}
