import { defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ConfigModule } from "@medusajs/framework/types"
import { parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"
import multer from "multer"

// Medusa only applies CORS to /store, /admin and /auth. The custom /search
// routes (semantic search + chat) are called directly from the storefront
// browser, so they need the same store CORS policy.
const storeCors = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const configModule: ConfigModule = req.scope.resolve("configModule")

  return cors({
    origin: parseCorsOrigins(configModule.projectConfig.http.storeCors),
    credentials: true,
  })(req, res, next)
}

const ACCEPTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB — apps/chatbot-core/README.md "Image input constraints"

const imageUpload = multer({
  storage: multer.memoryStorage(), // Buffer only, never written to disk — the image is embedded
  // in memory and discarded, per the README's "never persisted" requirement.
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported image type: ${file.mimetype}`))
      return
    }
    cb(null, true)
  },
})

// Wraps multer's single-file middleware with an explicit callback so failures
// map to this codebase's `{ message }` JSON convention instead of Express's
// default next(err) error propagation. A missing `image` part entirely is not
// an error multer raises here — `.single()` just leaves `req.file` undefined
// and calls next(), so the route handler is the one that rejects that case.
export const imageSearchUpload = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  // @ts-ignore — multer's Express-style (req, res, cb) signature doesn't line
  // up with Medusa's MiddlewareFunction type; same wrinkle Medusa's own docs
  // hit for file-upload middlewares.
  imageUpload.single("image")(req, res, (err: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: "Image exceeds the 5MB size limit" })
      return
    }
    res.status(400).json({ message: "Invalid image upload" })
  })
}

export default defineMiddlewares({
  routes: [
    { matcher: "/search*", middlewares: [storeCors] },
    {
      matcher: "/store/chat/image-search",
      methods: ["POST"],
      middlewares: [imageSearchUpload],
    },
  ],
})
