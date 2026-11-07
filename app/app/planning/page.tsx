"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import type { Client } from "@/lib/types";
import { memberName, useCompany } from "@/components/CompanyContext";

type Iv = { id?: string; assigned_to?: string | null; title: string; client_id?: string | null; document_id?: string | null; address?: string; starts_at: string; duration_min: number; technician?: string; status: string; notes?: string; clients?: { name: string; phone?: string } | null };

const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const localInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function Planning() {
  const params = useSearchParams();
  const router = useRouter();
  const [quitus, setQuitus] = useState<Record<string, { id: string; status: string }>>({});
  const [week, setWeek] = useState(startOfWeek(new Date()));
  const [list, setList] = useState<Iv[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [edit, setEdit] = useState<Iv | null>(null);
  const { team, me, isSup } = useCompany();
  const [who, setWho] = useState<string>("all");
  useEffect(() => { if (me && !isSup) setWho(me.user_id); }, [me, isSup]);

  const load = async () => {
    const end = new Date(week); end.setDate(end.getDate() + 7);
    const { data } = await sb().from("interventions").select("*, clients(name, phone)")
      .gte("starts_at", week.toISOString()).lt("starts_at", end.toISOString()).order("starts_at");
    setList(data || []);
    const ids = (data || []).map((i: Iv) => i.id);
    if (ids.length) {
      const { data: rs } = await sb().from("receptions").select("id, status, intervention_id").in("intervention_id", ids);
      setQuitus(Object.fromEntries((rs || []).map((r: any) => [r.intervention_id, { id: r.id, status: r.status }])));
    }
  };
  useEffect(() => { load(); }, [week]);
  useEffect(() => {
    sb().from("clients").select("*").order("name").then(({ data }) => {
      setClients(data || []);
      const cid = params.get("client");
      if (cid) {
        const c = (data || []).find((x: Client) => x.id === cid);
        const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
        setEdit({ title: "Intervention", client_id: cid, document_id: params.get("doc"), address: c ? [c.address, c.zip, c.city].filter(Boolean).join(" ") : "", starts_at: d.toISOString(), duration_min: 240, status: "planned" });
      }
    });
  }, [params]);

  async function save(over?: Partial<Iv>) {
    if (!edit) return;
    const { id, clients: _c, ...row } = { ...edit, ...over };
    const wasDone = id ? list.find((x) => x.id === id)?.status === "done" : false;
    const { data: saved } = id ? await sb().from("interventions").update(row).eq("id", id).select().single() : await sb().from("interventions").insert(row).select().single();
    setEdit(null);
    if (saved && row.status === "done" && !wasDone && !quitus[saved.id]) {
      router.push(`/app/quitus/nouveau?intervention=${saved.id}`);
      return;
    }
    load();
  }
  async function del() { if (edit?.id && confirm("Supprimer ?")) { await sb().from("interventions").delete().eq("id", edit.id); setEdit(null); load(); } }

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; });
  const shift = (n: number) => { const d = new Date(week); d.setDate(d.getDate() + 7 * n); setWeek(d); };
  const newAt = (d: Date) => { const x = new Date(d); x.setHours(8, 0, 0, 0); setEdit({ title: "", starts_at: x.toISOString(), duration_min: 120, status: "planned", assigned_to: who !== "all" && who !== "none" ? who : isSup ? null : me?.user_id, technician: (() => { const m = team.find((t) => t.user_id === (who !== "all" && who !== "none" ? who : isSup ? "" : me?.user_id)); return m ? memberName(m) : ""; })() }); };

  return (
    <>
      <Header title="Planning" right={<button className="btn-brand !px-3 !py-1.5 text-sm" onClick={() => newAt(new Date())}>＋</button>} />
      <div className="flex items-center justify-between px-4 pt-3">
        <button className="btn-ghost !px-3 !py-1.5" onClick={() => shift(-1)}>‹</button>
        <button className="text-sm font-semibold" onClick={() => setWeek(startOfWeek(new Date()))}>
          Semaine du {week.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
        </button>
        <button className="btn-ghost !px-3 !py-1.5" onClick={() => shift(1)}>›</button>
      </div>
      {team.length > 1 && (
        <div className="-mb-2 flex gap-1.5 overflow-x-auto px-4 pt-3">
          {[["all", "Tous"], ...(me ? [[me.user_id, "Moi"]] : []), ...team.filter((m) => m.user_id !== me?.user_id).map((m) => [m.user_id, memberName(m).split(" ")[0]]), ...(isSup ? [["none", "Non attribué"]] : [])].map(([k, l]) => (
            <button key={k} onClick={() => setWho(k)} className={`chip whitespace-nowrap border py-1.5 ${who === k ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{l}</button>
          ))}
        </div>
      )}
      <div className="space-y-3 p-4">
        {days.map((d) => {
          const key = d.toDateString();
          const items = list.filter((i) => new Date(i.starts_at).toDateString() === key && (who === "all" || (who === "none" ? !i.assigned_to : i.assigned_to === who)));
          const today = key === new Date().toDateString();
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <h3 className={`text-sm font-bold capitalize ${today ? "text-flame" : ""}`}>{d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}</h3>
                <button className="text-xs text-brand" onClick={() => newAt(d)}>＋ Ajouter</button>
              </div>
              {items.length === 0 && <p className="text-xs text-slate-400">—</p>}
              {items.map((i) => (
                <button key={i.id} onClick={() => setEdit(i)} className={`card mb-2 block w-full border-l-4 text-left ${i.status === "done" ? "border-l-green-500 opacity-60" : i.status === "canceled" ? "border-l-red-400 opacity-50" : "border-l-flame"}`}>
                  <p className="font-semibold">{new Date(i.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {i.title}</p>
                  <p className="text-sm text-slate-500">{[i.clients?.name, i.address].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-slate-400">👷 {i.technician || "Non attribué"}{i.id && quitus[i.id] ? (quitus[i.id].status === "draft" ? " · 📝 quitus à signer" : " · ✅ quitus signé") : ""}</p>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {edit && (
        <Modal title={edit.id ? "Intervention" : "Nouvelle intervention"} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <input className="input" placeholder="Intitulé (ex : Entretien chaudière)" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <select className="input" value={edit.client_id || ""} onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              setEdit({ ...edit, client_id: e.target.value || null, address: edit.address || (c ? [c.address, c.zip, c.city].filter(Boolean).join(" ") : "") });
            }}>
              <option value="">— Client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input" placeholder="Adresse" value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" className="input" value={localInput(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: new Date(e.target.value).toISOString() })} />
              <select className="input" value={edit.duration_min} onChange={(e) => setEdit({ ...edit, duration_min: Number(e.target.value) })}>
                {[30, 60, 90, 120, 180, 240, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
              </select>
            </div>
            <div><label className="label">Attribué à</label>
              <select className="input" value={edit.assigned_to || ""} onChange={(e) => { const m = team.find((x) => x.user_id === e.target.value); setEdit({ ...edit, assigned_to: e.target.value || null, technician: m ? memberName(m) : "" }); }}>
                <option value="">— Non attribué —</option>
                {team.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}{m.role === "technician" ? " (technicien)" : ""}</option>)}
              </select></div>
            <textarea className="input" rows={2} placeholder="Notes" value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <select className="input" value={edit.status} onChange={(e) => { setEdit({ ...edit, status: e.target.value }); if (e.target.value === "done" && edit.id && edit.title) save({ status: "done" }); }}>
              <option value="planned">Prévue</option><option value="done">Terminée</option><option value="canceled">Annulée</option>
            </select>
            {edit.id && quitus[edit.id] && <button className="btn-ghost w-full" onClick={() => router.push(`/app/quitus/${quitus[edit.id!].id}`)}>{quitus[edit.id].status === "draft" ? "📝 Faire signer le quitus" : "✅ Voir le quitus signé"}</button>}
            {edit.id && !quitus[edit.id] && edit.status === "done" && <button className="btn-ghost w-full" onClick={() => router.push(`/app/quitus/nouveau?intervention=${edit.id}`)}>📝 Quitus d'intervention</button>}
            {edit.status === "done" && !(edit.id && quitus[edit.id]) && <p className="text-xs text-slate-500">« Terminée » enregistre l'intervention et ouvre le quitus pré-rempli pour la signature du client.</p>}
            {edit.address && <a className="btn-ghost w-full" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(edit.address)}`}>🧭 Itinéraire</a>}
            <button className="btn-primary w-full" onClick={() => save()}>Enregistrer</button>
            {edit.id && <button className="btn-danger w-full" onClick={del}>Supprimer</button>}
          </div>
        </Modal>
      )}
    </>
  );
}
export default function Page() { return <Suspense><Planning /></Suspense>; }
