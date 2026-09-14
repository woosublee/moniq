import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

export const createSupabaseBrowserClient = () =>
  createBrowserClient(
    env.nextPublicSupabaseUrl,
    env.nextPublicSupabaseAnonKey,
  );

export const supabaseBrowserClient = createSupabaseBrowserClient();
