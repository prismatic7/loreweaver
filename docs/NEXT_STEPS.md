# Next Steps

## Immediate

- Review and merge the trash/delete/empty-folder fix branch.
- Add automated tests for the trash lifecycle (trash note, restore note, empty trash, folder persistence).

## Short Term

- Audit other destructive actions for the custom confirm modal pattern.
- Reduce reliance on `any` types in `src/App.tsx`.
- Split `App.tsx` into smaller feature components.

## Medium Term

- Harden plugin sandbox isolation beyond the current Boa permission allow-list.
- Connect image generation UI to the existing Rust backend bindings.
- Add automatic embedding dimension compatibility checks when switching providers.
