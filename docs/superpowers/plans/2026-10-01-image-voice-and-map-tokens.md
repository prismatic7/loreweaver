# Image Generation, Voice Generation, and Minimalist Map Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make voice generation (macOS local `say` + OpenAI/ElevenLabs) and local-first image generation (ComfyUI) fully functional with robust error handling, and implement minimalist wireframe Lucide icon tokens in the Map Builder.

**Architecture:**
- **Voice (TTS):** The Rust backend (`src-tauri/src/providers/speech.rs`) generates 16-bit LE PCM WAV audio via native macOS `/usr/bin/say` for local TTS and communicates with OpenAI / ElevenLabs HTTP APIs with clean error extraction. The React frontend (`src/hooks/useSettings.ts`, `src/hooks/useSessionTools.ts`) watches and propagates `ttsVoice` to the backend.
- **Image Generation (ComfyUI):** The Rust backend (`src-tauri/src/providers/image.rs`) submits workflows to ComfyUI, extracts detailed node validation errors when prompt submission fails, polls history with a 60-second window, and captures execution exceptions.
- **Map Builder Tokens:** `MapToken` in `src/components/MapBuilderView.tsx` includes `icon?: string` referencing wireframe icons from `src/utils/vaultIcons.ts`. The token creation/editing overlay offers quick minimalist Lucide icons (`User`, `Swords`, `Shield`, `Skull`, `Ghost`, `Flame`, `Sparkles`, `Crown`, `MapPin`, `Heart`, `Eye`, `Gem`, `None`). Tokens render the wireframe Lucide icon inside an SVG `<foreignObject>` centered at the token shape.

**Tech Stack:** Rust (Tauri v2, `ureq`, `symphonia`), React 19, TypeScript, Lucide React (`lucide-react`), Vitest, Cargo test.

## Global Constraints

- All Tauri commands must return `Result<T, String>` with informative, human-readable error messages.
- Never use `window.alert()` or `window.confirm()` in frontend components; use toast or modal dialogs.
- Keep build gates green: `npm run test` (Vitest), `npm run lint` (ESLint `--max-warnings 0`), `npm run build` (tsc/Vite), and `cargo test` in `src-tauri`.
- ComfyUI is the primary local image gen provider; preserve its workflow architecture.
- Wireframe icons must strictly use Lucide SVG components matching Loreweaver's design language.

---

### Task 1: TTS Backend & Frontend Voice Setting Wiring

**Files:**
- Modify: `src-tauri/src/providers/speech.rs`
- Modify: `src/hooks/useSettings.ts:190-236`
- Modify: `src/App.tsx:170-190, 500-530`
- Modify: `src/hooks/useSessionTools.ts:5-37, 173-195`
- Test: `src/hooks/useSessionTools.test.ts` (new or update existing)

**Interfaces:**
- Consumes: `generate_speech(text, provider, apiKey, voice, baseUrl)` Tauri command.
- Produces: `ttsVoice` reactive setting passed from `useSettings` through `App.tsx` into `useSessionTools`, with `generate_speech` invoking with the user-selected voice.

- [ ] **Step 1: Write failing frontend test for `useSessionTools` TTS voice propagation**

