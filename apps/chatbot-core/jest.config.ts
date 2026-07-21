import type { Config } from "jest"

const testType = process.env.TEST_TYPE

let testMatch: string[]
if (testType === "unit") {
  testMatch = ["<rootDir>/tests/unit/**/*.test.ts"]
} else if (testType === "integration") {
  testMatch = ["<rootDir>/tests/integration/**/*.test.ts"]
} else {
  testMatch = ["<rootDir>/tests/**/*.test.ts"]
}

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch,
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "./tsconfig.test.json" }],
  },
  // Scoped to the image search pipeline (Feature 2) — not a repo-wide gate.
  collectCoverageFrom: [
    "src/image/**/*.ts",
    "!src/image/index.ts",
    "src/orchestrator/ImageOrchestrator.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  coverageThreshold: {
    global: {},
    "./src/image/**/*.ts": { branches: 80, functions: 80, lines: 80, statements: 80 },
    "./src/orchestrator/ImageOrchestrator.ts": { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
}

export default config
