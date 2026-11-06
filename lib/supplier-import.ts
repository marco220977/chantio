"use client";
// Lecture des tarifs fournisseurs : Excel (.xlsx/.xls), CSV, FAB-DIS

export type Field = "ref" | "label" | "brand" | "family" | "price" | "public_price" | "unit";
export type Mapping = Partial<Record<Field, number>>;
export type Sheet = { headers: string[]; rows: string[][]; sheetName?: string; isFabdis?: boolean };

export const FIELD_LABEL: Record<Field, string> = {
  ref: "Référence", label: "Désignation", brand: "Marque", family: "Famille",
  price: "Prix d'achat net HT", public_price: "Prix public HT", unit: "Unité",
};

const SYN: Record<Field, string[]> = {
  ref: ["refciale", "reference fournisseur", "ref fournisseur", "reference", "ref", "code article", "code produit", "article", "code", "sku", "refarticle"],
  label: ["libelle240", "libelle80", "libelle", "designation", "description", "libelle30", "nom", "intitule"],
  brand: ["marque", "fabricant", "manufacturer"],
  family: ["famille", "fam1l", "categorie", "sous famille", "gamme", "famille article"],
  price: ["prix net", "net ht", "prix achat", "pa net", "tarif net", "prix net ht", "votre prix", "prix client", "net"],
  public_price: ["prix public", "ppht", "tarif", "prix tarif", "pp ht", "prix catalogue", "prix de base", "prix brut", "prix"],
  unit: ["unite", "ub", "uv", "unite de vente", "conditionnement"],
};

const norm = (s: string) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function detectMapping(headers: string[]): Mapping {
  const h = headers.map(norm);
  const used = new Set<number>();
  const map: Mapping = {};
  const order: Field[] = ["ref", "label", "brand", "family", "price", "public_price", "unit"];
  for (const f of order) {
    // 1. correspondance exacte, 2. le titre contient le synonyme
    for (const pass of [0, 1]) {
      if (map[f] !== undefined) break;
      for (const syn of SYN[f]) {
        const i = h.findIndex((x, k) => !used.has(k) && (pass === 0 ? x === syn : x.includes(syn)));
        if (i >= 0) { map[f] = i; used.add(i); break; }
      }
    }
  }
  return map;
}

function decode(buf: ArrayBuffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const sep = [";", "\t", ",", "|"].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// Trouve la ligne d'en-têtes (la première ligne avec plusieurs cellules texte reconnues)
function splitHeader(all: string[][]): Sheet {
  let hi = 0, best = -1;
  for (let i = 0; i < Math.min(all.length, 20); i++) {
    const score = Object.keys(detectMapping(all[i].map(String))).length;
    if (score > best) { best = score; hi = i; }
  }
  return { headers: all[hi].map((x) => String(x ?? "").trim()), rows: all.slice(hi + 1).map((r) => r.map((x) => String(x ?? "").trim())) };
}

export async function readSupplierFile(file: File): Promise<Sheet> {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return splitHeader(parseCsv(decode(buf)));
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array", dense: true });
  // FAB-DIS : onglet COMMERCE
  const fab = wb.SheetNames.find((n) => norm(n) === "commerce");
  const sheetName = fab || wb.SheetNames.map((n) => [n, (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }) as any[]).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const all = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" }) as string[][];
  return { ...splitHeader(all), sheetName, isFabdis: !!fab };
}

export function toNumber(v: string): number {
  if (!v) return NaN;
  let s = String(v).replace(/[€\s  ]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  return parseFloat(s);
}

export type ImportOptions = { supplier: string; priceType: "net" | "public"; discountPct: number; coef: number; vatRate: number; round: number };

export function buildItems(sheet: Sheet, map: Mapping, o: ImportOptions) {
  const get = (r: string[], f: Field) => (map[f] !== undefined ? r[map[f]!] ?? "" : "");
  const items: any[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of sheet.rows) {
    const ref = get(r, "ref").trim();
    const label = get(r, "label").trim() || ref;
    const pub = toNumber(get(r, "public_price"));
    let cost = o.priceType === "net" ? toNumber(get(r, "price")) : pub * (1 - (o.discountPct || 0) / 100);
    if (o.priceType === "net" && isNaN(cost) && !isNaN(pub)) cost = pub * (1 - (o.discountPct || 0) / 100);
    if (!ref || !label || isNaN(cost) || cost <= 0 || seen.has(ref)) { skipped++; continue; }
    seen.add(ref);
    const sale = Math.round((cost * o.coef) / o.round) * o.round;
    const brand = get(r, "brand").trim();
    items.push({
      supplier: o.supplier, ref, brand: brand || null,
      label: (brand && !label.toLowerCase().includes(brand.toLowerCase()) ? `${label} — ${brand}` : label).slice(0, 300),
      description: `Réf. ${ref}`,
      category: get(r, "family").trim() || o.supplier,
      unit: (get(r, "unit").trim() || "u").slice(0, 12),
      cost_price: Math.round(cost * 100) / 100,
      unit_price: Math.round(sale * 100) / 100,
      public_price: isNaN(pub) ? null : Math.round(pub * 100) / 100,
      vat_rate: o.vatRate,
    });
  }
  return { items, skipped };
}
