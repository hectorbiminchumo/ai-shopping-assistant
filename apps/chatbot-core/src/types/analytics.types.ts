export interface ChatLog {
  id: string
  userId?: string
  sessionId: string
  userQuery: string
  retrievedIds: string[]
  topScore: number
  hasResults: boolean
  categoryHint?: string
  createdAt: string
}

export interface AnalyticsMetric {
  label: string
  value: number
}

export interface DashboardData {
  mostSearchedProducts: AnalyticsMetric[]
  lostSales: ChatLog[]
  categoryIntent: AnalyticsMetric[]
  searchTrends: AnalyticsMetric[]
}
