"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";

type Item = { k: string; ok: boolean; warn?: boolean; msg: string };
// Voyants des services connectés (tableau de bord admin)
export default function ServiceStatus() {
  const [d, setD] = useState<{ items: Item[]; note?: string } | null>(null);
  const [err, setErr] = useState("");
  const load = async () => {
    setD(null); setErr("");
    const { data: { session } } = await sb().auth.getSession();
    const r = await fetch("/api/admin/status", { headers: { Authorization: `Bearer ${session?.access_token}` }, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Vérification impossible");
    setD(j);
  };
  useEffect(() => { load(); }, []);
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between"><p className="font-bold">🔌 Services connectés</p><button className="text-sm text-brand" onClick={load}>↻ Revérifier</button></div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!d && !err && <p className="text-sm text-slate-400">Vérification…</p>}
      {d?.items.map((x) => (
        <div key={x.k} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5">{x.ok ? "🟢" : x.warn ? "🟠" : "🔴"}</span>
          <div><p className="font-semibold">{x.k}</p><p className="text-xs text-slate-500">{x.msg}</p></div>
        </div>
      ))}
      {d?.note && <p className="text-[11px] text-slate-400">{d.note}</p>}
    </section>
  );
}
