import { AnalyticsService } from "../../../src/analytics/AnalyticsService"

describe("AnalyticsService", () => {
  it("throws until the Supabase client is configured", async () => {
    const service = new AnalyticsService()
    await expect(service.getDashboardData()).rejects.toThrow("Supabase client not configured yet")
  })
})
