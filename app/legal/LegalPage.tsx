import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export function V({ children }: { children: string }) {
  return children.startsWith("[") ? <mark className="rounded bg-yellow-200 px-1">{children}</mark> : <>{children}</>;
}

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/" className="text-sm text-brand">← {LEGAL.app}</Link>
      <h1 className="mt-4 text-3xl font-extrabold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Dernière mise à jour : {LEGAL.updated}</p>
      <article className="legal mt-6 space-y-4 text-[15px] leading-relaxed text-slate-700">{children}</article>
      <nav className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm text-slate-500">
        <Link href="/legal/mentions-legales">Mentions légales</Link>
        <Link href="/legal/cgv">CGU / CGV</Link>
        <Link href="/legal/confidentialite">Confidentialité</Link>
        <Link href="/legal/sous-traitance">Sous-traitance RGPD</Link>
      </nav>
    </main>
  );
}
