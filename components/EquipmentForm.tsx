"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { EQUIPMENT, type Equipment } from "@/lib/maintenance";

async function resize(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

function guessType(t: string): string | undefined {
  const s = t.toLowerCase();
  if (s.includes("thermodynamique") || (s.includes("chauffe-eau") && s.includes("pompe"))) return "ballon_thermo";
  if (s.includes("air/air") || s.includes("clim")) return "pac_air_air";
  if (s.includes("pac") || s.includes("pompe")) return "pac_air_eau";
  if (s.includes("fioul")) return "chaudiere_fioul";
  if (s.includes("chaudi")) return "chaudiere_gaz";
}

export default function EquipmentForm({ value, onChange, disabled }: { value: Equipment; onChange: (e: Equipment) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof Equipment, v: string) => onChange({ ...value, [k]: v });
  const isFrigo = value.type?.startsWith("pac") || value.type === "ballon_thermo";

  async function scan(f: File) {
    setBusy(true); setErr("");
    try {
      const { data: { session } } = await sb().auth.getSession();
      const r = await fetch("/api/scan-plaque", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ image: await resize(f) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const fluid = /R ?-?\d{2,4}[A-Z]?/i.exec(j.other || "")?.[0];
      onChange({
        ...value,
        type: value.type || guessType(`${j.type} ${j.energy}`),
        brand: j.brand || value.brand, model: j.model || value.model, serial_number: j.serial_number || value.serial_number,
        power_kw: j.power_kw || value.power_kw, year: j.year || value.year, energy: j.energy || value.energy,
        fluid: fluid || value.fluid,
      });
    } catch (e: any) { setErr(e.message || "Lecture impossible"); }
    setBusy(false);
  }

  const F = (k: keyof Equipment, label: string, ph = "") => (
    <div><label className="label">{label}</label><input className="input" disabled={disabled} placeholder={ph} value={value[k] || ""} onChange={(e) => set(k, e.target.value)} /></div>
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Type d'équipement</label>
        <select className="input" disabled={disabled} value={value.type || ""} onChange={(e) => set("type", e.target.value)}>
          <option value="">— Choisir —</option>
          {Object.entries(EQUIPMENT).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
        </select>
      </div>
      {!disabled && (
        <label className="btn-ghost w-full cursor-pointer">
          {busy ? "Lecture de la plaque…" : "📷 Remplir en scannant la plaque"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
        </label>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-2 gap-2">{F("brand", "Marque")}{F("model", "Modèle")}</div>
      {F("serial_number", "N° de série")}
      <div className="grid grid-cols-2 gap-2">{F("power_kw", "Puissance", "ex. 24 kW")}{F("year", "Année")}</div>
      <div className="grid grid-cols-2 gap-2">
        {F("energy", "Énergie", "gaz naturel, électricité…")}
        {F("location", "Emplacement", "cuisine, garage…")}
      </div>
      {isFrigo && <div className="grid grid-cols-2 gap-2">{F("fluid", "Fluide", "R32, R410A…")}{F("fluid_charge_kg", "Charge (kg)")}</div>}
    </div>
  );
}
