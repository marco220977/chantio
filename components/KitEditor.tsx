"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { eur } from "@/lib/calc";
import type { Component } from "@/lib/types";

// Éditeur d'ouvrage : un article composé de fournitures et de main d'œuvre
export default function KitEditor({ value, onChange }: { value: Component[]; onChange: (v: Component[], totals: { cost: number; sale: number }) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(async () => {
      const w = q.trim().replace(/[%,()]/g, "");
      const { data } = await sb().from("catalog_items").select("*").is("components", null).or(`label.ilike.%${w}%,ref.ilike.%${w}%`).order("label").limit(10);
      setRes(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const emit = (v: Component[]) => onChange(v, {
    cost: Math.round(v.reduce((a, c) => a + Number(c.qty) * Number(c.cost_price), 0) * 100) / 100,
    sale: Math.round(v.reduce((a, c) => a + Number(c.qty) * Number(c.unit_price), 0) * 100) / 100,
  });
  const setC = (i: number, p: Partial<Component>) => emit(value.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
  const sale = value.reduce((a, c) => a + Number(c.qty) * Number(c.unit_price), 0);
  const cost = value.reduce((a, c) => a + Number(c.qty) * Number(c.cost_price), 0);

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="label">Composants de l'ouvrage</p>
      {value.map((c, i) => (
        <div key={i} className="space-y-1 rounded-lg bg-white p-2">
          <div className="flex gap-1">
            <input className="input !py-1.5 text-sm" value={c.label} onChange={(e) => setC(i, { label: e.target.value })} />
            <button className="px-1 text-red-500" onClick={() => emit(value.filter((_, j) => j !== i))}>🗑</button>
          </div>
          <div className="grid grid-cols-4 gap-1 text-xs">
            <input className="input !px-1 !py-1 text-xs" inputMode="decimal" value={c.qty} onChange={(e) => setC(i, { qty: num(e.target.value) })} title="Quantité" />
            <input className="input !px-1 !py-1 text-xs" value={c.unit} onChange={(e) => setC(i, { unit: e.target.value })} title="Unité" />
            <input className="input !px-1 !py-1 text-xs" inputMode="decimal" value={c.cost_price} onChange={(e) => setC(i, { cost_price: num(e.target.value) })} title="Prix d'achat HT" />
            <input className="input !px-1 !py-1 text-xs" inputMode="decimal" value={c.unit_price} onChange={(e) => setC(i, { unit_price: num(e.target.value) })} title="Prix de vente HT" />
          </div>
          <p className="text-[10px] text-slate-400">Qté · unité · achat HT · vente HT{c.supplier ? ` · ${c.supplier} ${c.ref || ""}` : ""}</p>
        </div>
      ))}
      <input className="input !py-2 text-sm" placeholder="＋ Ajouter depuis le catalogue (nom ou référence)…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.map((r) => (
        <button key={r.id} className="block w-full rounded-lg bg-white p-2 text-left text-xs" onClick={() => {
          emit([...value, { label: r.label, qty: 1, unit: r.unit, cost_price: Number(r.cost_price) || 0, unit_price: Number(r.unit_price) || 0, supplier: r.supplier || null, ref: r.ref || null }]);
          setQ("");
        }}>{r.supplier ? `🏭 ${r.supplier} · ` : ""}{r.label} — {eur(r.unit_price)}</button>
      ))}
      <button className="text-xs text-brand" onClick={() => emit([...value, { label: "Main d'œuvre", qty: 1, unit: "h", cost_price: 0, unit_price: 55 }])}>＋ Ligne libre (main d'œuvre…)</button>
      <p className="text-right text-sm">Total vente <b>{eur(sale)}</b> · achat {eur(cost)} · marge {sale ? Math.round((1 - cost / sale) * 100) : 0} %</p>
    </div>
  );
}
