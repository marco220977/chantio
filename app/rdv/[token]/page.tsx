"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Data = {
  error?: string; mode?: string;
  company: { name: string; phone?: string; logo_url?: string; duration: number; auto_confirm: boolean };
  ticket: { number: string; problem?: string; address: string; client_name?: string };
  booked: { starts_at: string; status: string } | null;
  slots: { start: string; tech: string; best?: boolean }[];
};
const TZ = "Europe/Paris";
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const hour = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const full = (iso: string) => `${dayLabel(iso)} à ${hour(iso)}`;

export default function Rdv() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Data | null | false>(null);
  const [pick, setPick] = useState<{ start: string; tech: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ starts_at: string; status: string } | null>(null);
  const [change, setChange] = useState(false);

  const load = () => fetch(`/api/rdv?t=${token}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); setD(r.ok || j.company ? j : false); if (!r.ok && !j.company) setErr(j.error); });
  useEffect(() => { load(); }, [token]);

  async function book() {
    if (!pick) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/rdv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, ...pick }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error || "Réservation impossible, réessayez."); setPick(null); load(); return; }
    setDone({ starts_at: j.starts_at, status: j.status }); setChange(false);
  }

  if (d === null) return <p className="p-10 text-center text-slate-400">Recherche des créneaux disponibles…</p>;
  if (d === false) return <main className="mx-auto max-w-md p-6 text-center"><p className="text-4xl">🔗</p><p className="mt-2 font-semibold">{err || "Lien invalide."}</p></main>;

  const groups: Record<string, { start: string; tech: string; best?: boolean }[]> = {};
  for (const s of d.slots) (groups[dayLabel(s.start)] ||= []).push(s);
  const current = done || (d.booked && !change ? d.booked : null);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-16">
      <header className="flex items-center gap-3 pt-2">
        {d.company.logo_url && <img src={d.company.logo_url} alt="" className="h-12 w-12 rounded-xl object-contain" />}
        <div><p className="text-lg font-bold">{d.company.name}</p><p className="text-sm text-slate-500">Prise de rendez-vous — SAV n° {d.ticket.number}</p></div>
      </header>

      <section className="card space-y-1 text-sm">
        {d.ticket.client_name && <p><b>{d.ticket.client_name}</b></p>}
        <p>📍 {d.ticket.address}</p>
        {d.ticket.problem && <p className="text-slate-600">🛠 {d.ticket.problem}</p>}
        <p className="text-slate-500">⏱ Durée prévue : environ {Math.round(d.company.duration / 30) / 2} h</p>
      </section>

      {current ? (
        <section className="card space-y-3 text-center">
          <p className="text-4xl">{current.status === "planned" ? "✅" : "📨"}</p>
          <p className="font-semibold">{current.status === "planned" ? "Rendez-vous confirmé" : "Demande de rendez-vous envoyée"}</p>
          <p className="text-lg font-bold capitalize">{full(current.starts_at)}</p>
          {current.status !== "planned" && <p className="text-sm text-slate-500">L'entreprise va vous confirmer ce rendez-vous rapidement.</p>}
          <p className="text-xs text-slate-400">Vous recevrez un rappel la veille.</p>
          <button className="btn-ghost w-full" onClick={() => { setChange(true); setDone(null); setPick(null); load(); }}>Changer de créneau</button>
        </section>
      ) : (
        <>
          {d.error ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{d.error}</p> : (
            <section className="space-y-3">
              <p className="font-semibold">Choisissez votre créneau d'arrivée</p>
              <p className="text-xs text-slate-500">Les créneaux proposés sont ceux où nos techniciens sont déjà dans votre secteur. ⭐ = technicien tout proche ce jour-là.</p>
              {!d.slots.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Aucun créneau disponible pour le moment : contactez-nous par téléphone.</p>}
              {Object.entries(groups).map(([day, list]) => (
                <div key={day} className="card space-y-2">
                  <p className="font-semibold capitalize">{day}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => {
                      const on = pick?.start === s.start && pick?.tech === s.tech;
                      return <button key={s.start + s.tech} onClick={() => setPick(s)} className={`rounded-xl border px-4 py-2 font-semibold ${on ? "border-flame bg-flame text-white" : "border-slate-300 bg-white"}`}>{hour(s.start)}{s.best && <span className="ml-1 text-xs">⭐</span>}</button>;
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}
          {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
          {pick && (
            <div className="sticky bottom-3 space-y-2 rounded-2xl bg-white p-3 shadow-lg">
              <p className="text-center text-sm">Rendez-vous le <b className="capitalize">{full(pick.start)}</b></p>
              <button className="btn-brand w-full" disabled={busy} onClick={book}>{busy ? "Réservation…" : "Confirmer ce rendez-vous"}</button>
            </div>
          )}
        </>
      )}
      {d.company.phone && <p className="text-center text-sm text-slate-500">Une question ? <a className="text-brand underline" href={`tel:${d.company.phone}`}>{d.company.phone}</a></p>}
    </main>
  );
}
