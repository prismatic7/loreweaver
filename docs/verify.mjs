import fs from "fs";
import path from "path";

const rootDir = process.cwd();

// Helper to resolve absolute path from root
const resolvePath = (...p) => path.resolve(rootDir, ...p);

let hasError = false;

function logError(message) {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
  hasError = true;
}

function logSuccess(message) {
  console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`);
}

// 1. Validate Relative Markdown Links
console.log("Checking markdown links...");
const docFiles = [
  "README.md",
  "ARCHITECTURE.md",
  "docs/codebase/ARCHITECTURE.md",
  "docs/codebase/STACK.md",
  "docs/codebase/STRUCTURE.md",
  "docs/codebase/CONVENTIONS.md",
  "docs/codebase/INTEGRATIONS.md",
  "docs/codebase/TESTING.md",
  "docs/codebase/CONCERNS.md",
  "docs/user/QUICKSTART.md",
  "docs/user/FEATURES.md",
  "docs/user/SETTINGS.md",
  "docs/developer/API.md",
  "docs/developer/PLUGIN_AUTHORING.md",
  "docs/developer/TROUBLESHOOTING.md",
  "docs/developer/CONTRIBUTING.md",
];

for (const docFile of docFiles) {
  const absolutePath = resolvePath(docFile);
  if (!fs.existsSync(absolutePath)) {
    logError(`Declared doc file does not exist: ${docFile}`);
    continue;
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  // Match relative markdown links [text](path) or [text](file:///...)
  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const rawLink = match[1];
    
    // Skip external http/https/mermaid links
    if (rawLink.startsWith("http://") || rawLink.startsWith("https://") || rawLink.startsWith("#")) {
      continue;
    }

    // Translate file:/// absolute links to workspace relative paths
    let linkPath = rawLink;
    if (rawLink.startsWith("file:///Users/chris/Development/loreweaver/")) {
      linkPath = rawLink.replace("file:///Users/chris/Development/loreweaver/", "");
    } else if (rawLink.startsWith("file://")) {
      // General file scheme mock cleanup
      linkPath = rawLink.replace("file://", "");
    }

    // Strip line anchors (e.g. #L100-L120)
    const cleanLinkPath = linkPath.split("#")[0];

    const resolvedLink = resolvePath(cleanLinkPath);
    if (!fs.existsSync(resolvedLink)) {
      logError(`Broken link in ${docFile}: "${rawLink}" resolves to missing path "${cleanLinkPath}"`);
    }
  }
}

// 2. Extract Tauri Commands from lib.rs
console.log("Analyzing Tauri commands in Rust backend...");
const libRsPath = resolvePath("src-tauri/src/lib.rs");
const libRsContent = fs.readFileSync(libRsPath, "utf-8");

const commandRegex = /#\[tauri::command\]\s+(?:async\s+)?fn\s+(\w+)/g;
const rustCommands = new Set();
let cmdMatch;
while ((cmdMatch = commandRegex.exec(libRsContent)) !== null) {
  rustCommands.add(cmdMatch[1]);
}
logSuccess(`Found ${rustCommands.size} commands in lib.rs`);

// 3. Verify all Rust commands are listed in docs/developer/API.md
console.log("Verifying API documentation coverage...");
const apiMdPath = resolvePath("docs/developer/API.md");
const apiMdContent = fs.readFileSync(apiMdPath, "utf-8");

for (const cmd of rustCommands) {
  // Greet is a standard Tauri template greeting, skip if not documented
  if (cmd === "greet") continue;

  if (!apiMdContent.includes(`\`${cmd}\``)) {
    logError(`Tauri command "${cmd}" is not documented in docs/developer/API.md`);
  }
}

// 4. Verify all invoke() calls in App.tsx correspond to Rust commands
console.log("Verifying frontend invoke() call destinations...");
const appTspPath = resolvePath("src/App.tsx");
const appTsContent = fs.readFileSync(appTspPath, "utf-8");

const invokeRegex = /invoke(?:<[^>]+>)?\(\s*["']([^"']+)["']/g;
let invokeMatch;
const frontendInvokes = new Set();
while ((invokeMatch = invokeRegex.exec(appTsContent)) !== null) {
  frontendInvokes.add(invokeMatch[1]);
}

for (const inv of frontendInvokes) {
  if (!rustCommands.has(inv)) {
    logError(`Frontend invokes unknown Tauri command "${inv}" (not found in lib.rs)`);
  }
}
logSuccess(`Verified ${frontendInvokes.size} unique invoke calls`);

if (hasError) {
  console.log("\n\x1b[31m[FAILURE]\x1b[0m Documentation verification failed with errors.");
  process.exit(1);
} else {
  console.log("\n\x1b[32m[SUCCESS]\x1b[0m All documentation verification checks passed successfully!");
  process.exit(0);
}
