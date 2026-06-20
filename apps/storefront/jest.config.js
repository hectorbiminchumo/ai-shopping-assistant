const nextJest = require("next/jest")

// Loads next.config.js + .env files and wires the SWC transform so JSX/TS and
// the "@modules/*" / "@lib/*" tsconfig path aliases resolve inside tests.
const createJestConfig = nextJest({ dir: "./" })

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
}

module.exports = createJestConfig(config)
