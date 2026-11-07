// Clés publiques Supabase (faites pour être visibles côté navigateur, la sécurité est assurée par la RLS).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lqhzkgxkjhrqjrljdvik.supabase.co";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxaHprZ3hramhycWpybGpkdmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NjIyNzEsImV4cCI6MjEwOTQzODI3MX0.pyWfgD5wdMnofW8zVZuWtM76nCxnR6L0TH9IwtcCgfc";

export const SUBSCRIPTION_REQUIRED =
  "Essai gratuit terminé : abonnez-vous (Menu → Abonnement) pour créer, envoyer ou faire signer des documents. Vos documents restent consultables et téléchargeables.";
