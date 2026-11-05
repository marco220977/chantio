"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import type { Company } from "@/lib/types";

type Ctx = { company: Company | null; reload: () => Promise<void> };
const C = createContext<Ctx>({ company: null, reload: async () => {} });

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const reload = useCallback(async () => {
    const { data } = await sb().from("companies").select("*").single();
    setCompany(data);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return <C.Provider value={{ company, reload }}>{children}</C.Provider>;
}
export const useCompany = () => useContext(C);
