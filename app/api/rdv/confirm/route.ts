import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { fmtSlot } from "@/lib/booking";
import { escHtml, intlPhone, sendEmail, sendSms, wrapHtml } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Confirmation par l'artisan d'un RDV réservé en ligne : statut « Prévue » + e-mail et SMS au client
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Rendez-vous manquant" }, { status: 400 });

  const { data: iv, error } = await s.from("interventions").update({ status: "planned" }).eq("id", id)
    .select("id, starts_at, address, company_id, sav_id, clients(name, email, phone)").single();
  if (error || !iv) return NextResponse.json({ error: error?.message || "Rendez-vous introuvable" }, { status: 404 });
  const { data: co } = await s.from("companies").select("name, email, phone, logo_url, sms_enabled, sms_sender").eq("id", iv.company_id).single();
  const { data: tk } = iv.sav_id ? await s.from("sav_tickets").select("number, booking_token, client_snapshot").eq("id", iv.sav_id).single()
    : await s.from("receptions").select("number, booking_token, client_snapshot").eq("intervention_id", iv.id).maybeSingle();

  const cl: any = iv.clients || {};
  const snap: any = tk?.client_snapshot || {};
  const name = cl.name || snap.name || "";
  const email = cl.email || snap.email || "";
  const phone = intlPhone(cl.phone || snap.phone);
  const label = fmtSlot(iv.starts_at);
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const link = tk?.booking_token ? `${base}/rdv/${tk.booking_token}` : "";
  const out = { ok: true, email: false, sms: false, errors: [] as string[] };

  if (email) {
    try {
      await sendEmail({ fromName: co?.name || "Votre artisan", replyTo: co?.email, to: email, toName: name,
        subject: `Rendez-vous confirmé — ${label}`,
        html: wrapHtml(co || { name: "" }, `<p>Bonjour ${escHtml(name)},</p>
          <p>Votre rendez-vous est <b>confirmé</b> :</p>
          <p><b>${escHtml(label)}</b>${iv.address ? `<br>${escHtml(iv.address)}` : ""}${tk?.number && iv.sav_id ? `<br>SAV n° ${escHtml(tk.number)}` : ""}</p>
          ${link ? `<p>Un empêchement ? Changez de créneau ici : <a href="${link}">${link}</a></p>` : ""}`) });
      out.email = true;
    } catch (e: any) { out.errors.push(`E-mail : ${e.message}`); }
  }
  if (phone && co?.sms_enabled) {
    try {
      await sendSms({ sender: co.sms_sender || co.name, to: phone, text: `${co.name} : votre rendez-vous du ${label} est confirmé.${link ? ` Modifier : ${link}` : co.phone ? ` Empêchement : ${co.phone}` : ""}` });
      out.sms = true;
    } catch (e: any) { out.errors.push(`SMS : ${e.message}`); }
  }
  return NextResponse.json(out);
}
