"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import type { Company } from "@/lib/types";

const KIND: Record<string, string> = { invoice: "Relance facture", quote: "Relance devis", appointment: "Rappel RDV", maintenance: "Rappel entretien", review_chantier: "Demande d'avis", review_sav: "Demande d'avis" };

export default function AutomationSettings({ company, reload }: { company: Company; reload: () => void }) {
  const co: any = company;
  const [f, setF] = useState<any>({});
  const [log, setLog] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setF({ auto_reminders: co.auto_reminders !== false, reminder_days: (co.reminder_days || [1, 15, 30]).join(", "), quote_followup_days: co.quote_followup_days ?? 7,
      appointment_reminders: co.appointment_reminders !== false, sms_enabled: !!co.sms_enabled, sms_sender: co.sms_sender || "",
      maintenance_reminders: co.maintenance_reminders !== false, review_requests: !!co.review_requests, google_review_url: co.google_review_url || "" });
    sb().from("automation_log").select("*").order("created_at", { ascending: false }).limit(10).then(({ data }) => setLog(data || []));
  }, [co.id]);

  async function save() {
    const days = String(f.reminder_days).split(/[,;\s]+/).map(Number).filter((n) => n > 0).sort((a, b) => a - b).slice(0, 5);
    if (f.review_requests && !/^https?:\/\//.test(f.google_review_url)) return setMsg("⚠️ Collez le lien d'avis Google (commence par https://)");
    const { error } = await sb().from("companies").update({
      auto_reminders: f.auto_reminders, reminder_days: days.length ? days : [1, 15, 30], quote_followup_days: Number(f.quote_followup_days) || 7,
      appointment_reminders: f.appointment_reminders, sms_enabled: f.sms_enabled, sms_sender: f.sms_sender.replace(/[^A-Za-z0-9]/g, "").slice(0, 11) || null,
      maintenance_reminders: f.maintenance_reminders, review_requests: f.review_requests, google_review_url: f.google_review_url.trim() || null,
    }).eq("id", co.id);
    setMsg(error ? `⚠️ ${error.message}` : "✅ Automatisations enregistrées"); reload();
  }
  const T = ({ k, label, hint }: { k: string; label: string; hint?: string }) => (
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
      <span><b>{label}</b>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span></label>
  );

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">🤖 Automatisations</h2>
      <p className="text-xs text-slate-500">Envoyées automatiquement chaque matin vers 8 h, au nom de votre entreprise (les réponses arrivent dans votre boîte mail).</p>
      {T({ k: "auto_reminders", label: "Relancer les factures impayées et les devis sans réponse" })}
      {f.auto_reminders && (
        <div className="grid grid-cols-2 gap-2 pl-6">
          <div><label className="label">Relances factures (jours après échéance)</label><input className="input" value={f.reminder_days} onChange={(e) => setF({ ...f, reminder_days: e.target.value })} /></div>
          <div><label className="label">Relance devis après (jours)</label><input className="input" inputMode="numeric" value={f.quote_followup_days} onChange={(e) => setF({ ...f, quote_followup_days: e.target.value })} /></div>
        </div>
      )}
      {T({ k: "appointment_reminders", label: "Rappeler le rendez-vous au client la veille", hint: "Pour les interventions du planning rattachées à un client." })}
      {f.appointment_reminders && (
        <div className="space-y-2 pl-6">
          {T({ k: "sms_enabled", label: "Par SMS (sinon par e-mail)", hint: "Nécessite des crédits SMS sur votre compte Brevo (environ 0,045 € le SMS)." })}
          {f.sms_enabled && <div><label className="label">Nom d'expéditeur SMS (11 caractères, sans espace)</label><input className="input" maxLength={11} value={f.sms_sender} onChange={(e) => setF({ ...f, sms_sender: e.target.value })} placeholder="MPCplomb" /></div>}
        </div>
      )}
      {T({ k: "maintenance_reminders", label: "Rappeler l'entretien annuel aux clients sous contrat", hint: "Un mois avant la date de visite prévue." })}
      {T({ k: "review_requests", label: "Demander un avis Google après un chantier ou un SAV terminé" })}
      {f.review_requests && (
        <div className="pl-6"><label className="label">Lien d'avis Google</label><input className="input" placeholder="https://g.page/r/…/review" value={f.google_review_url} onChange={(e) => setF({ ...f, google_review_url: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">Dans Google Maps ou votre fiche Google Business : « Demander des avis » → copier le lien.</p></div>
      )}
      <button className="btn-primary w-full" onClick={save}>Enregistrer les automatisations</button>
      {msg && <p className="text-xs">{msg}</p>}
      {log.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-2">
          <p className="label">Derniers envois</p>
          {log.map((l) => <p key={l.id} className="text-xs text-slate-500">{l.ok ? "✅" : "⚠️"} {new Date(l.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {KIND[l.kind] || l.kind} ({l.channel}) — {l.message}</p>)}
        </div>
      )}
    </section>
  );
}
