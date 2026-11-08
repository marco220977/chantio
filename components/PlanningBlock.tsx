"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase";
import { memberName, useCompany } from "@/components/CompanyContext";

type Slot = { start: string; tech: string; tech_name: string; detour: number; best: boolean };
const localInput = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// Bloc « Rendez-vous et planning » : créneaux disponibles (trajets optimisés) + ajout / mise à jour au planning
export default function PlanningBlock({ address, interventionId, onSchedule }: {
  address: string;
  interventionId?: string | null;
  // Crée l'intervention liée (après enregistrement du document) et renvoie son id
  onSchedule: (when: string, tech: { assigned_to: string | null; technician: string | null }, duration: number) => Promise<string | null>;
}) {
  const { team, company } = useCompany();
  const [iv, setIv] = useState<{ id: string; starts_at: string; status: string; assigned_to?: string | null } | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const [tech, setTech] = useState<string>("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const duration = (company as any)?.booking_duration_min || 90;

  useEffect(() => {
    if (!interventionId) { setIv(null); return; }
    sb().from("interventions").select("id, starts_at, status, assigned_to").eq("id", interventionId).maybeSingle().then(({ data }) => {
      if (data && ["planned", "to_confirm"].includes(data.status)) { setIv(data); setWhen(data.starts_at); setTech(data.assigned_to || ""); } else setIv(null);
    });
  }, [interventionId]);

  async function findSlots() {
    if (!address?.trim()) return setErr("Indiquez d'abord l'adresse des travaux.");
    setBusy(true); setErr(""); setSlots([]);
    const { data: { session } } = await sb().auth.getSession();
    const r = await fetch("/api/rdv/slots", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ address, tech: tech || null, duration }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setSlots(null); return setErr(j.error || "Recherche impossible"); }
    setSlots(j.slots || []);
  }

  async function plan() {
    if (!when) return findSlots();
    setBusy(true); setErr("");
    const m = team.find((x) => x.user_id === tech);
    const t = { assigned_to: tech || null, technician: m ? memberName(m) : null };
    if (iv) {
      const { error } = await sb().from("interventions").update({ starts_at: when, ...t, status: "planned" }).eq("id", iv.id);
      setBusy(false);
      if (error) return setErr(error.message);
      setIv({ ...iv, starts_at: when, status: "planned" }); setMsg("🗓 Rendez-vous mis à jour dans le planning");
      return;
    }
    const id = await onSchedule(when, t, duration);
    setBusy(false);
    if (!id) return;
    setIv({ id, starts_at: when, status: "planned", assigned_to: tech || null }); setMsg("🗓 Rendez-vous ajouté au planning");
  }

  const groups = (slots || []).reduce((g: Record<string, Slot[]>, x) => { const k = new Date(x.start).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); (g[k] ||= []).push(x); return g; }, {});
  return (
    <section className="card space-y-3 border-l-4 border-l-flame">
      <h2 className="font-bold">🗓 Rendez-vous et planning</h2>
      {iv && <p className="rounded-lg bg-blue-50 p-2 text-sm text-blue-900">📅 Au planning le <b>{new Date(iv.starts_at).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</b> · <Link href="/app/planning" className="text-brand underline">Voir le planning</Link></p>}
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Date et heure</label><input type="datetime-local" className="input" value={localInput(when)} onChange={(e) => setWhen(e.target.value ? new Date(e.target.value).toISOString() : null)} /></div>
        <div><label className="label">Technicien</label><select className="input" value={tech} onChange={(e) => setTech(e.target.value)}>
          <option value="">— Technicien —</option>
          {team.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
        </select></div>
      </div>
      <button type="button" className="btn-ghost w-full" disabled={busy} onClick={findSlots}>{busy && slots ? "Recherche des créneaux…" : "🔎 Voir les créneaux disponibles"}</button>
      {slots && !busy && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          {!slots.length ? <p className="text-sm text-slate-500">Aucun créneau libre sur la période : choisissez une date à la main.</p> : <>
            <p className="text-xs text-slate-500">Créneaux libres, classés pour limiter les trajets. ⭐ = un technicien est déjà dans le secteur ce jour-là. Touchez un créneau pour le choisir.</p>
            {Object.entries(groups).map(([day, list]) => (
              <div key={day}>
                <p className="text-sm font-semibold capitalize">{day}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {list.map((x) => {
                    const on = when && new Date(when).getTime() === new Date(x.start).getTime() && tech === x.tech;
                    return <button key={x.start + x.tech} type="button" onClick={() => { setWhen(x.start); setTech(x.tech); }}
                      className={`rounded-xl border px-3 py-1.5 text-sm ${on ? "border-flame bg-flame text-white" : "border-slate-300 bg-white"}`}>
                      <b>{new Date(x.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</b>{x.best && " ⭐"}{team.length > 1 && <span className="block text-[10px] opacity-80">{x.tech_name}</span>}
                    </button>;
                  })}
                </div>
              </div>
            ))}
          </>}
        </div>
      )}
      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-800">{msg}</p>}
      <button className="btn-brand w-full" disabled={busy} onClick={plan}>{iv ? "🔁 Mettre à jour le rendez-vous" : when ? "🗓 Ajouter au planning" : "🗓 Choisir un créneau"}</button>
    </section>
  );
}
