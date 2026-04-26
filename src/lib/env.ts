const readEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
};

export const env = {
  nextPublicSupabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  nextPublicSupabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};
