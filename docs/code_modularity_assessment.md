# Code Modularity Assessment

## Strengths To Preserve

- The web app uses a mode-aware data facade in `apps/web/src/lib/demo-store.ts`; route code does not import `supabase-store.ts` directly.
- Domain operations and normalization are concentrated in `apps/web/src/lib/runtime-state.ts`, with focused unit tests.
- Feasibility, linear schedule, and project-network view builders are separated from route rendering.
- The connector has clearer orchestration boundaries through config, clients, readers, writers, validators, and `SyncEngine`.
- The Archicad snapshot filter already uses a cleaner extracted server-action module in `apps/web/src/app/integrations/archicad/snapshot-actions.ts`.

## Maintainability Risks

- Large route files mix rendering, `FormData` parsing, server actions, revalidation, redirects, and error handling. The highest-pressure files are `apps/web/src/app/scenarios/[scenarioId]/page.tsx`, `apps/web/src/app/sites/[siteId]/page.tsx`, and `apps/web/src/app/base-costs/page.tsx`.
- `apps/web/src/lib/demo-store.ts` and `apps/web/src/lib/supabase-store.ts` duplicate many input types and function signatures. This creates data-source drift risk.
- Large client workspaces such as `apps/web/src/app/base-costs/base-costs-workspace.tsx` and `apps/web/src/app/linear-schedule/schedule-client.tsx` will become hard to review unless split around real sub-workflows.
- Shared JSON schemas exist, but they are not clearly enforced across the web app, connector, Python listener, and native serializer.
- BuildSync/native event contracts are split between C++ hand-built JSON and Python Pydantic models.
- Test coverage is good for pure domain/view builders and connector internals, but thin around route-level workflow behavior and contract drift.

## Refactor Rules

Refactor only where it protects the primary workflow spine.

1. Extract route-local server actions into `actions.ts` modules when a page has more than a few mutations.
2. Move repeated `FormData` parsing into small shared helpers as actions are extracted.
3. Define shared store input/DTO types before changing demo and Supabase implementations in parallel.
4. Add contract tests around connector payloads, shared vocabularies, and BuildSync listener events before widening integration behavior.
5. Split large client workspaces by decision/action boundaries, not by arbitrary component counts.
6. Keep demo and Supabase behavior parity visible in tests or smoke scripts.

## Immediate Quality Gate

Before adding a new product surface, the branch should pass:

- web library/workflow tests
- connector tests
- Python listener tests
- native BuildSync smoke when CMake is available
- a build or type-oriented web check

The CI workflow should run the checks that are reliable in a clean hosted environment and leave Archicad/live adapter validation in runbooks.
