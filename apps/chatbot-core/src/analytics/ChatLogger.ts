import { getSupabaseClient } from "../config"
import type { IChatLogger } from "../interfaces"
import type { ChatLog } from "../types"

// Writes every chat interaction to chat_logs (Supabase) for the business
// analytics dashboard (most searched products, lost sales, category intent).
export class ChatLogger implements IChatLogger {
  async log(entry: Omit<ChatLog, "id" | "createdAt">): Promise<void> {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from("chat_logs").insert({
      user_id: entry.userId ?? null,
      session_id: entry.sessionId,
      user_query: entry.userQuery,
      retrieved_ids: entry.retrievedIds,
      top_score: entry.topScore,
      has_results: entry.hasResults,
      category_hint: entry.categoryHint ?? null,
    })

    if (error) throw new Error(`Supabase chat_logs insert failed: ${error.message}`)
  }
}
