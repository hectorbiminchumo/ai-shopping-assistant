import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// See ../mocks/chatbot-core.mock.ts for why this is required lazily from
// *inside* the factory instead of imported at the top of this file.
jest.mock("@dtc/chatbot-core", () =>
  require("../mocks/chatbot-core.mock").mockChatbotCore()
)

// Mocks the multer module itself (not @dtc/chatbot-core) so the
// imageSearchUpload middleware's error-translation branches can be driven
// directly, without needing real multipart bytes. Keeps the real
// MulterError class via jest.requireActual so `err instanceof
// multer.MulterError` inside the middleware still resolves correctly.
jest.mock("multer", () => {
  const actualMulter = jest.requireActual("multer")
  const single = jest.fn()
  const upload = { single: jest.fn(() => single) }
  const multerFn = jest.fn(() => upload) as unknown as jest.Mock & {
    MulterError: typeof actualMulter.MulterError
    memoryStorage: typeof actualMulter.memoryStorage
  }
  multerFn.MulterError = actualMulter.MulterError
  multerFn.memoryStorage = actualMulter.memoryStorage
  return multerFn
})

import { POST } from "../../src/api/store/chat/image-search/route"
import { imageSearchUpload } from "../../src/api/middlewares"
import { ChatbotError, ImageOrchestrator } from "@dtc/chatbot-core"
import multer from "multer"

const MockedImageOrchestrator = ImageOrchestrator as unknown as jest.Mock

interface FakeFile {
  buffer: Buffer
  mimetype: string
  size: number
  originalname: string
}

function buildReq(body: unknown, file?: FakeFile): MedusaRequest {
  return { body, file } as Partial<MedusaRequest> as MedusaRequest
}

function buildRes(): MedusaResponse & { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
  return res as Partial<MedusaResponse> as MedusaResponse & {
    status: jest.Mock
    json: jest.Mock
  }
}

const fakeImage: FakeFile = {
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
  mimetype: "image/jpeg",
  size: 3,
  originalname: "shoe.jpg",
}

describe("POST /store/chat/image-search", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it("returns 200 with the orchestrator's response for a valid upload with no text query", async () => {
    const mockHandle = jest.fn().mockResolvedValue({
      message: "Here's a visually similar sneaker.",
      products: [
        {
          id: "prod_1",
          medusaProductId: "medusa_prod_1",
          title: "Trail Runner",
          similarityScore: 0.82,
        },
      ],
      hasResults: true,
      similarityThresholdMet: true,
    })
    MockedImageOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

    const req = buildReq({ sessionId: "session-1" }, fakeImage)
    const res = buildRes()

    await POST(req, res)

    expect(mockHandle).toHaveBeenCalledWith(fakeImage.buffer, undefined, {
      sessionId: "session-1",
      history: [],
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Here's a visually similar sneaker.", hasResults: true })
    )
  })

  it("forwards an optional text query as the hybrid search term", async () => {
    const mockHandle = jest.fn().mockResolvedValue({
      message: "Here's a match for your photo and description.",
      products: [],
      hasResults: true,
      similarityThresholdMet: true,
    })
    MockedImageOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

    const req = buildReq({ sessionId: "session-1", query: "red running shoes" }, fakeImage)
    const res = buildRes()

    await POST(req, res)

    expect(mockHandle).toHaveBeenCalledWith(fakeImage.buffer, "red running shoes", {
      sessionId: "session-1",
      history: [],
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("returns 400 when no image file is attached", async () => {
    const req = buildReq({ sessionId: "session-1" })
    const res = buildRes()

    await POST(req, res)

    expect(MockedImageOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Invalid request body",
        errors: expect.arrayContaining([expect.any(String)]),
      })
    )
  })

  it("returns 400 when sessionId is missing", async () => {
    const req = buildReq({}, fakeImage)
    const res = buildRes()

    await POST(req, res)

    expect(MockedImageOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 400 when sessionId is empty", async () => {
    const req = buildReq({ sessionId: "   " }, fakeImage)
    const res = buildRes()

    await POST(req, res)

    expect(MockedImageOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 400 when query is provided but empty", async () => {
    const req = buildReq({ sessionId: "session-1", query: "   " }, fakeImage)
    const res = buildRes()

    await POST(req, res)

    expect(MockedImageOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 500 with the ChatbotError message when the orchestrator throws a ChatbotError", async () => {
    const mockHandle = jest.fn().mockRejectedValue(new ChatbotError("Voyage API is unavailable"))
    MockedImageOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

    const req = buildReq({ sessionId: "session-1" }, fakeImage)
    const res = buildRes()

    await POST(req, res)

    // Intentionally 500, not the 502 /search/chat and /search/semantic use
    // for the same kind of pipeline failure — see apps/backend/README.md.
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: "Voyage API is unavailable" })
  })

  it("returns 500 with a generic message when the orchestrator throws an unknown error", async () => {
    const mockHandle = jest.fn().mockRejectedValue(new Error("boom"))
    MockedImageOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

    const req = buildReq({ sessionId: "session-1" }, fakeImage)
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: "Image search failed" })
  })
})

describe("imageSearchUpload middleware", () => {
  const mockedMulter = multer as unknown as jest.Mock & { MulterError: typeof multer.MulterError }
  // middlewares.ts builds `imageUpload = multer({...})` once at module load,
  // and the mock factory's `upload`/`single` are closure singletons — every
  // call to the mocked `multer()` returns the same objects, so this reaches
  // the exact `single` mock imageSearchUpload invokes internally.
  const single = mockedMulter().single("image") as jest.Mock

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("returns 413 when multer reports the file exceeds the size limit", () => {
    single.mockImplementationOnce((_req: unknown, _res: unknown, cb: (err?: unknown) => void) => {
      cb(new mockedMulter.MulterError("LIMIT_FILE_SIZE"))
    })
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const next = jest.fn()

    imageSearchUpload({} as MedusaRequest, res as unknown as MedusaResponse, next)

    expect(res.status).toHaveBeenCalledWith(413)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("5MB") })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it("returns 400 when multer/fileFilter reports any other error", () => {
    single.mockImplementationOnce((_req: unknown, _res: unknown, cb: (err?: unknown) => void) => {
      cb(new Error("Unsupported image type: image/gif"))
    })
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const next = jest.fn()

    imageSearchUpload({} as MedusaRequest, res as unknown as MedusaResponse, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid image upload" })
    expect(next).not.toHaveBeenCalled()
  })

  it("calls next() with no response when multer reports no error", () => {
    single.mockImplementationOnce((_req: unknown, _res: unknown, cb: (err?: unknown) => void) => {
      cb()
    })
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const next = jest.fn()

    imageSearchUpload({} as MedusaRequest, res as unknown as MedusaResponse, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })
})
