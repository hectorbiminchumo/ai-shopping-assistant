// next.config.js runs check-env-variables.js on load (process.exit on missing
// vars). Provide a test-only default so loading the Next config never aborts.
process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||= "pk_test"

const path = require("path")
const nextJest = require("next/jest")

const createJestConfig = nextJest({ dir: "./" })

// The monorepo hoists React 18 (Medusa admin peer dep) to the root
// node_modules while the storefront uses React 19. Pin jest resolution to the
// storefront's copy so hoisted packages (e.g. @testing-library/react) never
// load the React 18 renderer against React 19 elements.
const reactDir = path.dirname(require.resolve("react/package.json"))
const reactDomDir = path.dirname(require.resolve("react-dom/package.json"))

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@lib/(.*)$": "<rootDir>/src/lib/$1",
    "^@modules/(.*)$": "<rootDir>/src/modules/$1",
    "^@pages/(.*)$": "<rootDir>/src/pages/$1",
    "^react$": reactDir,
    "^react/(.*)$": `${reactDir}/$1`,
    "^react-dom$": reactDomDir,
    "^react-dom/(.*)$": `${reactDomDir}/$1`,
  },
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
}

module.exports = createJestConfig(config)
