"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase";
import { addDays, dateFr } from "@/lib/calc";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import SignaturePad from "@/components/SignaturePad";
import EquipmentForm from "@/components/EquipmentForm";
import { buildReportPdf, pdfToBase64, shareOrSave } from "@/lib/pdf-maintenance";
import { addMonths, EQUIPMENT, equipmentLabel, type Equipment, type Report } from "@/lib/maintenance";
import type { Client } from "@/lib/types";

const checklistFor = (type?: string) => (type && EQUIPMENT[type] ? EQUIPMENT[type].checklist.map((label) => ({ label, done: false })) : []);

function Visit() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { company, isSup } = useCompany();
  const isNew = id === "nouveau";
  const [r, setR] = useState<Report | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const s = sb();
    s.from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    if (!isNew) { s.from("maintenance_reports").select("*").eq("id", id).single().then(({ data }) => setR(data)); return; }
    (async () => {
      const { data: { user } } = await s.auth.getUser();
      const { data: me } = await s.from("members").select("full_name").eq("user_id", user?.id).maybeSingle();
      const base: Report = { id: "", status: "draft", equipment: {}, checklist: [], measures: {}, visit_date: addDays(0), technician: me?.full_name || "", client_id: params.get("client"), assigned_to: user?.id } as Report;
      const cid = params.get("contract");
      if (cid) {
        const { data: c } = await s.from("contracts").select("*").eq("id", cid).single();
        if (c) {
          const t = c.equipment?.type;
          Object.assign(base, { contract_id: c.id, client_id: c.client_id, client_snapshot: c.client_snapshot, site_address: c.site_address, equipment: c.equipment,
            checklist: checklistFor(t), advice: t ? EQUIPMENT[t].advice : "", next_visit_date: addMonths(addDays(0), c.period_months || 12) });
        }
      }
      setR(base);
    })();
  }, [id, isNew, params]);

  if (!r || !company) return <><Header back title="…" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  const editable = r.status === "draft";
  const client = clients.find((x) => x.id === r.client_id);
  const def = r.equipment.type ? EQUIPMENT[r.equipment.type] : undefined;
  const set = (p: Partial<Report>) => setR({ ...r, ...p });

  function setEquipment(e: Equipment) {
    if (e.type && e.type !== r!.equipment.type) {
      const d = EQUIPMENT[e.type];
      setR({ ...r!, equipment: e, checklist: checklistFor(e.type), advice: r!.advice || d.advice, next_visit_date: addMonths(r!.visit_date || addDays(0), d.period) });
    } else set({ equipment: e });
  }

  async function save(extra: Partial<Report> = {}): Promise<Report | null> {
    setBusy(true); setErr("");
    const cur = { ...r!, ...extra };
    const snap = client ? { name: client.name, email: client.email, phone: client.phone, address: client.address, zip: client.zip, city: client.city, type: client.type } : cur.client_snapshot;
    const { id: _id, ...rest } = cur as any;
    delete rest.created_at;
    const payload: any = { ...rest, client_snapshot: snap || null, client_id: cur.client_id || null, contract_id: cur.contract_id || null };
    if (!cur.id) {
      const { data: num, error } = await sb().rpc("next_number", { p_kind: "E" });
      if (error) { setErr(error.message); setBusy(false); return null; }
      payload.number = num;
    }
    const q = cur.id ? sb().from("maintenance_reports").update(payload).eq("id", cur.id).select().single() : sb().from("maintenance_reports").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { setErr(error.message); return null; }
    setR(data);
    if (!cur.id) router.replace(`/app/entretien/visite/${data.id}`);
    return data;
  }

  async function validate(extra: Partial<Report>) {
    await save({ ...extra, status: "done" });
    setToast("✅ Attestation validée"); setTimeout(() => setToast(""), 3000);
  }

  function check() {
    if (!r!.client_id && !r!.client_snapshot) return "Choisissez un client.";
    if (!r!.equipment.type) return "Choisissez le type d'équipement.";
    return "";
  }

  async function send() {
    let to = client?.email || r!.client_snapshot?.email;
    if (!to) { to = prompt("Adresse e-mail du client ?") || ""; if (!to) return; if (client) await sb().from("clients").update({ email: to }).eq("id", client.id); }
    if (!confirm(`Envoyer l'attestation ${r!.number} à ${to} ?`)) return;
    setBusy(true); setErr("");
    try {
      const { data: { session } } = await sb().auth.getSession();
      const res = await fetch("/api/send-document", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type: "report", id: r!.id, to, origin: location.origin, pdfBase64: pdfToBase64(await buildReportPdf(r!, company!)) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Échec de l'envoi");
      if (j.row) setR(j.row);
      setToast(`✅ Envoyée à ${to}`); setTimeout(() => setToast(""), 4000);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function invoice() {
    const price = def?.price || 0;
    const vat = company!.vat_exempt ? 0 : 10;
    const vatAmt = Math.round(price * vat) / 100;
    const { data, error } = await sb().from("documents").insert({
      kind: "invoice", status: "draft", client_id: r!.client_id, client_snapshot: r!.client_snapshot, title: `Entretien ${equipmentLabel(r!.equipment)}`,
      site_address: r!.site_address, issue_date: addDays(0), due_date: addDays(company!.payment_terms_days ?? 30),
      lines: [{ label: `Entretien ${equipmentLabel(r!.equipment).toLowerCase()}`, description: `Visite du ${dateFr(r!.visit_date)} — attestation n° ${r!.number}`, qty: 1, unit: "forfait", unit_price: price, vat_rate: vat }],
      total_ht: price, total_vat: vatAmt, total_ttc: price + vatAmt,
    }).select().single();
    if (error) return setErr(error.message);
    router.push(`/app/doc/${data.id}`);
  }

  const doneCount = r.checklist.filter((i) => i.done).length;

  return (
    <>
      <Header back title={`Attestation ${r.number || "(nouvelle)"}`} right={<span className={`chip ${r.status === "done" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"}`}>{r.status === "done" ? "Validée" : "Brouillon"}</span>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="fixed inset-x-4 top-4 z-50 rounded-xl bg-red-600 p-3 text-center text-sm font-semibold text-white shadow-lg">⚠️ {err}<span className="block text-xs font-normal opacity-80">Appuyez pour fermer</span></p>}
        {toast && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-ink p-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</p>}

        <section className="card space-y-3">
          {r.contract_id ? <p className="text-xs text-slate-500">Visite rattachée à un contrat d'entretien. <Link className="text-brand" href={`/app/entretien/contrat/${r.contract_id}`}>Voir le contrat</Link></p> : null}
          <span className="label !mb-0">Client</span>
          {editable && !r.contract_id ? (
            <select className="input" value={r.client_id || ""} onChange={(e) => { const x = clients.find((k) => k.id === e.target.value); set({ client_id: e.target.value, site_address: r.site_address || (x ? [x.address, x.zip, x.city].filter(Boolean).join(" ") : "") }); }}>
              <option value="">— Choisir un client —</option>
              {clients.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` (${x.city})` : ""}</option>)}
            </select>
          ) : <p className="font-semibold">{r.client_snapshot?.name || client?.name}</p>}
          <div><label className="label">Adresse de l'installation</label><input className="input" disabled={!editable} value={r.site_address || ""} onChange={(e) => set({ site_address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Date de visite</label><input type="date" className="input" disabled={!editable} value={r.visit_date || ""} onChange={(e) => set({ visit_date: e.target.value })} /></div>
            <div><label className="label">Technicien</label><input className="input" disabled={!editable} value={r.technician || ""} onChange={(e) => set({ technician: e.target.value })} /></div>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-3 font-bold">Équipement</h2>
          <EquipmentForm value={r.equipment} disabled={!editable} onChange={setEquipment} />
        </section>

        {r.checklist.length > 0 && (
          <section className="card space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Opérations ({doneCount}/{r.checklist.length})</h2>
              {editable && <button className="text-sm font-semibold text-brand" onClick={() => set({ checklist: r.checklist.map((i) => ({ ...i, done: true })) })}>Tout cocher</button>}
            </div>
            {r.checklist.map((i, k) => (
              <div key={k} className="border-b border-slate-100 pb-2">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[#ea7a0c]" disabled={!editable} checked={i.done}
                    onChange={(e) => set({ checklist: r.checklist.map((x, j) => (j === k ? { ...x, done: e.target.checked } : x)) })} />
                  <span className="text-sm">{i.label}</span>
                </label>
                {(editable || i.comment) && (
                  <input className="input mt-1 !py-1.5 text-xs" placeholder="Remarque (facultatif)" disabled={!editable} value={i.comment || ""}
                    onChange={(e) => set({ checklist: r.checklist.map((x, j) => (j === k ? { ...x, comment: e.target.value } : x)) })} />
                )}
              </div>
            ))}
          </section>
        )}

        {def && (
          <section className="card space-y-2">
            <h2 className="font-bold">Mesures</h2>
            <div className="grid grid-cols-2 gap-2">
              {def.measures.map((m) => (
                <div key={m.key}>
                  <label className="label">{m.label}{m.unit ? ` (${m.unit})` : ""}</label>
                  {m.options ? (
                    <select className="input" disabled={!editable} value={r.measures[m.key] || ""} onChange={(e) => set({ measures: { ...r.measures, [m.key]: e.target.value } })}>
                      <option value="">—</option>{m.options.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="input" inputMode={m.key === "fluide" ? "text" : "decimal"} disabled={!editable} value={r.measures[m.key] || ""} onChange={(e) => set({ measures: { ...r.measures, [m.key]: e.target.value } })} />
                  )}
                </div>
              ))}
            </div>
            {r.measures.co_ambiant && Number(r.measures.co_ambiant) >= 20 && <p className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">⚠️ CO ambiant élevé : signalez le danger au client et consignez-le dans les observations.</p>}
          </section>
        )}

        <section className="card space-y-3">
          <div><label className="label">Observations / anomalies</label><textarea className="input text-sm" rows={3} disabled={!editable} value={r.observations || ""} onChange={(e) => set({ observations: e.target.value })} placeholder="Aucune anomalie constatée." /></div>
          <div><label className="label">Conseils de bon usage</label><textarea className="input text-sm" rows={3} disabled={!editable} value={r.advice || ""} onChange={(e) => set({ advice: e.target.value })} /></div>
          <div><label className="label">Améliorations possibles</label><textarea className="input text-sm" rows={2} disabled={!editable} value={r.improvements || ""} onChange={(e) => set({ improvements: e.target.value })} /></div>
          {r.equipment.type?.startsWith("chaudiere") && <div><label className="label">Intérêt du remplacement</label><textarea className="input text-sm" rows={2} disabled={!editable} value={r.replacement || ""} onChange={(e) => set({ replacement: e.target.value })} placeholder="Pas de remplacement à envisager à ce jour." /></div>}
          <div><label className="label">Prochaine visite conseillée</label><input type="date" className="input" disabled={!editable} value={r.next_visit_date || ""} onChange={(e) => set({ next_visit_date: e.target.value })} /></div>
        </section>

        {r.signature_data && (
          <section className="card flex items-center gap-3">
            <img src={r.signature_data} alt="Signature" className="h-14" />
            <p className="text-xs text-slate-500">Signé par {r.signer_name}<br />le {new Date(r.signed_at!).toLocaleString("fr-FR")}</p>
          </section>
        )}
        {r.sent_at && <p className="text-xs text-green-700">📧 Envoyée le {new Date(r.sent_at).toLocaleString("fr-FR")} à {r.sent_to}</p>}

        <section className="space-y-2">
          {editable && <button className="btn-primary w-full py-3.5" disabled={busy} onClick={() => save()}>💾 Enregistrer</button>}
          {editable && <button className="btn-brand w-full py-3.5" disabled={busy} onClick={async () => { const e = check(); if (e) return setErr(e); if (await save()) setModal("sign"); }}>✍️ Faire signer et valider</button>}
          {editable && r.id && <button className="btn-ghost w-full" onClick={async () => { const e = check(); if (e) return setErr(e); if (confirm("Valider sans signature du client ?")) await validate({}); }}>Valider sans signature</button>}
          {r.id && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={async () => (await buildReportPdf(r, company)).save(`${r.number}.pdf`)}>⬇️ PDF</button>
              <button className="btn-ghost" onClick={async () => shareOrSave(await buildReportPdf(r, company), `${r.number}.pdf`)}>📤 Partager</button>
            </div>
          )}
          {r.status === "done" && <button className="btn-primary w-full" disabled={busy} onClick={send}>📧 {r.sent_at ? "Renvoyer" : "Envoyer"} l'attestation par e-mail</button>}
          {isSup && r.status === "done" && !r.contract_id && <button className="btn-ghost w-full" onClick={invoice}>💶 Facturer la visite</button>}
          {editable && r.id && <button className="btn-danger w-full" onClick={async () => { if (confirm("Supprimer ce brouillon ?")) { await sb().from("maintenance_reports").delete().eq("id", r.id); router.replace("/app/entretien?tab=attestations"); } }}>Supprimer le brouillon</button>}
        </section>
      </div>

      {modal === "sign" && (
        <Modal title="Signature du client" onClose={() => setModal("")}>
          <SignaturePad defaultName={client?.name || r.client_snapshot?.name || ""} allowPhoto={false} onCancel={() => setModal("")}
            agreement="Je confirme le passage du technicien et la réalisation de l'entretien décrit dans cette attestation."
            onDone={async (name, sig) => { setModal(""); await validate({ signer_name: name, signature_data: sig, signed_at: new Date().toISOString() }); }} />
        </Modal>
      )}
    </>
  );
}
export default function Page() { return <Suspense><Visit /></Suspense>; }
