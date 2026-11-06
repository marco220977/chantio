"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase";
import { eur, VAT_RATES } from "@/lib/calc";
import Header from "@/components/Header";
import { buildItems, detectMapping, FIELD_LABEL, readSupplierFile, type Field, type ImportOptions, type Mapping, type Sheet } from "@/lib/supplier-import";

type Supplier = { id: string; name: string; mapping: Record<string, string>; price_type: string; discount_pct: number; coef: number; vat_rate: number };
const KNOWN = ["Cedeo", "Point P", "Richardson", "Brossette", "Téréva", "Dispano", "Sanitaire Comtois", "Prolians", "Frans Bonhomme", "Rexel"];

function Import() {
  const router = useRouter();
  const preset = useSearchParams().get("fournisseur") || "";
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState(preset);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<Mapping>({});
  const [opt, setOpt] = useState<ImportOptions>({ supplier: "", priceType: "net", discountPct: 0, coef: 1.4, vatRate: 10, round: 0.01 });
  const [removeMissing, setRemoveMissing] = useState(true);
  const [step, setStep] = useState<"file" | "map" | "run" | "done">("file");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: number; removed: number } | null>(null);

  useEffect(() => { sb().from("suppliers").select("*").order("name").then(({ data }) => setSuppliers(data || [])); }, []);
  const existing = suppliers.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());

  async function read(f: File) {
    setErr(""); setFile(f);
    try {
      const sh = await readSupplierFile(f);
      if (!sh.rows.length) throw new Error("Le fichier ne contient aucune ligne.");
      setSheet(sh);
      // réutilise le paramétrage enregistré pour ce fournisseur si les colonnes correspondent
      let m = detectMapping(sh.headers);
      if (existing?.mapping) {
        const saved: Mapping = {};
        for (const [f2, h] of Object.entries(existing.mapping)) { const i = sh.headers.indexOf(h); if (i >= 0) saved[f2 as Field] = i; }
        if (Object.keys(saved).length >= 2) m = saved;
      }
      setMap(m);
      setOpt((o) => ({ ...o, supplier: name.trim(), priceType: existing?.price_type === "public" ? "public" : m.price === undefined && m.public_price !== undefined ? "public" : "net",
        discountPct: Number(existing?.discount_pct) || 0, coef: Number(existing?.coef) || 1.4, vatRate: Number(existing?.vat_rate) || 10 }));
      setStep("map");
    } catch (e: any) { setErr(e.message || "Fichier illisible"); }
  }

  const built = useMemo(() => (sheet ? buildItems(sheet, map, { ...opt, supplier: name.trim() }) : { items: [], skipped: 0 }), [sheet, map, opt, name]);

  async function run() {
    const supplier = name.trim();
    if (!supplier) return setErr("Indiquez le nom du fournisseur.");
    if (map.ref === undefined || map.label === undefined) return setErr("Choisissez au moins les colonnes Référence et Désignation.");
    if (!built.items.length) return setErr("Aucun article valide : vérifiez la colonne de prix.");
    setErr(""); setStep("run");
    const importId = crypto.randomUUID();
    const items = built.items.map((x) => ({ ...x, supplier, import_id: importId, updated_at: new Date().toISOString() }));
    setProgress({ done: 0, total: items.length });
    try {
      for (let i = 0; i < items.length; i += 500) {
        const { error } = await sb().from("catalog_items").upsert(items.slice(i, i + 500), { onConflict: "company_id,supplier,ref" });
        if (error) throw error;
        setProgress({ done: Math.min(i + 500, items.length), total: items.length });
      }
      let removed = 0;
      if (removeMissing) {
        const { count } = await sb().from("catalog_items").delete({ count: "exact" }).eq("supplier", supplier).or(`import_id.is.null,import_id.neq.${importId}`);
        removed = count || 0;
      }
      const mapping: Record<string, string> = {};
      for (const [f, i] of Object.entries(map)) if (i !== undefined) mapping[f] = sheet!.headers[i as number];
      const { count: total } = await sb().from("catalog_items").select("id", { count: "exact", head: true }).eq("supplier", supplier);
      await sb().from("suppliers").upsert({ name: supplier, mapping, price_type: opt.priceType, discount_pct: opt.discountPct, coef: opt.coef, vat_rate: opt.vatRate,
        last_import_at: new Date().toISOString(), last_file: file?.name, item_count: total || items.length }, { onConflict: "company_id,name" });
      setResult({ imported: items.length, skipped: built.skipped, removed });
      setStep("done");
    } catch (e: any) { setErr(e.message || "Erreur d'import"); setStep("map"); }
  }

  const sample = built.items.slice(0, 5);

  return (
    <>
      <Header back title="Importer un tarif fournisseur" />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="rounded-xl bg-red-50 p-3 text-sm text-red-700">⚠️ {err}</p>}

        {step === "file" && (
          <>
            <section className="card space-y-3">
              <div>
                <label className="label">Fournisseur</label>
                <input className="input" list="fournisseurs" placeholder="Ex : Cedeo" value={name} onChange={(e) => setName(e.target.value)} />
                <datalist id="fournisseurs">{[...suppliers.map((s) => s.name), ...KNOWN].map((n) => <option key={n} value={n} />)}</datalist>
                {existing && <p className="mt-1 text-xs text-slate-500">Mise à jour du tarif existant : le paramétrage précédent sera réutilisé.</p>}
              </div>
              <label className={`btn-brand w-full cursor-pointer py-4 ${!name.trim() ? "pointer-events-none opacity-50" : ""}`}>
                📂 Choisir le fichier (Excel, CSV, FAB-DIS)
                <input type="file" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden"
                  onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
              </label>
            </section>
            <div className="card space-y-2 bg-slate-50 text-sm text-slate-600">
              <p className="font-semibold text-ink">Où trouver le fichier ?</p>
              <p>Demandez à votre agence ou à votre commercial votre <b>« fichier tarif client »</b> au format Excel ou CSV (avec vos prix nets), ou le fichier <b>FAB-DIS</b> du fabricant. Enregistrez-le sur votre téléphone, puis choisissez-le ici.</p>
              <p>Vous pourrez le mettre à jour à chaque nouveau tarif : les prix sont actualisés, vos devis déjà faits ne changent pas.</p>
            </div>
          </>
        )}

        {step === "map" && sheet && (
          <>
            <section className="card space-y-1 text-sm">
              <p className="font-semibold">📄 {file?.name}</p>
              <p className="text-slate-500">{sheet.rows.length.toLocaleString("fr-FR")} lignes{sheet.isFabdis ? " · format FAB-DIS détecté" : sheet.sheetName ? ` · onglet « ${sheet.sheetName} »` : ""}</p>
            </section>

            <section className="card space-y-3">
              <h2 className="font-bold">Colonnes du fichier</h2>
              {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                <div key={f} className="grid grid-cols-5 items-center gap-2">
                  <span className="col-span-2 text-sm font-medium">{FIELD_LABEL[f]}{(f === "ref" || f === "label") && " *"}</span>
                  <select className="input col-span-3 !py-2 text-sm" value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                    <option value="">— Aucune —</option>
                    {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </section>

            <section className="card space-y-3">
              <h2 className="font-bold">Prix</h2>
              <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
                {[["net", "Prix net (mon prix)"], ["public", "Prix public − remise"]].map(([k, l]) => (
                  <button key={k} onClick={() => setOpt({ ...opt, priceType: k as any })} className={`rounded-lg py-2 text-xs font-semibold ${opt.priceType === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
                ))}
              </div>
              {opt.priceType === "public" && (
                <div><label className="label">Ma remise fournisseur (%)</label><input className="input" inputMode="decimal" value={opt.discountPct} onChange={(e) => setOpt({ ...opt, discountPct: Number(e.target.value.replace(",", ".")) || 0 })} /></div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Coefficient de vente</label><input className="input" inputMode="decimal" value={opt.coef} onChange={(e) => setOpt({ ...opt, coef: Number(e.target.value.replace(",", ".")) || 1 })} /></div>
                <div><label className="label">TVA par défaut</label>
                  <select className="input" value={opt.vatRate} onChange={(e) => setOpt({ ...opt, vatRate: Number(e.target.value) })}>{VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></div>
              </div>
              <div><label className="label">Arrondi du prix de vente</label>
                <select className="input" value={opt.round} onChange={(e) => setOpt({ ...opt, round: Number(e.target.value) })}>
                  <option value={0.01}>Au centime</option><option value={0.1}>À 10 centimes</option><option value={1}>À l'euro</option>
                </select></div>
              <p className="text-xs text-slate-500">Prix de vente HT = prix d'achat × {String(opt.coef).replace(".", ",")} (marge {Math.round((1 - 1 / (opt.coef || 1)) * 100)} %). Modifiable plus tard.</p>
              {existing && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} /> Retirer les articles {existing.name} absents du nouveau fichier</label>}
            </section>

            <section className="card space-y-2">
              <h2 className="font-bold">Aperçu</h2>
              <p className="text-sm"><b>{built.items.length.toLocaleString("fr-FR")}</b> articles valides{built.skipped ? ` · ${built.skipped.toLocaleString("fr-FR")} lignes ignorées (sans référence ou sans prix)` : ""}</p>
              {sample.map((x) => (
                <div key={x.ref} className="border-t border-slate-100 pt-2 text-sm">
                  <p className="font-medium">{x.label}</p>
                  <p className="text-xs text-slate-500">{x.ref} · {x.category} · achat {eur(x.cost_price)} → vente <b>{eur(x.unit_price)}</b> HT/{x.unit}</p>
                </div>
              ))}
            </section>

            <button className="btn-brand w-full py-4" onClick={run}>Importer {built.items.length.toLocaleString("fr-FR")} articles</button>
            <button className="btn-ghost w-full" onClick={() => { setStep("file"); setSheet(null); }}>Changer de fichier</button>
          </>
        )}

        {step === "run" && (
          <div className="card space-y-3 text-center">
            <p className="font-bold">Import en cours…</p>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-flame transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
            <p className="text-sm text-slate-500">{progress.done.toLocaleString("fr-FR")} / {progress.total.toLocaleString("fr-FR")} — ne fermez pas la page</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="card space-y-3 text-center">
            <p className="text-4xl">✅</p>
            <p className="font-bold">Tarif {name} importé</p>
            <p className="text-sm text-slate-600">{result.imported.toLocaleString("fr-FR")} articles ajoutés ou mis à jour{result.removed ? ` · ${result.removed} retirés` : ""}{result.skipped ? ` · ${result.skipped} lignes ignorées` : ""}.</p>
            <button className="btn-primary w-full" onClick={() => router.replace("/app/catalogue?tab=fournisseurs")}>Voir le catalogue</button>
          </div>
        )}
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Import /></Suspense>; }
