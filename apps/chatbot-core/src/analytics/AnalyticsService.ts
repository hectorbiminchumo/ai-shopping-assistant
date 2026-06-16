import type { DashboardData } from "../types"

// SQL aggregations on chat_logs for the store owner's dashboard:
// most searched products, lost sales (has_results = false), category
// intent, and search volume trends over time.
export class AnalyticsService {
  async getDashboardData(): Promise<DashboardData> {
    // TODO: run the Supabase SQL aggregations once the client is configured
    throw new Error("Supabase client not configured yet")
  }
}
