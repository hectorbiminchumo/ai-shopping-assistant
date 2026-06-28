import { getSupabaseClient } from "../config"
import type { IChatLogger } from "../interfaces"
import type { ChatLog } from "../types"

export class ChatLogger implements IChatLogger {
  async log(entry: Omit<ChatLog, "id" | "createdAt">): Promise<void> {
    const supabase = getSupabaseClient()
    await supabase.from("chat_logs").insert({
      user_id: entry.userId ?? null,
      session_id: entry.sessionId,
      user_query: entry.userQuery,
      retrieved_ids: entry.retrievedIds,
      top_score: entry.topScore,
      has_results: entry.hasResults,
      category_hint: entry.categoryHint ?? null,
    })
  }
}
