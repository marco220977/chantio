"use client";
import { sb } from "./supabase";

const KEY = "chantio-outbox";
export type OutItem = { key: string; id?: string; payload: any; label: string; at: string };

export function outbox(): OutItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(items: OutItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  window.dispatchEvent(new Event("chantio-outbox"));
}
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export function queueDoc(id: string | undefined, payload: any, label: string) {
  const key = id || `new-${Date.now()}`;
  const items = outbox().filter((x) => x.key !== key);
  items.push({ key, id, payload, label, at: new Date().toISOString() });
  write(items);
  return key;
}

let running = false;
export async function flushOutbox(): Promise<number> {
  if (running || isOffline()) return 0;
  running = true;
  let done = 0;
  try {
    for (const it of outbox()) {
      const s = sb();
      const p = { ...it.payload };
      if (!it.id && p.kind === "quote" && !p.number) {
        const { data: num, error } = await s.rpc("next_number", { p_kind: "D" });
        if (error) continue;
        p.number = num;
      }
      const { error } = it.id ? await s.from("documents").update(p).eq("id", it.id) : await s.from("documents").insert(p);
      if (error) continue;
      write(outbox().filter((x) => x.key !== it.key));
      done++;
    }
  } finally { running = false; }
  return done;
}
