import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

export const createSupabaseServerClient = () =>
  createClient(env.nextPublicSupabaseUrl, serverEnv.supabaseServiceRoleKey);
