// Chantio — service worker : mode hors ligne (lecture) + coquille de l'appli
const V = "chantio-v1";
const SHELL = ["/app", "/app/devis", "/app/factures", "/app/entretien", "/app/chantiers", "/app/planning", "/app/menu", "/app/doc/nouveau?kind=quote", "/app/clients", "/manifest.json", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, key) {
  const c = await caches.open(V);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(key || req, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(key || req, { ignoreVary: true });
    if (hit) return hit;
    if (req.mode === "navigate") { const app = await c.match("/app"); if (app) return app; }
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Données Supabase (lecture) : réseau d'abord, cache si hors ligne
  if (url.hostname.endsWith(".supabase.co") && (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/object/public/"))) {
    e.respondWith(networkFirst(req, req.url + "#" + (req.headers.get("accept") || "")));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Fichiers statiques Next : cache d'abord
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|mjs|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.open(V).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // Données de navigation Next (RSC) : clé sans le paramètre _rsc
  if (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") {
    e.respondWith(networkFirst(req, url.origin + url.pathname + url.search.replace(/[?&]_rsc=[^&]*/, "") + "#rsc"));
    return;
  }
  // Pages : réseau d'abord
  e.respondWith(networkFirst(req, url.origin + url.pathname + url.search));
});
