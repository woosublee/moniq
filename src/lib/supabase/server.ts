import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export const createSupabaseServerClient = () =>
  createClient(env.nextPublicSupabaseUrl, env.nextPublicSupabaseAnonKey);
