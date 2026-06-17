---
name: PADCOM global typecheck is pre-broken
description: When to trust runtime over tsc in the PADCOM repo
---

The repo-wide `pnpm run typecheck` fails on pre-existing drift in generated client/zod
types (and an api-zod `type`+`const` same-name collision, TS2308). Runtime esbuild
bundling resolves these, so the app runs correctly despite the type errors.

**Why:** generated types have drifted from page usage; codegen emits colliding declarations.

**Root cause of the "missing export" leaf errors:** `lib/api-zod/src/index.ts` has
ambiguous re-exports from `./generated/api` (TS2308 "already exported a member..."),
which makes `pnpm run typecheck:libs` (`tsc --build`) FAIL before emitting. Because the
lib build never completes, `lib/api-client-react/dist/**/*.d.ts` stays STALE. So a leaf
artifact that imports a freshly-added codegen hook (e.g. `useListCatalogOptions`) sees
`has no exported member` even though the symbol DOES exist in
`lib/api-client-react/src/generated/api.ts`. Vite serves the source, so runtime is fine.

**How to apply:** do NOT use the global typecheck as a pass/fail gate for PADCOM changes.
To confirm a "missing export" is the stale-dist false alarm (not a real bug): grep the
symbol in the lib `src/generated/` — if present there, runtime works. Validate backend by
runtime (curl through localhost:80) and frontend by restarting the `padcom` workflow +
screenshots. Only treat type errors that point at files YOU changed as real. Fixing the
api-zod barrel ambiguity (so `tsc --build` can emit) is the real cure, but it is global
codegen surgery — out of scope for feature work.
