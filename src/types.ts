import type { CampaignNote as GeneratedCampaignNote, RuleEntry as GeneratedRuleEntry, SearchResult as GeneratedSearchResult } from './bindings';

/**
 * Strongly-typed wrapper around the Specta-generated CampaignNote.
 *
 * `frontmatter` is intentionally `Record<string, unknown>` because note metadata keys are
 * user-defined and may hold strings, numbers, booleans, arrays, or nested JSON values.
 * Callers should narrow values with `String(...)`, `Array.isArray(...)`, or `typeof` checks.
 */
export type CampaignNote = Omit<GeneratedCampaignNote, 'frontmatter'> & {
  frontmatter: Record<string, unknown>;
};

export type RuleEntry = GeneratedRuleEntry;

/**
 * Discriminated union narrowing the generated `SearchResult.type` to the only two runtime
 * values ever emitted by the backend ("note" and "rule").
 */
export type SearchResult = Omit<GeneratedSearchResult, 'type' | 'score'> & {
  type: 'note' | 'rule';
  score: number;
};
