import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  connectCompanion,
  disconnectCompanion,
  getCompanionLogs,
  getCompanionStatus,
  runCompanionInbound,
  runCompanionOutbound
} from "../../../lib/companion-client";

async function runCompanionAction(formData: FormData) {
  "use server";

  const action = String(formData.get("action") ?? "");
  const search = new URLSearchParams();
  try {
    if (action === "connect") {
      await connectCompanion();
      search.set("status", "Connected to local Archicad companion.");
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
    search.set("error", error instanceof Error ? error.message : "Companion action failed");
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

  let status: Awaited<ReturnType<typeof getCompanionStatus>> | null = null;
  let logs: string[] = [];
  let statusError: string | null = null;

  try {
    [status, logs] = await Promise.all([getCompanionStatus(), getCompanionLogs(80)]);
  } catch (error) {
    statusError = error instanceof Error ? error.message : "Failed to read companion status";
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
      {statusError ? <div className="notice notice-error">{statusError}</div> : null}

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

      <div className="actions integrations-actions">
        <form action={runCompanionAction}>
          <input type="hidden" name="action" value="connect" />
          <button type="submit">Connect</button>
        </form>
        <form action={runCompanionAction}>
          <input type="hidden" name="action" value="disconnect" />
          <button type="submit">Disconnect</button>
        </form>
        <form action={runCompanionAction}>
          <input type="hidden" name="action" value="inbound" />
          <button type="submit">Run Inbound</button>
        </form>
        <form action={runCompanionAction}>
          <input type="hidden" name="action" value="outbound_dry_run" />
          <button type="submit">Run Outbound Dry-Run</button>
        </form>
        <form action={runCompanionAction}>
          <input type="hidden" name="action" value="outbound" />
          <button type="submit">Run Outbound</button>
        </form>
      </div>

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
