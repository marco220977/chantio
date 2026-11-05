// Types d'équipements, check-lists, mesures et mentions réglementaires pour l'entretien.

export type Equipment = {
  type?: string; brand?: string; model?: string; serial_number?: string; power_kw?: string;
  year?: string; energy?: string; fluid?: string; fluid_charge_kg?: string; location?: string;
};
export type CheckItem = { label: string; done: boolean; comment?: string };

export type Contract = {
  id: string; number?: string; status: string; client_id?: string | null; client_snapshot?: any;
  site_address?: string; equipment: Equipment; start_date?: string; duration_months?: number;
  period_months?: number; tacit_renewal?: boolean; price_ht?: number; vat_rate?: number;
  includes?: string; excludes?: string; options?: string; notes?: string; next_visit_date?: string;
  signed_at?: string; signer_name?: string; signature_data?: string; signer_photo?: string | null;
  signed_on_site?: boolean; sent_at?: string; sent_to?: string; created_at?: string; renewal_notice_at?: string;
};

export type Report = {
  id: string; number?: string; status: string; contract_id?: string | null; client_id?: string | null;
  client_snapshot?: any; site_address?: string; equipment: Equipment; visit_date?: string;
  technician?: string; checklist: CheckItem[]; measures: Record<string, string>; observations?: string;
  advice?: string; improvements?: string; replacement?: string; next_visit_date?: string;
  signed_at?: string; signer_name?: string; signature_data?: string; sent_at?: string; sent_to?: string; assigned_to?: string | null;
};

type Def = {
  label: string; short: string; price: number; period: number; legal: string;
  checklist: string[]; measures: { key: string; label: string; unit?: string; options?: string[] }[];
  advice: string;
};

