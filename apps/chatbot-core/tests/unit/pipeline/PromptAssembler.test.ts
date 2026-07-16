import { HISTORY_TURNS, PromptAssembler } from "../../../src/pipeline/PromptAssembler"
import type { ChatMessage, Product, RetrievalResult } from "../../../src/types"

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

// Rough token estimate: OpenAI's BPE tokenizers average ~4 characters per
// token for English prose, so chars / 4 is a conservative upper bound that
// needs no tiktoken/wasm dependency. See the token-budget test for how it's used.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// gpt-4o-mini has a 128k-token context window. The assembled prompt is only the
// per-turn context (matches + history + query); the ~1.5k-token system prompt
// and the model's completion share the rest of the window. We cap the per-turn
// context well below that so a regression (e.g. history no longer trimmed, or
// the full catalog dumped in) fails loudly instead of silently inflating cost.
const PROMPT_TOKEN_BUDGET = 6000

// A rich, 150+ word description like the enriched catalog copy the RAG pipeline
// actually embeds — the worst-case size for a single retrieved product.
const LONG_DESCRIPTION = Array.from(
  { length: 160 },
  (_, i) => `word${i + 1}`,
).join(" ")

function makeHeavyProduct(index: number): Product {
  return {
    id: `prod_${index}`,
    medusaProductId: `medusa_${index}`,
    title: `Trail Runner ${index} Ultra Boost Performance Edition`,
    description: LONG_DESCRIPTION,
    category: "running shoes",
    tags: ["trail", "running", "lightweight", "waterproof", "cushioned", "breathable"],
    variants: Array.from({ length: 5 }, (_, v) => ({
      id: `var_${index}_${v}`,
      title: `Size ${40 + v} / Black`,
      sku: `TRX-${index}-${40 + v}-BLK`,
      price: 90 + v,
      inventoryQuantity: 5,
      options: { size: `${40 + v}`, color: "Black" },
    })),
  }
}

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

  it("keeps the worst-case prompt within the per-turn token budget", () => {
    // Worst case the pipeline can produce: top-k = 5 products, each with a
    // 150+ word enriched description, plus a full 6-turn conversation.
    const retrievedProducts: RetrievalResult[] = Array.from({ length: 5 }, (_, i) => ({
      product: makeHeavyProduct(i + 1),
      similarityScore: 0.9 - i * 0.05,
    }))
    const history: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `${LONG_DESCRIPTION} (turn ${i + 1})`,
    }))

    const prompt = assembler.assemble({
      query: { rawQuery: "lightweight waterproof trail shoes under $150", embeddingText: "lightweight waterproof trail shoes" },
      retrievedProducts,
      history,
    })

    expect(estimateTokens(prompt)).toBeLessThan(PROMPT_TOKEN_BUDGET)
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
