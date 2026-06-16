import { ResponseFormatter } from "../../../src/pipeline/ResponseFormatter"
import type { Product, RetrievalResult } from "../../../src/types"

const product: Product = {
  id: "prod_1",
  medusaProductId: "medusa_1",
  title: "Trail Runner X",
  description: "A lightweight trail running shoe.",
  tags: [],
  variants: [
    { id: "var_1", title: "41", sku: "TRX-41", price: 85, inventoryQuantity: 3, options: {} },
    { id: "var_2", title: "42", sku: "TRX-42", price: 95, inventoryQuantity: 5, options: {} },
  ],
}

describe("ResponseFormatter", () => {
  const formatter = new ResponseFormatter()

  it("maps retrieval results to product cards with min/max price", () => {
    const result: RetrievalResult = { product, similarityScore: 0.75 }
    const response = formatter.format("Here are some options.", [result])

    expect(response.products).toEqual([
      {
        id: "prod_1",
        title: "Trail Runner X",
        thumbnailUrl: undefined,
        priceMin: 85,
        priceMax: 95,
        similarityScore: 0.75,
      },
    ])
  })

  it("marks hasResults true when the top score meets the similarity threshold", () => {
    const response = formatter.format("ok", [{ product, similarityScore: 0.6 }])
    expect(response.hasResults).toBe(true)
  })

  it("marks hasResults false when the top score is below the similarity threshold", () => {
    const response = formatter.format("ok", [{ product, similarityScore: 0.4 }])
    expect(response.hasResults).toBe(false)
  })

  it("marks hasResults false when nothing was retrieved", () => {
    const response = formatter.format("no matches", [])
    expect(response.hasResults).toBe(false)
  })
})
