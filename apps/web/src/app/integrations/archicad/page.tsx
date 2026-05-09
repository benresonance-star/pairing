import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CompanionRequestError,
  connectCompanion,
  disconnectCompanion,
  getCompanionLogs,
  getCompanionStatus,
  runCompanionInbound,
  runCompanionOutbound
} from "../../../lib/companion-client";
import { CompanionOfflineHelp } from "./companion-offline-help";
import { CompanionActionButton } from "./companion-action-button";
import { COMPANION_OFFLINE_QUERY } from "../../../lib/companion-start-script";
import { getFeasibilityPortfolio } from "../../../lib/demo-store";
import type { CompanionSnapshotFilterState, CompanionSnapshotPreviewRow } from "../../../lib/companion-client";
import { resetSnapshotFilterAction, submitSnapshotFilterAction } from "./snapshot-actions";

const SNAPSHOT_ELEMENT_TYPES = ["wall", "slab", "roof", "window", "door", "column", "beam", "object"] as const;

const SNAPSHOT_ROW_TYPE_CLASSES = new Set([
  "zone",
  "wall",
  "slab",
  "roof",
  "window",
  "door",
  "column",
  "beam",
  "object"
]);

function snapshotRowClassName(type: string): string {
  const t = type.trim().toLowerCase();
  const suffix = SNAPSHOT_ROW_TYPE_CLASSES.has(t) ? t : "other";
  return `snapshot-row snapshot-row--${suffix}`;
}

function defaultSnapshotFilter(): CompanionSnapshotFilterState {
  return {
    layers: [],
    element_types: [...SNAPSHOT_ELEMENT_TYPES],
    include_zones: true
  };
}

type AssemblyPreviewSummary = {
  key: string;
  assembly_id: string;
  assembly_name?: string | null;
  assembly_type?: string | null;
  assembly_trade?: string | null;
  assembly_status?: string | null;
  assembly_task_id?: string | null;
  member_count: number;
  types: string[];
  storeys: string[];
  layers: string[];
};

function buildAssemblyPreview(rows: CompanionSnapshotPreviewRow[]): AssemblyPreviewSummary[] {
  const byAssembly = new Map<string, AssemblyPreviewSummary>();
  for (const row of rows) {
    if (row.kind !== "element" || !row.assembly_id) {
      continue;
    }
    const key = row.assembly_uuid || row.assembly_id;
    const existing =
      byAssembly.get(key) ??
      {
        key,
        assembly_id: row.assembly_id,
        assembly_name: row.assembly_name,
        assembly_type: row.assembly_type,
        assembly_trade: row.assembly_trade,
        assembly_status: row.assembly_status,
        assembly_task_id: row.assembly_task_id,
        member_count: 0,
        types: [],
        storeys: [],
        layers: []
      };

    existing.member_count += 1;
    if (row.type && !existing.types.includes(row.type)) {
      existing.types.push(row.type);
    }
    if (row.storey && !existing.storeys.includes(row.storey)) {
      existing.storeys.push(row.storey);
    }
    if (row.layer && !existing.layers.includes(row.layer)) {
      existing.layers.push(row.layer);
    }
    byAssembly.set(key, existing);
  }

  return Array.from(byAssembly.values()).sort((a, b) => a.assembly_id.localeCompare(b.assembly_id));
}

