---
name: PADCOM global typecheck is pre-broken
description: When to trust runtime over tsc in the PADCOM repo
---

The repo-wide `pnpm run typecheck` fails on pre-existing drift in generated client/zod
types (and an api-zod `type`+`const` same-name collision, TS2308). Runtime esbuild
bundling resolves these, so the app runs correctly despite the type errors.

**Why:** generated types have drifted from page usage; codegen emits colliding declarations.

**How to apply:** do NOT use the global typecheck as a pass/fail gate for PADCOM changes.
Validate backend by runtime (curl through localhost:80) and frontend by restarting the
`padcom` workflow + screenshots. Only treat type errors that point at files YOU changed as real.
