export type DataSourceMode = "demo" | "supabase";

function normalizeMode(value: string | undefined): DataSourceMode {
  return value === "supabase" ? "supabase" : "demo";
}

export function getDataSourceMode(): DataSourceMode {
  return normalizeMode(process.env.CCP_DATA_SOURCE);
}

export function isSupabaseMode(): boolean {
  return getDataSourceMode() === "supabase";
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable '${name}'`);
  }
  return value;
}

export function projectIdFromEnv(): string {
  return requiredEnv("PROJECT_ID");
}
