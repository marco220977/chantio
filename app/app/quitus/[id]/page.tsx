"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase";
import { addDays, dateFr } from "@/lib/calc";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import PdfPreview from "@/components/PdfPreview";
import Modal from "@/components/Modal";
import SignaturePad from "@/components/SignaturePad";
import { buildReceptionPdf, type Reception } from "@/lib/quitus-sav";
import { pdfToBase64, shareOrSave } from "@/lib/pdf-maintenance";
import { askEmail, sendMail, snapshotOf } from "@/lib/send";
import { signedUrls, uploadPhoto } from "@/lib/chantiers";
import type { Client } from "@/lib/types";

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { company } = useCompany();
  const isNew = id === "nouveau";
  const [r, setR] = useState<Reception | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [preview, setPreview] = useState<null | (() => Promise<any>)>(null);
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [upl, setUpl] = useState("");

  useEffect(() => {
    const s = sb();
    s.from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    if (!isNew) { s.from("receptions").select("*").eq("id", id).single().then(async ({ data }) => { setR(data); if (data?.photos?.length) setUrls(await signedUrls(data.photos)); }); return; }
    (async () => {
      const { data: { user } } = await s.auth.getUser();
      const { data: me } = await s.from("members").select("full_name").eq("user_id", user?.id).maybeSingle();
      const base: Reception = { id: "", status: "draft", reserves: [], photos: [], reception_date: addDays(0), works_end_date: addDays(0), company_signer: me?.full_name || "" };
      let docId = params.get("doc");
      const chId = params.get("chantier");
      const ivId = params.get("intervention");
      if (ivId) {
        const { data: iv } = await s.from("interventions").select("*").eq("id", ivId).single();
        if (iv) {
          const day = new Date(iv.starts_at); day.setMinutes(day.getMinutes() - day.getTimezoneOffset());
          const d = day.toISOString().slice(0, 10);
          let snap: any = null;
          if (iv.client_id) { const { data: c } = await s.from("clients").select("*").eq("id", iv.client_id).single(); snap = snapshotOf(c); }
          Object.assign(base, { intervention_id: iv.id, client_id: iv.client_id, client_snapshot: snap, address: iv.address,
            works: [iv.title, iv.notes].filter(Boolean).join("\n"), works_end_date: d, reception_date: addDays(0),
            company_signer: iv.technician || base.company_signer });
          docId = docId || iv.document_id;
        }
      }
      if (chId) {
        const { data: ch } = await s.from("chantiers").select("*").eq("id", chId).single();
        if (ch) { Object.assign(base, { chantier_id: ch.id, client_id: ch.client_id, client_snapshot: ch.client_snapshot, address: ch.address, works: ch.title }); docId = docId || ch.document_id; }
      }
      if (docId) {
        const { data: d } = await s.from("documents").select("*").eq("id", docId).single();
        if (d) Object.assign(base, {
          document_id: d.id, client_id: base.client_id || d.client_id, client_snapshot: base.client_snapshot || d.client_snapshot,
          address: base.address || d.site_address,
          works: [d.title || base.works, ...(d.lines || []).map((l: any) => `• ${l.label}`)].filter(Boolean).join("\n") + `\n(selon devis n° ${d.number})`,
        });
      }
      setR(base);
    })();
  }, [id, isNew, params]);

  if (!r || !company) return <><Header back title="…" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  const editable = r.status === "draft";
  const client = clients.find((x) => x.id === r.client_id);
  const set = (p: Partial<Reception>) => setR({ ...r, ...p });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };

  async function save(extra: Partial<Reception> = {}): Promise<Reception | null> {
    setBusy(true); setErr("");
    const cur = { ...r!, ...extra };
    const { id: _i, created_at, ...rest } = cur as any;
    const payload: any = { ...rest, client_snapshot: snapshotOf(client) || cur.client_snapshot || null, client_id: cur.client_id || null,
      chantier_id: cur.chantier_id || null, document_id: cur.document_id || null, intervention_id: cur.intervention_id || null, reserves: cur.with_reserves ? cur.reserves.filter((x) => x.label.trim()) : [] };
    if (!cur.id) {
      const { data: num, error } = await sb().rpc("next_number", { p_kind: "Q" });
      if (error) { setErr(error.message); setBusy(false); return null; }
      payload.number = num;
    }
    const q = cur.id ? sb().from("receptions").update(payload).eq("id", cur.id).select().single() : sb().from("receptions").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { setErr(error.message); return null; }
    setR(data);
    if (!cur.id) router.replace(`/app/quitus/${data.id}`);
    return data;
  }

  async function addPhotos(files: FileList) {
    const saved = r!.id ? r! : await save(); if (!saved) return;
    try {
      const paths = [...(saved.photos || [])];
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) { setUpl(`Envoi photo ${i + 1}/${list.length}…`); paths.push(await uploadPhoto(company!.id, `quitus-${saved.id}`, list[i])); }
      const { data, error } = await sb().from("receptions").update({ photos: paths }).eq("id", saved.id).select().single();
      if (error) throw error;
      setR({ ...r!, ...saved, photos: data.photos });
      setUrls(await signedUrls(data.photos));
    } catch (e: any) { setErr(e.message); }
    setUpl("");
  }
  async function removePhoto(p: string) {
    if (!confirm("Supprimer cette photo ?")) return;
    await sb().storage.from("chantiers").remove([p]);
    const photos = (r!.photos || []).filter((x) => x !== p);
    await sb().from("receptions").update({ photos }).eq("id", r!.id);
    setR({ ...r!, photos });
  }

  async function lift(i: number) {
    const reserves = r!.reserves.map((x, j) => (j === i ? { ...x, lifted_at: x.lifted_at ? null : addDays(0) } : x));
    const all = reserves.every((x) => x.lifted_at);
    await save({ reserves, reserves_lifted_at: all ? new Date().toISOString() : null });
    if (all) flash("✅ Toutes les réserves sont levées");
  }

  async function send() {
    const to = await askEmail(client?.email || r!.client_snapshot?.email, r!.client_id); if (!to) return;
    if (!confirm(`Envoyer le procès-verbal ${r!.number} à ${to} ?`)) return;
    setBusy(true); setErr("");
    try { const j = await sendMail({ type: "reception", id: r!.id, to, pdfBase64: pdfToBase64(await buildReceptionPdf(r!, company!, urls)) }); if (j.row) setR(j.row); flash(`✅ Envoyé à ${to}`); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const pending = r.reserves.filter((x) => !x.lifted_at).length;
  const canPhoto = editable || pending > 0;

  return (
    <>
      <Header back title={`Quitus ${r.number || "(nouveau)"}`} right={<span className={`chip ${r.status === "draft" ? "bg-slate-100 text-slate-700" : "bg-green-100 text-green-800"}`}>{r.status === "draft" ? "Brouillon" : "Signé"}</span>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="fixed inset-x-4 top-4 z-50 rounded-xl bg-red-600 p-3 text-center text-sm font-semibold text-white shadow-lg">⚠️ {err}</p>}
        {toast && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-ink p-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</p>}

        <section className="card space-y-3">
          <span className="label !mb-0">Client (maître d'ouvrage)</span>
          {editable ? (
            <select className="input" value={r.client_id || ""} onChange={(e) => { const x = clients.find((k) => k.id === e.target.value); set({ client_id: e.target.value, address: r.address || (x ? [x.address, x.zip, x.city].filter(Boolean).join(" ") : "") }); }}>
              <option value="">— Choisir —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          ) : <p className="font-semibold">{r.client_snapshot?.name}</p>}
          <div><label className="label">Lieu des travaux</label><input className="input" disabled={!editable} value={r.address || ""} onChange={(e) => set({ address: e.target.value })} /></div>
          <div><label className="label">Nature des travaux</label><textarea className="input text-sm" rows={4} disabled={!editable} value={r.works || ""} onChange={(e) => set({ works: e.target.value })} placeholder="Ex : Remplacement chaudière gaz par PAC air/eau 8 kW" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Fin des travaux</label><input type="date" className="input" disabled={!editable} value={r.works_end_date || ""} onChange={(e) => set({ works_end_date: e.target.value })} /></div>
            <div><label className="label">Réception</label><input type="date" className="input" disabled={!editable} value={r.reception_date || ""} onChange={(e) => set({ reception_date: e.target.value })} /></div>
          </div>
          {(r.chantier_id || r.document_id) && (
            <div className="flex gap-3 text-sm">
              {r.chantier_id && <Link className="text-brand" href={`/app/chantiers/${r.chantier_id}`}>🏗️ Chantier</Link>}
              {r.document_id && <Link className="text-brand" href={`/app/doc/${r.document_id}`}>📝 Devis</Link>}
            </div>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">Réserves</h2>
          {editable && (
            <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
              {[[false, "Sans réserve"], [true, "Avec réserves"]].map(([v, l]) => (
                <button key={String(v)} onClick={() => set({ with_reserves: v as boolean, reserves: v && !r.reserves.length ? [{ label: "", deadline: addDays(30) }] : r.reserves })}
                  className={`rounded-lg py-2 text-sm font-semibold ${!!r.with_reserves === v ? "bg-white shadow" : "text-slate-600"}`}>{l as string}</button>
              ))}
            </div>
          )}
          {!r.with_reserves && !editable && <p className="text-sm text-green-700">✅ Réception prononcée sans réserve.</p>}
          {r.with_reserves && r.reserves.map((x, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              {editable ? (
                <>
                  <div className="flex gap-2">
                    <input className="input text-sm" placeholder="Ex : Calorifuge du départ chauffage à reprendre" value={x.label} onChange={(e) => set({ reserves: r.reserves.map((k, j) => (j === i ? { ...k, label: e.target.value } : k)) })} />
                    <button className="px-1 text-red-500" onClick={() => set({ reserves: r.reserves.filter((_, j) => j !== i) })}>🗑</button>
                  </div>
                  <div className="flex items-center gap-2 text-sm"><span className="text-slate-500">À lever avant le</span>
                    <input type="date" className="input !w-auto !py-1.5" value={x.deadline || ""} onChange={(e) => set({ reserves: r.reserves.map((k, j) => (j === i ? { ...k, deadline: e.target.value } : k)) })} /></div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div><p className={`text-sm ${x.lifted_at ? "text-slate-400 line-through" : "font-semibold"}`}>{x.label}</p>
                    <p className="text-xs text-slate-500">{x.lifted_at ? `Levée le ${dateFr(x.lifted_at)}` : `Avant le ${dateFr(x.deadline)}`}</p></div>
                  <button className={`chip whitespace-nowrap py-1.5 ${x.lifted_at ? "bg-slate-100" : "bg-green-100 text-green-800"}`} onClick={() => lift(i)}>{x.lifted_at ? "Annuler" : "✓ Levée"}</button>
                </div>
              )}
            </div>
          ))}
          {editable && r.with_reserves && <button className="btn-ghost w-full" onClick={() => set({ reserves: [...r.reserves, { label: "", deadline: addDays(30) }] })}>＋ Ajouter une réserve</button>}
          {!editable && r.with_reserves && (pending ? <p className="text-sm text-amber-700">{pending} réserve(s) à lever</p> : <p className="text-sm text-green-700">✅ Toutes les réserves sont levées{r.reserves_lifted_at ? ` (${dateFr(r.reserves_lifted_at)})` : ""}</p>)}
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">Photos</h2>
          {(r.photos || []).length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {(r.photos || []).map((p) => (
                <div key={p} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                  {urls[p] && <a href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" className="h-full w-full object-cover" /></a>}
                  {canPhoto && <button className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white" onClick={() => removePhoto(p)}>×</button>}
                </div>
              ))}
            </div>
          )}
          {!(r.photos || []).length && !canPhoto && <p className="text-sm text-slate-400">Aucune photo.</p>}
          {canPhoto && (
            <div className="grid grid-cols-2 gap-2">
              <label className="btn-ghost cursor-pointer">📷 Prendre une photo
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = ""; }} /></label>
              <label className="btn-ghost cursor-pointer">🖼 Galerie
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = ""; }} /></label>
            </div>
          )}
          {upl && <p className="text-sm text-slate-500">{upl}</p>}
          {canPhoto && <p className="text-xs text-slate-400">Les photos sont ajoutées au procès-verbal PDF (8 maximum).</p>}
        </section>

        <section className="card space-y-3">
          <div><label className="label">Observations</label><textarea className="input text-sm" rows={2} disabled={!editable} value={r.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></div>
          <div><label className="label">Signataire pour l'entreprise</label><input className="input" disabled={!editable} value={r.company_signer || ""} onChange={(e) => set({ company_signer: e.target.value })} /></div>
        </section>

        {r.signature_data && (
          <section className="card flex items-center gap-3">
            {r.signer_photo && <img src={r.signer_photo} alt="" className="h-16 w-16 rounded-xl object-cover" />}
            <img src={r.signature_data} alt="Signature" className="h-14" />
            <p className="text-xs text-slate-500">Signé par {r.signer_name}<br />le {new Date(r.signed_at!).toLocaleString("fr-FR")}</p>
          </section>
        )}
        {r.sent_at && <p className="text-xs text-green-700">📧 Envoyé le {new Date(r.sent_at).toLocaleString("fr-FR")} à {r.sent_to}</p>}

        <section className="space-y-2">
          {editable && <button className="btn-primary w-full py-3.5" disabled={busy} onClick={() => save()}>💾 Enregistrer</button>}
          {editable && <button className="btn-brand w-full py-3.5" disabled={busy} onClick={async () => {
            if (!r.client_id && !r.client_snapshot) return setErr("Choisissez un client.");
            if (!r.works?.trim()) return setErr("Décrivez les travaux.");
            if (r.with_reserves && !r.reserves.some((x) => x.label.trim())) return setErr("Ajoutez au moins une réserve, ou choisissez « Sans réserve ».");
            if (await save()) setModal("sign");
          }}>✍️ Faire signer le quitus</button>}
          {r.id && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => setPreview(() => () => buildReceptionPdf(r, company, urls))}>👁 Aperçu</button>
              <button className="btn-ghost" onClick={async () => shareOrSave(await buildReceptionPdf(r, company, urls), `${r.number}.pdf`)}>📤 Partager</button>
            </div>
          )}
          {r.status === "signed" && <button className="btn-primary w-full" disabled={busy} onClick={send}>📧 {r.sent_at ? "Renvoyer" : "Envoyer"} par e-mail</button>}
          {r.status === "signed" && <Link href={`/app/sav/nouveau?client=${r.client_id || ""}&reception=${r.id}`} className="btn-ghost w-full">🛠 Ouvrir un SAV pour ce client</Link>}
          {editable && r.id && <button className="btn-danger w-full" onClick={async () => { if (confirm("Supprimer ce brouillon ?")) { await sb().from("receptions").delete().eq("id", r.id); router.replace("/app/quitus"); } }}>Supprimer le brouillon</button>}
        </section>
      </div>

      {preview && <PdfPreview build={preview} filename={`${r.number || "quitus"}.pdf`} onClose={() => setPreview(null)} />}
      {modal === "sign" && (
        <Modal title="Signature du client" onClose={() => setModal("")}>
          <SignaturePad defaultName={client?.name || r.client_snapshot?.name || ""} onCancel={() => setModal("")}
            agreement={`Je prononce la réception des travaux ${r.with_reserves ? "avec les réserves indiquées" : "sans réserve"} et je donne quitus à l'entreprise pour leur exécution${r.with_reserves ? ", sous réserve de la levée des réserves" : ""}.`}
            onDone={async (name, sig, photo) => { setModal(""); await save({ status: "signed", signer_name: name, signature_data: sig, signer_photo: photo, signed_at: new Date().toISOString() }); }} />
        </Modal>
      )}
    </>
  );
}
export default function Page() { return <Suspense><Editor /></Suspense>; }
