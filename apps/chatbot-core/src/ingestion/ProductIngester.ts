import type { Product } from "../types"

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL

// Reads new/updated products from Medusa. Runs as part of the hourly
// ingestion cron job (triggered from apps/backend/src/jobs).
export class ProductIngester {
  async fetchUpdatedProducts(_since: Date): Promise<Product[]> {
    if (!MEDUSA_BACKEND_URL) {
      throw new Error("MEDUSA_BACKEND_URL is not set")
    }
    // TODO: call the Medusa Store/Admin API to fetch products updated since the given date
    throw new Error("Not implemented")
  }
}
