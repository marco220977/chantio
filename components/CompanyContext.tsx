"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import type { Company } from "@/lib/types";

export type Member = { user_id: string; company_id: string; role: "owner" | "supervisor" | "technician"; full_name?: string | null; email?: string | null };
type Ctx = { company: Company | null; me: Member | null; team: Member[]; isSup: boolean; loaded: boolean; reload: () => Promise<void> };
const C = createContext<Ctx>({ company: null, me: null, team: [], isSup: false, loaded: false, reload: async () => {} });

export const ROLE_LABEL: Record<string, string> = { owner: "Superviseur (titulaire)", supervisor: "Superviseur", technician: "Technicien" };
export const memberName = (m?: Member | null) => m?.full_name || m?.email || "—";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    const s = sb();
    const { data: { user } } = await s.auth.getUser();
    const [{ data: co }, { data: ms }] = await Promise.all([
      s.from("companies").select("*").maybeSingle(),
      s.from("members").select("user_id, company_id, role, full_name, email").order("created_at"),
    ]);
    setCompany(co);
    setTeam(ms || []);
    setMe((ms || []).find((m: Member) => m.user_id === user?.id) || null);
    setLoaded(true);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const isSup = !!me && me.role !== "technician";
  return <C.Provider value={{ company, me, team, isSup, loaded, reload }}>{children}</C.Provider>;
}
export const useCompany = () => useContext(C);
