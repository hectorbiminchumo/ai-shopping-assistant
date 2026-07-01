import type { Config } from "jest";

const testType = process.env.TEST_TYPE;

let testMatch: string[];
if (testType === "integration:http") {
  testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
} else if (testType === "integration:modules") {
  testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
} else if (testType === "unit") {
  testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
} else {
  testMatch = ["**/src/**/__tests__/**/*.[jt]s"];
}

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch,
  moduleFileExtensions: ["ts", "js", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  setupFiles: ["./integration-tests/setup.js"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "./tsconfig.json" }],
  },
};

export default config;
