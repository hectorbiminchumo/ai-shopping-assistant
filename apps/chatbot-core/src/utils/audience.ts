import type { Audience } from "../types"

// Order matters: check children first so "shoes for girls" is not read as
// "women". Word boundaries keep "Women" from matching the "men" pattern.
const AUDIENCE_PATTERNS: Array<[Audience, RegExp]> = [
  ["children", /\b(kids?|children|child|boys?|girls?|teen|junior)\b/i],
  ["women", /\b(women'?s?|womens|woman|ladies|lady|female)\b/i],
  ["men", /\b(men'?s?|mens|man|male)\b/i],
]

export function detectAudience(text: string): Audience | undefined {
  return AUDIENCE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0]
}

// A product fits an audience when its title names that audience, or names
// none at all (unlabeled products are unisex).
export function titleMatchesAudience(title: string, audience: Audience): boolean {
  const titleAudience = detectAudience(title)
  return titleAudience === undefined || titleAudience === audience
}
