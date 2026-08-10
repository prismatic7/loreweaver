import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CampaignNote, RuleEntry, SearchResult } from "../types";
import { useDebounce } from "use-debounce";

export function useSearch(notes: CampaignNote[], rules: RuleEntry[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory] = useState<"all" | "notes" | "rules">("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  const executeSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await invoke<SearchResult[]>("search_vault", {
        query,
        category: searchCategory,
      });
      setSearchResults(res || []);
    } catch (err) {
      console.error("Search failed:", err);
    }
  }, [searchCategory]);

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
    executeSearch,
    matchedNotesByPath,
    matchedRulesById,
  };
}
