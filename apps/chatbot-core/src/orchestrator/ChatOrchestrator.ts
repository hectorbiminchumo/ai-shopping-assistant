import { HISTORY_TURNS } from "../pipeline/PromptAssembler"
import type { IChatLogger, IEmbeddingService, ILLMService, IRetrievalService } from "../interfaces"
import type { PromptAssembler, QueryParser, Reranker, ResponseFormatter } from "../pipeline"
import type { ChatResponse, ChatSession, ExplicitFilters } from "../types"

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

  async handle(
    rawQuery: string,
    session: ChatSession,
    filters?: ExplicitFilters
  ): Promise<ChatResponse> {
    // Known categories let the parser emit a SQL pre-filter (e.g. "shoes"
    // in the query → only shoe rows are vector-searched)
    const knownCategories = await this.retrievalService.listCategories()

    // Follow-ups like "for women" carry no meaning on their own: condense
    // them with the history into a standalone query before embedding
    const standaloneQuery = await this.llmService.condenseQuery(rawQuery, session.history)
    const parsedQuery = this.queryParser.parse(standaloneQuery, knownCategories)
    // Explicit filters from the client override the same fields inferred from text
    const mergedQuery = filters ? { ...parsedQuery, ...filters } : parsedQuery
    const embedding = await this.embeddingService.embedText(mergedQuery.rawQuery)
    const candidates = await this.retrievalService.search(embedding, mergedQuery, RETRIEVE_K)
    const retrieved = this.reranker.rerank(mergedQuery, candidates, RERANK_K)

    const prompt = this.promptAssembler.assemble({
      // The LLM answers the user's actual message; only retrieval uses the
      // condensed rewrite
      query: { ...mergedQuery, rawQuery },
      retrievedProducts: retrieved,
      history: session.history,
    })

    const llmMessage = await this.llmService.complete(prompt)
    const response = this.responseFormatter.format(llmMessage, retrieved)

    // W3 spec: return the updated history so the client can send it back on
    // the next turn, trimmed to the same window the prompt uses
    response.history = [
      ...session.history,
      { role: "user" as const, content: rawQuery },
      { role: "assistant" as const, content: response.message },
    ].slice(-HISTORY_TURNS)

    const appliedFilters: ExplicitFilters = {
      ...(mergedQuery.category  !== undefined && { category: mergedQuery.category }),
      ...(mergedQuery.priceMin  !== undefined && { priceMin: mergedQuery.priceMin }),
      ...(mergedQuery.priceMax  !== undefined && { priceMax: mergedQuery.priceMax }),
      ...(mergedQuery.size      !== undefined && { size: mergedQuery.size }),
    }
    if (Object.keys(appliedFilters).length > 0) {
      response.appliedFilters = appliedFilters
    }

    // Analytics logging is best-effort: a Supabase hiccup here must never
    // discard an already-generated, valid chat response.
    try {
      await this.chatLogger.log({
        userId: session.userId,
        sessionId: session.sessionId,
        userQuery: rawQuery,
        retrievedIds: retrieved.map((r) => r.product.medusaProductId),
        topScore: retrieved[0]?.similarityScore ?? 0,
        hasResults: response.similarityThresholdMet,
        categoryHint: parsedQuery.category,
      })
    } catch (err) {
      console.error("[ChatOrchestrator] chat_logs write failed:", err)
    }

    return response
  }
}
