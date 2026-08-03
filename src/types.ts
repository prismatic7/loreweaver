export interface CampaignNote {
  id: string;
  title: string;
  path: string;
  frontmatter: Record<string, string | number | string[]>;
  content: string;
}

export interface RuleEntry {
  id: string;
  path: string;
  title: string;
  category: string;
  source: string;
  content: string;
}

export interface SearchResult {
  type: "note" | "rule";
  title: string;
  snippet: string;
  score: number;
  path: string;
}
