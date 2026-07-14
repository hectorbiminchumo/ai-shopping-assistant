import { HISTORY_TURNS } from "../pipeline/PromptAssembler"
import type { IChatLogger, IEmbeddingService, ILLMService, IRetrievalService } from "../interfaces"
import type { PromptAssembler, QueryParser, Reranker, ResponseFormatter } from "../pipeline"
import type {
  ChatResponse,
  ChatSession,
  ChatStreamEvent,
  ExplicitFilters,
  ParsedQuery,
  RetrievalResult,
} from "../types"

// Retrieve more candidates than needed so the re-ranker has a meaningful set
// to work with; RERANK_K is the final count passed to the LLM.
const RETRIEVE_K = 10
const RERANK_K = 5

// Chars of the streamed reply to always hold back from the client. The
// "RECOMMENDED: 1, 3" trailer lives at the very end of the LLM's raw output —
// withholding this tail means it's never emitted as a visible delta; the
// "done" event's already-stripped response.message supersedes it entirely.
const STREAM_HOLDBACK_CHARS = 40

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
    const { prompt, retrieved, parsedQuery, mergedQuery } = await this.prepare(
      rawQuery,
      session,
      filters
    )

    const llmMessage = await this.llmService.complete(prompt)
    const response = this.responseFormatter.format(llmMessage, retrieved)
    this.finalize(response, rawQuery, session, mergedQuery)
    await this.logInteraction(rawQuery, session, retrieved, parsedQuery, response)

    return response
  }

  // Same pipeline as handle(), but streams the LLM reply as it's generated.
  // "delta" events give the storefront a live-typing effect; the trailing
  // STREAM_HOLDBACK_CHARS are never emitted as deltas — the RECOMMENDED
  // trailer can only be parsed once the full reply is known, so the final
  // "done" event's already-formatted response is what the client renders as
  // the source of truth, superseding whatever partial text was streamed.
  async *handleStream(
    rawQuery: string,
    session: ChatSession,
    filters?: ExplicitFilters
  ): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const { prompt, retrieved, parsedQuery, mergedQuery } = await this.prepare(
      rawQuery,
      session,
      filters
    )

    let fullText = ""
    let emittedLength = 0
    for await (const delta of this.llmService.stream(prompt)) {
      fullText += delta
      const safeLength = Math.max(0, fullText.length - STREAM_HOLDBACK_CHARS)
      if (safeLength > emittedLength) {
        yield { type: "delta", text: fullText.slice(emittedLength, safeLength) }
        emittedLength = safeLength
      }
    }

    const response = this.responseFormatter.format(fullText, retrieved)
    this.finalize(response, rawQuery, session, mergedQuery)
    await this.logInteraction(rawQuery, session, retrieved, parsedQuery, response)

    yield { type: "done", response }
  }

  // Steps shared by handle() and handleStream(): condense the follow-up into
  // a standalone query, parse + merge explicit filters, retrieve, rerank, and
  // assemble the final prompt. Everything after this point differs only in
  // how the LLM reply is obtained (complete() vs stream()).
  private async prepare(
    rawQuery: string,
    session: ChatSession,
    filters?: ExplicitFilters
  ): Promise<{
    prompt: string
    retrieved: RetrievalResult[]
    parsedQuery: ParsedQuery
    mergedQuery: ParsedQuery
  }> {
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

    return { prompt, retrieved, parsedQuery, mergedQuery }
  }

  // W3 spec: return the updated history so the client can send it back on
  // the next turn, trimmed to the same window the prompt uses. Also surfaces
  // which filters (explicit + inferred) actually applied, for the storefront's
  // active-filter tags.
  private finalize(
    response: ChatResponse,
    rawQuery: string,
    session: ChatSession,
    mergedQuery: ParsedQuery
  ): void {
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
  }

  // Analytics logging is best-effort: a Supabase hiccup here must never
  // discard an already-generated, valid chat response.
  private async logInteraction(
    rawQuery: string,
    session: ChatSession,
    retrieved: RetrievalResult[],
    parsedQuery: ParsedQuery,
    response: ChatResponse
  ): Promise<void> {
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
  }
}
