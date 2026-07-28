import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";

// Mock Tauri core API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd, _args) => {
    if (cmd === "get_vault_path") return "/mock/vault";
    if (cmd === "load_notes") {
      return [
        {
          id: "note-1",
          title: "Mock Note",
          path: "Worldbuilding/Mock Note.md",
          frontmatter: { type: "Note" },
          content: "Hello from mock note",
        },
      ];
    }
    if (cmd === "load_rules") return [];
    if (cmd === "load_settings") return {};
    if (cmd === "list_vaults") return [{ name: "default", path: "/mock/vault" }];
    if (cmd === "load_plugins") return [];
    if (cmd === "load_trash_notes") return [];
    return null;
  }),
  convertFileSrc: (path: string) => path,
}));

describe("Loreweaver Main UI App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Dashboard view by default", async () => {
    render(<App />);

    // Wait for the main elements to load
    await waitFor(() => {
      expect(screen.getByText("Campaign Workspace")).toBeInTheDocument();
    });

    expect(screen.getByText(/Welcome back, GM/)).toBeInTheDocument();
    
    // Check if the mock note loaded in the recent list
    await waitFor(() => {
      expect(screen.getByText("Mock Note")).toBeInTheDocument();
    });
  });

  it("allows switching views between dashboard, vault, and rules", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Campaign Workspace")).toBeInTheDocument();
    });

    // Find the Campaign Vault navigation button in the ribbon
    const vaultNav = screen.getByTitle("Campaign Vault");
    fireEvent.click(vaultNav);

    // Verify vault title is in document
    await waitFor(() => {
      expect(screen.getByText("Campaign Notes")).toBeInTheDocument();
    });

    // Find the Rulebooks & SRDs navigation button in the ribbon
    const rulesNav = screen.getByTitle("Rulebooks & SRDs");
    fireEvent.click(rulesNav);

    // Verify rules view has loaded
    await waitFor(() => {
      expect(screen.getByText("Rulebook Entries")).toBeInTheDocument();
    });
  });
});
