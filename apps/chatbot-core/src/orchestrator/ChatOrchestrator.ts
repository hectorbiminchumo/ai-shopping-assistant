import type { IChatLogger, IEmbeddingService, ILLMService, IRetrievalService } from "../interfaces"
import type { PromptAssembler, QueryParser, Reranker, ResponseFormatter } from "../pipeline"
import type { ChatResponse, ChatSession } from "../types"

// Retrieve more candidates than needed so the re-ranker has a meaningful set
// to work with; RERANK_K is the final count passed to the LLM.
const RETRIEVE_K = 10
const RERANK_K = 5

// Coordinates Feature 1 (conversational/semantic search) end to end.
// Implements no business logic itself — each step is delegated to a
// single-responsibility collaborator injected via the constructor
// (Dependency Inversion), so any step can be swapped or mocked in tests.
export class ChatOrchestrator {
  constructor(
    private readonly queryParser: QueryParser,
    private readonly embeddingService: IEmbeddingService,
    private readonly retrievalService: IRetrievalService,
    private readonly reranker: Reranker,
    private readonly promptAssembler: PromptAssembler,
    private readonly llmService: ILLMService,
    private readonly responseFormatter: ResponseFormatter,
    private readonly chatLogger: IChatLogger
  ) {}

  async handle(rawQuery: string, session: ChatSession): Promise<ChatResponse> {
    // Known categories let the parser emit a SQL pre-filter (e.g. "shoes"
    // in the query → only shoe rows are vector-searched)
    const knownCategories = await this.retrievalService.listCategories()
    // Follow-ups like "for women" carry no meaning on their own: condense
    // them with the history into a standalone query before embedding
    const standaloneQuery = await this.llmService.condenseQuery(rawQuery, session.history)
    const parsedQuery = this.queryParser.parse(standaloneQuery, knownCategories)
    const embedding = await this.embeddingService.embedText(parsedQuery.rawQuery)
    const candidates = await this.retrievalService.search(embedding, parsedQuery, RETRIEVE_K)
    const retrieved = this.reranker.rerank(parsedQuery, candidates, RERANK_K)
    // TEMPORAL — quitar después
console.log("Before rerank:", candidates.map(r => ({ title: r.product.title, score: r.similarityScore })))
console.log("After rerank:", retrieved.map(r => ({ title: r.product.title, score: r.similarityScore })))

    const prompt = this.promptAssembler.assemble({
      // The LLM answers the user's actual message; only retrieval uses the
      // condensed rewrite
      query: { ...parsedQuery, rawQuery },
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
