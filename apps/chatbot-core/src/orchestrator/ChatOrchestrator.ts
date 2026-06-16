import type { IChatLogger, IEmbeddingService, ILLMService, IRetrievalService } from "../interfaces"
import type { PromptAssembler, QueryParser, ResponseFormatter } from "../pipeline"
import type { ChatResponse, ChatSession } from "../types"

const TOP_K = 5

// Coordinates Feature 1 (conversational/semantic search) end to end.
// Implements no business logic itself — each step is delegated to a
// single-responsibility collaborator injected via the constructor
// (Dependency Inversion), so any step can be swapped or mocked in tests.
export class ChatOrchestrator {
  constructor(
    private readonly queryParser: QueryParser,
    private readonly embeddingService: IEmbeddingService,
    private readonly retrievalService: IRetrievalService,
    private readonly promptAssembler: PromptAssembler,
    private readonly llmService: ILLMService,
    private readonly responseFormatter: ResponseFormatter,
    private readonly chatLogger: IChatLogger
  ) {}

  async handle(rawQuery: string, session: ChatSession): Promise<ChatResponse> {
    const parsedQuery = this.queryParser.parse(rawQuery)
    const embedding = await this.embeddingService.embedText(parsedQuery.rawQuery)
    const retrieved = await this.retrievalService.search(embedding, parsedQuery, TOP_K)

    const prompt = this.promptAssembler.assemble({
      query: parsedQuery,
      retrievedProducts: retrieved,
      history: session.history,
    })

    const llmMessage = await this.llmService.complete(prompt)
    const response = this.responseFormatter.format(llmMessage, retrieved)

    await this.chatLogger.log({
      userId: session.userId,
      sessionId: session.sessionId,
      userQuery: rawQuery,
      retrievedIds: retrieved.map((r) => r.product.medusaProductId),
      topScore: retrieved[0]?.similarityScore ?? 0,
      hasResults: response.hasResults,
      categoryHint: parsedQuery.category,
    })

    return response
  }
}
