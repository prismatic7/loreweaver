import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppShell, AppShellProps, AppView } from "./AppShell";
import { ThemePreference } from "../hooks/useSettings";
import { WorldInfo, CampaignNote, RuleEntry, SearchResult } from "../types";

const worlds: WorldInfo[] = [
  {
    id: "fate-of-cthulhu",
    name: "FATE of Cthulhu",
    description: "2003 espionage-horror.",
    icon: "🜁",
    path: "/vaults/fate-of-cthulhu",
    last_opened: "2026-08-10",
  },
];

function makeProps(overrides: Partial<AppShellProps> = {}): AppShellProps {
  return {
    activeView: "dashboard" as AppView,
    setActiveView: vi.fn(),
    theme: "system" as ThemePreference,
    setTheme: vi.fn(),
    vaultPath: "/vaults/fate-of-cthulhu",
    worlds,
    onSwitchWorld: vi.fn(),
    onOpenLiminal: vi.fn(),
    onCreateWorld: vi.fn(async () => {}),
    onExportWorld: vi.fn(async () => {}),
    onImportWorld: vi.fn(async () => {}),
    onMakeWorldFromLiminal: vi.fn(async () => {}),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    isSearchOpen: false,
    setIsSearchOpen: vi.fn(),
    searchResults: [] as SearchResult[],
    searchExpanded: false,
    notes: [] as CampaignNote[],
    rules: [] as RuleEntry[],
    onSelectSearchResult: vi.fn(),
    searchRef: { current: null },
    children: <div>content</div>,
    rightPanel: <div>right</div>,
    onLoadTrash: vi.fn(),
    onClipUrl: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    ...overrides,
  };
}

describe("AppShell theme toggle", () => {
  it("renders the Monitor icon when theme is system", () => {
    render(<AppShell {...makeProps({ theme: "system" })} />);
    const btn = screen.getByTitle(/Theme: System/);
    expect(btn).toBeTruthy();
  });

  it("cycles system -> dark -> light -> system on successive clicks", () => {
    const setTheme = vi.fn();
    render(<AppShell {...makeProps({ theme: "system", setTheme })} />);
    const btn = screen.getByTitle(/Theme: System/);
    fireEvent.click(btn);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("shows Sun icon in dark mode and cycles to light", () => {
    const setTheme = vi.fn();
    render(<AppShell {...makeProps({ theme: "dark", setTheme })} />);
    const btn = screen.getByTitle(/Theme: Dark/);
    fireEvent.click(btn);
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("shows Moon icon in light mode and cycles back to system", () => {
    const setTheme = vi.fn();
    render(<AppShell {...makeProps({ theme: "light", setTheme })} />);
    const btn = screen.getByTitle(/Theme: Light/);
    fireEvent.click(btn);
    expect(setTheme).toHaveBeenCalledWith("system");
  });
});
