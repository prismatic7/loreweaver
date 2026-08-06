# Testing Guidelines & Standards

This document outlines the testing strategy, frameworks, and quality thresholds for Loreweaver.

## 1. Testing Frameworks

- **Frontend**: Vitest for React components and TypeScript utilities.
- **Backend**: Rust native `#[cfg(test)]` harness.

## 2. File Organization

- **Frontend Tests**: Match component name with `.test.tsx` suffix next to the target file or under `src/test/` (e.g., `src/components/DashboardView.test.tsx`).
- **Backend Tests**: Standard inline unit tests at the bottom of the source module, or inside a nested `tests` submodule block.

## 3. Standards and Best Practices

- **Avoid Blank Mocks**: Tests must assert real behavioral expectations rather than mocking out every single API call without validation.
- **Tauri IPC Command Mocking**: On the frontend, mock Tauri commands using standard mock handlers that match the expected Rust `Result<T, String>` format.
- **Hermetic Database Tests**: Rust database tests must use in-memory SQLite instances or unique temporary file paths (`test_db_*.db`) that are cleaned up after execution.
- **Pristine Output**: Ensure that test suites run silently without logging warnings, errors, or stack traces unless asserting failure states.
