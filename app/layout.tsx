import "./globals.css";
import type { Metadata, Viewport } from "next";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Chantio";

export const metadata: Metadata = {
  title: `${APP} — Devis et factures pour plombiers chauffagistes`,
  description: "Créez vos devis sur le chantier, faites-les signer sur place, facturez en un clic.",
  manifest: "/manifest.json",
};
export const viewport: Viewport = { themeColor: "#0f1b2d", width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
