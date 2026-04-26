import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export const supabaseBrowserClient = createClient(
  env.nextPublicSupabaseUrl,
  env.nextPublicSupabaseAnonKey,
);
