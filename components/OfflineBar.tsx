"use client";
import { useEffect } from "react";

// Enregistre le service worker minimal (nécessaire pour installer l'appli) et vide l'ancien stockage hors ligne
export default function OfflineBar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").then((r) => r.update()).catch(() => {});
    try { localStorage.removeItem("chantio-outbox"); } catch {}
  }, []);
  return null;
}
