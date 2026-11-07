"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { currentUser, sb } from "@/lib/supabase";
import { addDays, dateFr } from "@/lib/calc";
import { memberName, useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import PdfPreview from "@/components/PdfPreview";
import Modal from "@/components/Modal";
import SignaturePad from "@/components/SignaturePad";
import EquipmentForm from "@/components/EquipmentForm";
import { buildSavPdf, ORIGINS, SAV_STATUS, WARRANTY, warrantyFromReception, type Ticket } from "@/lib/quitus-sav";
import { equipmentLabel } from "@/lib/maintenance";
import { pdfToBase64, shareOrSave } from "@/lib/pdf-maintenance";
import { signedUrls, uploadPhoto } from "@/lib/chantiers";
import { askEmail, sendMail, snapshotOf } from "@/lib/send";
import type { Client } from "@/lib/types";

const localInput = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { company, team, me, isSup } = useCompany();
  const isNew = id === "nouveau";
  const [t, setT] = useState<Ticket | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<null | (() => Promise<any>)>(null);
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [warrantyHint, setWarrantyHint] = useState("");

  useEffect(() => {
    const s = sb();
    s.from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    if (!isNew) {
      s.from("sav_tickets").select("*").eq("id", id).single().then(async ({ data }) => { setT(data); if (data?.photos?.length) setUrls(await signedUrls(data.photos)); });
      return;
    }
    (async () => {
      const user = await currentUser();
      const { data: mine } = await s.from("members").select("full_name, role").eq("user_id", user?.id).maybeSingle();
      const base: Ticket = { id: "", status: "open", priority: "normal", origin: "Téléphone", equipment: {}, photos: [], warranty: "hors_garantie", client_id: params.get("client") || null,
        ...(mine?.role === "technician" ? { assigned_to: user?.id, technician: mine.full_name || "" } : {}) } as Ticket;
      const cid = params.get("contract");
      if (cid) {
        const { data: c } = await s.from("contracts").select("*").eq("id", cid).single();
        if (c) Object.assign(base, { contract_id: c.id, client_id: c.client_id, client_snapshot: c.client_snapshot, address: c.site_address, equipment: c.equipment, warranty: "contrat" });
      }
      setT(base);
    })();
  }, [id, isNew, params]);

  // Garantie suggérée à partir des quitus et contrats du client
  useEffect(() => {
    if (!t?.client_id || t.status !== "open") return;
    (async () => {
      const s = sb();
      const { data: ct } = await s.from("contracts").select("id, number, equipment, site_address, status").eq("client_id", t.client_id).eq("status", "active");
      setContracts(ct || []);
      const { data: rc } = await s.from("receptions").select("number, reception_date").eq("client_id", t.client_id).eq("status", "signed").order("reception_date", { ascending: false }).limit(1);
      const w = rc?.[0] ? warrantyFromReception(rc[0].reception_date) : null;
      setWarrantyHint(rc?.[0] ? `Quitus ${rc[0].number} du ${dateFr(rc[0].reception_date)} → ${WARRANTY[w!]}` : ct?.length ? "Client sous contrat d'entretien" : "");
      if (isNew && t.warranty === "hors_garantie") {
        if (w && w !== "hors_garantie") setT((x) => x && { ...x, warranty: w });
        else if (ct?.length) setT((x) => x && { ...x, warranty: "contrat" });
      }
    })();
  }, [t?.client_id]);

  if (!t || !company) return <><Header back title="…" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  const closed = t.status === "closed";
  const client = clients.find((x) => x.id === t.client_id);
  const set = (p: Partial<Ticket>) => setT({ ...t, ...p });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };

  async function save(extra: Partial<Ticket> = {}): Promise<Ticket | null> {
    setBusy("Enregistrement…"); setErr("");
    const cur = { ...t!, ...extra };
    const { id: _i, created_at, ...rest } = cur as any;
    const payload: any = { ...rest, client_snapshot: snapshotOf(client) || cur.client_snapshot || null, client_id: cur.client_id || null, contract_id: cur.contract_id || null };
    if (!cur.id) {
      const { data: num, error } = await sb().rpc("next_number", { p_kind: "S" });
      if (error) { setErr(error.message); setBusy(""); return null; }
      payload.number = num;
    }
    const q = cur.id ? sb().from("sav_tickets").update(payload).eq("id", cur.id).select().single() : sb().from("sav_tickets").insert(payload).select().single();
    const { data, error } = await q;
    setBusy("");
    if (error) { setErr(error.message); return null; }
    setT(data);
    if (!cur.id) router.replace(`/app/sav/${data.id}`);
    return data;
  }

  async function addPhotos(files: FileList) {
    const saved = t!.id ? t! : await save(); if (!saved) return;
    try {
      const paths = [...saved.photos];
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) { setBusy(`Envoi photo ${i + 1}/${list.length}…`); paths.push(await uploadPhoto(company!.id, `sav-${saved.id}`, list[i])); }
      const done = await save({ ...saved, photos: paths });
      if (done) setUrls(await signedUrls(done.photos));
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  async function removePhoto(p: string) {
    if (!confirm("Supprimer cette photo ?")) return;
    await sb().storage.from("chantiers").remove([p]);
    await save({ photos: t!.photos.filter((x) => x !== p) });
  }

  async function schedule() {
    if (!t!.scheduled_at) return setErr("Choisissez la date du rendez-vous.");
    const saved = await save({ status: "planned" }); if (!saved) return;
    await sb().from("interventions").insert({ sav_id: saved.id, assigned_to: (saved as any).assigned_to || null, title: `SAV ${saved.number}${saved.equipment?.type ? " — " + equipmentLabel(saved.equipment) : ""}`, client_id: saved.client_id, address: saved.address || [saved.client_snapshot?.address, saved.client_snapshot?.zip, saved.client_snapshot?.city].filter(Boolean).join(" ") || null, starts_at: saved.scheduled_at, duration_min: 90, technician: saved.technician, notes: saved.problem });
    flash("🗓 Rendez-vous ajouté au planning");
  }

  async function invoice() {
    const saved = await save(); if (!saved) return;
    const vat = company!.vat_exempt ? 0 : 10;
    const { data, error } = await sb().from("documents").insert({
      kind: "invoice", status: "draft", client_id: saved.client_id, client_snapshot: saved.client_snapshot, title: `Intervention SAV ${saved.number}`,
      site_address: saved.address, issue_date: addDays(0), due_date: addDays(company!.payment_terms_days ?? 30),
      lines: [
        { label: `Intervention SAV n° ${saved.number}`, description: [saved.diagnosis && `Diagnostic : ${saved.diagnosis}`, saved.actions && `Travaux : ${saved.actions}`].filter(Boolean).join("\n"), qty: 1, unit: "forfait", unit_price: 0, vat_rate: vat },
        ...(saved.parts ? [{ label: "Pièces", description: saved.parts, qty: 1, unit: "forfait", unit_price: 0, vat_rate: vat }] : []),
      ], total_ht: 0, total_vat: 0, total_ttc: 0,
    }).select().single();
    if (error) return setErr(error.message);
    await sb().from("sav_tickets").update({ document_id: data.id }).eq("id", saved.id);
    router.push(`/app/doc/${data.id}`);
  }

  async function send() {
    const to = await askEmail(client?.email || t!.client_snapshot?.email, t!.client_id); if (!to) return;
    if (!confirm(`Envoyer le bon d'intervention ${t!.number} à ${to} ?`)) return;
    setBusy("Envoi…"); setErr("");
    try { const j = await sendMail({ type: "sav", id: t!.id, to, pdfBase64: pdfToBase64(await buildSavPdf(t!, company!, urls)) }); if (j.row) setT(j.row); flash(`✅ Envoyé à ${to}`); }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  const st = SAV_STATUS[t.status];
  const billable = t.warranty === "hors_garantie" || t.billable;

  return (
    <>
      <Header back title={`SAV ${t.number || "(nouveau)"}`} right={<span className={`chip ${st?.[1]}`}>{st?.[0]}</span>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="fixed inset-x-4 top-4 z-50 rounded-xl bg-red-600 p-3 text-center text-sm font-semibold text-white shadow-lg">⚠️ {err}</p>}
        {toast && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-ink p-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</p>}

        <section className="card space-y-3">
          <h2 className="font-bold">Demande</h2>
          <select className="input" disabled={!!t.id} value={t.client_id || ""} onChange={(e) => { const x = clients.find((k) => k.id === e.target.value); set({ client_id: e.target.value, address: t.address || (x ? [x.address, x.zip, x.city].filter(Boolean).join(" ") : "") }); }}>
            <option value="">— Client —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {(client?.phone || t.client_snapshot?.phone) && <a href={`tel:${client?.phone || t.client_snapshot?.phone}`} className="text-sm text-brand">📞 {client?.phone || t.client_snapshot?.phone}</a>}
          <input className="input" placeholder="Adresse d'intervention" disabled={closed} value={t.address || ""} onChange={(e) => set({ address: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Origine</label><select className="input" disabled={closed} value={t.origin} onChange={(e) => set({ origin: e.target.value })}>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</select></div>
            <div><label className="label">Priorité</label><select className="input" disabled={closed} value={t.priority} onChange={(e) => set({ priority: e.target.value })}><option value="normal">Normale</option><option value="urgent">🚨 Urgente</option></select></div>
          </div>
          <div><label className="label">Problème signalé</label><textarea className="input text-sm" rows={3} disabled={closed} placeholder="Ex : plus d'eau chaude, chaudière en défaut F28…" value={t.problem || ""} onChange={(e) => set({ problem: e.target.value })} /></div>
          <div>
            <label className="label">Prise en charge</label>
            <select className="input" disabled={closed} value={t.warranty} onChange={(e) => set({ warranty: e.target.value })}>{Object.entries(WARRANTY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {warrantyHint && <p className="mt-1 text-xs text-slate-500">ℹ️ {warrantyHint}</p>}
          </div>
          {contracts.length > 0 && !t.contract_id && (
            <select className="input text-sm" value="" onChange={(e) => { const c = contracts.find((x) => x.id === e.target.value); if (c) set({ contract_id: c.id, equipment: c.equipment, address: t.address || c.site_address, warranty: "contrat" }); }}>
              <option value="">Rattacher à un contrat d'entretien…</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.number} — {equipmentLabel(c.equipment)} {c.equipment?.brand || ""}</option>)}
            </select>
          )}
          {t.contract_id && <Link href={`/app/entretien/contrat/${t.contract_id}`} className="text-sm text-brand">🔧 Contrat d'entretien rattaché</Link>}
        </section>

        <section className="card">
          <h2 className="mb-3 font-bold">Équipement concerné</h2>
          <EquipmentForm value={t.equipment} disabled={closed} onChange={(e) => set({ equipment: e })} />
        </section>

        {t.id && (
          <section className="card space-y-3">
            <h2 className="font-bold">Rendez-vous</h2>
            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" className="input" disabled={closed} value={localInput(t.scheduled_at)} onChange={(e) => set({ scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              <select className="input" disabled={closed} value={(t as any).assigned_to || ""} onChange={(e) => { const m = team.find((x) => x.user_id === e.target.value); set({ assigned_to: e.target.value || null, technician: m ? memberName(m) : "" } as any); }}>
                <option value="">— Technicien —</option>
                {team.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
              </select>
            </div>
            {t.status === "open" && <button className="btn-ghost w-full" onClick={schedule}>🗓 Planifier et ajouter au planning</button>}
          </section>
        )}

        {t.id && (
          <section className="card space-y-3">
            <h2 className="font-bold">Intervention</h2>
            <div><label className="label">Diagnostic</label><textarea className="input text-sm" rows={2} disabled={closed} value={t.diagnosis || ""} onChange={(e) => set({ diagnosis: e.target.value })} /></div>
            <div><label className="label">Travaux réalisés</label><textarea className="input text-sm" rows={3} disabled={closed} value={t.actions || ""} onChange={(e) => set({ actions: e.target.value })} /></div>
            <div><label className="label">Pièces remplacées / à commander</label><textarea className="input text-sm" rows={2} disabled={closed} value={t.parts || ""} onChange={(e) => set({ parts: e.target.value })} /></div>
            <div>
              <span className="label">Photos</span>
              <div className="grid grid-cols-4 gap-1.5">
                {t.photos.map((p) => (
                  <div key={p} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                    {urls[p] && <a href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" className="h-full w-full object-cover" /></a>}
                    {!closed && <button className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white" onClick={() => removePhoto(p)}>×</button>}
                  </div>
                ))}
              </div>
              {!closed && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="btn-ghost cursor-pointer">📷 Prendre une photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = ""; }} /></label>
                  <label className="btn-ghost cursor-pointer">🖼 Galerie
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = ""; }} /></label>
                </div>
              )}
              {busy && <p className="mt-1 text-sm text-slate-500">{busy}</p>}
            </div>
          </section>
        )}

        {t.signature_data && (
          <section className="card flex items-center gap-3">
            <img src={t.signature_data} alt="Signature" className="h-14" />
            <p className="text-xs text-slate-500">Signé par {t.signer_name}<br />le {new Date(t.signed_at!).toLocaleString("fr-FR")}</p>
          </section>
        )}
        {t.sent_at && <p className="text-xs text-green-700">📧 Envoyé le {new Date(t.sent_at).toLocaleString("fr-FR")} à {t.sent_to}</p>}

        <section className="space-y-2">
          {!closed && <button className="btn-primary w-full py-3.5" disabled={!!busy} onClick={async () => { if (!t.client_id && !t.client_snapshot) return setErr("Choisissez un client."); if (await save()) flash("✅ Enregistré"); }}>{busy || "💾 Enregistrer"}</button>}
          {t.id && ["open", "planned", "waiting_parts"].includes(t.status) && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => save({ status: "in_progress" })}>▶️ En cours</button>
              <button className="btn-ghost" onClick={() => save({ status: "waiting_parts" })}>📦 Attente pièce</button>
            </div>
          )}
          {t.id && !["resolved", "closed"].includes(t.status) && (
            <button className="btn-brand w-full py-3.5" onClick={async () => { if (!t.actions?.trim()) return setErr("Décrivez les travaux réalisés."); if (await save()) setModal("sign"); }}>✍️ Faire signer et clôturer l'intervention</button>
          )}
          {t.id && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => setPreview(() => () => buildSavPdf(t, company, urls))}>👁 Aperçu</button>
              <button className="btn-ghost" onClick={async () => shareOrSave(await buildSavPdf(t, company, urls), `${t.number}.pdf`)}>📤 Partager</button>
            </div>
          )}
          {t.status === "resolved" && <button className="btn-primary w-full" disabled={!!busy} onClick={send}>📧 Envoyer le bon au client</button>}
          {isSup && t.id && billable && !t.document_id && <button className="btn-ghost w-full" onClick={invoice}>💶 Facturer l'intervention</button>}
          {isSup && t.document_id && <Link href={`/app/doc/${t.document_id}`} className="btn-ghost w-full">💶 Voir la facture</Link>}
          {isSup && t.id && !billable && <Link href={`/app/doc/nouveau?kind=quote&client=${t.client_id || ""}`} className="btn-ghost w-full">📝 Faire un devis</Link>}
          {t.status === "resolved" && <button className="btn-ghost w-full" onClick={() => save({ status: "closed" })}>🗂 Archiver (clôturé)</button>}
          {t.status === "closed" && <button className="btn-ghost w-full" onClick={() => save({ status: "resolved" })}>Rouvrir</button>}
          {t.id && t.status === "open" && <button className="btn-danger w-full" onClick={async () => { if (confirm("Supprimer cette demande ?")) { if (t.photos.length) await sb().storage.from("chantiers").remove(t.photos); await sb().from("sav_tickets").delete().eq("id", t.id); router.replace("/app/sav"); } }}>Supprimer</button>}
        </section>
      </div>

      {preview && <PdfPreview build={preview} filename={`${t.number || "sav"}.pdf`} onClose={() => setPreview(null)} />}
      {modal === "sign" && (
        <Modal title="Fin d'intervention" onClose={() => setModal("")}>
          <SignaturePad defaultName={client?.name || t.client_snapshot?.name || ""} allowPhoto={false} onCancel={() => setModal("")}
            agreement="Je confirme la réalisation de l'intervention décrite dans ce bon."
            onDone={async (name, sig) => { setModal(""); await save({ status: "resolved", resolved_at: new Date().toISOString(), signer_name: name, signature_data: sig, signed_at: new Date().toISOString() }); flash("✅ Intervention clôturée"); }} />
        </Modal>
      )}
    </>
  );
}
export default function Page() { return <Suspense><Editor /></Suspense>; }
