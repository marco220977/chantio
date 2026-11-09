// Formules d'abonnement et fonctions incluses
import type { Company } from "@/lib/types";

export type Tier = "solo" | "pro" | "equipe";
export type Feature = "ia" | "entretien" | "agenda" | "chantiers";

export const TIERS: Record<Tier, { name: string; price: number; users: number; features: Feature[]; tagline: string; includes: string[] }> = {
  solo: { name: "Solo", price: 29, users: 1, features: [], tagline: "L'essentiel pour l'artisan seul",
    includes: ["Devis, factures, avoirs illimités", "Signature électronique sur place et à distance", "Facture électronique 2026 (Factur-X)", "Clients, catalogue, import des tarifs fournisseurs", "Planning et quitus d'intervention", "Paiement en ligne, relances automatiques", "Chiffre d'affaires, TVA, export comptable", "1 utilisateur"] },
  pro: { name: "Pro", price: 49, users: 2, features: ["ia", "entretien", "agenda"], tagline: "Pour le chauffagiste qui veut gagner du temps",
    includes: ["Tout Solo", "🤖 IA : devis dictés, scan de plaque, diagnostic de panne, catalogue par photo", "🛠 Entretien et SAV : contrats, attestations, rappels, codes erreur", "📲 Prise de RDV en ligne avec trajets optimisés", "2 utilisateurs"] },
  equipe: { name: "Équipe", price: 79, users: 4, features: ["ia", "entretien", "agenda", "chantiers"], tagline: "Pour l'entreprise avec des techniciens",
    includes: ["Tout Pro", "🏗 Suivi de chantier : journal photo et vidéo", "👷 Planning d'équipe : patron + 3 techniciens", "4 utilisateurs"] },
};

export const FEATURE_LABEL: Record<Feature, string> = {
  ia: "L'intelligence artificielle (devis IA, scan de plaque, diagnostic, catalogue par photo)",
  entretien: "Les contrats d'entretien, attestations, SAV et codes erreur",
  agenda: "La prise de rendez-vous en ligne par les clients",
  chantiers: "Le suivi de chantier",
};
export const minTier = (f: Feature): Tier => (TIERS.pro.features.includes(f) ? "pro" : "equipe");

// Formule effective : pendant l'essai ou avec un accès offert, tout est inclus
export function effectiveTier(c?: Company | null): Tier {
  if (!c) return "equipe";
  if (c.plan === "pro") return ((c as any).tier || "solo") as Tier;
  return "equipe";
}
export const hasFeature = (c: Company | null | undefined, f: Feature) => TIERS[effectiveTier(c)].features.includes(f);
