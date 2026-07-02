import type { Config } from "jest";

const testType = process.env.TEST_TYPE;

let testMatch: string[];
let setupFiles: string[];

if (testType === "integration:http") {
  testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
  setupFiles = ["./integration-tests/setup.js"];
} else if (testType === "integration:modules") {
  testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
  setupFiles = ["./integration-tests/setup.js"];
} else if (testType === "unit") {
  testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
  setupFiles = [];
} else {
  testMatch = ["**/src/**/__tests__/**/*.[jt]s"];
  setupFiles = [];
}

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch,
  setupFiles,
  moduleFileExtensions: ["ts", "js", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "./tsconfig.test.json" }],
  },
};

export default config;
