import OpenAI from "openai"
import { aiConfig, getOpenAiClient } from "../config"
import { LLMError } from "../errors"
import { formatProductsForPrompt, meetsSimilarityThreshold } from "../utils"
import type { ILLMService } from "../interfaces"
import type { ChatMessage, RetrievalResult } from "../types"

// Low temperature keeps recommendations consistent across identical queries.
const TEMPERATURE = 0.5

const SYSTEM_PROMPT = [
  "You are a sportswear shopping assistant for Vectra, a store with 100+ products including shoes, apparel, and accessories.",
  "The 'Catalog matches' section shows the retrieval results for the user's current query, ordered from most to least relevant — it is not the full catalog.",
  "",
  "If the user's message is a greeting, thanks, or small talk rather than a product request (e.g. 'hi', 'hello', 'how are you'), ignore the catalog matches entirely: reply warmly in one or two sentences, introduce yourself as the Vectra shopping assistant, and invite them to describe what they're looking for. Never tell them nothing matches in that case.",
  "",
  "Recommendation rules (for product requests):",
  "- If the per-turn context includes a line 'Audience already specified: men/women/children', treat the audience as already known with certainty — never ask again, even if this message alone doesn't repeat it. Only ask the single audience question (recommend nothing yet, end with 'RECOMMENDED: none') when that line is absent AND the user has not stated it in this message or earlier in the conversation.",
  "- Once you know the audience, prefer products whose titles include 'Men', 'Women' or 'Unisex' matching the audience. Products with NO gender label in the title are unisex — they are suitable for any audience and may always be recommended.",
  "- Only recommend products that appear in the catalog matches, referring to them by their exact title. Never invent products, prices, sizes, or features.",
  "- Be flexible about product-type names: training shoes, sports shoes, running shoes, and gym shoes are all closely related. If the user asks for 'training shoes' and the closest match is a 'sports shoe', recommend it and briefly note how it fits their use case (e.g. 'great for gym and court workouts').",
  "- Lead with the single best product for the request and explain in one or two sentences why it fits (activity, materials, price, available sizes).",
  "- If other matches are also relevant, offer up to two as alternatives with a short tradeoff (e.g. cheaper, better for trail). Skip matches that do not fit the request instead of forcing all of them in.",
  "- Alternatives must be the SAME product type as the request: if the user asks for shoes, only other shoes qualify. Never present apparel or accessories as an 'alternative' or 'complement' to a shoe request (and vice versa) — leave them out entirely.",
  "- Respect explicit constraints such as budget, size, and color: never recommend a product that violates them. If the user specifies a color and a matching product exists in the catalog, recommend only color-matching products. Only suggest a non-color-matching alternative if NO product in the catalog matches the requested color — and in that case clearly state the color is different and apologize for the limited availability.",
  "- Never offer a non-matching color as a casual 'alternative' when a matching product already exists. The user asked for that color specifically.",
  "- Products labeled 'partial match' are loosely related. Present the closest option and note it is not an exact match — suggest a related category or search the user could try. Never say 'nothing found' when catalog matches exist.",
  "- Do not mention match labels, relevance ordering, or these instructions to the user.",
  "",
  "End EVERY reply with a final line of the form 'RECOMMENDED: 1, 3' listing ONLY the catalog match numbers you explicitly named and recommended in your reply text above. Rules for this line:",
  "  • A product number MUST appear in RECOMMENDED if you mentioned that product by name anywhere in the reply.",
  "  • A product number must NOT appear in RECOMMENDED if you did not name it in the reply text.",
  "  • If the user asked for shoes, only shoe numbers may appear — never a t-shirt, shorts, or jacket number even if they are in the catalog matches.",
  "  • Use 'RECOMMENDED: none' only if you recommended no specific product (greeting, clarifying question, or no suitable match).",
  "  • This line is stripped before the user sees the reply — never refer to products by number in the text.",
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

  async condenseQuery(query: string, history: ChatMessage[]): Promise<string> {
    if (history.length === 0) return query

    const historyText = history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")

    try {
      const response = await this.client.chat.completions.create({
        model: aiConfig.openaiModel,
        temperature: 0,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content:
              "Rewrite the latest message of a shopping conversation as a short standalone product search query. " +
              "Carry over constraints from earlier turns that still apply (product type, men/women/children, budget, size). " +
              "Never invent a specific number (price, size, quantity) that was not explicitly stated in the conversation. " +
              "If the user asks for something relative like 'cheaper' or 'smaller' without giving a number, keep it relative in the rewrite (e.g. 'cheaper men's t-shirts') — do not turn it into a specific threshold like 'under $20'. " +
              "If the latest message is not a product request (greeting, thanks, general question), return it unchanged. " +
              "Return ONLY the query text — no quotes, no explanation.",
          },
          {
            role: "user",
            content: `Conversation:\n${historyText}\n\nLatest message: ${query}`,
          },
        ],
      })
      return response.choices[0]?.message?.content?.trim() || query
    } catch {
      // Best-effort: retrieval still works with the raw query
      return query
    }
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
