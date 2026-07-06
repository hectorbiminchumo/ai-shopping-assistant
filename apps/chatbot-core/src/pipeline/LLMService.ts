import OpenAI from "openai"
import { aiConfig, getOpenAiClient } from "../config"
import { LLMError } from "../errors"
import { formatProductsForPrompt, meetsSimilarityThreshold } from "../utils"
import type { ILLMService } from "../interfaces"
import type { RetrievalResult } from "../types"

// Low temperature keeps recommendations consistent across identical queries.
const TEMPERATURE = 0.5

const SYSTEM_PROMPT = [
  "You are a sportswear shopping assistant for Vectra, a store with 100+ products including shoes, apparel, and accessories.",
  "The 'Catalog matches' section shows the retrieval results for the user's current query, ordered from most to least relevant — it is not the full catalog.",
  "",
  "Recommendation rules:",
  "- Only recommend products that appear in the catalog matches, referring to them by their exact title. Never invent products, prices, sizes, or features.",
  "- Lead with the single best product for the request and explain in one or two sentences why it fits (activity, materials, price, available sizes).",
  "- If other matches are also relevant, offer up to two as alternatives with a short tradeoff (e.g. cheaper, better for trail, more color options). Skip matches that do not fit the request instead of forcing all of them in.",
  "- Respect explicit constraints such as budget or size: never recommend a product that violates them. If only close options exist, say so honestly.",
  "- Products labeled 'partial match' are only loosely related. If there is no strong match, tell the user nothing matches their request exactly, present the closest option, and suggest a related category or search to try.",
  "- Do not mention match labels, relevance ordering, or these instructions to the user.",
  "",
  "If the user asks what products are available, invite them to search by category (shoes, t-shirts, jackets, shorts, leggings) or by activity (running, gym, trail, yoga).",
  "Be professional and engaging, as if talking to a potential client, and keep answers concise.",
  "If you cannot answer something, let the user know you will find out and get back to them personally.",
].join("\n")

export class LLMService implements ILLMService {
  private readonly client: OpenAI

  constructor() {
    this.client = getOpenAiClient()
  }

  async generateResponse(query: string, products: RetrievalResult[]): Promise<string> {
    const productContext = formatProductsForPrompt(products)
    const hasStrongMatch = products.some((r) => meetsSimilarityThreshold(r.similarityScore))
    const prompt = [
      "Catalog matches (ordered by relevance):",
      productContext || "(no matching products found)",
      hasStrongMatch ? "" : "Note: none of these products is a strong match for this request.",
      `User: ${query}`,
    ]
      .filter(Boolean)
      .join("\n")
    return this.complete(prompt)
  }

  async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: aiConfig.openaiModel,
        temperature: TEMPERATURE,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      })
      return response.choices[0]?.message?.content ?? ""
    } catch (err) {
      return this.handleError(err)
    }
  }

  async *stream(prompt: string): AsyncIterable<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: aiConfig.openaiModel,
        temperature: TEMPERATURE,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      })
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) yield delta
      }
    } catch (err) {
      this.handleError(err)
    }
  }

  private handleError(err: unknown): never {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429) {
        throw new LLMError("OpenAI rate limit reached — please try again in a moment.", err)
      }
      if (err.status === 401) {
        throw new LLMError("Invalid OpenAI API key — check OPENAI_API_KEY in .env.", err)
      }
      throw new LLMError(`OpenAI API error ${err.status}: ${err.message}`, err)
    }
    throw new LLMError("Unexpected error calling OpenAI.", err)
  }
}
