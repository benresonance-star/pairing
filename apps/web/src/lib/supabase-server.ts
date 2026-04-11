import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requiredEnv } from "./data-source";

export function createServerSupabaseClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
