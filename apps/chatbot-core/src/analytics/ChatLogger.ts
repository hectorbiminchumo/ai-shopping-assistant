import type { IChatLogger } from "../interfaces"
import type { ChatLog } from "../types"

// Writes every chat interaction to chat_logs (Supabase) for the business
// analytics dashboard (most searched products, lost sales, category intent).
export class ChatLogger implements IChatLogger {
  async log(_entry: Omit<ChatLog, "id" | "createdAt">): Promise<void> {
    // TODO: insert into Supabase chat_logs once the client is configured
    throw new Error("Supabase client not configured yet")
  }
}
