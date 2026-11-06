"use client";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase";
import { computeTotals, eur } from "@/lib/calc";
import Header from "@/components/Header";

type Row = { kind: string; status: string; issue_date: string; paid_at: string | null; total_ht: number; total_ttc: number; total_vat: number; lines: any[]; discount_pct: number };
const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const k = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€` : `${Math.round(n)} €`);

function Bars({ data, label }: { data: { name: string; value: number; current?: boolean }[]; label: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = [max, max / 2, 0];
  return (
    <div>
      <div className="relative flex h-56 gap-3">
        <div className="flex flex-col justify-between pb-5 text-right text-[10px] text-slate-400">{ticks.map((t, i) => <span key={i}>{k(t)}</span>)}</div>
        <div className="relative flex-1">
          {ticks.map((_, i) => <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: `calc(${(i / 2) * 100}% - ${i === 2 ? 20 : 0}px)` }} />)}
          <div className="absolute inset-0 bottom-5 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <button key={d.name} type="button" aria-label={`${d.name} : ${eur(d.value)}`} onClick={() => setSel(sel === i ? null : i)}
                className="group relative flex h-full flex-1 items-end">
                <div className={`w-full rounded-t-[4px] transition ${sel === i ? "bg-flame" : d.current ? "bg-brand" : "bg-brand/70"}`}
                  style={{ height: `${Math.max(d.value > 0 ? 1.5 : 0, (d.value / max) * 100)}%` }} />
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex gap-[2px]">
            {data.map((d) => <span key={d.name} className="flex-1 truncate text-center text-[9px] text-slate-500">{d.name}</span>)}
          </div>
        </div>
      </div>
      <p className="mt-2 h-5 text-center text-sm">
        {sel !== null ? <><b>{data[sel].name}</b> : {eur(data[sel].value)} {label}</> : <span className="text-slate-400">Touchez une barre pour voir le montant</span>}
      </p>
    </div>
  );
}

export default function CA() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [measure, setMeasure] = useState<"facture" | "encaisse">("facture");
  const [vatMonth, setVatMonth] = useState<number>(-1);

  useEffect(() => {
    sb().from("documents").select("kind,status,issue_date,paid_at,total_ht,total_ttc,total_vat,lines,discount_pct").in("kind", ["invoice", "credit"]).neq("status", "draft")
      .then(({ data }) => setRows((data as Row[]) || []));
  }, []);

  const val = (r: Row) => (measure === "facture" ? Number(r.total_ht) : Number(r.total_ttc));
  const dateOf = (r: Row) => (measure === "facture" ? r.issue_date : r.paid_at);
  const usable = useMemo(() => (rows || []).filter((r) => (measure === "facture" ? true : r.kind === "invoice" && r.status === "paid" && r.paid_at)), [rows, measure]);

  const years = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear()]);
    usable.forEach((r) => { const d = dateOf(r); if (d) ys.add(Number(d.slice(0, 4))); });
    return Array.from(ys).sort();
  }, [usable]);

  const monthly = MONTHS.map((name, m) => ({
    name, current: year === new Date().getFullYear() && m === new Date().getMonth(),
    value: usable.filter((r) => { const d = dateOf(r); return d && Number(d.slice(0, 4)) === year && Number(d.slice(5, 7)) === m + 1; }).reduce((s, r) => s + val(r), 0),
  }));
  const inMonth = (r: Row, m: number) => { const d = dateOf(r); return !!d && Number(d.slice(0, 4)) === year && (m < 0 || Number(d.slice(5, 7)) === m + 1); };
  const vatOf = (rs: Row[]) => rs.reduce((a, r) => a + Number(r.total_vat || 0), 0);
  const monthlyVat = MONTHS.map((_, m) => vatOf(usable.filter((r) => inMonth(r, m))));
  const totalVat = monthlyVat.reduce((a, v) => a + v, 0);
  const byRate = (() => {
    const acc: Record<string, { base: number; vat: number }> = {};
    for (const r of usable.filter((x) => inMonth(x, vatMonth))) {
      const t = computeTotals(r.lines || [], r.discount_pct, false);
      for (const [rate, v] of Object.entries(t.byRate)) { acc[rate] ??= { base: 0, vat: 0 }; acc[rate].base += v.base; acc[rate].vat += v.vat; }
    }
    return Object.entries(acc).filter(([, v]) => Math.abs(v.base) > 0.001).sort((a, b) => Number(b[0]) - Number(a[0]));
  })();
  const yearly = years.map((y) => ({ name: String(y), current: y === new Date().getFullYear(), value: usable.filter((r) => dateOf(r)?.startsWith(String(y))).reduce((s, r) => s + val(r), 0) }));

  const total = monthly.reduce((s, m) => s + m.value, 0);
  const prevSameDate = (() => {
    const now = new Date(); const lim = `${year - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return usable.filter((r) => { const d = dateOf(r); return d && d.startsWith(String(year - 1)) && (year !== now.getFullYear() || d.slice(0, 10) <= lim); }).reduce((s, r) => s + val(r), 0);
  })();
  const evo = prevSameDate > 0 ? ((total - prevSameDate) / prevSameDate) * 100 : null;
  const unit = measure === "facture" ? "HT facturé" : "TTC encaissé";

  return (
    <>
      <Header back title="Chiffre d'affaires" />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
          {[["facture", "Facturé (HT)"], ["encaisse", "Encaissé (TTC)"]].map(([kk, l]) => (
            <button key={kk} onClick={() => setMeasure(kk as any)} className={`rounded-lg py-2 text-sm font-semibold ${measure === kk ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>

        {rows === null ? <p className="text-center text-slate-400">Chargement…</p> : (
          <>
            <div className="flex items-center justify-between">
              <button className="btn-ghost !px-3 !py-1.5" onClick={() => setYear(year - 1)}>‹</button>
              <span className="text-lg font-extrabold">{year}</span>
              <button className="btn-ghost !px-3 !py-1.5" disabled={year >= new Date().getFullYear()} onClick={() => setYear(year + 1)}>›</button>
            </div>

            <div className="card">
              <p className="text-xs font-semibold uppercase text-slate-500">Total {year} — {unit}</p>
              <p className="text-3xl font-extrabold">{eur(total)}</p>
              <p className="text-sm text-slate-600">dont TVA {measure === "facture" ? "facturée" : "encaissée"} : <b>{eur(totalVat)}</b></p>
              {evo !== null && (
                <p className={`text-sm font-semibold ${evo >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {evo >= 0 ? "▲" : "▼"} {Math.abs(evo).toFixed(0)} % vs {year - 1}{year === new Date().getFullYear() ? " à la même date" : ""}
                </p>
              )}
            </div>

            <div className="card">
              <h2 className="mb-3 font-bold">Par mois — {year}</h2>
              <Bars data={monthly} label={unit} />
            </div>

            <div className="card">
              <h2 className="mb-3 font-bold">Par année</h2>
              <Bars data={yearly} label={unit} />
            </div>

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">TVA par taux</h2>
                <select className="input !w-auto !py-1.5 text-sm" value={vatMonth} onChange={(e) => setVatMonth(Number(e.target.value))}>
                  <option value={-1}>Année {year}</option>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
                </select>
              </div>
              {byRate.length === 0 ? <p className="text-sm text-slate-500">Aucune TVA sur la période.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Taux</th><th className="py-1 text-right">Base HT</th><th className="py-1 text-right">TVA</th></tr></thead>
                  <tbody>
                    {byRate.map(([rate, v]) => (
                      <tr key={rate} className="border-t border-slate-100"><td className="py-1.5">{rate.replace(".", ",")} %</td><td className="py-1.5 text-right tabular-nums">{eur(v.base)}</td><td className="py-1.5 text-right tabular-nums">{eur(v.vat)}</td></tr>
                    ))}
                    <tr className="border-t-2 font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right tabular-nums">{eur(byRate.reduce((a, [, v]) => a + v.base, 0))}</td><td className="py-1.5 text-right tabular-nums">{eur(byRate.reduce((a, [, v]) => a + v.vat, 0))}</td></tr>
                  </tbody>
                </table>
              )}
              <p className="text-xs text-slate-500">{measure === "encaisse"
                ? "Pour des travaux (prestations de services), la TVA est due à l'encaissement : utilisez la vue « Encaissé » pour votre déclaration."
                : "TVA facturée à la date d'émission des factures. Pour votre déclaration de travaux, la TVA est due à l'encaissement : passez sur « Encaissé »."}</p>
            </div>

            <div className="card overflow-x-auto">
              <h2 className="mb-2 font-bold">Détail {year}</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Mois</th><th className="py-1 text-right">{unit}</th><th className="py-1 text-right">TVA</th></tr></thead>
                <tbody>
                  {monthly.map((m, i) => <tr key={m.name} className="border-t border-slate-100"><td className="py-1.5">{m.name}</td><td className="py-1.5 text-right tabular-nums">{eur(m.value)}</td><td className="py-1.5 text-right tabular-nums text-slate-600">{eur(monthlyVat[i])}</td></tr>)}
                  <tr className="border-t-2 font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right tabular-nums">{eur(total)}</td><td className="py-1.5 text-right tabular-nums">{eur(totalVat)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Facturé : factures émises moins les avoirs, à la date d'émission. Encaissé : factures marquées payées, à la date du paiement.</p>
          </>
        )}
      </div>
    </>
  );
}
