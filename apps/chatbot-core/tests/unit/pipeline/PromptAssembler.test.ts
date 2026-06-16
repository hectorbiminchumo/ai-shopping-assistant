import { PromptAssembler } from "../../../src/pipeline/PromptAssembler"
import type { Product, RetrievalResult } from "../../../src/types"

const product: Product = {
  id: "prod_1",
  medusaProductId: "medusa_1",
  title: "Trail Runner X",
  description: "A lightweight trail running shoe.",
  category: "running shoes",
  tags: ["trail", "running"],
  variants: [{ id: "var_1", title: "42 / Black", sku: "TRX-42-BLK", price: 90, inventoryQuantity: 5, options: { size: "42", color: "Black" } }],
}

const retrievalResult: RetrievalResult = { product, similarityScore: 0.82 }

describe("PromptAssembler", () => {
  const assembler = new PromptAssembler()

  it("includes the user query and retrieved product context", () => {
    const prompt = assembler.assemble({
      query: { rawQuery: "trail shoes under $100" },
      retrievedProducts: [retrievalResult],
      history: [],
    })

    expect(prompt).toContain("trail shoes under $100")
    expect(prompt).toContain("Trail Runner X")
  })

  it("includes only the last 3 turns of conversation history", () => {
    const history = [1, 2, 3, 4].map((n) => ({
      role: "user" as const,
      content: `turn ${n}`,
    }))

    const prompt = assembler.assemble({
      query: { rawQuery: "anything else?" },
      retrievedProducts: [],
      history,
    })

    expect(prompt).not.toContain("turn 1")
    expect(prompt).toContain("turn 2")
    expect(prompt).toContain("turn 4")
  })

  it("notes when no products were retrieved", () => {
    const prompt = assembler.assemble({
      query: { rawQuery: "something rare" },
      retrievedProducts: [],
      history: [],
    })

    expect(prompt).toContain("no matching products found")
  })
})
