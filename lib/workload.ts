// Temps de main d'œuvre prévu au devis et découpage en journées de travail
import type { Company, Line } from "@/lib/types";

const HOUR_UNITS = ["h", "heure", "heures", "hr", "hrs", "hre"];
const isHour = (u?: string) => HOUR_UNITS.includes(String(u || "").trim().toLowerCase().replace(/\.$/, ""));

// Minutes de main d'œuvre : lignes en heures (+ heures comprises dans les ouvrages composés)
export function laborMinutes(lines: Line[] = []): number {
  let h = 0;
  for (const l of lines) {
    if (isHour(l.unit)) h += Number(l.qty) || 0;
    else if (l.components?.length) for (const c of l.components as any[]) if (isHour(c.unit)) h += (Number(c.qty) || 0) * (Number(l.qty) || 1);
  }
  return Math.round(h * 60);
}

const hm = (s?: string, d = "08:00") => { const [h, m] = String(s || d).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Horaires de la journée (minutes depuis minuit)
export function dayHours(c?: Company | null) {
  const x: any = c || {};
  const start = hm(x.booking_day_start, "08:00"), end = hm(x.booking_day_end, "17:00");
  const lunch = x.booking_lunch !== false;
  const ls = hm(x.booking_lunch_start, "12:00"), le = hm(x.booking_lunch_end, "13:00");
  const lunchMin = lunch && le > ls && ls > start && le < end ? le - ls : 0;
  return { start, end, ls, le, lunchMin, work: end - start - lunchMin };
}

// Durée sur le planning (pause déjeuner comprise) pour un temps de travail donné à partir d'une heure
export function elapsed(startMin: number, workMin: number, c?: Company | null) {
  const d = dayHours(c);
  return d.lunchMin && startMin < d.ls && startMin + workMin > d.ls ? workMin + d.lunchMin : workMin;
}

// Découpe un chantier en journées (jours ouvrés, samedi selon réglage)
export function splitDays(startIso: string, workMin: number, c?: Company | null) {
  const d = dayHours(c);
  const sat = !!(c as any)?.booking_saturday;
  const out: { starts_at: string; duration_min: number; work: number }[] = [];
  let cur = new Date(startIso); let left = workMin;
  for (let guard = 0; left > 0 && guard < 60; guard++) {
    const startMin = cur.getHours() * 60 + cur.getMinutes();
    const lunchLeft = d.lunchMin && startMin < d.ls ? d.lunchMin : 0;
    const capacity = Math.max(0, d.end - startMin - lunchLeft);
    const w = Math.min(left, capacity);
    if (w > 0) { out.push({ starts_at: cur.toISOString(), duration_min: elapsed(startMin, w, c), work: w }); left -= w; }
    // Jour ouvré suivant, début de journée
    const n = new Date(cur); n.setDate(n.getDate() + 1); n.setHours(Math.floor(d.start / 60), d.start % 60, 0, 0);
    while (n.getDay() === 0 || (n.getDay() === 6 && !sat)) n.setDate(n.getDate() + 1);
    cur = n;
  }
  return out;
}

export const fmtH = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`; };
