import type { Line } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeTotals(lines: Line[], discountPct = 0, vatExempt = false) {
  const k = 1 - (Number(discountPct) || 0) / 100;
  const byRate: Record<string, { base: number; vat: number }> = {};
  let ht = 0;
  for (const l of lines) {
    const base = r2((Number(l.qty) || 0) * (Number(l.unit_price) || 0) * k);
    ht += base;
    const rate = vatExempt ? 0 : Number(l.vat_rate) || 0;
    const key = String(rate);
    byRate[key] ??= { base: 0, vat: 0 };
    byRate[key].base += base;
  }
  let vat = 0;
  for (const key of Object.keys(byRate)) {
    byRate[key].base = r2(byRate[key].base);
    byRate[key].vat = r2((byRate[key].base * Number(key)) / 100);
    vat += byRate[key].vat;
  }
  ht = r2(ht); vat = r2(vat);
  return { ht, vat, ttc: r2(ht + vat), byRate };
}

export const eur = (n?: number | null) =>
  (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export const dateFr = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "";

export const addDays = (days: number, from = new Date()) => {
  const d = new Date(from); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon", sent: "Envoyé", signed: "Signé", refused: "Refusé",
  invoiced: "Facturé", issued: "Émise", paid: "Payée", canceled: "Annulée",
};

export const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700", sent: "bg-blue-100 text-blue-800",
  signed: "bg-green-100 text-green-800", refused: "bg-red-100 text-red-700",
  invoiced: "bg-purple-100 text-purple-800", issued: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800", canceled: "bg-red-100 text-red-700",
};

export const VAT_RATES = [20, 10, 5.5, 0];
