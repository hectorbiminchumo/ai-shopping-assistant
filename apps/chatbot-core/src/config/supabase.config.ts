export const supabaseConfig = {
  url: process.env.SUPABASE_URL || "",
  anonKey: process.env.SUPABASE_ANON_KEY || "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
}

// TODO: instantiate the real Supabase client once @supabase/supabase-js is added
export function getSupabaseClient(): never {
  throw new Error("Supabase client not configured yet")
}
