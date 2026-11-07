// Service worker minimal (installation de l'appli) — pas de mode hors ligne.
// Supprime les anciens caches de la version hors ligne.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