async function runCompanionAction(formData: FormData) {
  "use server";

  const action = String(formData.get("action") ?? "");
  const search = new URLSearchParams();
  try {
    if (action === "connect") {
      const connectResult = await connectCompanion();
      if (connectResult.bridge?.reachable) {
        search.set("status", "Connected. Bridge is reachable and ready.");
      } else {
        search.set(
          "warning",
          "Companion responded but bridge is not reachable yet. Ensure Archicad is open, then retry Connect."
        );
      }
    } else if (action === "disconnect") {
      await disconnectCompanion();
      search.set("status", "Disconnected managed bridge process.");
    } else if (action === "inbound") {
      const result = await runCompanionInbound();
      search.set(
        "status",
        `Inbound completed with status=${result.status}, exit_code=${String(result.exit_code)}.`
      );
    } else if (action === "outbound") {
      const result = await runCompanionOutbound(false);
      search.set(
        "status",
        `Outbound completed with status=${result.status}, exit_code=${String(result.exit_code)}.`
      );
    } else if (action === "outbound_dry_run") {
      const result = await runCompanionOutbound(true);
      search.set(
        "status",
        `Outbound dry-run completed with status=${result.status}, exit_code=${String(result.exit_code)}.`
      );
    } else {
      throw new Error("Unsupported companion action");
    }
  } catch (error) {
    if (error instanceof CompanionRequestError) {
      if (error.kind === "connection_refused") {
        search.set("error", COMPANION_OFFLINE_QUERY);
      } else if (error.kind === "timeout") {
        search.set("error", "The action timed out. Retry, and ensure Archicad is open for Connect.");
      } else {
        search.set("error", error.message);
      }
    } else {
      search.set("error", error instanceof Error ? error.message : "Companion action failed");
    }
  }

  revalidatePath("/");
  revalidatePath("/change-sets");
  revalidatePath("/integrations/archicad");
  redirect(`/integrations/archicad?${search.toString()}`);
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ArchicadIntegrationPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const portfolio = await getFeasibilityPortfolio();
  const statusMessage = typeof params.status === "string" ? params.status : null;
  const errorMessage = typeof params.error === "string" ? params.error : null;
  const companionOfflineFromAction = errorMessage === COMPANION_OFFLINE_QUERY;
  const warningMessage = typeof params.warning === "string" ? params.warning : null;

  let status: Awaited<ReturnType<typeof getCompanionStatus>> | null = null;
  let logs: string[] = [];
  let companionOffline = false;

  try {
    [status, logs] = await Promise.all([getCompanionStatus(), getCompanionLogs(80)]);
  } catch {
    companionOffline = true;
  }

  const snapshotFilter = status?.bridge.snapshot_filter ?? defaultSnapshotFilter();
  const availableLayers = status?.bridge.available_layers ?? [];
  const snapshotPreview = status?.bridge.snapshot_preview ?? null;
  const assemblyPreview = buildAssemblyPreview(snapshotPreview?.snapshot_rows ?? []);
  const linkedOptions = portfolio.sites.flatMap((site) =>
    site.scenarioOptions
      .filter((option) => option.archicadLink)
      .map((option) => ({ site, option }))
  );

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Archicad Live Link</h2>
          <p className="muted">
            Control the local desktop companion to connect an open Archicad session, run connector
            inbound/outbound, and inspect bridge health.
          </p>
        </div>
        <Link className="secondary-link" href="/">
          Back to overview
        </Link>
      </div>

      {statusMessage ? <div className="notice notice-success">{statusMessage}</div> : null}
      {errorMessage && !companionOfflineFromAction ? (
        <div className="notice notice-error">{errorMessage}</div>
      ) : null}
      {warningMessage ? <div className="notice notice-warning">{warningMessage}</div> : null}
      {companionOffline || companionOfflineFromAction ? (
        <CompanionOfflineHelp lastActionFailed={companionOfflineFromAction} />
      ) : null}

      <div className="card-grid">
        <div className="card">
          <strong>Companion Reachable</strong>
          <div>{status ? "yes" : "no"}</div>
        </div>
        <div className="card">
          <strong>Bridge Reachable</strong>
          <div>{status?.bridge.reachable ? "yes" : "no"}</div>
        </div>
        <div className="card">
          <strong>Bridge Process</strong>
          <div>{status?.bridge.process_running ? "running" : "stopped"}</div>
        </div>
        <div className="card">
          <strong>Configured Endpoint</strong>
          <div>
            {status?.bridge.configured_host ?? "127.0.0.1"}:
            {String(status?.bridge.configured_port ?? 19724)}
          </div>
        </div>
      </div>

      <div className="notice notice-warning">
        <strong>Inbound and Supabase.</strong> Run Inbound uses the snapshot filter below. Only zones and
        element types that pass the filter are written to your configured data store (demo runtime or Supabase).
      </div>

      <section className="panel panel-subtle snapshot-filter-panel">
        <h3>Snapshot filter</h3>
        <p className="muted">
          Empty layer selection means <strong>all layers</strong>. Choose element types to query from Archicad,
          then Apply. Reset restores defaults (all layers, all types, zones on).
        </p>
        <form action={submitSnapshotFilterAction} className="filter-form">
          <div className="form-grid snapshot-filter-grid">
            <label className="filter-field">
              <span>Layers</span>
              <span className="muted filter-field-hint">Check one or more layers to restrict the snapshot; leave all unchecked for every layer.</span>
              <div className="layer-checkbox-list" role="group" aria-label="Layers">
                {availableLayers.length === 0 ? (
                  <p className="muted layer-checkbox-empty">
                    {status?.bridge.reachable
                      ? "No layer names yet — refresh the page; if this persists, restart the desktop companion and bridge."
                      : "Connect to bridge to load layers"}
                  </p>
                ) : (
                  availableLayers.map((layer) => (
                    <label key={layer} className="layer-checkbox-row">
                      <input
                        type="checkbox"
                        name="layers"
                        value={layer}
                        defaultChecked={snapshotFilter.layers.includes(layer)}
                      />
                      <span>{layer}</span>
                    </label>
                  ))
                )}
              </div>
            </label>
            <div className="snapshot-filter-element-column">
              <fieldset>
                <legend>Element types</legend>
                <div className="checkbox-grid">
                  {SNAPSHOT_ELEMENT_TYPES.map((t) => (
                    <label key={t} className="inline-check">
                      <input
                        type="checkbox"
                        name="element_types"
                        value={t}
                        defaultChecked={snapshotFilter.element_types.includes(t)}
                      />{" "}
                      {t}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="snapshot-filter-active-layers">
                <strong>Layers in filter</strong>
                {snapshotFilter.layers.length === 0 ? (
                  <p className="muted snapshot-filter-active-layers-body">
                    No restriction — all layers are included when none are ticked above.
                  </p>
                ) : (
                  <ul className="snapshot-filter-active-layers-list">
                    {snapshotFilter.layers.map((layer) => (
                      <li key={layer}>{layer}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <label className="inline-check snapshot-filter-include-zones">
              <input type="checkbox" name="include_zones" defaultChecked={snapshotFilter.include_zones} /> Include
              zones
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="secondary-button">
              Apply filter
            </button>
          </div>
        </form>
        <form action={resetSnapshotFilterAction} style={{ marginTop: 8 }}>
          <button type="submit" className="secondary-button">
            Reset filter
          </button>
        </form>
      </section>

      <form action={runCompanionAction} className="actions integrations-actions">
        <CompanionActionButton action="connect" label="Connect" pendingLabel="Connecting..." />
        <CompanionActionButton action="disconnect" label="Disconnect" pendingLabel="Disconnecting..." />
        <CompanionActionButton action="inbound" label="Run Inbound" pendingLabel="Running inbound..." />
        <CompanionActionButton
          action="outbound_dry_run"
          label="Run Outbound Dry-Run"
          pendingLabel="Running dry-run..."
        />
        <CompanionActionButton action="outbound" label="Run Outbound" pendingLabel="Running outbound..." />
      </form>

      <section className="panel panel-subtle">
        <h3>Bridge Identity</h3>
        {status?.bridge.product_info ? (
          <pre className="log-box">{JSON.stringify(status.bridge.product_info, null, 2)}</pre>
        ) : (
          <p className="muted">No live product-info response available yet.</p>
        )}
      </section>

      <section className="panel panel-subtle">
        <h3>Snapshot summary</h3>
        {status?.bridge.snapshot_summary ? (
          <p>
            Zones in filter: <strong>{status.bridge.snapshot_summary.zones}</strong>, Elements in filter:{" "}
            <strong>{status.bridge.snapshot_summary.elements}</strong>
          </p>
        ) : (
          <p className="muted">No snapshot summary available (bridge offline or snapshot request failed).</p>
        )}
        {snapshotPreview?.counts_by_type ? (
          <p className="muted">
            Counts by type:{" "}
            {Object.entries(snapshotPreview.counts_by_type)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(" · ")}
          </p>
        ) : null}
        {snapshotPreview && snapshotPreview.snapshot_rows.length > 0 ? (
          <div className="snapshot-rows-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Element / zone ID</th>
                  <th>Archicad GUID</th>
                  <th>Layer</th>
                  <th>Storey</th>
                  <th>Area</th>
                  <th>BuildSync assembly</th>
                  <th>IFC / classification</th>
                </tr>
              </thead>
              <tbody>
                {snapshotPreview.snapshot_rows.map((row, idx) => (
                  <tr key={`${row.archicad_guid ?? row.element_id}-${idx}`} className={snapshotRowClassName(row.type)}>
                    <td>{row.type}</td>
                    <td>{row.element_id}</td>
                    <td className="muted">{row.archicad_guid ?? "—"}</td>
                    <td>{row.layer ?? "—"}</td>
                    <td>{row.storey ?? "—"}</td>
                    <td>{row.area ?? "—"}</td>
                    <td>
                      {row.assembly_id ? (
                        <>
                          <strong>{row.assembly_id}</strong>
                          {row.assembly_name ? <span className="muted"> {row.assembly_name}</span> : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{row.ifc_type ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {snapshotPreview.snapshot_rows_truncated ? (
              <p className="muted">Table is capped; more rows exist in the model.</p>
            ) : null}
          </div>
        ) : status?.bridge.reachable ? (
          <p className="muted">No preview rows yet. Apply the filter or connect the bridge.</p>
        ) : null}
      </section>

      <section className="panel panel-subtle">
        <h3>BuildSync Assembly Preview</h3>
        <p className="muted">
          Read-only view of assemblies found in the current Archicad snapshot filter. This uses stamped `BS_*`
          metadata and does not write back to Archicad.
        </p>
        {assemblyPreview.length > 0 ? (
          <div className="snapshot-rows-wrap">
            <table>
              <thead>
                <tr>
                  <th>Assembly</th>
                  <th>Type</th>
                  <th>Trade</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th>Storeys</th>
                  <th>Layers</th>
                  <th>Task</th>
                </tr>
              </thead>
              <tbody>
                {assemblyPreview.map((assembly) => (
                  <tr key={assembly.key}>
                    <td>
                      <strong>{assembly.assembly_id}</strong>
                      {assembly.assembly_name ? <div className="muted">{assembly.assembly_name}</div> : null}
                    </td>
                    <td>{assembly.assembly_type ?? "—"}</td>
                    <td>{assembly.assembly_trade ?? "—"}</td>
                    <td>
                      <span className={`assembly-status assembly-status--${assembly.assembly_status ?? "unknown"}`}>
                        {assembly.assembly_status ?? "unknown"}
                      </span>
                    </td>
                    <td>
                      {assembly.member_count}
                      {assembly.types.length > 0 ? <div className="muted">{assembly.types.join(", ")}</div> : null}
                    </td>
                    <td>{assembly.storeys.length > 0 ? assembly.storeys.join(", ") : "—"}</td>
                    <td>{assembly.layers.length > 0 ? assembly.layers.join(", ") : "—"}</td>
                    <td>{assembly.assembly_task_id ?? "Unlinked"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No BuildSync assemblies found in the current snapshot. Create/stamp assemblies in Archicad or use the demo
            snapshot fixture to preview this panel.
          </p>
        )}
      </section>

      <section className="panel panel-subtle">
        <h3>Feasibility Scenario Links</h3>
        <p className="muted">
          Site scenario options can point at Archicad files and assembly task IDs, then continue into the linked
          scenario editor and linear schedule.
        </p>
        {linkedOptions.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Site Option</th>
                <th>Archicad File</th>
                <th>GUIDs</th>
                <th>Assembly Tasks</th>
                <th>Schedule Link</th>
              </tr>
            </thead>
            <tbody>
              {linkedOptions.map(({ site, option }) => (
                <tr key={option.id}>
                  <td>
                    <Link href={`/sites/${site.id}`}>{option.name}</Link>
                    <div className="muted">{site.name}</div>
                  </td>
                  <td>
                    {option.archicadLink?.file_label}
                    <div className="muted">{option.archicadLink?.model_scope ?? "Model scope not set"}</div>
                  </td>
                  <td>{option.archicadLink?.linked_guid_count ?? 0}</td>
                  <td>
                    {option.assemblyTaskIds.length > 0 ? option.assemblyTaskIds.join(", ") : "No task IDs linked"}
                  </td>
                  <td>
                    {option.scenario_id ? (
                      <Link href={`/linear-schedule?scenarioId=${option.scenario_id}`}>
                        {option.scheduleSummary.activityCount} activities
                      </Link>
                    ) : (
                      <span className="muted">No scenario schedule</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No feasibility scenario options are linked to Archicad yet.</p>
        )}
      </section>

      <section className="panel panel-subtle">
        <h3>Last Connector Run</h3>
        {status?.connector.last_result ? (
          <pre className="log-box">{JSON.stringify(status.connector.last_result, null, 2)}</pre>
        ) : (
          <p className="muted">No connector run has been executed by the companion yet.</p>
        )}
      </section>

      <section className="panel panel-subtle">
        <h3>Companion Logs</h3>
        {logs.length === 0 ? (
          <p className="muted">No logs yet.</p>
        ) : (
          <pre className="log-box">{logs.join("\n")}</pre>
        )}
      </section>
    </section>
  );
}
