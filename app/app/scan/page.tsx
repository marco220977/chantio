"use client";
import { useState } from "react";
import Header from "@/components/Header";
import { scanPlate } from "@/lib/scan";

type Result = { brand?: string; model?: string; type?: string; energy?: string; power_kw?: string; serial_number?: string; year?: string; other?: string; confidence?: string };

async function resize(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function Scan() {
  const [preview, setPreview] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(f: File) {
    setErr(""); setRes(null); setBusy(true);
    const data = await resize(f); setPreview(data);
    try { setRes(await scanPlate(data)); }
    catch (e: any) { setErr(e.message || "Erreur d'analyse"); }
    setBusy(false);
  }

  const rows: [keyof Result, string][] = [["brand", "Marque"], ["model", "Modèle"], ["type", "Type"], ["energy", "Énergie"], ["power_kw", "Puissance"], ["serial_number", "N° de série"], ["year", "Année"], ["other", "Autres infos"]];
  const text = res ? rows.filter(([k]) => res[k]).map(([k, l]) => `${l} : ${res[k]}`).join("\n") : "";

  return (
    <>
      <Header back title="Scanner une plaque" />
      <div className="space-y-4 p-4">
        <p className="text-sm text-slate-600">Photographiez la plaque signalétique de la chaudière, PAC ou chauffe-eau. L'appareil est identifié automatiquement.</p>
        <label className="btn-brand w-full cursor-pointer py-4 text-lg">
          📷 Prendre la photo
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {preview && <img src={preview} alt="" className="w-full rounded-2xl" />}
        {busy && <p className="text-center text-slate-500">Analyse en cours…</p>}
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {res && (
          <div className="card space-y-2">
            {rows.filter(([k]) => res[k]).map(([k, l]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1 text-sm"><span className="text-slate-500">{l}</span><span className="text-right font-semibold">{res[k]}</span></div>
            ))}
            {res.confidence === "low" && <p className="text-xs text-amber-700">⚠️ Lecture incertaine : vérifiez sur la plaque.</p>}
            <button className="btn-ghost w-full" onClick={() => navigator.clipboard.writeText(text)}>📋 Copier (à coller dans un devis ou une fiche client)</button>
          </div>
        )}
      </div>
    </>
  );
}
