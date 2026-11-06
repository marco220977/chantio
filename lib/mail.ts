// Envoi e-mail / SMS via Brevo (côté serveur)
export const escHtml = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const eurFr = (n: any) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export const dateFrS = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "");

export function wrapHtml(co: { name: string; logo_url?: string | null; phone?: string | null }, body: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1b2d;max-width:560px">
    ${co.logo_url ? `<img src="${co.logo_url}" alt="" style="max-height:60px;margin-bottom:16px">` : ""}${body}
    <p>Cordialement,<br><b>${escHtml(co.name)}</b>${co.phone ? `<br>${escHtml(co.phone)}` : ""}</p></div>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#ea7a0c;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">${escHtml(label)}</a></p>`;

export async function sendEmail(o: { fromName: string; replyTo?: string | null; to: string; toName?: string; subject: string; html: string; attachments?: { name: string; content: string }[] }) {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) throw new Error("E-mail non configuré");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: o.fromName, email: process.env.EMAIL_FROM }, replyTo: o.replyTo ? { email: o.replyTo } : undefined,
      to: [{ email: o.to, name: o.toName || o.to }], subject: o.subject, htmlContent: o.html, attachment: o.attachments?.length ? o.attachments : undefined }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || `Brevo ${r.status}`); }
}

export function intlPhone(p?: string | null): string | null {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 10) d = "33" + d.slice(1);
  return /^\d{10,15}$/.test(d) ? d : null;
}

export async function sendSms(o: { sender?: string | null; to: string; text: string }) {
  if (!process.env.BREVO_API_KEY) throw new Error("SMS non configuré");
  const sender = (o.sender || "Artisan").replace(/[^A-Za-z0-9]/g, "").slice(0, 11) || "Artisan";
  const r = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender, recipient: o.to, content: o.text.slice(0, 300), type: "transactional", unicodeEnabled: true }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || `SMS ${r.status}`); }
}
