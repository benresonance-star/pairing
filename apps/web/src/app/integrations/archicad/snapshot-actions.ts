"use server";

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";

import { CompanionRequestError, setCompanionSnapshotFilter } from "../../../lib/companion-client";

const ALL_TYPES = ["wall", "slab", "roof", "window", "door", "column", "beam", "object"] as const;

const FILTER_FILENAME = "companion_snapshot_filter.json";

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const directRoot = path.join(cwd, "shared");
  return existsSync(directRoot) ? cwd : path.resolve(cwd, "../..");
}

async function persistSnapshotFilterFile(body: Record<string, unknown>): Promise<void> {
  const root = resolveRepoRoot();
  const dir = path.join(root, "shared", "examples", "runtime");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, FILTER_FILENAME);
  await writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");
}

async function notifyCompanionSnapshotFilter(body: Record<string, never> | Record<string, unknown>): Promise<void> {
  try {
    await setCompanionSnapshotFilter(body);
  } catch (error) {
    if (error instanceof CompanionRequestError && error.kind === "not_found") {
      return;
    }
    throw error;
  }
}

export async function submitSnapshotFilterAction(formData: FormData) {
  const layers = formData.getAll("layers").map(String).filter((s) => s.length > 0);
  const elementTypes = formData.getAll("element_types").map(String).filter((s) => s.length > 0);
  const includeZones = formData.get("include_zones") === "on";
  const payload = {
    layers,
    element_types: elementTypes.length > 0 ? elementTypes : [...ALL_TYPES],
    include_zones: includeZones
  };
  await persistSnapshotFilterFile(payload);
  await notifyCompanionSnapshotFilter(payload);
  revalidatePath("/integrations/archicad");
  revalidatePath("/");
}

export async function resetSnapshotFilterAction() {
  await persistSnapshotFilterFile({});
  await notifyCompanionSnapshotFilter({});
  revalidatePath("/integrations/archicad");
  revalidatePath("/");
}
