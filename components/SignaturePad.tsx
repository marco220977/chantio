"use client";
import { useEffect, useRef, useState } from "react";

async function compress(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const max = 640, k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

const QUOTE_AGREEMENT = "« Bon pour accord » — j'accepte ce devis et ses conditions, et je certifie l'exactitude des informations relatives au logement (TVA à taux réduit le cas échéant).";

export default function SignaturePad({ onDone, onCancel, defaultName = "", agreement = QUOTE_AGREEMENT, allowPhoto = true }: {
  onDone: (name: string, dataUrl: string, photo: string | null) => void; onCancel?: () => void; defaultName?: string;
  agreement?: string; allowPhoto?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f1b2d";
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e: PointerEvent) => { drawing.current = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setEmpty(false); };
    const up = () => { drawing.current = false; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up); c.addEventListener("pointerleave", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointerleave", up); };
  }, []);

  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setEmpty(true); };

  return (
    <div className="space-y-3">
      <div><label className="label">Nom du signataire</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>

      {allowPhoto && <div>
        <span className="label">Photo du signataire (preuve, facultative)</span>
        {photo ? (
          <div className="flex items-center gap-3">
            <img src={photo} alt="Signataire" className="h-20 w-20 rounded-xl object-cover" />
            <button type="button" className="text-sm text-brand" onClick={() => setPhoto(null)}>Reprendre / retirer</button>
          </div>
        ) : (
          <label className="btn-ghost w-full cursor-pointer">
            🤳 Prendre la photo
            <input type="file" accept="image/*" capture="user" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compress(f)); }} />
          </label>
        )}
        <p className="mt-1 text-xs text-slate-500">La photo est conservée avec le devis uniquement comme preuve de la signature. Le signataire doit être d'accord.</p>
      </div>}

      <div>
        <div className="flex items-center justify-between"><span className="label">Signature</span><button type="button" onClick={clear} className="text-xs text-brand">Effacer</button></div>
        <canvas ref={ref} className="h-48 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{agreement}{photo ? " J'accepte que ma photo soit conservée comme preuve de signature." : ""}</span>
      </label>
      <div className="flex gap-2">
        {onCancel && <button type="button" className="btn-ghost flex-1" onClick={onCancel}>Annuler</button>}
        <button type="button" className="btn-brand flex-1" disabled={empty || !name.trim() || !agree}
          onClick={() => onDone(name.trim(), ref.current!.toDataURL("image/png"), photo)}>Valider la signature</button>
      </div>
    </div>
  );
}
