# Spec: Template-Driven Actions & Schema Registry

**Date:** 2026-08-05  
**Status:** Approved  
**Author:** Antigravity  

---

## 📖 Overview
Loreweaver is a system-agnostic campaign manager. To make the canvas and editor views useful for system-specific mechanics without hardcoding game rules, this specification establishes a portable **Template-Driven Actions & Schema Registry**. 

Templates are stored in the user's campaign vault, dynamically rendering tailored metadata editors and equipping canvas board nodes with scriptable context-menu roll actions driven by local JavaScript plugins.

---

## 🏗️ 1. Directory Structure & Storage
Templates are stored as portable Markdown files with YAML frontmatter inside a special `.templates/` hidden folder at the root of the active vault directory.

```text
vault-root/
├── .templates/
│   ├── Character.md
│   ├── MagicItem.md
│   └── Room.md
```

### 1.1 Template Schema Contract
A template file (e.g. `.templates/Character.md`) defines the fields and available hooks in its YAML frontmatter.

```yaml
---
name: Character
type: template
properties:
  hp: { type: "number", default: 10 }
  class: { type: "string", default: "Fighter" }
  str: { type: "number", default: 10 }
  dex: { type: "number", default: 10 }
actions:
  - label: "Roll Initiative"
    hook: "roll_initiative"
    plugin: "character-roller"
  - label: "Roll Strength Check"
    hook: "roll_str_check"
    plugin: "character-roller"
---
# {{name}}
Template default content sheet...
```

---

## 🛠️ 2. Subsystem Implementations

### 2.1 Backend Template Scanning
*   **Rust Command:** `list_templates() -> Result<Vec<TemplateEntry>, String>`
    *   Reads all `.md` files in `<active-vault>/.templates/`.
    *   Parses frontmatter schema properties and returns a compiled list of active template schemas to the frontend.
*   **Safety validation:** All paths are resolved through the safe path validator to guarantee vault encapsulation.

### 2.2 Frontend Dynamic Metadata Panel
*   **Component:** `CampaignVaultView` ([`src/components/CampaignVaultView.tsx`](file:///Users/chris/Development/loreweaver/src/components/CampaignVaultView.tsx))
    *   When editing a note, the panel queries the template registry for the note's frontmatter `type`.
    *   If a template matches, the metadata property details section renders:
        *   Numeric inputs for properties marked `type: "number"`.
        *   Checkboxes for properties marked `type: "boolean"`.
        *   Standard text inputs for properties marked `type: "string"`.
    *   Modifications save directly back into the note's YAML frontmatter in the background.

### 2.3 Canvas Node Context Actions
*   **Component:** `FolderCanvas` ([`src/components/FolderCanvas.tsx`](file:///Users/chris/Development/loreweaver/src/components/FolderCanvas.tsx))
    *   Right-clicking a node checks its `type`.
    *   Appends the list of custom `actions` defined by its template (e.g. *Roll Initiative*).
    *   Clicking an action triggers the Tauri IPC command `execute_plugin_hook` with payload:
        ```json
        {
          "pluginId": "character-roller",
          "hook": "roll_initiative",
          "payload": "{\"title\":\"Valerius\",\"hp\":12,\"dex\":14,...}"
        }
        ```
    *   Renders the output of the hook (e.g., the roll result) inside a floating styled result toast in the bottom-right corner of the canvas.

---

## 🧪 3. Self-Review & Verification
*   **Contradiction Check:** Frontmatter fields are kept fully system-agnostic; no hardcoded systems (like D&D 5e or Pathfinder) exist in the core codebase.
*   **Path Safety:** The backend scanner utilizes canonical path verification relative to the active vault.
*   **Consistency:** The document verification script `docs/verify.mjs` will be updated to audit the new `list_templates` Tauri command.
