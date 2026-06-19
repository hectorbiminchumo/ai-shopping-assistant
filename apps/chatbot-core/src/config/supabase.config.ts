import { createClient, SupabaseClient } from "@supabase/supabase-js"

const env = (globalThis as any).process?.env ?? {}

export const supabaseConfig = {
  url: env.SUPABASE_URL || "",
  anonKey: env.SUPABASE_ANON_KEY || "",
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
}

// Service role client — used server-side only (ingestion, retrieval, analytics).
// Never expose this key to the browser.
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set")
  }
  return createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey)
}
