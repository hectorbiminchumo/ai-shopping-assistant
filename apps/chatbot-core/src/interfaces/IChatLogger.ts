import type { ChatLog } from "../types"

export interface IChatLogger {
  log(entry: Omit<ChatLog, "id" | "createdAt">): Promise<void>
}