export const EQUIPMENT: Record<string, Def> = {
  chaudiere_gaz: {
    label: "Chaudière gaz", short: "chaudière gaz", price: 150, period: 12,
    legal: "Entretien annuel obligatoire des chaudières de 4 à 400 kW (articles R224-41-4 et suivants du Code de l'environnement, décret n° 2009-649 du 9 juin 2009, arrêté du 15 septembre 2009). Attestation à conserver au moins 2 ans.",
    checklist: [
      "Nettoyage du corps de chauffe et du brûleur",
      "Contrôle et nettoyage des électrodes d'allumage et d'ionisation",
      "Vérification du circuit de combustion et du conduit d'évacuation des fumées",
      "Contrôle de l'étanchéité du circuit gaz",
      "Nettoyage du siphon et de l'évacuation des condensats",
      "Contrôle du vase d'expansion et de la pression du circuit",
      "Vérification des organes de sécurité",
      "Vérification de la régulation et du thermostat",
      "Analyse de combustion et mesure du CO",
    ],
    measures: [
      { key: "co_ambiant", label: "CO ambiant", unit: "ppm" },
      { key: "co_fumees", label: "CO dans les fumées", unit: "ppm" },
      { key: "co2", label: "CO2", unit: "%" },
      { key: "o2", label: "O2", unit: "%" },
      { key: "t_fumees", label: "Température des fumées", unit: "°C" },
      { key: "rendement", label: "Rendement", unit: "%" },
      { key: "nox", label: "Classe NOx", options: ["1", "2", "3", "4", "5", "6"] },
      { key: "pression", label: "Pression du circuit", unit: "bar" },
    ],
    advice: "Ne pas obstruer les entrées d'air ni les grilles de ventilation. Vérifier régulièrement la pression du circuit (entre 1 et 2 bar à froid). Régler la température de chauffage au juste besoin (19 °C en pièce de vie). Faire réaliser l'entretien chaque année.",
  },
  chaudiere_fioul: {
    label: "Chaudière fioul", short: "chaudière fioul", price: 190, period: 12,
    legal: "Entretien annuel obligatoire des chaudières de 4 à 400 kW (articles R224-41-4 et suivants du Code de l'environnement, décret n° 2009-649 du 9 juin 2009, arrêté du 15 septembre 2009). Attestation à conserver au moins 2 ans.",
    checklist: [
      "Nettoyage du corps de chauffe et du foyer",
      "Remplacement du gicleur",
      "Nettoyage ou remplacement du filtre fioul",
      "Nettoyage et réglage du brûleur (électrodes, accroche-flamme)",
      "Vérification du conduit d'évacuation des fumées",
      "Contrôle du vase d'expansion et de la pression du circuit",
      "Vérification des organes de sécurité",
      "Vérification de la régulation",
      "Analyse de combustion et indice de noircissement",
    ],
    measures: [
      { key: "co_ambiant", label: "CO ambiant", unit: "ppm" },
      { key: "co_fumees", label: "CO dans les fumées", unit: "ppm" },
      { key: "co2", label: "CO2", unit: "%" },
      { key: "o2", label: "O2", unit: "%" },
      { key: "t_fumees", label: "Température des fumées", unit: "°C" },
      { key: "bacharach", label: "Indice de noircissement (Bacharach)" },
      { key: "rendement", label: "Rendement", unit: "%" },
      { key: "nox", label: "Classe NOx", options: ["1", "2", "3", "4", "5", "6"] },
      { key: "pression", label: "Pression du circuit", unit: "bar" },
    ],
    advice: "Surveiller le niveau de la cuve et éviter de la laisser se vider complètement (aspiration de dépôts). Ne pas obstruer les ventilations. Vérifier la pression du circuit. Faire réaliser l'entretien chaque année, idéalement avant la saison de chauffe.",
  },
  pac_air_eau: {
    label: "Pompe à chaleur air/eau", short: "pompe à chaleur air/eau", price: 220, period: 24,
    legal: "Entretien obligatoire au moins tous les 2 ans des pompes à chaleur de 4 à 70 kW (décret n° 2020-912 du 28 juillet 2020, arrêté du 24 juillet 2020). Contrôle d'étanchéité du circuit frigorifique selon la charge en fluide (règlement (UE) 2024/573). Attestation à conserver au moins 2 ans.",
    checklist: [
      "Nettoyage de l'unité extérieure (batterie, ventilateur, bac)",
      "Contrôle d'étanchéité du circuit frigorifique",
      "Vérification des pressions et températures de fonctionnement",
      "Contrôle des raccordements électriques et des organes de sécurité",
      "Nettoyage du filtre hydraulique / pot à boues",
      "Vérification du circuit hydraulique (pression, vase d'expansion, purge)",
      "Contrôle de l'évacuation des condensats",
      "Vérification de la régulation et de la loi d'eau",
      "Contrôle de la production d'eau chaude sanitaire (si équipée)",
    ],
    measures: [
      { key: "fluide", label: "Fluide frigorigène" },
      { key: "charge", label: "Charge en fluide", unit: "kg" },
      { key: "hp", label: "Pression HP", unit: "bar" },
      { key: "bp", label: "Pression BP", unit: "bar" },
      { key: "t_depart", label: "Température départ eau", unit: "°C" },
      { key: "t_retour", label: "Température retour eau", unit: "°C" },
      { key: "pression", label: "Pression circuit eau", unit: "bar" },
      { key: "etancheite", label: "Contrôle d'étanchéité", options: ["Conforme", "Fuite détectée", "Non requis"] },
    ],
    advice: "Laisser l'unité extérieure dégagée (feuilles, neige, végétation) et ne pas la couvrir en fonctionnement. Éviter les variations importantes de consigne. Vérifier la pression du circuit d'eau. Faire réaliser l'entretien au moins tous les 2 ans.",
  },
  pac_air_air: {
    label: "Pompe à chaleur air/air (climatisation)", short: "pompe à chaleur air/air", price: 160, period: 24,
    legal: "Entretien obligatoire au moins tous les 2 ans des pompes à chaleur de 4 à 70 kW (décret n° 2020-912 du 28 juillet 2020, arrêté du 24 juillet 2020). Contrôle d'étanchéité du circuit frigorifique selon la charge en fluide (règlement (UE) 2024/573).",
    checklist: [
      "Nettoyage des filtres des unités intérieures",
      "Nettoyage des échangeurs et turbines des unités intérieures",
      "Nettoyage de l'unité extérieure",
      "Contrôle d'étanchéité du circuit frigorifique",
      "Vérification des pressions et températures de fonctionnement",
      "Contrôle des raccordements électriques",
      "Contrôle de l'évacuation des condensats",
      "Traitement antibactérien des unités intérieures",
    ],
    measures: [
      { key: "fluide", label: "Fluide frigorigène" },
      { key: "charge", label: "Charge en fluide", unit: "kg" },
      { key: "hp", label: "Pression HP", unit: "bar" },
      { key: "bp", label: "Pression BP", unit: "bar" },
      { key: "t_soufflage", label: "Température de soufflage", unit: "°C" },
      { key: "etancheite", label: "Contrôle d'étanchéité", options: ["Conforme", "Fuite détectée", "Non requis"] },
    ],
    advice: "Nettoyer les filtres des unités intérieures tous les 1 à 2 mois. Garder l'unité extérieure dégagée. En été, ne pas régler la température plus de 7 °C en dessous de la température extérieure.",
  },
  ballon_thermo: {
    label: "Chauffe-eau thermodynamique", short: "chauffe-eau thermodynamique", price: 130, period: 12,
    legal: "Entretien recommandé chaque année par les fabricants (condition de garantie). Contrôle d'étanchéité du circuit frigorifique selon la charge en fluide (règlement (UE) 2024/573).",
    checklist: [
      "Nettoyage de l'évaporateur, du ventilateur et du filtre à air",
      "Contrôle de l'anode (magnésium ou titane)",
      "Vérification du groupe de sécurité",
      "Contrôle de l'évacuation des condensats",
      "Vérification des raccordements électriques",
      "Contrôle de l'appoint électrique",
      "Vérification du fonctionnement de la pompe à chaleur et des consignes",
      "Détartrage si nécessaire",
    ],
    measures: [
      { key: "fluide", label: "Fluide frigorigène" },
      { key: "t_ecs", label: "Température eau chaude", unit: "°C" },
      { key: "anode", label: "État de l'anode", options: ["Bon", "À surveiller", "À remplacer", "Remplacée", "Titane (sans usure)"] },
      { key: "pression_eau", label: "Pression d'arrivée d'eau", unit: "bar" },
    ],
    advice: "Manœuvrer le groupe de sécurité une fois par mois. Laisser la prise et la sortie d'air dégagées. Privilégier le mode « éco » ou pompe à chaleur seule. Faire réaliser l'entretien chaque année.",
  },
};

