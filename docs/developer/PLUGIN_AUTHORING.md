# Loreweaver Plugin Authoring Guide

Loreweaver supports extensibility through Javascript plugins. Plugins run in an embedded JavaScript engine (Boa) on the backend and hook into tabletop behaviors.

---

## 1. Plugin Package Structure

Every plugin is packaged as a folder containing:
1. `manifest.json`: Configuration, metadata, and permissions.
2. `index.js`: Script containing hook implementations.

---

## 2. Manifest Format (`manifest.json`)

The manifest defines metadata and access permissions:
```json
{
  "id": "my-custom-roller",
  "name": "My Custom Dice Roller",
  "version": "1.0.0",
  "description": "Adds house rules to standard dice rolls.",
  "entry": "index.js",
  "permissions": ["hooks"]
}
```

### Manifest Fields:
- `id` (Required): String identifier (alphanumeric, lowercase, hyphenated).
- `name` (Required): Human-readable name.
- `version`: Version string.
- `entry`: Relative path to script (default: `index.js`).
- `permissions`: Whitelisted permissions.

> [!IMPORTANT]
> **Whitelisted Permissions:** Currently, only `"hooks"` is supported. Declarations containing other permissions will trigger load-time errors.

---

## 3. Hook Contracts & Execution

Hooks are global Javascript functions called by Loreweaver's event system:
- **Event Hook:** Receives a string payload and returns a string response.
- **Parameters:** Argument is always a string. If passing structured data, it is serialized as a JSON string.
- **Output:** Must return a string (or JSON string). Returning non-string types results in a null callback.

---

## 4. State Persistence

The Boa context provides a global state namespace:
- **State Object:** State is stored inside `globalThis.__state` (or simply `__state`).
- **Persistence:** Loreweaver serializes and saves `__state` to the SQLite DB after every hook execution.
- **Accessing State:** Feel free to query or mutate `__state` inside your hook. It will persist between script invocations.

---

## 5. Script Engine Limitations (Boa)

The plugin runtime uses the [Boa engine](https://github.com/boa-dev/boa), a Javascript compiler written in Rust.
- **No Node.js / Browser APIs:** There is no access to standard Node APIs (`fs`, `net`, `http`) or browser APIs (`fetch`, `XMLHttpRequest`, `window`, `document`).
- **JSON Parsing:** To parse payloads, use standard `JSON.parse(payload)` and `JSON.stringify(result)`.
- **Script Size Limit:** The maximum script content size is **1 MiB** (1,048,576 bytes). Larger files will fail to load.

---

## 6. Code Examples

### Example 1: Dice Modifier Plugin
Intercepts a roll payload and adds a flat house-rule bonus.
```javascript
// index.js
function on_dice_roll(payload) {
    // 1. Parse payload
    let roll = JSON.parse(payload); // e.g. { "sides": 20, "value": 14 }
    
    // 2. Apply modifier
    roll.value += 2; 
    
    // 3. Track count in state
    __state.roll_count = (__state.roll_count || 0) + 1;
    
    // 4. Return serialized result
    return JSON.stringify(roll);
}
```

### Example 2: Campaign Note Word Counter
Keeps track of note modifications.
```javascript
// index.js
function on_note_save(payload) {
    let note = JSON.parse(payload); // e.g. { "title": "Eldoria", "content": "..." }
    let wordCount = note.content.split(/\s+/).length;
    
    // Update counters in state
    __state.notes = __state.notes || {};
    __state.notes[note.title] = wordCount;
    
    return "Processed note: " + note.title;
}
```
