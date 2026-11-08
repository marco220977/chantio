import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { escHtml, intlPhone, sendEmail, sendSms, wrapHtml } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Prévient un client du retard du technicien
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { id, minutes } = await req.json().catch(() => ({}));
  const min = Math.round(Number(minutes));
  if (!id || !min || min < 1 || min > 600) return NextResponse.json({ error: "Retard invalide" }, { status: 400 });
  const { data: iv } = await s.from("interventions").select("id, starts_at, company_id, sav_id, clients(name, email, phone)").eq("id", id).single();
  if (!iv) return NextResponse.json({ error: "Rendez-vous introuvable" }, { status: 404 });
  const { data: co } = await s.from("companies").select("name, email, phone, logo_url, sms_enabled, sms_sender").eq("id", iv.company_id).single();
  const { data: tk } = iv.sav_id ? await s.from("sav_tickets").select("client_snapshot").eq("id", iv.sav_id).single() : { data: null as any };
  const cl: any = iv.clients || {}; const snap: any = tk?.client_snapshot || {};
  const name = cl.name || snap.name || ""; const email = cl.email || snap.email || "";
  const rawPhone = cl.phone || snap.phone || ""; const phone = intlPhone(rawPhone);
  const planned = new Date(iv.starts_at);
  const hhmm = (d: Date) => d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  const eta = new Date(Math.max(planned.getTime(), Date.now()) + min * 60000);
  const text = `${co?.name || "Votre artisan"} : notre technicien aura environ ${min} min de retard pour votre rendez-vous de ${hhmm(planned)}. Arrivée estimée vers ${hhmm(eta)}. Merci de votre compréhension.${co?.phone ? ` ${co.phone}` : ""}`;
  const out = { ok: true, sms: false, email: false, phone: rawPhone.replace(/[^\d+]/g, ""), text, errors: [] as string[] };
  if (phone && co?.sms_enabled) {
    try { await sendSms({ sender: co.sms_sender || co.name, to: phone, text }); out.sms = true; } catch (e: any) { out.errors.push(e.message); }
  }
  if (!out.sms && email) {
    try {
      await sendEmail({ fromName: co?.name || "Votre artisan", replyTo: co?.email, to: email, toName: name, subject: `Retard d'environ ${min} min pour votre rendez-vous`,
        html: wrapHtml(co || { name: "" }, `<p>Bonjour ${escHtml(name)},</p><p>Notre technicien aura environ <b>${min} minutes de retard</b> pour votre rendez-vous de ${hhmm(planned)}.</p><p>Arrivée estimée vers <b>${hhmm(eta)}</b>. Merci de votre compréhension.</p>`) });
      out.email = true;
    } catch (e: any) { out.errors.push(e.message); }
  }
  return NextResponse.json(out);
}
