# Security Guardrails

This document defines critical security boundaries and access restrictions to safeguard user data and environment security.

## 1. Vault Directory Sandboxing (Path Traversal Prevention)

- **Strict Path Validation**: All file reads, writes, deletions, and moves must be validated using `validate_safe_path`.
- **Absolute Sandbox Bounds**: The backend must never allow writing, reading, or checking directories that resolve outside the root of the active vault directory.
- **Directory Traversal Detection**: Reject paths that contain directory traversal tokens (e.g., `..`, `./../`, absolute platform roots) before performing any filesystem syscalls.

## 2. Secure Plugin Execution

- **Sandboxed Execution**: Plugins are executed inside the Boa JavaScript engine on the Rust side, which lacks access to the node runtime, global browser APIs, or system calls.
- **Strict Allowance list**: Only hooks declared in the allow-list (e.g., `"hooks"`) must be loaded and executed.
- **No System FFI/Command widening**: Do not grant plugins direct access to system binaries or disk access outside vault bounds.

## 3. Database Safety

- **SQL Injection Prevention**: All queries against SQLite must use parameterized arguments (`params![]` or `named_params![]`). Never concatenate raw user input into query strings.
- **WAL Thread Safety**: Ensure proper write-ahead logging synchronization so concurrent threads do not block or corrupt SQLite databases.
- **Cross-Vault Isolation**: Do not cache rules, rules indexing, or note contents globally; database access must always be scoped per-vault.
