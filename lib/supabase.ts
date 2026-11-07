"use client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;
export function sb() {
  if (!client) {
    client = createBrowserClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );
  }
  return client;
}

// Utilisateur courant lu sur l'appareil (fonctionne aussi hors ligne)
export async function currentUser() {
  const { data: { session } } = await sb().auth.getSession();
  return session?.user ?? null;
}
