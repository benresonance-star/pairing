import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type StoreModule = {
  getFeasibilityPortfolio(): Promise<{
    masterCodeCatalogs: Array<{ id: string; name: string; status: string }>;
    masterCodeItems: Array<{ id: string; code: string; title: string; status: string }>;
    masterCostItems: Array<{ id: string; master_code_item_id?: string | null; cost_code: string; title: string }>;
  }>;
  createMasterCodeItem(input: {
    catalogId: string;
    code: string;
    title: string;
    codeType: string;
    tradeCode?: string | null;
    packageId?: string | null;
    defaultUnit?: string | null;
    defaultEstimateGranularity?: string | null;
    defaultCostingMethod?: string | null;
    status?: string | null;
  }): Promise<{ itemId: string }>;
  updateMasterCodeItem(input: {
    itemId: string;
    catalogId: string;
    code: string;
    title: string;
    codeType: string;
    tradeCode?: string | null;
    packageId?: string | null;
    defaultUnit?: string | null;
    defaultEstimateGranularity?: string | null;
    defaultCostingMethod?: string | null;
    status?: string | null;
  }): Promise<void>;
  archiveMasterCodeItem(itemId: string): Promise<void>;
  deleteMasterCodeItem(itemId: string): Promise<void>;
  createMasterDatabaseItem(input: {
    masterCodeItemId?: string | null;
    costCode: string;
    title: string;
    tradeCode?: string | null;
    packageId?: string | null;
    estimateGranularity: string;
    costingMethod: string;
    unit: string;
    baseRate: number;
    status?: string | null;
  }): Promise<{ itemId: string }>;
  deleteMasterDatabaseItem(itemId: string): Promise<void>;
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
    throw new Error("CCP_DATA_SOURCE must be 'supabase' for the live catalog smoke check");
  }

  if (!skipBootstrap) {
    run("npm", ["run", "supabase:bootstrap"]);
  }

  const store = await loadStore();
  const portfolio = await store.getFeasibilityPortfolio();
  const catalog = portfolio.masterCodeCatalogs.find((item) => item.status !== "archived") ?? portfolio.masterCodeCatalogs[0];
  assert(catalog, "No global master code catalog was available after Supabase bootstrap");
  assert(portfolio.masterCodeItems.length > 0, "No global master code items were available after Supabase bootstrap");

  const suffix = Date.now().toString(36);
  const code = `SMOKE-${suffix}`;
  const createdCode = await store.createMasterCodeItem({
    catalogId: catalog.id,
    code,
    title: "Smoke catalog item",
    codeType: "cost_item",
    tradeCode: "smoke",
    packageId: "PKG-SMOKE",
    defaultUnit: "item",
    defaultEstimateGranularity: "material",
    defaultCostingMethod: "rate_per_item",
    status: "draft"
  });

  await store.updateMasterCodeItem({
    itemId: createdCode.itemId,
    catalogId: catalog.id,
    code,
    title: "Smoke catalog item updated",
    codeType: "cost_item",
    tradeCode: "smoke",
    packageId: "PKG-SMOKE",
    defaultUnit: "item",
    defaultEstimateGranularity: "material",
    defaultCostingMethod: "rate_per_item",
    status: "draft"
  });

  const createdMaster = await store.createMasterDatabaseItem({
    masterCodeItemId: createdCode.itemId,
    costCode: code,
    title: "Project smoke snapshot",
    tradeCode: "smoke",
    packageId: "PKG-SMOKE",
    estimateGranularity: "material",
    costingMethod: "rate_per_item",
    unit: "item",
    baseRate: 1,
    status: "draft"
  });

  const linkedPortfolio = await store.getFeasibilityPortfolio();
  const linkedMasterItem = linkedPortfolio.masterCostItems.find((item) => item.id === createdMaster.itemId);
  assert(linkedMasterItem?.master_code_item_id === createdCode.itemId, "Master cost item did not retain master_code_item_id");
  assert(linkedMasterItem.title === "Project smoke snapshot", "Master cost item snapshot title changed unexpectedly");

  await store.updateMasterCodeItem({
    itemId: createdCode.itemId,
    catalogId: catalog.id,
    code,
    title: "Smoke catalog item changed after snapshot",
    codeType: "cost_item",
    tradeCode: "smoke",
    packageId: "PKG-SMOKE",
    defaultUnit: "item",
    defaultEstimateGranularity: "material",
    defaultCostingMethod: "rate_per_item",
    status: "draft"
  });

  const snapshotPortfolio = await store.getFeasibilityPortfolio();
  const snapshotMasterItem = snapshotPortfolio.masterCostItems.find((item) => item.id === createdMaster.itemId);
  assert(snapshotMasterItem?.title === "Project smoke snapshot", "Global catalog update mutated project snapshot");

  let blockedDelete = false;
  try {
    await store.deleteMasterCodeItem(createdCode.itemId);
  } catch {
    blockedDelete = true;
  }
  assert(blockedDelete, "Used master code item was deleted instead of blocked");

  await store.deleteMasterDatabaseItem(createdMaster.itemId);
  await store.archiveMasterCodeItem(createdCode.itemId);
  await store.deleteMasterCodeItem(createdCode.itemId);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        catalogId: catalog.id,
        smokeCode: code,
        linkedMasterItemId: createdMaster.itemId
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
