import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.103.3/+esm";

export const SUPABASE_URL = "https://tioxocilqbmcixrgbyac.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpb3hvY2lscWJtY2l4cmdieWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODc1OTYsImV4cCI6MjA5MjA2MzU5Nn0.wFaqHVPFBzQO1DpAEPchpBeIbQ-k3k5mvhvB2SKiLMY";

export const isSupabaseConfigured =
  SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
  SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  }
);
