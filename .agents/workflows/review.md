---
description: "Review current changes for code quality, security bounds, and formatting."
---

# Code Review Workflow

When triggered to review changes or staged files, perform the following steps:

1. **Verify Formatting**: Check that TypeScript files follow 2-space indentation and that Rust files have been formatted via `rustfmt`.
2. **Scan for Traversal Vulnerabilities**: Verify that all file system modifications inside Rust functions execute `validate_safe_path` check.
3. **Verify State Scoping**: Confirm that new queries, DB interactions, or cached context objects are strictly scoped by the active campaign vault path.
4. **Assert Tests Coverage**: Verify that any modified helper function has a corresponding unit or integration test case.
5. **Output Structured Report**: Produce a structured summary outlining:
   - **Critical (Must Fix)**
   - **Important (Should Fix)**
   - **Minor (Nice to Have)**
