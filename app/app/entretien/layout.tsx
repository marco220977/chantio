"use client";
import { FeatureGate } from "@/components/Locked";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="entretien">{children}</FeatureGate>;
}
