import { defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ConfigModule } from "@medusajs/framework/types"
import { parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"

// Medusa only applies CORS to /store, /admin and /auth. The custom /search
// routes are called directly from the storefront browser, so they need the
// same store CORS policy.
export default defineMiddlewares({
  routes: [
    {
      matcher: "/search*",
      middlewares: [
        (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          const configModule: ConfigModule = req.scope.resolve("configModule")

          return cors({
            origin: parseCorsOrigins(configModule.projectConfig.http.storeCors),
            credentials: true,
          })(req, res, next)
        },
      ],
    },
  ],
})
