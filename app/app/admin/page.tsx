"use client";
import Link from "next/link";
import GiftLinks from "@/components/GiftLinks";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";

const PRICE_HT: Record<string, number> = { solo: 29, pro: 49, equipe: 79 }; // € HT / mois
type Co = { id: string; name: string; email?: string; city?: string; plan?: string; tier?: string; free_until?: string | null; siren_changed_at?: string | null; trial_ends_at?: string; cancel_at?: string | null; created_at: string;
  referred: boolean; referrer?: string | null; members: number; quotes: number; invoices: number; last_seen?: string | null };

const statusOf = (c: Co, now: number) =>
  c.plan === "free" ? (!c.free_until || new Date(c.free_until).getTime() > now ? "offert" : "expire") : c.plan === "pro" ? (c.cancel_at ? "resiliation" : "abonne") : c.plan === "canceled" ? "resilie"
  : new Date(c.trial_ends_at || 0).getTime() > now ? "essai" : "expire";
const ST: Record<string, [string, string]> = {
  abonne: ["Abonné", "bg-green-100 text-green-800"], offert: ["Accès offert", "bg-purple-100 text-purple-800"], resiliation: ["Résiliation prévue", "bg-amber-100 text-amber-800"],
  essai: ["Essai", "bg-blue-100 text-blue-800"], expire: ["Essai terminé", "bg-slate-200 text-slate-700"], resilie: ["Résilié", "bg-red-100 text-red-700"],
};
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function Admin() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [data, setData] = useState<{ companies: Co[]; referrals: number } | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    sb().rpc("is_platform_admin").then(async ({ data: a }) => {
      setOk(!!a);
      if (a) { const { data: s } = await sb().rpc("admin_platform_stats"); setData(s); }
    });
  }, []);

  const now = Date.now();
  const k = useMemo(() => {
    const cs = data?.companies || [];
    const by = (s: string) => cs.filter((c) => statusOf(c, now) === s).length;
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const week = now - 7 * 86400000;
    const subs = by("abonne") + by("resiliation");
    const endedTrials = cs.filter((c) => !["essai", "offert"].includes(statusOf(c, now))).length;
    return {
      total: cs.length, subs, trial: by("essai"), expired: by("expire"), canceled: by("resilie"), leaving: by("resiliation"),
      mrr: cs.filter((c) => ["abonne", "resiliation"].includes(statusOf(c, now))).reduce((t, c) => t + (PRICE_HT[c.tier || "solo"] || 29), 0), arr: cs.filter((c) => ["abonne", "resiliation"].includes(statusOf(c, now))).reduce((t, c) => t + (PRICE_HT[c.tier || "solo"] || 29), 0) * 12,
      newMonth: cs.filter((c) => new Date(c.created_at) >= month).length,
      newWeek: cs.filter((c) => new Date(c.created_at).getTime() >= week).length,
      conv: endedTrials ? Math.round((subs + by("resilie")) / endedTrials * 100) : 0,
      endingSoon: cs.filter((c) => statusOf(c, now) === "essai" && new Date(c.trial_ends_at!).getTime() < now + 3 * 86400000),
      active7: cs.filter((c) => c.last_seen && new Date(c.last_seen).getTime() >= week).length,
    };
  }, [data, now]);

  if (ok === null) return <><Header back title="Tableau de bord" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  if (!ok) return <><Header back title="Tableau de bord" /><p className="p-6 text-center">🔒 Réservé à l'administrateur de l'application.</p></>;
  if (!data) return <><Header back title="Tableau de bord" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;

  const list = data.companies.filter((c) => (filter === "all" || statusOf(c, now) === filter) && (!q || `${c.name} ${c.email} ${c.city}`.toLowerCase().includes(q.toLowerCase())));
  const Tile = ({ l, v, sub, color }: { l: string; v: string | number; sub?: string; color?: string }) => (
    <div className="card !p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">{l}</p><p className={`text-2xl font-extrabold ${color || ""}`}>{v}</p>{sub && <p className="text-[11px] text-slate-500">{sub}</p>}</div>
  );

  return (
    <>
      <Header back title="Tableau de bord" right={<Link href="/app/admin/suggestions" className="btn-ghost !px-3 !py-1.5 text-xs">💡 Suggestions</Link>} />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Tile l="Abonnés payants" v={k.subs} sub={k.leaving ? `dont ${k.leaving} résiliation prévue` : undefined} color="text-green-700" />
          <Tile l="Revenu mensuel" v={eur(k.mrr)} sub={`HT · ${eur(k.arr)} / an`} />
          <Tile l="En essai" v={k.trial} sub={k.endingSoon.length ? `${k.endingSoon.length} finissent sous 3 jours` : undefined} color="text-blue-700" />
          <Tile l="Comptes au total" v={k.total} sub={`+${k.newWeek} cette semaine · +${k.newMonth} ce mois`} />
          <Tile l="Essais terminés" v={k.expired} sub="sans abonnement" />
          <Tile l="Résiliés" v={k.canceled} />
          <Tile l="Conversion" v={`${k.conv} %`} sub="essais finis → abonnés" />
          <Tile l="Actifs 7 jours" v={k.active7} sub={`${data.referrals} parrainage(s)`} />
        </div>

        {k.endingSoon.length > 0 && (
          <section className="card space-y-1 border-l-4 border-l-flame">
            <p className="font-bold">⏳ Essais qui finissent bientôt</p>
            {k.endingSoon.map((c) => <p key={c.id} className="text-sm">{c.name} — {d(c.trial_ends_at)}{c.email && <> · <a className="text-brand" href={`mailto:${c.email}`}>{c.email}</a></>}</p>)}
          </section>
        )}

        <GiftLinks />

        <input className="input" placeholder="Rechercher une entreprise…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          {[["all", "Tous"], ["abonne", "Abonnés"], ["offert", "Offerts"], ["essai", "Essai"], ["expire", "Essai terminé"], ["resiliation", "Résiliation prévue"], ["resilie", "Résiliés"]].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} className={`chip whitespace-nowrap border py-1.5 ${filter === f ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{l}</button>
          ))}
        </div>

        {list.map((c) => {
          const st = ST[statusOf(c, now)];
          return (
            <div key={c.id} className="card space-y-1 !py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-semibold">{c.name}</p><p className="truncate text-xs text-slate-500">{[c.city, c.email].filter(Boolean).join(" · ")}</p></div>
                <span className={`chip shrink-0 ${st[1]}`}>{st[0]}{c.plan === "pro" ? ` · ${({ solo: "Solo", pro: "Pro", equipe: "Équipe" } as Record<string, string>)[c.tier || "solo"]}` : ""}</span>
              </div>
              <p className="text-xs text-slate-500">
                Inscrit le {d(c.created_at)}{statusOf(c, now) === "essai" || statusOf(c, now) === "expire" ? ` · fin d'essai ${d(c.trial_ends_at)}` : ""}{c.cancel_at ? ` · fin le ${d(c.cancel_at)}` : ""}{c.siren_changed_at ? ` · 🔁 entreprise (SIREN) changée le ${d(c.siren_changed_at)}` : ""}
                {c.referrer ? ` · parrain : ${c.referrer}` : ""}
              </p>
              <p className="text-xs text-slate-500">👥 {c.members} · 📝 {c.quotes} devis · 💶 {c.invoices} factures · vu le {d(c.last_seen)}</p>
            </div>
          );
        })}
        {list.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Aucune entreprise.</p>}
        <p className="text-center text-[11px] text-slate-400">Revenu calculé selon la formule de chaque abonné : Solo 29 €, Pro 49 €, Équipe 79 € HT / mois.</p>
      </div>
    </>
  );
}
