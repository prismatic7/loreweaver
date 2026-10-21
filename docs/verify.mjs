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

    // Normalise local absolute links (file:///abs/path or /abs/path) to
    // repo-relative paths, resolved against the repo root. Hard-coding the
    // author's checkout path meant the same doc passed locally and failed in
    // CI (or on any other machine); resolving from the root is portable.
    let linkPath = rawLink.replace(/^file:\/\//, "");
    if (linkPath.startsWith("/")) {
      linkPath = path.relative(rootDir, linkPath) || ".";
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

// 4. Verify every invoke() call under src/ corresponds to a Rust command.
//    Scans App.tsx, components/, hooks/ and utils/ — hooks are where most
//    invoke() calls actually live, so scanning only the first two left the
//    check blind to the majority of the frontend↔backend surface.
console.log("Verifying frontend invoke() call destinations...");

function getFilesRecursively(dir, extensions) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, extensions));
    } else {
      if (extensions.includes(path.extname(filePath))) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const frontendFiles = [
  resolvePath("src/App.tsx"),
  ...getFilesRecursively(resolvePath("src/components"), [".tsx", ".ts"]),
  ...getFilesRecursively(resolvePath("src/hooks"), [".tsx", ".ts"]),
  ...getFilesRecursively(resolvePath("src/utils"), [".tsx", ".ts"]),
].filter(file => !file.endsWith(".test.tsx") && !file.endsWith(".test.ts"));

const invokeRegex = /invoke(?:<[^>]+>)?\(\s*["']([^"']+)["']/g;
const frontendInvokes = new Set();

for (const file of frontendFiles) {
  const content = fs.readFileSync(file, "utf-8");
  let invokeMatch;
  while ((invokeMatch = invokeRegex.exec(content)) !== null) {
    frontendInvokes.add(invokeMatch[1]);
  }
}

for (const inv of frontendInvokes) {
  if (!rustCommands.has(inv)) {
    logError(`Frontend invokes unknown Tauri command "${inv}" (not found in lib.rs)`);
  }
}
logSuccess(`Verified ${frontendInvokes.size} unique invoke calls across ${frontendFiles.length} files`);

// 5. Every command must be reachable: registered in `generate_handler!`, given a
//    permission block in permissions/allow-all.toml, and added to the active
//    capability. Missing any one of the three fails at RUNTIME with a rejected
//    invoke (silent in tests, loud in the app), so it is checked here instead.
console.log("Verifying command permissions and capabilities...");

const allowAllPath = resolvePath("src-tauri/permissions/allow-all.toml");
const allowAllContent = fs.readFileSync(allowAllPath, "utf-8");
const capabilityPath = resolvePath("src-tauri/capabilities/default.json");
const capabilityContent = fs.readFileSync(capabilityPath, "utf-8");
const capabilityPermissions = new Set(
  (JSON.parse(capabilityContent).permissions ?? []).map((p) => String(p)),
);

// Permission identifiers declared as `identifier = "allow-<kebab>"`.
const declaredPermissions = new Set(
  [...allowAllContent.matchAll(/identifier\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
);

// Names listed in the catch-all `allow-all-commands` block: from its identifier
// line to the next `[[permission]]` header.
const allowAllStart = allowAllContent.indexOf('identifier = "allow-all-commands"');
const allowAllEnd = allowAllContent.indexOf("[[permission]]", allowAllStart + 1);
const allowAllBlock = allowAllContent.slice(
  allowAllStart,
  allowAllEnd === -1 ? undefined : allowAllEnd,
);
const allowAllCommands = new Set(
  [...allowAllBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]),
);

const handlerBlock = libRsContent.slice(
  libRsContent.indexOf("tauri::generate_handler!"),
);

for (const cmd of rustCommands) {
  const kebab = cmd.replace(/_/g, "-");
  const permission = `allow-${kebab}`;

  if (!handlerBlock.includes(`${cmd},`) && !handlerBlock.includes(`${cmd})\n`)) {
    logError(`Command "${cmd}" is not registered in generate_handler!`);
  }
  if (!declaredPermissions.has(permission)) {
    logError(
      `Command "${cmd}" has no "${permission}" permission block in src-tauri/permissions/allow-all.toml`,
    );
  }
  if (!capabilityPermissions.has(permission)) {
    logError(
      `Command "${cmd}" is missing "${permission}" in src-tauri/capabilities/default.json`,
    );
  }
  if (!allowAllCommands.has(cmd)) {
    logError(`Command "${cmd}" is missing from the allow-all-commands list`);
  }
}
logSuccess(
  `Checked ${rustCommands.size} commands against the permission + capability surface`,
);

if (hasError) {
  console.log("\n\x1b[31m[FAILURE]\x1b[0m Documentation verification failed with errors.");
  process.exit(1);
} else {
  console.log("\n\x1b[32m[SUCCESS]\x1b[0m All documentation verification checks passed successfully!");
  process.exit(0);
}

