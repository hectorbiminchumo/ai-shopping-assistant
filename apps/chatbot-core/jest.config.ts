import type { Config } from "jest"

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
}

export default config
