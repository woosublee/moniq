const nextPublicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const nextPublicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!nextPublicSupabaseUrl || !nextPublicSupabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
  );
}

export const env = {
  nextPublicSupabaseUrl,
  nextPublicSupabaseAnonKey,
};
