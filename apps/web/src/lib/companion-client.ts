type CompanionConnectorResult = {
  status: "ok" | "error";
  command: string;
  dry_run: boolean;
  exit_code: number;
  output: string;
};

export type CompanionSnapshotFilterState = {
  layers: string[];
  element_types: string[];
  include_zones: boolean;
};

export type CompanionSnapshotPreviewRow = {
  kind: string;
  type: string;
  element_id: string;
  archicad_guid?: string;
  layer?: string | null;
  storey?: string | null;
  ifc_type?: string | null;
  assembly_id?: string | null;
  assembly_name?: string | null;
  area?: number | null;
};

export type CompanionSnapshotPreview = {
  zone_count: number;
  element_count: number;
  counts_by_type?: Record<string, number>;
  snapshot_rows: CompanionSnapshotPreviewRow[];
  snapshot_rows_truncated?: boolean;
  /** Layer names from the same snapshot as rows (subset of project layers when filter is narrow). */
  layer_names?: string[];
};

type CompanionStatusResponse = {
  bridge: {
    managed: boolean;
    configured_host: string;
    configured_port: number;
    process_running: boolean;
    process_pid: number | null;
    reachable: boolean;
    last_error: string | null;
    product_info: Record<string, unknown> | null;
    snapshot_summary: { zones: number; elements: number } | null;
    snapshot_filter?: CompanionSnapshotFilterState;
    available_layers?: string[];
    snapshot_preview?: CompanionSnapshotPreview | null;
  };
  connector: {
    last_result: CompanionConnectorResult | null;
  };
};

type CompanionLogsResponse = {
  logs: string[];
};

export type CompanionConnectResponse = {
  status: string;
  product_info?: Record<string, unknown>;
  bridge?: {
    reachable?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CompanionErrorKind =
  | "timeout"
  | "connection_refused"
  | "unauthorized"
  | "not_found"
  | "server_error"
  | "network_error";

export class CompanionRequestError extends Error {
  kind: CompanionErrorKind;
  statusCode?: number;

  constructor(message: string, kind: CompanionErrorKind, statusCode?: number) {
    super(message);
    this.name = "CompanionRequestError";
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

function companionBaseUrl() {
  const raw = (process.env.ARCHICAD_COMPANION_URL ?? "http://127.0.0.1:19725").trim();
  return raw.replace(/\/+$/, "");
}

type CompanionRequestOptions = RequestInit & {
  timeoutMs?: number;
};

function toCompanionRequestError(error: unknown, path: string): CompanionRequestError {
  if (error instanceof CompanionRequestError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new CompanionRequestError(
      `Companion request to '${path}' timed out. Ensure the local companion is running and retry.`,
      "timeout"
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
    return new CompanionRequestError(
      "Could not reach desktop companion. Open Integrations → Archicad for a copy-paste PowerShell script.",
      "connection_refused"
    );
  }
  return new CompanionRequestError(
    `Companion request to '${path}' failed: ${message}`,
    "network_error"
  );
}

async function companionRequest<T>(path: string, init?: CompanionRequestOptions): Promise<T> {
  const { timeoutMs, ...fetchInit } = init ?? {};
  const headers = new Headers(fetchInit.headers);
  headers.set("Content-Type", "application/json");
  const token = process.env.ARCHICAD_COMPANION_TOKEN;
  if (token) {
    headers.set("x-companion-token", token);
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs ?? 2500);

  let response: Response;
  try {
    const base = companionBaseUrl();
    const suffix = path.startsWith("/") ? path : `/${path}`;
    response = await fetch(`${base}${suffix}`, {
      ...fetchInit,
      headers,
      signal: fetchInit.signal ?? timeoutSignal,
      cache: "no-store"
    });
  } catch (error) {
    throw toCompanionRequestError(error, path);
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      throw new CompanionRequestError(
        "Companion authorization failed. Check ARCHICAD_COMPANION_TOKEN.",
        "unauthorized",
        response.status
      );
    }
    if (response.status === 404) {
      throw new CompanionRequestError(
        `Companion returned 404 for '${path}'. If you recently updated the repo, stop and restart ` +
          "`npm run archicad:companion` so `POST /companion/snapshot-filter` is registered. " +
          `Confirm ARCHICAD_COMPANION_URL (${companionBaseUrl()}) points at the desktop companion.`,
        "not_found",
        response.status
      );
    }
    throw new CompanionRequestError(
      `Companion request failed (${response.status}): ${body}`,
      "server_error",
      response.status
    );
  }

  return (await response.json()) as T;
}

export async function getCompanionStatus(): Promise<CompanionStatusResponse> {
  return companionRequest<CompanionStatusResponse>("/companion/status", { timeoutMs: 1500 });
}

export async function getCompanionLogs(limit = 120): Promise<string[]> {
  const payload = await companionRequest<CompanionLogsResponse>(`/companion/logs?limit=${limit}`, {
    timeoutMs: 1500
  });
  return payload.logs;
}

export async function connectCompanion() {
  return companionRequest<CompanionConnectResponse>("/companion/connect", {
    method: "POST",
    timeoutMs: 45000
  });
}

export async function disconnectCompanion() {
  return companionRequest<Record<string, unknown>>("/companion/disconnect", {
    method: "POST",
    timeoutMs: 7000
  });
}

export async function runCompanionInbound() {
  return companionRequest<CompanionConnectorResult>("/companion/inbound", {
    method: "POST",
    timeoutMs: 45000
  });
}

export async function runCompanionOutbound(dryRun: boolean) {
  return companionRequest<CompanionConnectorResult>("/companion/outbound", {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun }),
    timeoutMs: dryRun ? 45000 : 60000
  });
}

export async function setCompanionSnapshotFilter(filter: Partial<CompanionSnapshotFilterState> | Record<string, never>) {
  return companionRequest<{ status: string; filter: CompanionSnapshotFilterState }>("/companion/snapshot-filter", {
    method: "POST",
    body: JSON.stringify(filter),
    timeoutMs: 15000
  });
}
