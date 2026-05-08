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
import { CompanionActionButton } from "./companion-action-button";

async function runCompanionAction(formData: FormData) {
  "use server";

  const action = String(formData.get("action") ?? "");
  const search = new URLSearchParams();
  try {
    if (action === "connect") {
      await connectCompanion();
      const status = await getCompanionStatus();
      if (status.bridge.reachable) {
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
        search.set("error", "Desktop companion is offline. Start `npm run archicad:companion` and retry.");
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
  const statusMessage = typeof params.status === "string" ? params.status : null;
  const errorMessage = typeof params.error === "string" ? params.error : null;
  const warningMessage = typeof params.warning === "string" ? params.warning : null;

  let status: Awaited<ReturnType<typeof getCompanionStatus>> | null = null;
  let logs: string[] = [];
  let companionOffline = false;

  try {
    [status, logs] = await Promise.all([getCompanionStatus(), getCompanionLogs(80)]);
  } catch {
    companionOffline = true;
  }

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
      {errorMessage ? <div className="notice notice-error">{errorMessage}</div> : null}
      {warningMessage ? <div className="notice notice-warning">{warningMessage}</div> : null}
      {companionOffline ? (
        <div className="notice">
          Desktop companion is offline. Start <code>npm run archicad:companion</code>, then click Connect.
        </div>
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
        <h3>Snapshot Summary</h3>
        {status?.bridge.snapshot_summary ? (
          <p>
            Zones: <strong>{status.bridge.snapshot_summary.zones}</strong>, Elements:{" "}
            <strong>{status.bridge.snapshot_summary.elements}</strong>
          </p>
        ) : (
          <p className="muted">No snapshot summary available.</p>
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
