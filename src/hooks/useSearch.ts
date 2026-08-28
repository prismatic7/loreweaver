import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CampaignNote, RuleEntry, SearchResult, SearchResponse } from "../types";
import { useDebounce } from "use-debounce";

export function useSearch(notes: CampaignNote[], rules: RuleEntry[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory] = useState<"all" | "notes" | "rules">("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  const executeSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setSearchExpanded(false);
        return;
      }
      try {
        const res = await invoke<SearchResponse>("search_vault", {
          query,
          category: searchCategory,
        });
        setSearchResults(res?.results || []);
        setSearchExpanded(res?.expanded ?? false);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchExpanded(false);
      }
    },
    [searchCategory],
  );

  useEffect(() => {
    executeSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery, executeSearch]);

  const matchedNotesByPath = useMemo(() => {
    const map = new Map<string, CampaignNote>();
    notes.forEach((n) => map.set(n.path, n));
    return map;
  }, [notes]);

  const matchedRulesById = useMemo(() => {
    const map = new Map<string, RuleEntry>();
    rules.forEach((r) => map.set(r.id, r));
    return map;
  }, [rules]);

  return {
    searchQuery,
    setSearchQuery,
    searchCategory,
    isSearchOpen,
    setIsSearchOpen,
    searchResults,
    setSearchResults,
    searchExpanded,
    executeSearch,
    matchedNotesByPath,
    matchedRulesById,
  };
}
