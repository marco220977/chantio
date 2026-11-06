"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { checkSiret, type SiretInfo } from "@/lib/siret";

export default function SiretField({ value, onChange, onVerified, label = "SIRET", checkDuplicate = false, disabled }: {
  value: string; onChange: (v: string) => void; onVerified?: (info: SiretInfo) => void; label?: string; checkDuplicate?: boolean; disabled?: boolean;
}) {
  const [state, setState] = useState<{ kind: "ok" | "warn" | "err" | "busy"; text: string } | null>(null);

  async function verify() {
    const c = checkSiret(value);
    if (!c.ok) return setState({ kind: "err", text: `❌ ${c.error}` });
    setState({ kind: "busy", text: "Vérification au registre officiel…" });
    try {
      const r = await fetch(`/api/siret?q=${c.siret || c.siren}`);
      const j: SiretInfo & { error?: string } = await r.json();
      if (!r.ok) return setState({ kind: "warn", text: `⚠️ ${j.error}` });
      if (!j.found) return setState({ kind: "err", text: "❌ Aucun établissement trouvé avec ce numéro au registre Sirene." });
      if (checkDuplicate) {
        const { data: used } = await sb().rpc("siret_in_use", { p_siret: c.siret || c.siren });
        if (used) return setState({ kind: "err", text: "❌ Ce SIRET est déjà utilisé par un autre compte. Contactez le support si c'est bien le vôtre." });
      }
      if (!j.active) { setState({ kind: "err", text: `❌ ${j.name} — entreprise ou établissement fermé (radié) au registre.` }); return; }
      const notes = [!j.establishment_known && "établissement secondaire non vérifié", j.naf && !j.naf_btp && `activité ${j.naf} hors bâtiment`].filter(Boolean);
      setState({ kind: notes.length ? "warn" : "ok", text: `✅ ${j.name}${j.city ? ` — ${j.city}` : ""} · actif${notes.length ? ` · ⚠️ ${notes.join(", ")}` : ""}` });
      onVerified?.(j);
    } catch { setState({ kind: "warn", text: "⚠️ Vérification impossible (connexion)." }); }
  }

  const color = { ok: "bg-green-50 text-green-800", warn: "bg-amber-50 text-amber-900", err: "bg-red-50 text-red-700", busy: "bg-slate-50 text-slate-600" };
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input className="input" inputMode="numeric" placeholder="14 chiffres" disabled={disabled} value={value || ""}
          onChange={(e) => { onChange(e.target.value); setState(null); }}
          onBlur={() => { const c = checkSiret(value); if (value && !c.ok) setState({ kind: "err", text: `❌ ${c.error}` }); }} />
        {!disabled && <button type="button" className="btn-ghost whitespace-nowrap !px-3" onClick={verify}>🔎 Vérifier</button>}
      </div>
      {state && <p className={`mt-1 rounded-lg p-2 text-xs ${color[state.kind]}`}>{state.text}</p>}
    </div>
  );
}
