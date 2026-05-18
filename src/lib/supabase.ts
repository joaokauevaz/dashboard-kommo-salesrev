import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://kvrupsbmrcenihpmbdyd.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cnVwc2JtcmNlbmlocG1iZHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5OTUzMTMsImV4cCI6MjA5NDU3MTMxM30.H18GLABc_h6sqU4B69tfklLUA1salYfqrAIRZOfAxDw";

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}
