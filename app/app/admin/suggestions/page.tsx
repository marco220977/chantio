"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";
import { FB_KIND, FB_STATUS, notifyFeedback } from "@/lib/feedback";

export default function AdminSuggestions() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState("open");
  const [edit, setEdit] = useState<Record<string, { status: string; admin_reply: string }>>({});
  const [msg, setMsg] = useState("");

  const load = () => sb().from("feedback").select("*, companies(name)").order("created_at", { ascending: false }).limit(300).then(({ data }) => setList(data || []));
  useEffect(() => { sb().rpc("is_platform_admin").then(({ data }) => { setOk(!!data); if (data) load(); }); }, []);

  async function save(f: any) {
    const e = edit[f.id]; if (!e) return;
    const { error } = await sb().from("feedback").update({ status: e.status, admin_reply: e.admin_reply.trim() || null, replied_at: new Date().toISOString() }).eq("id", f.id);
    if (error) return setMsg(`⚠️ ${error.message}`);
    await notifyFeedback(f.id, "reply");
    setMsg("✅ Réponse enregistrée et envoyée"); setEdit((x) => { const y = { ...x }; delete y[f.id]; return y; }); load();
  }

  if (ok === null) return <><Header back title="Suggestions (admin)" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  if (!ok) return <><Header back title="Suggestions (admin)" /><p className="p-6 text-center">🔒 Réservé à l'administrateur de l'application.</p></>;
  const shown = list.filter((f) => filter === "all" || (filter === "open" ? ["nouveau", "etude", "prevu"].includes(f.status) : f.kind === filter));
  const count = (k: string) => list.filter((f) => f.status === k).length;

  return (
    <>
      <Header back title="Suggestions (admin)" />
      <div className="space-y-3 p-4">
        <p className="text-sm text-slate-600">{count("nouveau")} nouvelle(s) · {count("prevu")} prévue(s) · {list.length} au total</p>
        <div className="flex gap-1.5 overflow-x-auto">
          {[["open", "À traiter"], ["idee", "Idées"], ["bug", "Problèmes"], ["all", "Tout"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`chip whitespace-nowrap border py-1.5 ${filter === k ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{l}</button>
          ))}
        </div>
        {msg && <p className="text-sm">{msg}</p>}
        {shown.map((f) => {
          const e = edit[f.id] || { status: f.status, admin_reply: f.admin_reply || "" };
          const set = (p: any) => setEdit({ ...edit, [f.id]: { ...e, ...p } });
          return (
            <div key={f.id} className="card space-y-2">
              <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{FB_KIND[f.kind]} · {f.companies?.name} · {f.author} · {new Date(f.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className={`chip ${FB_STATUS[f.status][1]}`}>{FB_STATUS[f.status][0]}</span></div>
              <p className="whitespace-pre-wrap text-sm">{f.message}</p>
              {f.author_email && <a className="text-xs text-brand" href={`mailto:${f.author_email}`}>{f.author_email}</a>}
              {f.screenshot && <a href={f.screenshot} target="_blank" rel="noreferrer"><img src={f.screenshot} alt="" className="max-h-48 rounded-lg" /></a>}
              <select className="input !py-1.5 text-sm" value={e.status} onChange={(x) => set({ status: x.target.value })}>
                {Object.entries(FB_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <textarea className="input text-sm" rows={2} placeholder="Réponse au client (envoyée par e-mail)" value={e.admin_reply} onChange={(x) => set({ admin_reply: x.target.value })} />
              {edit[f.id] && <button className="btn-primary w-full text-sm" onClick={() => save(f)}>Enregistrer et prévenir le client</button>}
            </div>
          );
        })}
      </div>
    </>
  );
}
