import { OpenAIError, RateLimitError } from "openai"
import { aiConfig, getOpenAiClient } from "../config"
import { ChatbotError } from "../errors"
import type { Product } from "../types"

function formatProductContext(products: Product[]): string {
  if (products.length === 0) {
    return "No hay productos coincidentes disponibles."
  }

  return products
    .map((product) => {
      const prices = product.variants.map((variant) => variant.price)
      const priceRange =
        prices.length > 0
          ? `$${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`
          : "precio no disponible"
      const category = product.category
        ? `Categoría: ${product.category}. `
        : ""

      return `• ${product.title} (${priceRange}). ${category}${product.description}`
    })
    .join("\n")
}

function buildPrompt(query: string, products: Product[]): string {
  const productContext = formatProductContext(products)

  return [
    "Eres un asistente de compras de ropa deportiva. Recomienda productos del catálogo y explica por qué cada uno es una buena elección.",
    "Responde en español en un estilo amigable, claro y directo.",
    "Utiliza los resultados de búsqueda a continuación para recomendar los productos más relevantes.",
    "",
    "Consulta del usuario:",
    query,
    "",
    "Productos disponibles:",
    productContext,
    "",
    "Entrega una respuesta natural recomendando hasta tres productos relevantes y explicando por qué cada uno es una buena elección.",
  ].join("\n")
}

function mapOpenAiError(error: unknown): ChatbotError {
  if (error instanceof RateLimitError) {
    return new ChatbotError(
      "OpenAI rate limit exceeded. Por favor intenta de nuevo en unos segundos.",
      error,
    )
  }

  if (error instanceof OpenAIError) {
    return new ChatbotError(`OpenAI API error: ${error.message}`, error)
  }

  if (error instanceof Error) {
    return new ChatbotError(`OpenAI error: ${error.message}`, error)
  }

  return new ChatbotError("OpenAI returned an unknown error")
}

export async function generateResponse(
  promptOrQuery: string,
  products: Product[] = [],
): Promise<string> {
  const client = getOpenAiClient()
  const prompt = products.length
    ? buildPrompt(promptOrQuery, products)
    : promptOrQuery

  try {
    const completion = await client.chat.completions.create({
      model: aiConfig.openaiModel,
      messages: [
        {
          role: "system",
          content: "Eres un asistente de compras de ropa deportiva. Recomienda productos del catálogo y explica por qué cada uno es una buena elección.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const content = completion.choices?.[0]?.message?.content?.trim()

    if (!content) {
      throw new ChatbotError("OpenAI respondió sin contenido")
    }

    return content
  } catch (error: unknown) {
    throw mapOpenAiError(error)
  }
}

export async function* streamResponse(
  promptOrQuery: string,
  products: Product[] = [],
): AsyncIterable<string> {
  const client = getOpenAiClient()
  const prompt = products.length
    ? buildPrompt(promptOrQuery, products)
    : promptOrQuery

  try {
    const stream = await client.chat.completions.create({
      model: aiConfig.openaiModel,
      messages: [
        {
          role: "system",
          content: "Eres un asistente de compras de ropa deportiva. Recomienda productos del catálogo y explica por qué cada uno es una buena elección.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
      stream: true,
    })

    for await (const part of stream as AsyncIterable<any>) {
      const delta = part?.choices?.[0]?.delta
      const text = delta?.content ?? delta?.message?.content
      if (text) {
        yield String(text)
      }
    }
  } catch (error: unknown) {
    throw mapOpenAiError(error)
  }
}
