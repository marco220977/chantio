"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { sendMail } from "@/lib/send";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import { memberName, ROLE_LABEL, useCompany } from "@/components/CompanyContext";

type Inv = { id: string; email: string; full_name?: string; role: string; token: string; accepted_at?: string; sent_at?: string; created_at: string };

export default function Equipe() {
  const { team, me, reload } = useCompany();
  const [invs, setInvs] = useState<Inv[]>([]);
  const [form, setForm] = useState<{ email: string; full_name: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [stats, setStats] = useState<Record<string, { week: number; sav: number }>>({});

  const load = async () => {
    const { data } = await sb().from("invitations").select("*").is("accepted_at", null).order("created_at", { ascending: false });
    setInvs(data || []);
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const { data: iv } = await sb().from("interventions").select("assigned_to").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
    const { data: sv } = await sb().from("sav_tickets").select("assigned_to").not("status", "in", "(resolved,closed)");
    const st: Record<string, { week: number; sav: number }> = {};
    (iv || []).forEach((x: any) => { if (x.assigned_to) { st[x.assigned_to] ??= { week: 0, sav: 0 }; st[x.assigned_to].week++; } });
    (sv || []).forEach((x: any) => { if (x.assigned_to) { st[x.assigned_to] ??= { week: 0, sav: 0 }; st[x.assigned_to].sav++; } });
    setStats(st);
  };
  useEffect(() => { load(); }, []);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function invite() {
    if (!form?.email.includes("@")) return setErr("E-mail invalide");
    if (team.some((m) => m.email?.toLowerCase() === form.email.toLowerCase())) return setErr("Cette personne fait déjà partie de l'équipe.");
    setBusy(true); setErr("");
    const { data, error } = await sb().from("invitations").insert({ email: form.email.trim().toLowerCase(), full_name: form.full_name.trim() || null, role: form.role }).select().single();
    if (error) { setErr(error.message); setBusy(false); return; }
    await send(data);
    setForm(null); setBusy(false); load();
  }

  async function send(inv: Inv) {
    try { await sendMail({ type: "invite", id: inv.id, to: inv.email }); flash(`✅ Invitation envoyée à ${inv.email}`); }
    catch (e: any) { setErr(`Invitation créée mais e-mail non envoyé (${e.message}). Partagez le lien manuellement.`); }
  }

  const link = (inv: Inv) => `${location.origin}/rejoindre/${inv.token}`;

  return (
    <>
      <Header back title="Équipe" right={<button className="btn-brand !px-3 !py-1.5 text-sm" onClick={() => setForm({ email: "", full_name: "", role: "technician" })}>＋ Inviter</button>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {msg && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

        <section className="space-y-2">
          <h2 className="font-bold">Membres ({team.length})</h2>
          {team.map((m) => (
            <div key={m.user_id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.role === "technician" ? "👷" : "🧑‍💼"} {memberName(m)}{m.user_id === me?.user_id ? " (vous)" : ""}</p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                <span className={`chip ${m.role === "technician" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{ROLE_LABEL[m.role]}</span>
              </div>
              {stats[m.user_id] && <p className="text-xs text-slate-500">{stats[m.user_id].week} intervention(s) cette semaine · {stats[m.user_id].sav} SAV en cours</p>}
              {m.role !== "owner" && m.user_id !== me?.user_id && (
                <div className="flex gap-2">
                  <button className="btn-ghost flex-1 !py-1.5 text-sm" onClick={async () => { await sb().rpc("set_member_role", { p_user: m.user_id, p_role: m.role === "technician" ? "supervisor" : "technician" }); reload(); }}>
                    Passer {m.role === "technician" ? "superviseur" : "technicien"}
                  </button>
                  <button className="btn-danger flex-1 !py-1.5 text-sm" onClick={async () => {
                    if (!confirm(`Retirer ${memberName(m)} de l'équipe ? Son accès sera supprimé (son travail reste dans l'appli).`)) return;
                    const { error } = await sb().rpc("remove_member", { p_user: m.user_id });
                    if (error) setErr(error.message); else { reload(); load(); }
                  }}>Retirer</button>
                </div>
              )}
            </div>
          ))}
        </section>

        {invs.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">Invitations en attente</h2>
            {invs.map((i) => (
              <div key={i.id} className="card space-y-2">
                <p className="font-semibold">{i.full_name || i.email} <span className="text-xs font-normal text-slate-500">· {ROLE_LABEL[i.role]}</span></p>
                <p className="text-xs text-slate-500">{i.email}{i.sent_at ? ` · envoyée le ${new Date(i.sent_at).toLocaleDateString("fr-FR")}` : ""}</p>
                <div className="grid grid-cols-3 gap-2">
                  <button className="btn-ghost !py-1.5 text-xs" onClick={() => send(i)}>📧 Renvoyer</button>
                  <button className="btn-ghost !py-1.5 text-xs" onClick={async () => {
                    const nav = navigator as any;
                    if (nav.share) await nav.share({ title: "Invitation", text: `Rejoins l'équipe sur l'appli : ${link(i)}` }).catch(() => {});
                    else { await navigator.clipboard.writeText(link(i)); flash("Lien copié"); }
                  }}>🔗 Partager</button>
                  <button className="btn-danger !py-1.5 text-xs" onClick={async () => { await sb().from("invitations").delete().eq("id", i.id); load(); }}>Annuler</button>
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="card space-y-1 bg-slate-50 text-sm text-slate-600">
          <p className="font-semibold text-ink">Ce que voit chaque rôle</p>
          <p>🧑‍💼 <b>Superviseur</b> : tout (devis, factures, chiffre d'affaires, réglages, équipe) et l'attribution du travail.</p>
          <p>👷 <b>Technicien</b> : sa journée, le planning, les chantiers (photos), les visites d'entretien, les SAV, les quitus et les clients. Pas d'accès aux prix, devis, factures, chiffre d'affaires ni réglages.</p>
        </div>
      </div>

      {form && (
        <Modal title="Inviter un membre" onClose={() => setForm(null)}>
          <div className="space-y-3">
            <input className="input" placeholder="Prénom et nom" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <input className="input" type="email" placeholder="E-mail *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
              {[["technician", "👷 Technicien"], ["supervisor", "🧑‍💼 Superviseur"]].map(([k, l]) => (
                <button key={k} onClick={() => setForm({ ...form, role: k })} className={`rounded-lg py-2 text-sm font-semibold ${form.role === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
              ))}
            </div>
            <p className="text-xs text-slate-500">La personne reçoit un e-mail avec un lien pour créer son accès. Elle rejoint directement votre entreprise.</p>
            <button className="btn-primary w-full" disabled={busy} onClick={invite}>{busy ? "…" : "Envoyer l'invitation"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
