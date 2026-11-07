"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";
import { memberName, useCompany } from "@/components/CompanyContext";
import { compressPhoto } from "@/lib/chantiers";
import { FB_KIND, FB_STATUS, notifyFeedback } from "@/lib/feedback";

const toDataUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });

export default function Suggestions() {
  const { me } = useCompany();
  const [list, setList] = useState<any[] | null>(null);
  const [kind, setKind] = useState("idee");
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [admin, setAdmin] = useState(false);

  const load = () => sb().from("feedback").select("id, kind, message, status, admin_reply, created_at, author").eq("company_id", me?.company_id).order("created_at", { ascending: false }).then(({ data }) => setList(data || []));
  useEffect(() => { if (me) { load(); sb().rpc("is_platform_admin").then(({ data }) => setAdmin(!!data)); } }, [me]);

  async function send() {
    if (text.trim().length < 5) return setMsg("Écrivez quelques mots.");
    setBusy(true); setMsg("");
    const { data: { user } } = await sb().auth.getUser();
    const { data, error } = await sb().from("feedback").insert({ kind, message: text.trim(), screenshot: shot || null, author: me ? memberName(me) : "", author_email: user?.email,
      page: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : null }).select("id").single();
    setBusy(false);
    if (error) return setMsg(`⚠️ ${error.message}`);
    notifyFeedback(data.id, "new");
    setText(""); setShot(""); setMsg("✅ Merci ! Votre message a bien été envoyé. Vous serez prévenu par e-mail de la suite."); load();
  }

  return (
    <>
      <Header back title="Suggestions & problèmes" right={admin ? <Link href="/app/admin/suggestions" className="btn-ghost !px-3 !py-1.5 text-xs">Admin</Link> : undefined} />
      <div className="space-y-4 p-4">
        <section className="card space-y-3">
          <p className="text-sm text-slate-600">Une idée, une fonction qui manque, quelque chose qui ne marche pas ? Dites-le ici : chaque message est lu.</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1">
            {Object.entries(FB_KIND).map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-lg py-2 text-xs font-semibold ${kind === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
            ))}
          </div>
          <textarea className="input min-h-[120px]" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={kind === "bug" ? "Que s'est-il passé ? Sur quelle page ? Qu'attendiez-vous ?" : kind === "idee" ? "Ex : pouvoir ajouter un acompte en pourcentage sur les factures…" : "Votre message"} />
          <label className="btn-ghost w-full cursor-pointer">{shot ? "✅ Capture jointe (toucher pour changer)" : "📎 Joindre une capture d'écran (option)"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setShot(await toDataUrl(await compressPhoto(f, 1000))); }} /></label>
          {shot && <img src={shot} alt="" className="max-h-40 rounded-lg" />}
          <button className="btn-brand w-full" disabled={busy} onClick={send}>{busy ? "Envoi…" : "Envoyer"}</button>
          {msg && <p className="text-sm">{msg}</p>}
        </section>

        <h2 className="font-bold">Mes messages</h2>
        {list === null && <p className="text-center text-slate-400">Chargement…</p>}
        {list?.length === 0 && <p className="text-sm text-slate-500">Aucun message pour l'instant.</p>}
        {list?.map((f) => (
          <div key={f.id} className="card space-y-1.5">
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{FB_KIND[f.kind]} · {new Date(f.created_at).toLocaleDateString("fr-FR")}{f.author ? ` · ${f.author}` : ""}</span>
              <span className={`chip ${FB_STATUS[f.status][1]}`}>{FB_STATUS[f.status][0]}</span></div>
            <p className="whitespace-pre-wrap text-sm">{f.message}</p>
            {f.admin_reply && <p className="whitespace-pre-wrap rounded-xl bg-orange-50 p-2.5 text-sm text-slate-700"><b>Réponse :</b> {f.admin_reply}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
