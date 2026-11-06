import "./globals.css";
import type { Metadata, Viewport } from "next";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Chantio";

export const metadata: Metadata = {
  title: `${APP} — Devis et factures pour plombiers chauffagistes`,
  description: "Créez vos devis sur le chantier, faites-les signer sur place, facturez en un clic.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: APP, statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0f1b2d", width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
