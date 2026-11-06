"use client";
import { useEffect, useState } from "react";
import { flushOutbox, outbox } from "@/lib/offline";

export default function OfflineBar() {
  const [off, setOff] = useState(false);
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").then(() => {
      // préchargement des écrans clés pour le terrain
      if (navigator.onLine) ["/app", "/app/devis", "/app/doc/nouveau?kind=quote", "/app/planning", "/app/chantiers", "/app/entretien", "/app/clients"]
        .forEach((u) => fetch(u, { headers: { RSC: "1" } }).catch(() => {}));
    }).catch(() => {});
    const refresh = () => { setOff(!navigator.onLine); setPending(outbox().length); };
    const online = async () => { refresh(); const n = await flushOutbox(); if (n) { setMsg(`✅ ${n} document(s) synchronisé(s)`); setTimeout(() => setMsg(""), 5000); } refresh(); };
    refresh(); online();
    window.addEventListener("online", online); window.addEventListener("offline", refresh); window.addEventListener("chantio-outbox", refresh);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", refresh); window.removeEventListener("chantio-outbox", refresh); };
  }, []);
  if (msg) return <div className="bg-green-600 px-4 py-1.5 text-center text-xs font-semibold text-white">{msg}</div>;
  if (!off && !pending) return null;
  return (
    <div className={`${off ? "bg-slate-700" : "bg-amber-500"} px-4 py-1.5 text-center text-xs font-semibold text-white`}>
      {off ? "📴 Hors ligne — consultation des données déjà ouvertes, les devis sont gardés sur l'appareil" : ""}
      {pending > 0 && <span>{off ? " · " : ""}{pending} en attente d'envoi{!off && <button className="ml-2 underline" onClick={() => flushOutbox().then(() => setPending(outbox().length))}>Synchroniser</button>}</span>}
    </div>
  );
}
