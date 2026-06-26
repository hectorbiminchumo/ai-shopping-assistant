const { QueryParser } = require('./dist/pipeline/QueryParser')
const { PromptAssembler } = require('./dist/pipeline/PromptAssembler')
const { ResponseFormatter } = require('./dist/pipeline/ResponseFormatter')
const { ChatOrchestrator } = require('./dist/orchestrator/ChatOrchestrator')

// Mock embedding service
const embeddingService = {
  embedText: async (text) => {
    console.log('embedText called with:', text)
    return Array(10).fill(0).map((_, i) => Math.random())
  }
}

// Mock retrieval service
const retrievalService = {
  search: async (embedding, parsedQuery, topK) => {
    console.log('retrieval.search called with parsedQuery:', parsedQuery.rawQuery)
    const product = {
      id: 'prod_1',
      medusaProductId: 'medusa_1',
      title: 'Trail Runner X',
      description: 'A lightweight trail running shoe.',
      tags: ['trail'],
      variants: [{ id: 'var_1', title: '42', sku: 'TRX-42', price: 90, inventoryQuantity: 5, options: {} }]
    }
    return [{ product, similarityScore: 0.82 }]
  }
}

// Mock LLM service
const llmService = {
  complete: async (prompt) => {
    console.log('LLM complete called. Prompt length:', prompt.length)
    return 'Trail Runner X is a great match. It is lightweight and suitable for trail running.'
  },
  stream: async function* (prompt) {
    const text = await this.complete(prompt)
    const parts = text.split(/(?<=[.!?])\s+/)
    for (const part of parts) yield part
  }
}

// Mock chat logger
const chatLogger = { log: async (entry) => console.log('chatLogger.log', entry) }

async function main() {
  const orchestrator = new ChatOrchestrator(
    new QueryParser(),
    embeddingService,
    retrievalService,
    new PromptAssembler(),
    llmService,
    new ResponseFormatter(),
    chatLogger
  )

  const session = { sessionId: 'session_1', history: [] }
  const response = await orchestrator.handle('trail shoes size 42', session)

  console.log('\n=== Chat Response ===')
  console.log('Message:', response.message)
  console.log('Has results:', response.hasResults)
  console.log('Products:', response.products)
}

main().catch((err) => { console.error(err); process.exit(1) })
