"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { currentUser, sb } from "@/lib/supabase";
import type { Company } from "@/lib/types";

export type Member = { user_id: string; company_id: string; role: "owner" | "supervisor" | "technician"; full_name?: string | null; email?: string | null };
type Ctx = { company: Company | null; me: Member | null; team: Member[]; isSup: boolean; loaded: boolean; active: boolean; reload: () => Promise<void> };
const C = createContext<Ctx>({ company: null, me: null, team: [], isSup: false, loaded: false, active: true, reload: async () => {} });

// Essai en cours ou abonnement actif (sinon : consultation seule)
export const isActive = (c?: Company | null) => !c || c.plan === "pro" || c.plan === "free" || new Date(c.trial_ends_at || 0).getTime() > Date.now();

export const ROLE_LABEL: Record<string, string> = { owner: "Superviseur (titulaire)", supervisor: "Superviseur", technician: "Technicien" };
export const memberName = (m?: Member | null) => m?.full_name || m?.email || "—";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    const s = sb();
    const user = await currentUser();
    const [{ data: co, error: e1 }, { data: ms, error: e2 }] = await Promise.all([
      s.from("companies").select("*").maybeSingle(),
      s.from("members").select("user_id, company_id, role, full_name, email").order("created_at"),
    ]);
    // Réseau coupé ou erreur : on garde l'état précédent au lieu d'afficher « accès retiré »
    if (e1 || e2 || !user) { setLoaded(true); return; }
    setCompany(co);
    setTeam(ms || []);
    setMe((ms || []).find((m: Member) => m.user_id === user?.id) || null);
    setLoaded(true);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const isSup = !!me && me.role !== "technician";
  return <C.Provider value={{ company, me, team, isSup, loaded, active: isActive(company), reload }}>{children}</C.Provider>;
}
export const useCompany = () => useContext(C);
