import type { ImageRetrievalService } from "../image"
import type {
  IChatLogger,
  IEmbeddingService,
  IImageEmbeddingService,
  ILLMService,
  IRetrievalService,
} from "../interfaces"
import type { PromptAssembler, QueryParser, ResponseFormatter } from "../pipeline"
import type { ChatResponse, ChatSession, RetrievalResult } from "../types"
import { meetsImageSimilarityThreshold } from "../utils"

const TOP_K = 5

// Coordinates Feature 2 (image-based search). Runs the image search and an
// optional text search in parallel, then merges the results before the LLM
// call (hybrid retrieval) — implements no business logic of its own.
export class ImageOrchestrator {
  constructor(
    private readonly queryParser: QueryParser,
    private readonly imageEmbeddingService: IImageEmbeddingService,
    private readonly imageRetrievalService: ImageRetrievalService,
    private readonly embeddingService: IEmbeddingService,
    private readonly retrievalService: IRetrievalService,
    private readonly promptAssembler: PromptAssembler,
    private readonly llmService: ILLMService,
    private readonly responseFormatter: ResponseFormatter,
    private readonly chatLogger: IChatLogger
  ) {}

  async handle(
    imageBuffer: Buffer,
    textQuery: string | undefined,
    session: ChatSession
  ): Promise<ChatResponse> {
    const parsedQuery = this.queryParser.parse(textQuery ?? "")

    const [imageResults, textResults] = await Promise.all([
      this.searchByImage(imageBuffer),
      textQuery ? this.searchByText(parsedQuery.embeddingText, parsedQuery) : Promise.resolve([]),
    ])

    const retrieved = this.mergeResults(imageResults, textResults).slice(0, TOP_K)

    const prompt = this.promptAssembler.assemble({
      query: parsedQuery,
      retrievedProducts: retrieved,
      history: session.history,
    })

    const llmMessage = await this.llmService.complete(prompt)
    const response = this.responseFormatter.format(llmMessage, retrieved)

    // Lost-sale signal for the analytics dashboard is retrieval confidence, not
    // whether the LLM chose to reply: a query whose best visual match is below
    // the image threshold is a catalog gap, even if the LLM offered the closest
    // option anyway. (See ResponseFormatter for the text-side equivalent.)
    const topScore = retrieved[0]?.similarityScore ?? 0
    const similarityThresholdMet = retrieved.length > 0 && meetsImageSimilarityThreshold(topScore)

    await this.chatLogger.log({
      userId: session.userId,
      sessionId: session.sessionId,
      userQuery: textQuery ?? "(image search)",
      retrievedIds: retrieved.map((r) => r.product.medusaProductId),
      topScore,
      hasResults: similarityThresholdMet,
      categoryHint: parsedQuery.category,
    })

    return response
  }

  private async searchByImage(imageBuffer: Buffer): Promise<RetrievalResult[]> {
    const embedding = await this.imageEmbeddingService.embedImage(imageBuffer)
    return this.imageRetrievalService.search(embedding, TOP_K)
  }

  private async searchByText(
    embeddingText: string,
    parsedQuery: ReturnType<QueryParser["parse"]>
  ): Promise<RetrievalResult[]> {
    const embedding = await this.embeddingService.embedText(embeddingText)
    return this.retrievalService.search(embedding, parsedQuery, TOP_K)
  }

  private mergeResults(
    imageResults: RetrievalResult[],
    textResults: RetrievalResult[]
  ): RetrievalResult[] {
    const byProductId = new Map<string, RetrievalResult>()

    for (const result of [...imageResults, ...textResults]) {
      const existing = byProductId.get(result.product.id)
      if (!existing || result.similarityScore > existing.similarityScore) {
        byProductId.set(result.product.id, result)
      }
    }

    return [...byProductId.values()].sort((a, b) => b.similarityScore - a.similarityScore)
  }
}
