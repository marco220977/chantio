"use client";
import Link from "next/link";
import { FEATURE_LABEL, minTier, TIERS, type Feature } from "@/lib/plans";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";

// Écran affiché quand un module n'est pas inclus dans la formule
export function Locked({ feature, compact }: { feature: Feature; compact?: boolean }) {
  const { isSup } = useCompany();
  const t = TIERS[minTier(feature)];
  return (
    <div className={`card space-y-2 text-center ${compact ? "" : "m-4"}`}>
      {!compact && <p className="text-4xl">🔒</p>}
      <p className="font-semibold">{FEATURE_LABEL[feature]} {feature === "chantiers" ? "est inclus" : "sont inclus"} dans la formule {t.name}{t.name === "Pro" ? " et Équipe" : ""}.</p>
      {isSup ? <Link href="/app/abonnement" className="btn-brand block w-full">Voir les formules (dès {t.price} € HT/mois)</Link>
        : <p className="text-sm text-slate-500">Demandez au responsable du compte de changer de formule.</p>}
    </div>
  );
}

// Enveloppe une page entière
export function FeatureGate({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const { has, loaded } = useCompany();
  if (!loaded) return null;
  return has(feature) ? <>{children}</> : <><Header back title="Option" /><Locked feature={feature} /></>;
}
