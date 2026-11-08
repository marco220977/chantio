import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { computeSlots, fmtSlot, geocode, km, pickSlots, type Ctx, type Pt } from "@/lib/booking";
import { escHtml, intlPhone, sendEmail, sendSms, wrapHtml } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function load(token: string) {
  const s = anon();
  const { data, error } = await s.rpc("booking_context", { p_token: token });
  if (error || !data) return null;
  const ctx = data as Ctx;
  const co = ctx.company;
  // Géolocalisation : client, dépôt (adresse de l'entreprise) et RDV pas encore localisés
  const [client, depot] = await Promise.all([geocode(ctx.ticket.address), geocode([co.address, co.zip, co.city].filter(Boolean).join(" "))]);
  const missing = ctx.busy.filter((b) => b.lat == null && b.address).slice(0, 40);
  const found = await Promise.all(missing.map(async (b) => ({ id: b.id, p: await geocode(b.address!) })));
  const items = found.filter((f) => f.p).map((f) => ({ id: f.id, lat: f.p!.lat, lng: f.p!.lng }));
  for (const it of items) { const b = ctx.busy.find((x) => x.id === it.id); if (b) { b.lat = it.lat; b.lng = it.lng; } }
  if (items.length) await s.rpc("booking_cache_coords", { p_token: token, p_items: items });
  return { s, ctx, client, depot };
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!UUID.test(token)) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const l = await load(token);
  if (!l) return NextResponse.json({ error: "Ce lien de rendez-vous n'est plus valide." }, { status: 404 });
  const { ctx, client, depot } = l;
  const base = { company: { name: ctx.company.name, phone: ctx.company.phone, logo_url: ctx.company.logo_url, duration: ctx.company.duration, auto_confirm: ctx.company.auto_confirm },
    ticket: { number: ctx.ticket.number, problem: ctx.ticket.problem, address: ctx.ticket.address, client_name: ctx.ticket.client_name }, booked: ctx.booked };
  if (!ctx.active) return NextResponse.json({ ...base, slots: [], error: "La prise de rendez-vous en ligne n'est pas disponible : contactez-nous par téléphone." });
  if (["resolved", "closed"].includes(ctx.ticket.status)) return NextResponse.json({ ...base, slots: [], error: "Cette intervention est déjà terminée." });
  if (!client) return NextResponse.json({ ...base, slots: [], error: "Adresse d'intervention introuvable : contactez-nous pour fixer le rendez-vous." });
  if (depot && ctx.company.max_km && km(depot, client) > ctx.company.max_km) return NextResponse.json({ ...base, slots: [], error: "Votre adresse est en dehors de notre zone de réservation en ligne : contactez-nous par téléphone." });
  const { slots, mode } = await computeSlots(ctx, client, depot);
  const picked = pickSlots(slots);
  const best = Math.min(...picked.map((x) => x.detour));
  return NextResponse.json({ ...base, mode, slots: picked.map((x) => ({ start: x.start, tech: x.tech, best: x.detour <= best + 10 })) });
}

export async function POST(req: Request) {
  const { t, start, tech } = await req.json().catch(() => ({}));
  if (!UUID.test(String(t)) || !UUID.test(String(tech)) || !start) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const l = await load(String(t));
  if (!l) return NextResponse.json({ error: "Ce lien de rendez-vous n'est plus valide." }, { status: 404 });
  const { s, ctx, client, depot } = l;
  if (!client) return NextResponse.json({ error: "Adresse introuvable." }, { status: 400 });
  // On revérifie que le créneau fait bien partie des créneaux possibles
  const { slots } = await computeSlots(ctx, client, depot);
  const when = new Date(start).toISOString();
  if (!slots.some((x) => x.tech === tech && x.start === when)) return NextResponse.json({ error: "Ce créneau n'est plus disponible, choisissez-en un autre." }, { status: 409 });
  const { data, error } = await s.rpc("booking_book", { p_token: t, p_start: when, p_tech: tech, p_lat: client.lat, p_lng: client.lng });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  // Notifications (au mieux, sans bloquer la réservation)
  const co = ctx.company; const tk = ctx.ticket; const label = fmtSlot(when);
  const confirmed = data?.status === "planned";
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const jobs: Promise<unknown>[] = [];
  if (co.email) jobs.push(sendEmail({ fromName: "Chantio", to: co.email, subject: `📅 RDV ${data?.rescheduled ? "déplacé" : "réservé"} par ${tk.client_name || "un client"} — SAV ${tk.number}`,
    html: wrapHtml({ name: "Chantio" }, `<p>${escHtml(tk.client_name || "Le client")} a ${data?.rescheduled ? "déplacé" : "réservé"} son rendez-vous SAV en ligne :</p>
      <p><b>${escHtml(label)}</b><br>${escHtml(tk.address)}<br>SAV n° ${escHtml(tk.number)}${tk.problem ? ` — ${escHtml(tk.problem)}` : ""}</p>
      <p>${confirmed ? "Le rendez-vous est confirmé et ajouté au planning." : "Il apparaît dans le planning « à confirmer » : ouvrez-le pour le valider."}</p>
      <p><a href="${base}/app/planning">Ouvrir le planning</a></p>`) }));
  if (tk.client_email) jobs.push(sendEmail({ fromName: co.name, replyTo: co.email, to: tk.client_email, toName: tk.client_name,
    subject: `${confirmed ? "Rendez-vous confirmé" : "Demande de rendez-vous reçue"} — ${label}`,
    html: wrapHtml(co, `<p>Bonjour ${escHtml(tk.client_name || "")},</p>
      <p>${confirmed ? "Votre rendez-vous est confirmé" : "Nous avons bien reçu votre demande de rendez-vous, nous vous la confirmons rapidement"} :</p>
      <p><b>${escHtml(label)}</b><br>${escHtml(tk.address)}</p>
      <p>Pour changer de créneau : <a href="${base}/rdv/${t}">${base}/rdv/${t}</a></p>`) }));
  const ph = intlPhone(tk.client_phone);
  if (ph && co.sms_enabled) jobs.push(sendSms({ sender: co.sms_sender || co.name, to: ph, text: `${co.name} : ${confirmed ? "RDV confirmé" : "demande de RDV reçue"} le ${label}. Modifier : ${base}/rdv/${t}` }));
  await Promise.allSettled(jobs);
  return NextResponse.json({ ok: true, ...data });
}
