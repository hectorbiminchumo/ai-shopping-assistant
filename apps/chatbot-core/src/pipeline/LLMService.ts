import OpenAI from "openai"
import { aiConfig, getOpenAiClient } from "../config"
import { LLMError } from "../errors"
import { formatProductsForPrompt } from "../utils"
import type { ILLMService } from "../interfaces"
import type { RetrievalResult } from "../types"

const SYSTEM_PROMPT =
  "You are acting as a sportswear shopping assistant. You are answering questions on Vectra's website, particularly questions related to products from the catalog below and explain your reasoning concisely. Be professional and engaging, as if talking to a potential client. If you don't know the answer to any question, let the user know you'll find out and get back to them personally"

export class LLMService implements ILLMService {
  private readonly client: OpenAI

  constructor() {
    this.client = getOpenAiClient()
  }

  async generateResponse(query: string, products: RetrievalResult[]): Promise<string> {
    const productContext = formatProductsForPrompt(products.map((r) => r.product))
    const prompt = [
      "Catalog matches:",
      productContext || "(no matching products found)",
      `User: ${query}`,
    ].join("\n")
    return this.complete(prompt)
  }

  async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: aiConfig.openaiModel,
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
