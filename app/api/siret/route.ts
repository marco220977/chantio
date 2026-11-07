import { NextResponse } from "next/server";
import { checkSiret, formeLabel, vatFromSiren, type SiretInfo } from "@/lib/siret";

export const revalidate = 0;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  const c = checkSiret(q);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  const siren = c.siren!;
  try {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${c.siret || siren}&per_page=5`, {
      headers: { accept: "application/json", "user-agent": "devis-factures-btp/1.0" }, cache: "no-store",
    });
    if (r.status === 429) return NextResponse.json({ error: "Registre momentanément saturé, réessayez dans quelques secondes." }, { status: 503 });
    if (!r.ok) return NextResponse.json({ error: "Registre des entreprises indisponible, réessayez plus tard." }, { status: 503 });
    const j = await r.json();
    const ent = (j.results || []).find((x: any) => x.siren === siren);
    if (!ent) return NextResponse.json({ found: false, siren } as SiretInfo);
    const siege = ent.siege || {};
    const etab = c.siret ? [siege, ...(ent.matching_etablissements || [])].find((e: any) => e?.siret === c.siret) : siege;
    const src = etab || siege;
    const naf = src.activite_principale || ent.activite_principale || "";
    const street = src.adresse ? String(src.adresse).replace(new RegExp(`\\s*${src.code_postal || "#"}.*$`), "").trim() : "";
    const info: SiretInfo = {
      found: true, siren, siret: c.siret || siege.siret,
      name: ent.nom_raison_sociale || ent.nom_complet,
      legal_form: formeLabel(String(ent.nature_juridique || "")),
      vat_number: vatFromSiren(siren),
      address: street, zip: src.code_postal, city: src.libelle_commune,
      naf, naf_btp: /^4[123]/.test(naf),
      active: ent.etat_administratif === "A" && (!etab || etab.etat_administratif !== "F"),
      establishment_known: !c.siret || !!etab,
      created: ent.date_creation,
      activity_label: src.libelle_activite_principale || ent.libelle_activite_principale || undefined,
      head_office: siege.adresse || undefined,
      directors: (ent.dirigeants || []).slice(0, 6).map((d: any) => ({
        name: d.denomination || [d.prenoms, d.nom].filter(Boolean).join(" "), role: d.qualite || undefined })),
      category: ent.categorie_entreprise || undefined,
      employees: ent.tranche_effectif_salarie || undefined,
      closed_on: ent.date_fermeture || null,
      rcs: !!(ent.complements?.est_rcs ?? ent.complements?.est_societe_commerciale),
      procedures: null,
    };
    // Procédures collectives publiées au BODACC (redressement, liquidation, sauvegarde)
    if (new URL(req.url).searchParams.get("full")) {
      try {
        const b = await fetch(`https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records?where=${encodeURIComponent(`"${siren}"`)}&refine=familleavis%3Acollective&order_by=dateparution%20desc&limit=5`, { cache: "no-store" });
        if (b.ok) {
          const bj = await b.json();
          info.procedures = (bj.results || []).filter((x: any) => String(x.registre || "").replace(/\s/g, "").includes(siren))
            .map((x: any) => ({ date: x.dateparution, type: x.familleavis_lib || "Procédure collective", court: x.tribunal || undefined }));
        }
      } catch {}
    }
    return NextResponse.json(info);
  } catch {
    return NextResponse.json({ error: "Registre des entreprises injoignable, réessayez plus tard." }, { status: 503 });
  }
}
