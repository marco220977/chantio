"use client";
// Horodatage + géolocalisation incrustés dans les photos

type Exif = { date?: Date; lat?: number; lon?: number };

// Lecture minimale des EXIF d'un JPEG (date de prise de vue + GPS)
export async function readExif(file: Blob): Promise<Exif> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + size;
    }
  } catch {}
  return {};
}

function parseTiff(v: DataView, t: number): Exif {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(t + o, le);
  const u32 = (o: number) => v.getUint32(t + o, le);
  const ifd = (o: number) => {
    const n = u16(o), out: Record<number, { type: number; count: number; off: number }> = {};
    for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), off: e + 8 }; }
    return out;
  };
  const str = (e: { count: number; off: number }) => { const o = e.count > 4 ? u32(e.off) : e.off; let s = ""; for (let i = 0; i < e.count - 1; i++) s += String.fromCharCode(v.getUint8(t + o + i)); return s; };
  const rat3 = (e: { off: number }) => { const o = u32(e.off); const r = (k: number) => u32(o + k * 8) / (u32(o + k * 8 + 4) || 1); return r(0) + r(1) / 60 + r(2) / 3600; };
  const res: Exif = {};
  const ifd0 = ifd(u32(4));
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].off));
    const d = ex[0x9003] || ifd0[0x0132];
    if (d) { const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(str(d)); if (m) res.date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); }
  }
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].off));
    if (g[2] && g[4]) {
      const ref = (tag: number) => (g[tag] ? String.fromCharCode(v.getUint8(g[tag].off)) : "");
      res.lat = rat3(g[2]) * (ref(1) === "S" ? -1 : 1);
      res.lon = rat3(g[4]) * (ref(3) === "W" ? -1 : 1);
      if (!res.lat && !res.lon) { delete res.lat; delete res.lon; }
    }
  }
  return res;
}

// Position actuelle (mise en cache 2 min pour ne pas redemander à chaque photo)
let last: { lat: number; lon: number; acc: number; at: number } | null = null;
export function currentPosition(): Promise<{ lat: number; lon: number; acc: number } | null> {
  if (last && Date.now() - last.at < 120_000) return Promise.resolve(last);
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((ok) => {
    navigator.geolocation.getCurrentPosition(
      (p) => { last = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: Date.now() }; ok(last); },
      () => ok(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}

const addrCache = new Map<string, string>();
async function address(lat: number, lon: number): Promise<string> {
  const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (addrCache.has(k)) return addrCache.get(k)!;
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}&limit=1`, { signal: ctl.signal });
    clearTimeout(tm);
    const j = await r.json();
    const a = j.features?.[0]?.properties?.label || "";
    if (a) addrCache.set(k, a);
    return a;
  } catch { return ""; }
}

// Redimensionne la photo et incruste date/heure + lieu en bas de l'image
type StampOpts = { when: Date; pos: { lat: number; lon: number; acc?: number } | null; prefix?: string };

export async function stampPhoto(file: Blob, max = 1600, opts?: StampOpts): Promise<Blob> {
  let lat: number | undefined, lon: number | undefined, acc: number | undefined, when: Date;
  if (opts) {
    when = opts.when; if (opts.pos) { lat = opts.pos.lat; lon = opts.pos.lon; acc = opts.pos.acc; }
  } else {
    const exif = await readExif(file);
    const recent = !exif.date || Math.abs(Date.now() - exif.date.getTime()) < 10 * 60_000;
    lat = exif.lat; lon = exif.lon;
    if (lat == null && recent) { const p = await currentPosition(); if (p) { lat = p.lat; lon = p.lon; acc = p.acc; } }
    when = exif.date || new Date((file as any).lastModified || Date.now());
  }
  const addr = lat != null && lon != null ? await address(lat, lon) : "";

  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);

  const fs = Math.max(13, Math.round(Math.min(c.width, c.height) / 34));
  const lines = [
    (opts?.prefix || "") + "🕒 " + when.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    lat != null && lon != null ? `📍 ${addr ? addr + " · " : ""}${lat.toFixed(5)}, ${lon.toFixed(5)}${acc ? ` (±${acc} m)` : ""}` : "📍 Position non disponible",
  ];
  ctx.font = `600 ${fs}px Arial, sans-serif`;
  // découpe des lignes trop longues
  const wrap: string[] = [];
  for (const l of lines) {
    let cur = "";
    for (const w of l.split(" ")) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > c.width - fs * 1.6 && cur) { wrap.push(cur); cur = w; } else cur = t; }
    wrap.push(cur);
  }
  const lh = fs * 1.35, h = wrap.length * lh + fs * 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, c.height - h, c.width, h);
  ctx.fillStyle = "#fff"; ctx.textBaseline = "top";
  wrap.forEach((l, i) => ctx.fillText(l, fs * 0.8, c.height - h + fs * 0.45 + i * lh));
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.82));
}
