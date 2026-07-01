import { createClient, SupabaseClient } from "@supabase/supabase-js"

const env = (globalThis as any).process?.env ?? {}

export const supabaseConfig = {
  url: env.SUPABASE_URL || "",
  anonKey: env.SUPABASE_ANON_KEY || "",
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
}

// Node < 22 lacks native WebSocket — supabase-js 2.x requires `ws` explicitly.
let wsTransport: unknown
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  wsTransport = require("ws")
} catch {
  wsTransport = undefined
}

// Service role client — used server-side only (ingestion, retrieval, analytics).
// Never expose this key to the browser.
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set")
  }
  return createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    realtime: { transport: wsTransport as any },
  })
}
