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
}

export default config
