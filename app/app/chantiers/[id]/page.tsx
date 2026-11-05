"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import jsPDF from "jspdf";
import { sb } from "@/lib/supabase";
import { addDays, dateFr } from "@/lib/calc";
import { toDataUrl } from "@/lib/pdf";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import { CH_STATUS, signedUrls, TAGS, uploadPhoto, type Chantier, type Entry } from "@/lib/chantiers";
import type { Client } from "@/lib/types";

function NewChantier() {
  const params = useSearchParams();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [c, setC] = useState<Partial<Chantier>>({ status: "planned", start_date: addDays(0) });
  const [err, setErr] = useState("");

  useEffect(() => {
    sb().from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    const docId = params.get("doc");
    if (docId) sb().from("documents").select("*").eq("id", docId).single().then(({ data: d }) => {
      if (d) setC((x) => ({ ...x, title: d.title || `Chantier ${d.client_snapshot?.name || ""}`, client_id: d.client_id, document_id: d.id, address: d.site_address }));
    });
  }, [params]);

  async function create() {
    if (!c.title) return setErr("Donnez un nom au chantier.");
    const cl = clients.find((x) => x.id === c.client_id);
    const { data, error } = await sb().from("chantiers").insert({
      ...c, client_id: c.client_id || null, document_id: c.document_id || null,
      client_snapshot: cl ? { name: cl.name, phone: cl.phone, email: cl.email, address: cl.address, zip: cl.zip, city: cl.city } : null,
    }).select().single();
    if (error) return setErr(error.message);
    router.replace(`/app/chantiers/${data.id}`);
  }

  return (
    <>
      <Header back title="Nouveau chantier" />
      <div className="space-y-3 p-4">
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        <div><label className="label">Nom du chantier</label><input className="input" placeholder="Ex : Remplacement chaudière Mme Fontaine" value={c.title || ""} onChange={(e) => setC({ ...c, title: e.target.value })} /></div>
        <div><label className="label">Client</label>
          <select className="input" value={c.client_id || ""} onChange={(e) => { const x = clients.find((k) => k.id === e.target.value); setC({ ...c, client_id: e.target.value, address: c.address || (x ? [x.address, x.zip, x.city].filter(Boolean).join(" ") : "") }); }}>
            <option value="">— Choisir —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></div>
        <div><label className="label">Adresse du chantier</label><input className="input" value={c.address || ""} onChange={(e) => setC({ ...c, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Début</label><input type="date" className="input" value={c.start_date || ""} onChange={(e) => setC({ ...c, start_date: e.target.value })} /></div>
          <div><label className="label">Fin prévue</label><input type="date" className="input" value={c.end_date || ""} onChange={(e) => setC({ ...c, end_date: e.target.value })} /></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={3} placeholder="Accès, code portail, matériel à prévoir…" value={c.notes || ""} onChange={(e) => setC({ ...c, notes: e.target.value })} /></div>
        <button className="btn-brand w-full py-3.5" onClick={create}>Créer le chantier</button>
      </div>
    </>
  );
}

function Detail({ id }: { id: string }) {
  const router = useRouter();
  const { company } = useCompany();
  const [c, setC] = useState<Chantier | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"journal" | "photos">("journal");
  const [tagFilter, setTagFilter] = useState("all");
  const [tag, setTag] = useState("pendant");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);
  const [edit, setEdit] = useState<Chantier | null>(null);

  async function load() {
    const { data } = await sb().from("chantiers").select("*").eq("id", id).single();
    setC(data);
    const { data: e } = await sb().from("chantier_entries").select("*").eq("chantier_id", id).order("created_at", { ascending: false });
    setEntries(e || []);
    const paths = (e || []).flatMap((x: Entry) => x.photos);
    if (paths.length) setUrls(await signedUrls(paths));
  }
  useEffect(() => { load(); }, [id]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  const allPhotos = entries.flatMap((e) => e.photos.map((p) => ({ path: p, entry: e }))).filter((p) => tagFilter === "all" || p.entry.tag === tagFilter);

  if (!c || !company) return <><Header back title="…" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;

  async function publish() {
    if (!files.length && !text.trim()) return;
    setErr("");
    try {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setBusy(`Envoi photo ${i + 1}/${files.length}…`);
        paths.push(await uploadPhoto(company!.id, c!.id, files[i]));
      }
      setBusy("Enregistrement…");
      const { data: me } = await sb().from("members").select("full_name").limit(1).maybeSingle();
      const { error } = await sb().from("chantier_entries").insert({ chantier_id: c!.id, tag, text: text.trim() || null, photos: paths, author: me?.full_name || null });
      if (error) throw error;
      if (!c!.cover_path && paths[0]) await sb().from("chantiers").update({ cover_path: paths[0] }).eq("id", c!.id);
      if (c!.status === "planned") await sb().from("chantiers").update({ status: "in_progress" }).eq("id", c!.id);
      setFiles([]); setText("");
      await load();
    } catch (e: any) { setErr(e.message || "Échec de l'envoi"); }
    setBusy("");
  }

  async function delEntry(e: Entry) {
    if (!confirm("Supprimer cette entrée et ses photos ?")) return;
    if (e.photos.length) await sb().storage.from("chantiers").remove(e.photos);
    await sb().from("chantier_entries").delete().eq("id", e.id);
    if (c!.cover_path && e.photos.includes(c!.cover_path)) await sb().from("chantiers").update({ cover_path: null }).eq("id", c!.id);
    setViewer(null); load();
  }

  async function setStatus(status: string) {
    await sb().from("chantiers").update({ status, ...(status === "done" ? { end_date: addDays(0) } : {}) }).eq("id", c!.id);
    load();
  }

  async function saveEdit() {
    const { id: _i, created_at, ...rest } = edit as any;
    await sb().from("chantiers").update(rest).eq("id", c!.id);
    setEdit(null); load();
  }

  async function removeChantier() {
    if (!confirm("Supprimer ce chantier, son journal et toutes ses photos ?")) return;
    const paths = entries.flatMap((e) => e.photos);
    if (paths.length) await sb().storage.from("chantiers").remove(paths);
    await sb().from("chantiers").delete().eq("id", c!.id);
    router.replace("/app/chantiers");
  }

  async function report() {
    setBusy("Création du rapport…");
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const W = 210, M = 15;
      pdf.setFont("helvetica", "bold").setFontSize(16).setTextColor(29, 78, 216).text("RAPPORT DE CHANTIER", M, 20);
      pdf.setTextColor(0).setFontSize(12).text(c!.title, M, 28);
      pdf.setFont("helvetica", "normal").setFontSize(9).text([
        `${company!.name}${company!.phone ? " — " + company!.phone : ""}`,
        c!.client_snapshot?.name ? `Client : ${c!.client_snapshot.name}` : "",
        c!.address ? `Adresse : ${c!.address}` : "",
        `Période : ${c!.start_date ? dateFr(c!.start_date) : "—"} au ${c!.end_date ? dateFr(c!.end_date) : "en cours"}`,
        `Édité le ${new Date().toLocaleDateString("fr-FR")}`,
      ].filter(Boolean), M, 35);
      let y = 60;
      const chrono = [...entries].reverse();
      for (const e of chrono) {
        if (y > 260) { pdf.addPage(); y = M; }
        pdf.setFont("helvetica", "bold").setFontSize(9.5).text(`${new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} — ${TAGS[e.tag]?.[0] || ""}`, M, y);
        y += 5;
        if (e.text) {
          const t = pdf.splitTextToSize(e.text, W - 2 * M);
          pdf.setFont("helvetica", "normal").setFontSize(9).text(t, M, y); y += t.length * 4 + 2;
        }
        let rowH = 0;
        for (let i = 0; i < e.photos.length; i++) {
          const img = await toDataUrl(urls[e.photos[i]]);
          if (!img) continue;
          const props = pdf.getImageProperties(img);
          const ratio = props.height / props.width;
          let w = 87, h = w * ratio;
          if (h > 100) { h = 100; w = h / ratio; }
          if (i % 2 === 0) { if (y + h > 285) { pdf.addPage(); y = M; } rowH = 0; }
          const x = i % 2 === 0 ? M : M + 93;
          pdf.addImage(img, "JPEG", x, y, w, h);
          rowH = Math.max(rowH, h);
          if (i % 2 === 1 || i === e.photos.length - 1) y += rowH + 4;
        }
        y += 4;
      }
      const pages = pdf.getNumberOfPages();
      for (let i = 1; i <= pages; i++) pdf.setPage(i).setFontSize(7).setTextColor(130).text(`${company!.name} — ${i}/${pages}`, W / 2, 290, { align: "center" });
      const name = `Rapport-${c!.title.replace(/[^\w-]+/g, "_").slice(0, 40)}.pdf`;
      const file = new File([pdf.output("blob")], name, { type: "application/pdf" });
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) await nav.share({ files: [file], title: name }); else pdf.save(name);
    } catch (e: any) { if (e?.name !== "AbortError") setErr(e.message || "Erreur"); }
    setBusy("");
  }

  const st = CH_STATUS[c.status];
  let lastDay = "";

  return (
    <>
      <Header back title={c.title} right={<span className={`chip ${st?.[1]}`}>{st?.[0]}</span>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="fixed inset-x-4 top-4 z-50 rounded-xl bg-red-600 p-3 text-center text-sm font-semibold text-white shadow-lg">⚠️ {err}</p>}

        <section className="card space-y-1 text-sm">
          {c.client_snapshot?.name && <p className="font-semibold">{c.client_snapshot.name}{c.client_snapshot.phone && <a href={`tel:${c.client_snapshot.phone}`} className="ml-2 text-brand">📞 {c.client_snapshot.phone}</a>}</p>}
          {c.address && <a className="block text-brand" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}`}>🧭 {c.address}</a>}
          <p className="text-slate-500">{c.start_date ? `Du ${dateFr(c.start_date)}` : ""}{c.end_date ? ` au ${dateFr(c.end_date)}` : ""}</p>
          {c.notes && <p className="whitespace-pre-line text-slate-600">{c.notes}</p>}
          <div className="flex flex-wrap gap-3 pt-2">
            {c.document_id && <Link href={`/app/doc/${c.document_id}`} className="text-brand">📝 Voir le devis</Link>}
            <button className="text-brand" onClick={() => setEdit(c)}>✏️ Modifier</button>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          {c.status === "planned" && <button className="btn-primary" onClick={() => setStatus("in_progress")}>▶️ Démarrer</button>}
          {c.status === "in_progress" && <button className="btn-primary" onClick={() => setStatus("done")}>✅ Terminer</button>}
          {c.status === "done" && <button className="btn-ghost" onClick={() => setStatus("in_progress")}>Rouvrir</button>}
          <Link href={`/app/quitus/nouveau?chantier=${c.id}`} className="btn-ghost col-span-2">✅ Quitus de fin de travaux</Link>
          <button className="btn-ghost" disabled={!!busy || !entries.length} onClick={report}>📄 Rapport photo</button>
        </div>

        {/* Ajout */}
        <section className="card space-y-3">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
            {Object.entries(TAGS).map(([k, [l, cls]]) => (
              <button key={k} onClick={() => setTag(k)} className={`chip whitespace-nowrap border py-1.5 ${tag === k ? `${cls} border-transparent ring-2 ring-ink` : "border-slate-200 bg-white"}`}>{l}</button>
            ))}
          </div>
          <textarea className="input text-sm" rows={2} placeholder="Note (facultatif) : ce qui a été fait, problème rencontré…" value={text} onChange={(e) => setText(e.target.value)} />
          {previews.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {previews.map((u, i) => (
                <div key={u} className="relative aspect-square overflow-hidden rounded-lg">
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white" onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="btn-ghost cursor-pointer">📷 Photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]); e.target.value = ""; }} /></label>
            <label className="btn-ghost cursor-pointer">🖼 Galerie<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]); e.target.value = ""; }} /></label>
          </div>
          <button className="btn-brand w-full py-3" disabled={!!busy || (!files.length && !text.trim())} onClick={publish}>{busy || "Ajouter au journal"}</button>
        </section>

        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
          {[["journal", "Journal"], ["photos", `Photos (${entries.reduce((s, e) => s + e.photos.length, 0)})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as any)} className={`rounded-lg py-2 text-sm font-semibold ${tab === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>

        {tab === "journal" && (
          <div className="space-y-3">
            {entries.length === 0 && <p className="py-6 text-center text-slate-500">Aucune entrée. Ajoutez vos premières photos.</p>}
            {entries.map((e) => {
              const day = new Date(e.created_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
              const showDay = day !== lastDay; lastDay = day;
              return (
                <div key={e.id}>
                  {showDay && <h3 className="mb-1 mt-2 text-sm font-bold capitalize text-slate-500">{day}</h3>}
                  <div className="card space-y-2 !p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{new Date(e.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{e.author ? ` · ${e.author}` : ""}</span>
                      <div className="flex items-center gap-2"><span className={`chip ${TAGS[e.tag]?.[1]}`}>{TAGS[e.tag]?.[0]}</span><button className="text-slate-400" onClick={() => delEntry(e)}>🗑</button></div>
                    </div>
                    {e.text && <p className="whitespace-pre-line text-sm">{e.text}</p>}
                    {e.photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {e.photos.map((p) => (
                          <button key={p} className="aspect-square overflow-hidden rounded-lg bg-slate-100" onClick={() => { setTagFilter("all"); setViewer(allPhotosIndex(entries, p)); }}>
                            {urls[p] && <img src={urls[p]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "photos" && (
          <div className="space-y-3">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
              {[["all", "Toutes"], ...Object.entries(TAGS).map(([k, v]) => [k, v[0]])].map(([k, l]) => (
                <button key={k} onClick={() => setTagFilter(k)} className={`chip whitespace-nowrap border py-1.5 ${tagFilter === k ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {allPhotos.map((p, i) => (
                <button key={p.path} className="aspect-square overflow-hidden rounded-lg bg-slate-100" onClick={() => setViewer(i)}>
                  {urls[p.path] && <img src={urls[p.path]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
            {allPhotos.length === 0 && <p className="py-6 text-center text-slate-500">Aucune photo.</p>}
          </div>
        )}

        <button className="btn-danger w-full" onClick={removeChantier}>Supprimer le chantier</button>
      </div>

      {viewer !== null && allPhotos[viewer] && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black" onClick={() => setViewer(null)}>
          <div className="flex items-center justify-between p-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm">{viewer + 1}/{allPhotos.length} · {TAGS[allPhotos[viewer].entry.tag]?.[0]} · {new Date(allPhotos[viewer].entry.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
            <button className="text-2xl" onClick={() => setViewer(null)}>×</button>
          </div>
          <div className="flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img src={urls[allPhotos[viewer].path]} alt="" className="max-h-full max-w-full object-contain" />
          </div>
          {allPhotos[viewer].entry.text && <p className="p-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>{allPhotos[viewer].entry.text}</p>}
          <div className="grid grid-cols-3 gap-2 p-3" onClick={(e) => e.stopPropagation()}>
            <button className="btn bg-white/10 text-white" disabled={viewer === 0} onClick={() => setViewer(viewer - 1)}>‹</button>
            <a className="btn bg-white/10 text-white" href={urls[allPhotos[viewer].path]} target="_blank" rel="noreferrer">⬇️</a>
            <button className="btn bg-white/10 text-white" disabled={viewer === allPhotos.length - 1} onClick={() => setViewer(viewer + 1)}>›</button>
          </div>
        </div>
      )}

      {edit && (
        <Modal title="Modifier le chantier" onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <div><label className="label">Nom</label><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div><label className="label">Adresse</label><input className="input" value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Début</label><input type="date" className="input" value={edit.start_date || ""} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} /></div>
              <div><label className="label">Fin</label><input type="date" className="input" value={edit.end_date || ""} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} /></div>
            </div>
            <div><label className="label">Notes</label><textarea className="input" rows={3} value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            <button className="btn-primary w-full" onClick={saveEdit}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function allPhotosIndex(entries: Entry[], path: string) {
  return entries.flatMap((e) => e.photos).indexOf(path);
}

function Page() {
  const { id } = useParams<{ id: string }>();
  return id === "nouveau" ? <NewChantier /> : <Detail id={id} />;
}
export default function Wrapper() { return <Suspense><Page /></Suspense>; }
