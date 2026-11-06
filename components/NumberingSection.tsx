"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";

type Row = { kind: "D" | "F" | "A"; prefix: string; pad: number; next: number; locked: boolean };
const LABEL = { D: "Devis", F: "Factures", A: "Avoirs" };

const preview = (r: Row) => {
  const y = String(new Date().getFullYear());
  return r.prefix.replace("{AAAA}", y).replace("{AA}", y.slice(2)) + String(r.next || 1).padStart(r.pad || 4, "0");
};

export default function NumberingSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const load = () => sb().rpc("get_numbering").then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const set = (k: string, p: Partial<Row>) => setRows(rows.map((r) => (r.kind === k ? { ...r, ...p } : r)));

  async function save(r: Row) {
    if (r.kind !== "D" && !confirm(`Les prochaines ${LABEL[r.kind].toLowerCase()} commenceront à ${preview(r)}. Ce réglage sera verrouillé dès la première émission. Confirmer ?`)) return;
    const { data, error } = await sb().rpc("set_numbering", { p_kind: r.kind, p_prefix: r.prefix, p_next: Number(r.next), p_pad: Number(r.pad) });
    setMsg({ ...msg, [r.kind]: error ? `⚠️ ${error.message}` : `✅ Prochain numéro : ${data}` });
    if (!error) load();
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-bold">Numérotation</h2>
        <p className="text-xs text-slate-500">Pour continuer la suite de votre ancien logiciel. Dans le préfixe, <b>{"{AAAA}"}</b> = année (2026) et <b>{"{AA}"}</b> = année courte (26) : le compteur repart alors à 1 chaque année. Sans année, le compteur continue sans fin.</p>
      </div>
      {rows.map((r) => (
        <div key={r.kind} className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{LABEL[r.kind]}</span>
            <span className="chip bg-slate-100 font-mono text-slate-700">{preview(r)}</span>
          </div>
          {r.locked ? (
            <p className="text-xs text-slate-500">🔒 Verrouillé : des {LABEL[r.kind].toLowerCase()} ont déjà été émises (la loi impose une suite continue).</p>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-2"><label className="label">Préfixe</label><input className="input !px-2 font-mono text-sm" value={r.prefix} onChange={(e) => set(r.kind, { prefix: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Prochain n°</label><input className="input !px-2" inputMode="numeric" value={r.next} onChange={(e) => set(r.kind, { next: Number(e.target.value.replace(/\D/g, "")) || 1 })} /></div>
                <div><label className="label">Chiffres</label><select className="input !px-1" value={r.pad} onChange={(e) => set(r.kind, { pad: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></div>
              </div>
              <button className="btn-ghost w-full !py-2 text-sm" onClick={() => save(r)}>Enregistrer la numérotation des {LABEL[r.kind].toLowerCase()}</button>
            </>
          )}
          {msg[r.kind] && <p className="text-xs">{msg[r.kind]}</p>}
        </div>
      ))}
    </section>
  );
}
