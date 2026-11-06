import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { button, dateFrS, escHtml, eurFr, intlPhone, sendEmail, sendSms, wrapHtml } from "@/lib/mail";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const EQUIP: Record<string, string> = { chaudiere_gaz: "chaudière gaz", chaudiere_fioul: "chaudière fioul", pac_air_eau: "pompe à chaleur", pac_air_air: "climatisation", ballon_thermo: "chauffe-eau thermodynamique" };

export async function POST(req: Request) {
  const token = req.headers.get("x-cron-token") || "";
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await s.rpc("cron_due_items", { p_token: token });
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const cos: Record<string, any> = Object.fromEntries((data.companies || []).map((c: any) => [c.id, c]));
  const stats: Record<string, number> = {};
  const mark = async (kind: string, id: string, company: string, ok: boolean, channel: string, message: string) => {
    stats[`${kind}_${ok ? "ok" : "ko"}`] = (stats[`${kind}_${ok ? "ok" : "ko"}`] || 0) + 1;
    await s.rpc("cron_mark", { p_token: token, p_kind: kind, p_id: id, p_company: company, p_ok: ok, p_channel: channel, p_message: message });
  };

  // 3a. Relances de factures impayées
  for (const d of data.invoices || []) {
    const co = cos[d.company_id]; if (!co) continue;
    const n = (d.count || 0) + 1;
    const tone = n === 1 ? "Sauf erreur de notre part, la facture ci-dessous n'a pas encore été réglée." : n === 2 ? "Nous nous permettons de vous relancer au sujet de la facture ci-dessous, toujours impayée." : "Malgré nos précédentes relances, la facture ci-dessous reste impayée. Sans règlement de votre part, nous serons contraints d'appliquer les pénalités de retard prévues.";
    try {
      await sendEmail({ fromName: co.name, replyTo: co.email, to: d.client.email, toName: d.client.name,
        subject: `${n > 1 ? `${n}e relance — ` : "Rappel — "}Facture ${d.number} (${eurFr(d.total_ttc)})`,
        html: wrapHtml(co, `<p>Bonjour ${escHtml(d.client.name || "")},</p><p>${tone}</p>
          <p>Facture n° <b>${escHtml(d.number)}</b> du ${dateFrS(d.issue_date)} — <b>${eurFr(d.total_ttc)} TTC</b> — échue le ${dateFrS(d.due_date)} (${d.days} jour${d.days > 1 ? "s" : ""} de retard).</p>
          ${d.pay_link_url ? button(d.pay_link_url, "Payer en ligne par carte") : ""}
          ${co.iban ? `<p>Règlement par virement : IBAN ${escHtml(co.iban)}</p>` : ""}
          <p>Si vous avez déjà effectué le règlement, merci de ne pas tenir compte de ce message.</p>`) });
      await mark("invoice", d.id, d.company_id, true, "email", `Relance n° ${n} facture ${d.number}`);
    } catch (e: any) { await mark("invoice", d.id, d.company_id, false, "email", e.message); }
  }

  // 3b. Relance des devis sans réponse
  for (const d of data.quotes || []) {
    const co = cos[d.company_id]; if (!co) continue;
    try {
      await sendEmail({ fromName: co.name, replyTo: co.email, to: d.client.email, toName: d.client.name,
        subject: `Votre devis ${d.number}${d.title ? ` — ${d.title}` : ""}`,
        html: wrapHtml(co, `<p>Bonjour ${escHtml(d.client.name || "")},</p>
          <p>Nous revenons vers vous au sujet de notre devis n° <b>${escHtml(d.number)}</b> (${eurFr(d.total_ttc)} TTC). Avez-vous pu en prendre connaissance ? Nous restons disponibles pour en discuter ou l'ajuster.</p>
          ${button(`${base}/signer/${d.public_token}`, "Consulter et signer le devis")}`) });
      await mark("quote", d.id, d.company_id, true, "email", `Relance devis ${d.number}`);
    } catch (e: any) { await mark("quote", d.id, d.company_id, false, "email", e.message); }
  }

  // 11a. Rappel de rendez-vous la veille (SMS si activé, sinon e-mail)
  for (const a of data.appointments || []) {
    const co = cos[a.company_id]; if (!co) continue;
    const when = new Date(a.starts_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    const phone = intlPhone(a.client_phone);
    try {
      if (co.sms_enabled && phone) {
        await sendSms({ sender: co.sms_sender || co.name, to: phone, text: `${co.name} : rappel de votre rendez-vous ${when}${a.address ? ` au ${a.address}` : ""}. Un empêchement ? Appelez le ${co.phone || "nous"}.` });
        await mark("appointment", a.id, a.company_id, true, "sms", `Rappel RDV ${when}`);
      } else if (a.client_email) {
        await sendEmail({ fromName: co.name, replyTo: co.email, to: a.client_email, toName: a.client_name, subject: `Rappel : notre intervention ${when}`,
          html: wrapHtml(co, `<p>Bonjour ${escHtml(a.client_name || "")},</p><p>Nous vous rappelons notre rendez-vous <b>${when}</b>${a.address ? ` au ${escHtml(a.address)}` : ""} (${escHtml(a.title)}).</p><p>En cas d'empêchement, merci de nous prévenir${co.phone ? ` au ${escHtml(co.phone)}` : ""}.</p>`) });
        await mark("appointment", a.id, a.company_id, true, "email", `Rappel RDV ${when}`);
      }
    } catch (e: any) { await mark("appointment", a.id, a.company_id, false, co.sms_enabled ? "sms" : "email", e.message); }
  }

  // 11b. Rappel d'entretien annuel (contrats)
  for (const k of data.maintenance || []) {
    const co = cos[k.company_id]; if (!co) continue;
    try {
      await sendEmail({ fromName: co.name, replyTo: co.email, to: k.client.email, toName: k.client.name, subject: `L'entretien de votre ${EQUIP[k.equipment?.type] || "équipement"} approche`,
        html: wrapHtml(co, `<p>Bonjour ${escHtml(k.client.name || "")},</p><p>Dans le cadre de votre contrat d'entretien n° ${escHtml(k.number)}, la prochaine visite de votre ${EQUIP[k.equipment?.type] || "équipement"} est prévue vers le <b>${dateFrS(k.next_visit_date)}</b>.</p><p>Répondez simplement à cet e-mail${co.phone ? ` ou appelez-nous au ${escHtml(co.phone)}` : ""} pour convenir d'un rendez-vous.</p>`) });
      await mark("maintenance", k.id, k.company_id, true, "email", `Rappel entretien ${k.number}`);
    } catch (e: any) { await mark("maintenance", k.id, k.company_id, false, "email", e.message); }
  }

  // 12. Demande d'avis Google
  for (const r of data.reviews || []) {
    const co = cos[r.company_id]; if (!co) continue;
    const kind = r.type === "sav" ? "review_sav" : "review_chantier";
    try {
      await sendEmail({ fromName: co.name, replyTo: co.email, to: r.client.email, toName: r.client.name, subject: `Votre avis compte pour ${co.name}`,
        html: wrapHtml(co, `<p>Bonjour ${escHtml(r.client.name || "")},</p><p>Merci de nous avoir fait confiance pour ${r.type === "sav" ? "cette intervention" : "vos travaux"}. Si vous êtes satisfait, un avis sur Google nous aiderait beaucoup : cela prend 30 secondes.</p>${button(co.google_review_url, "⭐ Laisser un avis Google")}<p>Et si quelque chose ne vous a pas convenu, répondez-nous directement : nous ferons le nécessaire.</p>`) });
      await mark(kind, r.id, r.company_id, true, "email", "Demande d'avis");
    } catch (e: any) { await mark(kind, r.id, r.company_id, false, "email", e.message); }
  }

  return NextResponse.json({ ok: true, stats });
}
