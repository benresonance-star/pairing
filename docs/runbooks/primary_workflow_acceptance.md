# Primary Workflow Acceptance

Use this runbook to validate the product spine before expanding scope.

## Goal

Prove that a site/scenario feasibility decision can become governed Archicad metadata without bypassing the control-plane boundaries.

## Local Demo Path

1. Reset demo runtime:

   ```powershell
   npm run demo:reset
   ```

2. Pull Archicad-shaped fixture data into the runtime store:

   ```powershell
   npm run demo:inbound
   ```

3. Start the web app:

   ```powershell
   npm run demo:web
   ```

4. In the UI, follow the spine:

   - open `Sites` and choose a development site
   - compare scenario options in `Feasibility`
   - inspect linked cost and schedule context
   - open `Objects` and draft a package or construction-state change
   - open `Change Sets`, submit, approve, and queue the change set

5. Run outbound sync:

   ```powershell
   npm run demo:outbound
   ```

6. Confirm the overview shows a recorded Archicad write and the runtime state contains an entry in `archicad_writes`.

## Supabase / Live-Capable Path

Use the same UI flow with:

- `CCP_DATA_SOURCE=supabase`
- `PROJECT_ID` set to the target project
- Supabase URL and service-role credentials configured server-side
- the connector pointed at the same project and scenario
- the Archicad adapter set to demo, mock, or live depending on the validation stage

The app must still create change sets and the connector must remain the only write-back path.

## Acceptance Criteria

- A selected site has at least one scenario option with cost evidence.
- The selected option links to a scenario, cost template, schedule context, and Archicad object context.
- A package or construction-state change is staged as a change set item, not written directly.
- The change set moves through `draft -> submitted -> approved -> queued_for_sync`.
- Outbound sync writes only allowlisted fields and records write evidence.
- Failed validation leaves the change set in `sync_failed` with errors.

## Automated Coverage

- `npm run test:web` covers the primary workflow domain path.
- `npm run connector:test` covers inbound/outbound connector behavior, validation, and write evidence.
- `npm run demo:test` runs the core web and connector test suites together.