Create `src/hooks/useSessionTools.test.ts` testing that `handleGenerateSpeech` passes the configured `ttsVoice` to Tauri's `generate_speech` invoke call.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionTools } from "./useSessionTools";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useSessionTools - TTS Voice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes configured ttsVoice to generate_speech invoke", async () => {
    vi.mocked(invoke).mockResolvedValue("data:audio/wav;base64,AAAA");

    const { result } = renderHook(() =>
      useSessionTools({
        pluginsList: [],
        alert: vi.fn(),
        imageProvider: "local",
        imageModel: "",
        imageApiKey: "",
        imageBaseUrl: "",
        ttsProvider: "openai",
        ttsApiKey: "test-key",
        ttsBaseUrl: "",
        ttsVoice: "nova",
        sttProvider: "local",
        sttApiKey: "",
        sttBaseUrl: "",
      })
    );

    act(() => {
      result.current.setTtsText("Hello adventurer");
    });

    await act(async () => {
      result.current.handleGenerateSpeech();
    });

    expect(invoke).toHaveBeenCalledWith("generate_speech", {
      text: "Hello adventurer",
      provider: "openai",
      apiKey: "test-key",
      voice: "nova",
      baseUrl: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useSessionTools.test.ts`
Expected: FAIL (argument mismatch or `ttsVoice` not accepted in props).

- [ ] **Step 3: Update `useSettings.ts`, `App.tsx`, and `useSessionTools.ts`**

In `src/hooks/useSettings.ts`:
- Watch `tts_voice`: `const ttsVoice = watch("tts_voice");`
- Return `ttsVoice` in `useSettings()` return object.

In `src/App.tsx`:
- Destructure `ttsVoice` from `useSettings()`.
- Pass `ttsVoice` into `useSessionTools({ ..., ttsVoice })`.

In `src/hooks/useSessionTools.ts`:
- Add `ttsVoice?: string;` to `SessionToolsDeps`.
- Destructure `ttsVoice`.
- In `handleGenerateSpeech`:
  `voice: (ttsVoice && ttsVoice !== "default" ? ttsVoice : null) || (ttsProvider === "openai" ? "alloy" : null)`
- Replace `alert("Speech generation failed: " + err)` with inline error tracking or non-blocking handling.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useSessionTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Run Rust tests for speech generation**

Run: `(cd src-tauri && cargo test providers::speech)`
Expected: PASS (`test_generate_speech_empty_text_error`, `test_generate_speech_unsupported_provider`, `test_generate_speech_local_macos`).

- [ ] **Step 6: Commit Task 1**

```bash
git add src-tauri/src/providers/speech.rs src/hooks/useSettings.ts src/App.tsx src/hooks/useSessionTools.ts src/hooks/useSessionTools.test.ts
git commit -m "feat(voice): support macOS native say TTS and wire ttsVoice setting"
```

---

### Task 2: Robust ComfyUI Image Generation & Error Handling

**Files:**
- Modify: `src-tauri/src/providers/image.rs`
- Modify: `src/hooks/useSessionTools.ts:112-171`
- Test: `src/hooks/useSessionTools.test.ts`

**Interfaces:**
- Consumes: ComfyUI prompt API (`/prompt`, `/history/{id}`, `/view`).
- Produces: Detailed node validation and execution error reporting without silent failures or modal alert popups.

- [ ] **Step 1: Write test for image generation error handling in `useSessionTools.test.ts`**

Add test to `src/hooks/useSessionTools.test.ts`:

```ts
  it("tracks image generation error without throwing alert", async () => {
    const alertMock = vi.fn();
    vi.mocked(invoke).mockRejectedValue(new Error("ComfyUI validation failed: Node 4: ckpt_name not found"));

    const { result } = renderHook(() =>
      useSessionTools({
        pluginsList: [],
        alert: alertMock,
        imageProvider: "local",
        imageModel: "sd15",
        imageApiKey: "",
        imageBaseUrl: "http://127.0.0.1:8188",
        ttsProvider: "local",
        ttsApiKey: "",
        ttsBaseUrl: "",
        sttProvider: "local",
        sttApiKey: "",
        sttBaseUrl: "",
      })
    );

    await act(async () => {
      result.current.handleGenerateImage();
    });

    expect(result.current.isGeneratingImage).toBe(false);
    expect(result.current.imageError).toContain("ckpt_name not found");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useSessionTools.test.ts`
Expected: FAIL (`result.current.imageError` is undefined).

- [ ] **Step 3: Implement `imageError` state and error handling in `useSessionTools.ts`**

In `src/hooks/useSessionTools.ts`:
- Add `imageError: string | null` state, initialized to `null`.
- Add `speechError: string | null` state, initialized to `null`.
- In `handleGenerateImage`: set `setImageError(null)` on start, set `setImageError(String(err))` in `.catch()`.
- Export `imageError` and `speechError` from `useSessionTools`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useSessionTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Run Rust unit tests for image generation**

Run: `(cd src-tauri && cargo test providers::image)`
Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src-tauri/src/providers/image.rs src/hooks/useSessionTools.ts src/hooks/useSessionTools.test.ts
git commit -m "feat(image): add robust ComfyUI node error extraction and frontend error state"
```

---

### Task 3: Map Builder Minimalist Wireframe Icon Tokens

**Files:**
- Modify: `src/components/MapBuilderView.tsx`
- Test: `src/components/MapBuilderView.test.tsx` (new test file)

**Interfaces:**
- Consumes: `VAULT_ICONS` from `src/utils/vaultIcons.ts`.
- Produces:
  - `MapToken.icon?: string`
  - Wireframe Lucide icon picker in `namingToken` dialog
  - SVG `<foreignObject>` rendering of Lucide wireframe icons on tokens
  - Palette preservation of token icons
  - Token editing on double-click or edit button

- [ ] **Step 1: Write failing component tests for MapBuilderView token icons**

Create `src/components/MapBuilderView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapBuilderView } from "./MapBuilderView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd) => {
    if (cmd === "load_canvas_file") {
      return Promise.resolve(
        JSON.stringify({
          type: "map",
          tokens: [
            {
              id: "token-1",
              label: "Goblin Archer",
              x: 100,
              y: 100,
              color: "oklch(50% 0.14 25)",
              shape: "circle",
              icon: "Skull",
            },
          ],
          fog: [],
        })
      );
    }
    return Promise.resolve(null);
  }),
  convertFileSrc: vi.fn((path) => path),
}));

describe("MapBuilderView - Icon Tokens", () => {
  it("renders wireframe icon inside the token", async () => {
    render(
      <MapBuilderView vaultPath="/test-vault" mapRelPath="maps/encounter.canvas" />
    );

    const tokenGroup = await screen.findByTestId("map-token-token-1");
    expect(tokenGroup).toBeDefined();

    // Verify foreignObject containing the Skull icon exists
    const iconContainer = tokenGroup.querySelector("foreignObject");
    expect(iconContainer).not.toBeNull();
  });

  it("allows selecting an icon in the token creation modal", async () => {
    render(
      <MapBuilderView vaultPath="/test-vault" mapRelPath="maps/encounter.canvas" />
    );

    const addTokenBtn = screen.getByTitle("Add Token");
    fireEvent.click(addTokenBtn);

    // Verify icon picker buttons are present
    const skullIconBtn = screen.getByTestId("map-token-icon-picker-Skull");
    expect(skullIconBtn).toBeDefined();

    fireEvent.click(skullIconBtn);
    expect(skullIconBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/MapBuilderView.test.tsx`
Expected: FAIL (no test ids, `icon` not handled).

- [ ] **Step 3: Implement icon support in `MapBuilderView.tsx`**

1. Extend `MapToken`:
   ```ts
   interface MapToken {
     id: string;
     label: string;
     x: number;
     y: number;
     color: string;
     shape?: TokenShape;
     icon?: string;
   }
   ```
2. Import `VAULT_ICONS` from `../utils/vaultIcons`.
3. Add curated list of quick token icons:
   ```ts
   const TOKEN_ICON_OPTIONS: Array<{ name: string; label: string }> = [
     { name: "User", label: "Character / NPC" },
     { name: "Swords", label: "Combatant" },
     { name: "Shield", label: "Defender" },
     { name: "Skull", label: "Monster / Threat" },
     { name: "Ghost", label: "Undead" },
     { name: "Flame", label: "Magic / Hazard" },
     { name: "Sparkles", label: "Arcane / Special" },
     { name: "Crown", label: "Boss / Leader" },
     { name: "MapPin", label: "Landmark / Objective" },
     { name: "Heart", label: "Ally / Healer" },
     { name: "Eye", label: "Scout / Watcher" },
     { name: "Gem", label: "Loot / Item" },
   ];
   ```
4. Add state in `MapBuilderView`:
   ```ts
   const [tokenIcon, setTokenIcon] = useState<string | null>(null);
   const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
   ```
5. In `addToken()`:
   Reset `tokenIcon` to `null` and `editingTokenId` to `null`.
6. Add `startEditToken(t: MapToken)`:
   Load `tokenName`, `tokenShape`, `tokenColor`, and `tokenIcon` from `t`, set `editingTokenId(t.id)`, and open `setNamingToken(true)`.
7. In `commitTokenName()`:
   If `editingTokenId` is present, update the matching token. If null, append a new token with `icon: tokenIcon || undefined`.
8. In SVG token rendering:
   - Add `data-testid={`map-token-${t.id}`}` on the token `<g>`.
   - If `t.icon && VAULT_ICONS[t.icon]`, render `<foreignObject x={-10} y={-10} width={20} height={20} style={{ pointerEvents: "none" }}>` with `React.createElement(VAULT_ICONS[t.icon], { size: 16, strokeWidth: 2 })`.
   - If no icon is set, fallback to `<text y="4" fontSize="12" ...>{t.label.charAt(0).toUpperCase()}</text>`.
   - Add double-click handler `onDoubleClick={() => startEditToken(t)}`.
9. In `namingToken` dialog:
   Add Icon picker row with `None (Initial)` button and icon buttons with `data-testid={`map-token-icon-picker-${opt.name}`}`.
10. Update `paletteItems` and `addFromPalette` to preserve `t.icon`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/MapBuilderView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full frontend test suite and lint**

Run: `npm run test`
Run: `npm run lint`
Run: `npm run build`
Expected: All pass without errors.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/MapBuilderView.tsx src/components/MapBuilderView.test.tsx
git commit -m "feat(map): add minimalist wireframe Lucide icon tokens and editing to MapBuilderView"
```

---

### Task 4: Full End-to-End Verification & Quality Gate

**Files:**
- All changed files

- [ ] **Step 1: Run complete Vitest suite**

Run: `npm run test`
Expected: 40+ test files passing.

- [ ] **Step 2: Run ESLint strict check**

Run: `npm run lint`
Expected: 0 warnings, 0 errors.

- [ ] **Step 3: Run Vite TypeScript compilation**

Run: `npm run build`
Expected: Compilation succeeds.

- [ ] **Step 4: Run Rust test suite**

Run: `(cd src-tauri && cargo test)`
Expected: All tests pass.

- [ ] **Step 5: Final Git Status check**

Run: `git status`
Expected: Clean working directory on `main`.
