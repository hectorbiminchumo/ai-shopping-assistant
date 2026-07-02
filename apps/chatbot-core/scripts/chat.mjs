import readline from "readline"
import { ChatOrchestrator } from "../dist/orchestrator/ChatOrchestrator.js"
import { QueryParser } from "../dist/pipeline/QueryParser.js"
import { EmbeddingService } from "../dist/pipeline/EmbeddingService.js"
import { RetrievalService } from "../dist/pipeline/RetrievalService.js"
import { PromptAssembler } from "../dist/pipeline/PromptAssembler.js"
import { LLMService } from "../dist/pipeline/LLMService.js"
import { ResponseFormatter } from "../dist/pipeline/ResponseFormatter.js"

const noopLogger = { log: async () => {} }

const orchestrator = new ChatOrchestrator(
  new QueryParser(),
  new EmbeddingService(),
  new RetrievalService(),
  new PromptAssembler(),
  new LLMService(),
  new ResponseFormatter(),
  noopLogger
)

const session = {
  userId: "demo-user",
  sessionId: `demo-${Date.now()}`,
  history: [],
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

console.log("Vectra AI — escribe tu pregunta (Ctrl+C para salir)\n")

function ask() {
  rl.question("Tú: ", async (query) => {
    if (!query.trim()) return ask()

    try {
      const response = await orchestrator.handle(query, session)

      console.log(`\nVectra: ${response.message}`)

      if (response.hasResults && response.products.length > 0) {
        console.log("\nProductos encontrados:")
        response.products.forEach((p) => {
          const price = p.priceMin != null ? `$${p.priceMin}–$${p.priceMax}` : "precio n/d"
          console.log(`  · ${p.title} (${price}) [score: ${p.similarityScore.toFixed(2)}]`)
        })
      }

      console.log()

      session.history.push({ role: "user", content: query })
      session.history.push({ role: "assistant", content: response.message })
    } catch (err) {
      console.error(`\nError: ${err.message}\n`)
    }

    ask()
  })
}

ask()
