// Vérification SIRET / SIREN : clé de Luhn + calcul du n° de TVA intracommunautaire

export const digits = (s: string) => String(s || "").replace(/\D/g, "");

export function luhnOk(num: string): boolean {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function checkSiret(input: string): { ok: boolean; error?: string; siret?: string; siren?: string } {
  const s = digits(input);
  if (s.length === 9) return luhnOk(s) ? { ok: true, siren: s } : { ok: false, error: "SIREN invalide (erreur de saisie ?)" };
  if (s.length !== 14) return { ok: false, error: "Un SIRET contient 14 chiffres." };
  const siren = s.slice(0, 9);
  // Exception La Poste : la somme des chiffres doit être un multiple de 5
  const valid = siren === "356000000" ? s.split("").reduce((a, c) => a + Number(c), 0) % 5 === 0 : luhnOk(s) && luhnOk(siren);
  return valid ? { ok: true, siret: s, siren } : { ok: false, error: "SIRET invalide (erreur de saisie ?)" };
}

export function vatFromSiren(siren: string): string {
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

export const formatSiret = (s: string) => {
  const d = digits(s);
  return d.length === 14 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : d;
};

const FORMES: Record<string, string> = {
  "1000": "EI", "5499": "SARL", "5498": "EURL", "5710": "SAS", "5720": "SASU", "5599": "SA", "5202": "SNC", "6540": "SCI",
  "5410": "SARL", "5422": "SARL", "5426": "SARL", "5485": "SARL", "5785": "SAS", "9220": "Association",
};
export const formeLabel = (code?: string) => (code ? FORMES[code] || (code.startsWith("54") ? "SARL" : code.startsWith("57") ? "SAS" : code.startsWith("1") ? "EI" : "") : "");

export type SiretInfo = {
  found: boolean; siren: string; siret?: string; name?: string; legal_form?: string; vat_number?: string;
  address?: string; zip?: string; city?: string; naf?: string; naf_btp?: boolean; active?: boolean;
  establishment_known?: boolean; created?: string;
  // Fiche détaillée (équivalent Kbis)
  activity_label?: string; head_office?: string; directors?: { name: string; role?: string }[];
  category?: string; employees?: string; closed_on?: string | null; rcs?: boolean;
  procedures?: { date: string; type: string; court?: string }[] | null;
};
