// Prise de RDV SAV par le client : calcul des créneaux qui minimisent les trajets des techniciens.
// Distances : OpenRouteService (clé ORS_API_KEY) ; à défaut, estimation à vol d'oiseau.

export type Pt = { lat: number; lng: number };
export type Busy = { id: string; assigned_to: string | null; starts_at: string; duration_min: number | null; address: string | null; lat: number | null; lng: number | null; sav_id: string | null };
export type Ctx = {
  active: boolean;
  company: { name: string; phone?: string; email?: string; logo_url?: string; address?: string; zip?: string; city?: string; sms_enabled?: boolean; sms_sender?: string;
    duration: number; day_start: string; day_end: string; buffer: number; max_km: number; days_ahead: number; saturday: boolean; auto_confirm: boolean; keep_free: number };
  ticket: { id: string; number: string; problem?: string; status: string; address: string; client_name?: string; client_email?: string; client_phone?: string };
  booked: { id: string; starts_at: string; duration_min: number; status: string } | null;
  techs: { id: string; name?: string; role: string }[];
  busy: Busy[];
};
export type Slot = { start: string; tech: string; detour: number; day: string };

const TZ = "Europe/Paris";

// Date UTC correspondant à une heure locale de Paris
export function parisDate(y: number, m: number, d: number, h: number, min: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asParis = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (asParis - guess));
}
export function parisYmd(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, wd: p.weekday as string, key: `${p.year}-${p.month}-${p.day}` };
}

export function km(a: Pt, b: Pt) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const estimateMin = (a: Pt, b: Pt) => { const k = km(a, b); return k < 0.2 ? 0 : Math.round((k * 1.3) / 40 * 60 + 5); };

