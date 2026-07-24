import type { ImageRetrievalService } from "../image"
import type {
  IChatLogger,
  IEmbeddingService,
  IImageEmbeddingService,
  ILLMService,
  IRetrievalService,
} from "../interfaces"
import type { PromptAssembler, QueryParser, ResponseFormatter } from "../pipeline"
import type { ChatResponse, ChatSession, Product, RetrievalResult } from "../types"
import { meetsImageSimilarityThreshold } from "../utils"

const TOP_K = 5

// Shown when the best visual match is below the image threshold. A vector
// search always returns neighbours, so a photo of something the catalog does
// not sell (a bicycle) still comes back with its closest shoes — this is what
// the user sees instead of those false matches.
const NO_VISUAL_MATCH_MESSAGE =
  "I couldn't find anything in our catalog that looks like your photo. " +
  "Try a different image, or tell me in words what you're after."

// Hybrid retrieval weights (must sum to 1.0). Image is weighted higher because
// the uploaded photo is the primary intent; the text refines it. Only applied
// when BOTH an image and a text query are present — see mergeResults.
const IMAGE_WEIGHT = 0.6
const TEXT_WEIGHT = 0.4

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

    // Hybrid blend only when the text search actually contributed results; a
    // pure image search (no text query, or text matched nothing) keeps its raw
    // visual similarity scores, so the 0.60 image threshold still means
    // "visually similar" rather than a blend halved by an absent text score.
    const retrieved = (
      textResults.length > 0 ? this.mergeResults(imageResults, textResults) : imageResults
    ).slice(0, TOP_K)

    const prompt = this.promptAssembler.assemble({
      query: parsedQuery,
      retrievedProducts: retrieved,
      history: session.history,
    })

    const llmMessage = await this.llmService.completeImageSearch(prompt)
    const response = this.responseFormatter.format(llmMessage, retrieved)

    // Retrieval confidence is the gate for image search — for BOTH the user
    // reply and the analytics signal. Unlike text (where ResponseFormatter
    // trusts the LLM's RECOMMENDED trailer to decide relevance), a vector search
    // always returns the nearest neighbours, and the image system prompt tells
    // the model to present them, so it confidently recommends shoes for a photo
    // of a bicycle. The image similarity score is the only thing that actually
    // knows the photo matches nothing, so below the threshold we drop the cards
    // and replace the LLM's message rather than showing false matches.
    //
    // Gate on the best PURE IMAGE score, never the blended one. The 0.42
    // threshold was calibrated on raw image scores; the hybrid blend
    // (0.6·image + 0.4·text) lives on a compressed scale, so testing it against
    // 0.42 would reject good visual matches the instant the user adds any text.
    // "Is the photo something we sell?" is answered by image similarity alone;
    // the text only refines the ranking of what came back.
    const topScore = imageResults[0]?.similarityScore ?? 0
    const similarityThresholdMet = meetsImageSimilarityThreshold(topScore)

    await this.chatLogger.log({
      userId: session.userId,
      sessionId: session.sessionId,
      userQuery: textQuery ?? "(image search)",
      retrievedIds: retrieved.map((r) => r.product.medusaProductId),
      topScore,
      hasResults: similarityThresholdMet,
      categoryHint: parsedQuery.category,
    })

    if (!similarityThresholdMet) {
      return { ...response, message: NO_VISUAL_MATCH_MESSAGE, products: [], hasResults: false }
    }

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

  // Hybrid merge: blend the two modalities into one score per product,
  // final = 0.6·image + 0.4·text (a modality a product is absent from counts as
  // 0, so a product matched by BOTH image and text ranks above one matched by
  // only one — the point of hybrid retrieval). De-duplicated by product id
  // (keeping the higher score within each modality), sorted by the blend.
  private mergeResults(
    imageResults: RetrievalResult[],
    textResults: RetrievalResult[]
  ): RetrievalResult[] {
    const merged = new Map<string, { product: Product; image: number; text: number }>()

    const accumulate = (results: RetrievalResult[], modality: "image" | "text") => {
      for (const { product, similarityScore } of results) {
        const entry = merged.get(product.id) ?? { product, image: 0, text: 0 }
        entry[modality] = Math.max(entry[modality], similarityScore)
        merged.set(product.id, entry)
      }
    }
    accumulate(imageResults, "image")
    accumulate(textResults, "text")

    return [...merged.values()]
      .map(({ product, image, text }) => ({
        product,
        similarityScore: IMAGE_WEIGHT * image + TEXT_WEIGHT * text,
      }))
      .sort((a, b) => b.similarityScore - a.similarityScore)
  }
}
