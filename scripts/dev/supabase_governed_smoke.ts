import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ScenarioRow = {
  id: string;
  name: string;
  status: string;
};

type OperationalRow = {
  id: string;
  constructionState: string | null;
  packageId: string | null;
  sequenceGroup: string | null;
  sequenceOrder: number | null;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
};

type StoreModule = {
  getScenarios(): Promise<ScenarioRow[]>;
  getScenarioEditorData(scenarioId: string): Promise<{ operationalRows: OperationalRow[] }>;
  createScenarioOperationalChangeSet(input: {
    scenarioId: string;
    operationalRowId: string;
    patch: {
      packageId?: string | null;
      constructionState?: string | null;
      sequenceGroup?: string | null;
      sequenceOrder?: number | null;
      plannedStart?: string | null;
      plannedFinish?: string | null;
      actualStart?: string | null;
      actualFinish?: string | null;
    };
  }): Promise<{ changeSetId: string; targetLabel: string; itemCount: number }>;
  transitionChangeSet(changeSetId: string, action: "submit" | "approve" | "queue"): Promise<string>;
  getChangeSets(scenarioId?: string | null): Promise<Array<{ id: string; status: string; itemCount: number }>>;
  getRecentWrites(): Promise<Array<Record<string, unknown>>>;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function loadDotEnv(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const [name, ...rest] = line.split("=");
    if (name && process.env[name] === undefined) {
      process.env[name] = rest.join("=").trim();
    }
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable '${name}'`);
  }
  return value;
}

function run(command: string, args: string[]) {
  const result = spawnSync([command, ...args].join(" "), {
    cwd: repoRoot,
    shell: true,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function nextConstructionState(current: string | null) {
  return current === "blocked" ? "ready" : "blocked";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadStore(): Promise<StoreModule> {
  const imported = await import("../../apps/web/src/lib/demo-store");
  return (imported.default ?? imported["module.exports"] ?? imported) as StoreModule;
}

async function main() {
  const skipBootstrap = process.argv.includes("--skip-bootstrap");
  loadDotEnv(path.join(repoRoot, ".env"));

  requiredEnv("PROJECT_ID");
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  requiredEnv("SUPABASE_DB_URL");
  if (process.env.CCP_DATA_SOURCE !== "supabase") {
    throw new Error("CCP_DATA_SOURCE must be 'supabase' for the live smoke check");
  }

  if (!skipBootstrap) {
    run("npm", ["run", "supabase:bootstrap"]);
  }

  const store = await loadStore();
  const scenarios = await store.getScenarios();
  const scenario = scenarios.find((item) => item.status === "baseline") ?? scenarios[0];
  assert(scenario, "No scenario was available after Supabase bootstrap");

  const editorData = await store.getScenarioEditorData(scenario.id);
  const row = editorData.operationalRows[0];
  assert(row, "No operational row was available after Supabase bootstrap");

  const proposedState = nextConstructionState(row.constructionState);
  const result = await store.createScenarioOperationalChangeSet({
    scenarioId: scenario.id,
    operationalRowId: row.id,
    patch: {
      packageId: row.packageId,
      constructionState: proposedState,
      sequenceGroup: row.sequenceGroup,
      sequenceOrder: row.sequenceOrder,
      plannedStart: row.plannedStart,
      plannedFinish: row.plannedFinish,
      actualStart: row.actualStart,
      actualFinish: row.actualFinish
    }
  });
  assert(result.itemCount === 1, `Expected one changed item, received ${result.itemCount}`);

  const draftData = await store.getScenarioEditorData(scenario.id);
  const draftRow = draftData.operationalRows.find((item) => item.id === row.id);
  assert(draftRow?.constructionState === row.constructionState, "Operational row changed before approval/sync");

  const draftChangeSet = (await store.getChangeSets(scenario.id)).find((item) => item.id === result.changeSetId);
  assert(draftChangeSet?.status === "draft", "Scenario edit did not create a draft change set");
  assert(draftChangeSet.itemCount === 1, "Draft change set did not contain one item");

  await store.transitionChangeSet(result.changeSetId, "submit");
  await store.transitionChangeSet(result.changeSetId, "approve");
  await store.transitionChangeSet(result.changeSetId, "queue");

  run("python", ["scripts/dev/connector_cli.py", "outbound", "--dry-run"]);

  const syncedChangeSet = (await store.getChangeSets(scenario.id)).find((item) => item.id === result.changeSetId);
  const syncedData = await store.getScenarioEditorData(scenario.id);
  const syncedRow = syncedData.operationalRows.find((item) => item.id === row.id);
  const write = (await store.getRecentWrites()).find((item) => item.change_set_id === result.changeSetId);

  assert(syncedChangeSet?.status === "synced", "Queued change set was not marked synced");
  assert(syncedRow?.constructionState === proposedState, "Operational row was not updated by outbound sync");
  assert(write?.field_name === "CCP_ConstructionState", "Outbound sync did not record CCP_ConstructionState");
  assert(write?.field_value === proposedState, "Recorded Archicad write value did not match proposed state");
  assert(write?.dry_run === true, "Smoke check must record outbound writes as dry-run");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        scenarioId: scenario.id,
        operationalRowId: row.id,
        targetLabel: result.targetLabel,
        changeSetId: result.changeSetId,
        originalState: row.constructionState,
        syncedState: proposedState,
        writeField: write.field_name,
        dryRun: write.dry_run
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
