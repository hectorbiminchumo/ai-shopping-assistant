import { HISTORY_TURNS, PromptAssembler } from "../../../src/pipeline/PromptAssembler"
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
      query: { rawQuery: "trail shoes under $100", embeddingText: "trail shoes under $100" },
      retrievedProducts: [retrievalResult],
      history: [],
    })

    expect(prompt).toContain("trail shoes under $100")
    expect(prompt).toContain("Trail Runner X")
  })

  it("includes only the last HISTORY_TURNS turns of conversation history", () => {
    const history = Array.from({ length: HISTORY_TURNS + 1 }, (_, i) => ({
      role: "user" as const,
      content: `turn ${i + 1}`,
    }))

    const prompt = assembler.assemble({
      query: { rawQuery: "anything else?", embeddingText: "anything else?" },
      retrievedProducts: [],
      history,
    })

    // "turn 1\n" avoids matching the "turn 1" prefix of "turn 10"/"turn 11"
    expect(prompt).not.toContain("turn 1\n")
    expect(prompt).toContain("turn 2")
    expect(prompt).toContain(`turn ${HISTORY_TURNS + 1}`)
  })

  it("keeps every turn when the history is exactly HISTORY_TURNS long", () => {
    const history = Array.from({ length: HISTORY_TURNS }, (_, i) => ({
      role: "user" as const,
      content: `turn ${i + 1}`,
    }))

    const prompt = assembler.assemble({
      query: { rawQuery: "anything else?", embeddingText: "anything else?" },
      retrievedProducts: [],
      history,
    })

    expect(prompt).toContain("turn 1\n")
    expect(prompt).toContain(`turn ${HISTORY_TURNS}`)
  })

  it("keeps every turn when the history is shorter than HISTORY_TURNS", () => {
    const history = Array.from({ length: HISTORY_TURNS - 1 }, (_, i) => ({
      role: "user" as const,
      content: `turn ${i + 1}`,
    }))

    const prompt = assembler.assemble({
      query: { rawQuery: "anything else?", embeddingText: "anything else?" },
      retrievedProducts: [],
      history,
    })

    expect(prompt).toContain("turn 1\n")
    expect(prompt).toContain(`turn ${HISTORY_TURNS - 1}`)
  })

  it("omits the conversation section entirely for an empty history", () => {
    const prompt = assembler.assemble({
      query: { rawQuery: "anything else?", embeddingText: "anything else?" },
      retrievedProducts: [],
      history: [],
    })

    expect(prompt).not.toContain("Recent conversation:")
  })

  it("keeps only the last HISTORY_TURNS turns for a very long history (>20)", () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: "user" as const,
      content: `turn ${i + 1}`,
    }))

    const prompt = assembler.assemble({
      query: { rawQuery: "anything else?", embeddingText: "anything else?" },
      retrievedProducts: [],
      history,
    })

    expect(prompt).not.toContain("turn 15\n")
    expect(prompt).toContain("turn 16")
    expect(prompt).toContain("turn 25")
  })

  it("trims alternating user/assistant messages by message count, not by pair", () => {
    // 11 alternating messages starting on "user" — an odd count so slicing
    // to the last 10 drops only the lone first message, leaving its
    // "assistant" reply as the new first line with no paired "user"
    // message before it. Proves a "turn" is one message, not a pair.
    const history = Array.from({ length: 11 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg ${i + 1}`,
    }))

    const prompt = assembler.assemble({
      query: { rawQuery: "anything else?", embeddingText: "anything else?" },
      retrievedProducts: [],
      history,
    })

    expect(prompt).not.toContain("msg 1\n")
    expect(prompt).toContain("assistant: msg 2")
    expect(prompt).toContain("user: msg 11")
  })

  it("notes when no products were retrieved", () => {
    const prompt = assembler.assemble({
      query: { rawQuery: "something rare", embeddingText: "something rare" },
      retrievedProducts: [],
      history: [],
    })

    expect(prompt).toContain("no matching products found")
  })
})