export async function geocode(q: string): Promise<Pt | null> {
  if (!q || q.trim().length < 5) return null;
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`, { cache: "no-store" });
    const j = await r.json();
    const c = j?.features?.[0]?.geometry?.coordinates;
    return c ? { lng: c[0], lat: c[1] } : null;
  } catch { return null; }
}

// Matrice des temps de trajet (minutes) entre tous les points
export async function travelMatrix(pts: Pt[]): Promise<{ m: number[][]; mode: "ors" | "estimate" }> {
  const est = () => pts.map((a) => pts.map((b) => estimateMin(a, b)));
  const key = process.env.ORS_API_KEY;
  if (!key || pts.length < 2 || pts.length > 58) return { m: est(), mode: "estimate" };
  try {
    const r = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST", headers: { Authorization: key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ locations: pts.map((p) => [p.lng, p.lat]), metrics: ["duration"] }), cache: "no-store",
    });
    if (!r.ok) { console.error("ORS", r.status, await r.text().catch(() => "")); return { m: est(), mode: "estimate" }; }
    const j = await r.json();
    const fb = est();
    return { m: (j.durations as (number | null)[][]).map((row, i) => row.map((s, k) => (s == null ? fb[i][k] : Math.round(s / 60)))), mode: "ors" };
  } catch (e) { console.error("ORS", e); return { m: est(), mode: "estimate" }; }
}

const hm = (s: string) => { const [h, m] = String(s || "8:00").split(":").map(Number); return { h: h || 0, m: m || 0 }; };

// Calcule tous les créneaux possibles, classés du plus court détour au plus long
export async function computeSlots(ctx: Ctx, client: Pt, depot: Pt | null, now = new Date()) {
  const co = ctx.company;
  const dur = co.duration || 90, buf = co.buffer ?? 15;
  const own = ctx.booked?.id;
  const busy = ctx.busy.filter((b) => b.id !== own && b.assigned_to);
  // Points : 0 = client, 1 = dépôt (si connu), puis les RDV géolocalisés
  const pts: Pt[] = [client];
  const depotIdx = depot ? pts.push(depot) - 1 : -1;
  const idx = new Map<string, number>();
  const located = busy.filter((b) => b.lat != null && b.lng != null)
    .sort((a, b) => km(client, a as Pt) - km(client, b as Pt)).slice(0, 56);
  for (const b of located) idx.set(b.id, pts.push({ lat: b.lat!, lng: b.lng! }) - 1);
  const { m, mode } = await travelMatrix(pts);
  const t = (a: number, b: number) => (a < 0 || b < 0 ? 0 : m[a][b]);
  const nodeOf = (b: Busy) => idx.get(b.id) ?? -2; // -2 = position inconnue → 20 min forfaitaires
  const tt = (a: number, b: number) => (a === -2 || b === -2 ? 20 : t(a, b));

  const s0 = hm(co.day_start), s1 = hm(co.day_end);
  const slots: Slot[] = [];
  const minStart = now.getTime() + 3 * 3600_000;
  for (let dayI = 0; dayI <= (co.days_ahead || 14); dayI++) {
    const ymd = parisYmd(new Date(now.getTime() + dayI * 86400_000));
    if (ymd.wd === "Sun" || (ymd.wd === "Sat" && !co.saturday)) continue;
    const dayStart = parisDate(ymd.y, ymd.m, ymd.d, s0.h, s0.m).getTime();
    const dayEnd = parisDate(ymd.y, ymd.m, ymd.d, s1.h, s1.m).getTime();
    for (const tech of ctx.techs) {
      const list = busy.filter((b) => b.assigned_to === tech.id && new Date(b.starts_at).getTime() < dayEnd && new Date(b.starts_at).getTime() + (b.duration_min || 60) * 60000 > dayStart)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      const used = list.reduce((s, b) => s + (b.duration_min || 60), 0);
      if (used + dur > (dayEnd - dayStart) / 60000 - (co.keep_free || 0)) continue;
      const nodes = [{ end: dayStart, start: dayStart, node: depotIdx, depot: true },
        ...list.map((b) => ({ start: new Date(b.starts_at).getTime(), end: new Date(b.starts_at).getTime() + (b.duration_min || 60) * 60000, node: nodeOf(b), depot: false })),
        { start: dayEnd, end: dayEnd, node: depotIdx, depot: true }];
      for (let k = 0; k < nodes.length - 1; k++) {
        const A = nodes[k], B = nodes[k + 1];
        const tAC = tt(A.node, 0), tCB = tt(0, B.node), tAB = A.depot && B.depot ? 0 : tt(A.node, B.node);
        let earliest = A.depot ? dayStart : A.end + (buf + tAC) * 60000;
        const latest = (B.depot ? dayEnd : B.start - (buf + tCB) * 60000) - dur * 60000;
        earliest = Math.max(earliest, minStart);
        const grid = 30 * 60000;
        earliest = Math.ceil(earliest / grid) * grid;
        if (earliest > latest) continue;
        // Détour : trajet ajouté par rapport à la tournée sans ce client
        const detour = Math.max(0, (A.depot && depotIdx < 0 ? 0 : tAC) + (B.depot && depotIdx < 0 ? 0 : tCB) - tAB);
        const starts = [earliest];
        const late = Math.floor(latest / grid) * grid;
        if (late - earliest >= 2 * 3600_000) starts.push(late);
        for (const st of starts) slots.push({ start: new Date(st).toISOString(), tech: tech.id, detour, day: ymd.key });
      }
    }
  }
  return { slots, mode };
}

// Sélection des meilleurs créneaux à proposer au client (variété de jours)
export function pickSlots(all: Slot[], now = new Date(), n = 8) {
  const score = (s: Slot) => s.detour + 4 * Math.floor((new Date(s.start).getTime() - now.getTime()) / 86400_000);
  const sorted = [...all].sort((a, b) => score(a) - score(b) || a.start.localeCompare(b.start));
  const out: Slot[] = []; const perDay: Record<string, number> = {}; const seen = new Set<string>();
  for (const s of sorted) {
    if (seen.has(s.start) || (perDay[s.day] || 0) >= 2) continue;
    seen.add(s.start); perDay[s.day] = (perDay[s.day] || 0) + 1; out.push(s);
    if (out.length >= n) break;
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export const fmtSlot = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
