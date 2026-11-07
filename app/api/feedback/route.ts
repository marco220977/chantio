import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const KIND: Record<string, string> = { idee: "💡 Idée / amélioration", bug: "🐞 Problème", autre: "💬 Autre" };
const STATUS: Record<string, string> = { nouveau: "Reçue", etude: "À l'étude", prevu: "Prévue", fait: "Disponible ✅", refuse: "Non retenue" };

async function mail(to: string, subject: string, html: string, replyTo?: string) {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) return;
  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: process.env.NEXT_PUBLIC_APP_NAME || "Chantio", email: process.env.EMAIL_FROM }, to: [{ email: to }],
      replyTo: replyTo ? { email: replyTo } : undefined, subject, htmlContent: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1b2d;max-width:560px">${html}</div>` }),
  }).catch(() => {});
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { id, action } = await req.json();
  const { data: fb } = await s.from("feedback").select("*, companies(name)").eq("id", id).single();
  if (!fb) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  if (action === "new") {
    const to = process.env.FEEDBACK_EMAIL || process.env.EMAIL_FROM!;
    await mail(to, `${KIND[fb.kind]} — ${fb.companies?.name || ""}`,
      `<p><b>${KIND[fb.kind]}</b> de ${esc(fb.author || "")} (${esc(fb.companies?.name || "")}, ${esc(fb.author_email || "")})</p>
       <p style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px">${esc(fb.message)}</p>
       ${fb.page ? `<p style="color:#64748b;font-size:13px">Page : ${esc(fb.page)}</p>` : ""}
       <p><a href="${origin}/app/admin/suggestions">Répondre dans l'appli →</a></p>`, fb.author_email || undefined);
    return NextResponse.json({ ok: true });
  }
  if (action === "reply") {
    const { data: isAdmin } = await s.rpc("is_platform_admin");
    if (!isAdmin) return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    if (fb.author_email) await mail(fb.author_email, `Votre suggestion : ${STATUS[fb.status]}`,
      `<p>Bonjour ${esc(fb.author || "")},</p><p>Merci pour votre retour :</p>
       <p style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px;color:#475569">${esc(fb.message)}</p>
       <p>Statut : <b>${STATUS[fb.status]}</b></p>${fb.admin_reply ? `<p style="white-space:pre-wrap">${esc(fb.admin_reply)}</p>` : ""}
       <p><a href="${origin}/app/suggestions">Voir mes suggestions →</a></p>`);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
