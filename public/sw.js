// Chantio — service worker : mode hors ligne (consultation) + coquille de l'appli
const V = "chantio-v2";
const SHELL = ["/app", "/app/devis", "/app/factures", "/app/entretien", "/app/chantiers", "/app/planning", "/app/menu", "/app/doc/nouveau?kind=quote", "/app/clients", "/app/quitus", "/app/sav", "/manifest.json", "/icon-192.png"];

// Clé de cache distincte par variante (le cache ignore les #fragments, on passe donc par un paramètre)
const keyOf = (url, tag) => { const u = new URL(url); u.searchParams.delete("_rsc"); if (tag) u.searchParams.set("__sw", tag); return u.toString(); };

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.allSettled(SHELL.map(async (u) => {
    const r = await fetch(u, { credentials: "same-origin" });
    if (r.ok && !r.redirected) await c.put(keyOf(new URL(u, self.location.origin).toString(), "html"), r);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, key, fallbackKey) {
  const c = await caches.open(V);
  try {
    const r = await fetch(req);
    if (r.ok && !r.redirected) c.put(key, r.clone());
    return r;
  } catch (err) {
    const hit = (await c.match(key, { ignoreVary: true })) || (fallbackKey && (await c.match(fallbackKey, { ignoreVary: true })));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Données Supabase (lecture) : réseau d'abord, dernière version connue si hors ligne
  if (url.hostname.endsWith(".supabase.co") && (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/object/"))) {
    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      // URL signée : le jeton change à chaque fois, on garde la photo par son chemin
      const u = new URL(req.url); u.searchParams.delete("token");
      e.respondWith(networkFirst(req, u.toString()));
      return;
    }
    const accept = (req.headers.get("accept") || "").includes("vnd.pgrst.object") ? "one" : "many";
    e.respondWith(networkFirst(req, keyOf(req.url, accept)));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Fichiers statiques : cache d'abord (noms versionnés)
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|mjs|woff2?|ico)$/.test(url.pathname)) {
    e.respondWith(caches.open(V).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }

  // Données de navigation Next (RSC)
  if (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") {
    e.respondWith(networkFirst(req, keyOf(req.url, req.headers.get("Next-Router-Prefetch") ? "rsc-prefetch" : "rsc"), keyOf(req.url, "rsc-prefetch")));
    return;
  }

  // Pages : réseau d'abord ; hors ligne → page en cache, sinon l'accueil
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, keyOf(req.url, "html"), keyOf(self.location.origin + "/app", "html")));
  }
});
