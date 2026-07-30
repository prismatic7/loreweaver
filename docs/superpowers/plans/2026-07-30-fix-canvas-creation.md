# Fix Canvas Creation & Wire Up Canvas View

This plan addresses two issues:
1. The canvas creation API call in the frontend (`App.tsx`) passes `jsonContent` and `relPath` instead of the expected `content` and `rel_path` expected by the Rust backend.
2. The `FolderCanvas` component is fully implemented but is never imported or rendered in `App.tsx` when `activeView === "canvas"`, leaving the workspace blank or broken.

## User Review Required

> [!IMPORTANT]
> The `FolderCanvas` component will be rendered inside the vault workspace layout, maintaining the left sidebar navigation so you can seamlessly toggle between text notes and canvas boards.

## Open Questions

None. The technical paths and parameter names match existing working invocations in `FolderCanvas.tsx`.

## Proposed Changes

### Frontend Component & Layout Integration

---

#### [MODIFY] [App.tsx](file:///Users/chris/Development/loreweaver/src/App.tsx)

- **Import `FolderCanvas`:** Statically or lazily import the `FolderCanvas` component at the top of the file:
  ```javascript
  const FolderCanvas = lazy(() => import("./components/FolderCanvas"));
  ```
- **Fix API parameters:** Modify the `save_canvas_file` invocation inside `handleCreateItemInFolder` to use `rel_path` and `content`.
- **Add selection callback helpers:** Add `handleSelectNoteFromCanvas` and `handleSelectCanvas` callback handlers.
- **Support canvas view in workspace layout:** Update the layout wrappers to allow `activeView === "canvas"` to render the sidebar.
- **Render `FolderCanvas`:** Conditionalize the main editing panel to display the `FolderCanvas` component when the active view is `"canvas"`.

---

## Tasks

### Task 1: Add Canvas Handlers & Fix Creation API Call in App.tsx

**Files:**
- Modify: [App.tsx](file:///Users/chris/Development/loreweaver/src/App.tsx)

**Steps:**
- [ ] **Step 1: Lazy-load FolderCanvas**
  Add the dynamic import at line 44 right below `MarkdownEditor`:
  ```typescript
  const FolderCanvas = lazy(() => import("./components/FolderCanvas"));
  ```
- [ ] **Step 2: Add callbacks for canvas interaction**
  Add the following helper functions right after `handleNewNote` (around line 1016):
  ```typescript
  const handleSelectNoteFromCanvas = (noteId: string) => {
    const targetNote = notes.find((n) => n.id === noteId);
    if (targetNote) {
      setSelectedNoteId(noteId);
      const isCanvas =
        targetNote.frontmatter?.type === "Canvas" ||
        targetNote.path.endsWith(".canvas");
      if (isCanvas) {
        const parts = targetNote.path.split("/");
        parts.pop();
        const folderName = parts.join("/");
        setCurrentCanvasFolder(folderName);
        setActiveView("canvas");
      } else {
        setIsEditingNote(false);
        setActiveView("vault");
      }
    }
  };

  const handleSelectCanvas = (canvasPath: string) => {
    const targetNote = notes.find(
      (n) => n.frontmatter?.canvasPath === canvasPath || n.path === canvasPath,
    );
    if (targetNote) {
      setSelectedNoteId(targetNote.id);
      setActiveView("canvas");
    }
  };
  ```
- [ ] **Step 3: Fix `save_canvas_file` argument names**
  Modify lines 1178-1181 in the `type === "canvas"` block inside `handleCreateItemInFolder`:
  ```diff
  -      invoke("save_canvas_file", {
  -        relPath: canvasPath,
  -        jsonContent: JSON.stringify({ nodes: [], edges: [], containers: [] }),
  -      })
  +      invoke("save_canvas_file", {
  +        rel_path: canvasPath,
  +        content: JSON.stringify({ nodes: [], edges: [], containers: [] }),
  +      })
  ```

---

### Task 2: Update Layout and Render FolderCanvas in App.tsx

**Files:**
- Modify: [App.tsx](file:///Users/chris/Development/loreweaver/src/App.tsx)

**Steps:**
- [ ] **Step 1: Include canvas view in Vault Breadcrumbs**
  Modify the breadcrumb conditional at lines 2616-2620:
  ```diff
  -            {activeView === "vault" && (
  +            {(activeView === "vault" || activeView === "canvas") && (
                 <>
                   Vault / <span>{currentNote?.title || "Untitled"}</span>
                 </>
               )}
  ```
- [ ] **Step 2: Maintain Sidebar for Canvas View**
  Modify the main Vault view container check at line 2909:
  ```diff
  -            {activeView === "vault" && (
  +            {(activeView === "vault" || activeView === "canvas") && (
  ```
- [ ] **Step 3: Render FolderCanvas conditional**
  Replace the main note container starting around line 3164 (the `div` directly inside the flex layout next to the sidebar) with a conditional rendering block for the canvas:
  ```diff
  -                  <div
  -                    style={{
  -                      flex: 1,
  -                      overflowY: "auto",
  -                      padding: "32px 40px",
  -                      display: "flex",
  -                      justifyContent: "center",
  -                    }}
  -                  >
  -                    <div
  -                      className="document-sheet"
  -                      style={{ padding: "40px 48px" }}
  -                    >
  -                       ... (all original document sheet toggles & markdown editor contents) ...
  -                    </div>
  -                  </div>
  +                  {activeView === "canvas" ? (
  +                    <Suspense fallback={<div style={{ padding: "20px", color: "var(--muted)" }}>Loading Canvas...</div>}>
  +                      <FolderCanvas
  +                        currentFolder={currentCanvasFolder || ""}
  +                        activeCanvasPath={
  +                          currentNote?.frontmatter?.canvasPath ||
  +                          currentNote?.path ||
  +                          ""
  +                        }
  +                        notes={notes as any[]}
  +                        onSelectNote={handleSelectNoteFromCanvas}
  +                        onSelectCanvas={handleSelectCanvas}
  +                      />
  +                    </Suspense>
  +                  ) : (
  +                    <div
  +                      style={{
  +                        flex: 1,
  +                        overflowY: "auto",
  +                        padding: "32px 40px",
  +                        display: "flex",
  +                        justifyContent: "center",
  +                      }}
  +                    >
  +                      <div
  +                        className="document-sheet"
  +                        style={{ padding: "40px 48px" }}
  +                      >
  +                         ... (all original document sheet toggles & markdown editor contents) ...
  +                      </div>
  +                    </div>
  +                  )}
  ```

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify compiling is fully successful with strict typing.
- Run `npm run test` to verify Vitest frontend tests.

### Manual Verification
- In the Campaign Vault view:
  - Create a new Canvas Board.
  - Verify that both the `.canvas` JSON file and the `.canvas.md` files are created under the vault directory.
  - Verify that the view automatically switches to the Canvas Board.
  - Verify that clicking back to a markdown note switches back to the markdown editor view.
  - Verify that clicking the Canvas Board node in the sidebar switches the view back to the Canvas layout.
