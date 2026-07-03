const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/**
 * Medusa Cloud-related environment variables
 */
const S3_HOSTNAME = process.env.MEDUSA_CLOUD_S3_HOSTNAME
const S3_PATHNAME = process.env.MEDUSA_CLOUD_S3_PATHNAME

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  eslint: {
    // ESLint is left disabled during builds on purpose: `next lint` currently
    // crashes in this project (ajv "defaultMeta" error) and is deprecated in
    // Next 16. Re-enable once the ESLint config is migrated to the ESLint CLI.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type errors now fail the build — the project type-checks clean (tsc --noEmit).
    ignoreBuildErrors: false,
  },
  images: {
    // Optimization ON: Next resizes per `sizes`, serves AVIF/WebP and caches.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        // Medusa dev backend (local file provider serves /static/*)
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
      {
        // Supabase Storage (used after step 2)
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        // Product catalog photos seeded from Unsplash
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      ...(S3_HOSTNAME && S3_PATHNAME
        ? [
            {
              protocol: "https",
              hostname: S3_HOSTNAME,
              pathname: S3_PATHNAME,
            },
          ]
        : []),
    ],
  },
}

module.exports = nextConfig
