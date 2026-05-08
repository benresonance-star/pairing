type CompanionConnectorResult = {
  status: "ok" | "error";
  command: string;
  dry_run: boolean;
  exit_code: number;
  output: string;
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
  };
  connector: {
    last_result: CompanionConnectorResult | null;
  };
};

type CompanionLogsResponse = {
  logs: string[];
};

function companionBaseUrl() {
  return process.env.ARCHICAD_COMPANION_URL ?? "http://127.0.0.1:19725";
}

async function companionRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = process.env.ARCHICAD_COMPANION_TOKEN;
  if (token) {
    headers.set("x-companion-token", token);
  }

  const response = await fetch(`${companionBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Companion request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function getCompanionStatus(): Promise<CompanionStatusResponse> {
  return companionRequest<CompanionStatusResponse>("/companion/status");
}

export async function getCompanionLogs(limit = 120): Promise<string[]> {
  const payload = await companionRequest<CompanionLogsResponse>(`/companion/logs?limit=${limit}`);
  return payload.logs;
}

export async function connectCompanion() {
  return companionRequest<Record<string, unknown>>("/companion/connect", { method: "POST" });
}

export async function disconnectCompanion() {
  return companionRequest<Record<string, unknown>>("/companion/disconnect", { method: "POST" });
}

export async function runCompanionInbound() {
  return companionRequest<CompanionConnectorResult>("/companion/inbound", { method: "POST" });
}

export async function runCompanionOutbound(dryRun: boolean) {
  return companionRequest<CompanionConnectorResult>("/companion/outbound", {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun })
  });
}
