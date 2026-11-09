import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { computeSlots, geocode, pickSlots, type Ctx } from "@/lib/booking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Créneaux disponibles proposés à l'artisan (mêmes règles que la prise de RDV en ligne : trajets optimisés)
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { address, sav_id, tech, duration } = await req.json().catch(() => ({}));
  if (!address || String(address).trim().length < 5) return NextResponse.json({ error: "Indiquez d'abord l'adresse d'intervention." }, { status: 400 });

  const { data: co } = await s.from("companies").select("*").maybeSingle();
  if (!co) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  const { data: members } = await s.from("members").select("user_id, full_name, email, role");
  const days = co.booking_days_ahead || 14;
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(Date.now() + (days + 2) * 86400000);
  const { data: busy } = await s.from("interventions").select("id, assigned_to, starts_at, duration_min, address, lat, lng, sav_id")
    .in("status", ["planned", "to_confirm"]).gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString());

  const [client, depot] = await Promise.all([geocode(String(address)), geocode([co.address, co.zip, co.city].filter(Boolean).join(" "))]);
  if (!client) return NextResponse.json({ error: "Adresse introuvable : vérifiez-la (n°, rue, code postal, ville)." }, { status: 400 });
  // Géolocalise les RDV qui ne le sont pas encore (mémorisé pour la suite)
  const list = (busy || []).filter((b: any) => !sav_id || b.sav_id !== sav_id);
  const missing = list.filter((b: any) => b.lat == null && b.address).slice(0, 30);
  await Promise.all(missing.map(async (b: any) => {
    const p = await geocode(b.address); if (!p) return;
    b.lat = p.lat; b.lng = p.lng;
    await s.from("interventions").update({ lat: p.lat, lng: p.lng }).eq("id", b.id);
  }));

  const techs = (members || []).filter((m: any) => !tech || m.user_id === tech).map((m: any) => ({ id: m.user_id, name: m.full_name || m.email, role: m.role }));
  const ctx: Ctx = {
    active: true,
    company: { name: co.name, duration: Number(duration) || co.booking_duration_min || 90, day_start: co.booking_day_start || "08:00", day_end: co.booking_day_end || "17:00",
      buffer: co.booking_buffer_min ?? 15, max_km: co.booking_max_km || 40, days_ahead: days, saturday: !!co.booking_saturday, auto_confirm: true, keep_free: 0,
      lunch: co.booking_lunch !== false, lunch_start: co.booking_lunch_start || "12:00", lunch_end: co.booking_lunch_end || "13:00" },
    ticket: { id: sav_id || "", number: "", status: "open", address: String(address) },
    booked: null, techs, busy: list as any,
  };
  const { slots, mode } = await computeSlots(ctx, client, depot);
  const picked = pickSlots(slots, new Date(), 12);
  const best = picked.length ? Math.min(...picked.map((x) => x.detour)) : 0;
  const names = Object.fromEntries(techs.map((t) => [t.id, t.name]));
  return NextResponse.json({ mode, slots: picked.map((x) => ({ start: x.start, tech: x.tech, tech_name: names[x.tech] || "", detour: x.detour, best: x.detour <= best + 10 })) });
}