export const equipmentLabel = (e?: Equipment) => (e?.type && EQUIPMENT[e.type]?.label) || "Équipement";

export const defaultIncludes = (type: string) =>
  [
    `Une visite d'entretien ${EQUIPMENT[type].period === 24 ? "tous les 2 ans" : "par an"}, déplacement et main d'œuvre compris`,
    ...EQUIPMENT[type].checklist,
    "Remise de l'attestation d'entretien réglementaire",
    "Conseils sur le bon usage et les améliorations possibles de l'installation",
  ].join("\n");

export const DEFAULT_EXCLUDES = [
  "Pièces détachées et consommables non listés ci-dessus",
  "Dépannages en dehors de la visite d'entretien (facturés au tarif en vigueur)",
  "Travaux de mise en conformité, désembouage, ramonage du conduit",
  "Interventions consécutives à une mauvaise utilisation, au gel ou à un dégât des eaux",
].join("\n");

export const addMonths = (date: string, months: number) => {
  const d = new Date(date); d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export const contractEnd = (c: Contract) => addMonths(c.start_date || new Date().toISOString(), c.duration_months || 12);

// Prochaine échéance (avec reconduction tacite)
export function nextTerm(c: Contract): string {
  let end = contractEnd(c);
  const today = new Date().toISOString().slice(0, 10);
  while (c.tacit_renewal && end < today) end = addMonths(end, 12);
  return end;
}

// Fenêtre d'information loi Chatel : entre 3 mois et 1 mois avant l'échéance
export function renewalNoticeDue(c: Contract) {
  if (!c.tacit_renewal || c.status !== "active" || c.client_snapshot?.type === "professionnel") return false;
  const term = new Date(nextTerm(c)).getTime();
  const days = (term - Date.now()) / 86400000;
  const alreadySent = c.renewal_notice_at && (Date.now() - new Date(c.renewal_notice_at).getTime()) / 86400000 < 100;
  return days <= 92 && days >= 28 && !alreadySent;
}

export const CONTRACT_STATUS: Record<string, [string, string]> = {
  draft: ["Brouillon", "bg-slate-100 text-slate-700"],
  active: ["Actif", "bg-green-100 text-green-800"],
  ended: ["Terminé", "bg-slate-200 text-slate-600"],
  canceled: ["Résilié", "bg-red-100 text-red-700"],
};
