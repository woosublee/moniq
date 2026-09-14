import "server-only";

const defaultMoniqOwnerId = "00000000-0000-0000-0000-000000000001";
const defaultDemoOwnerId = "00000000-0000-0000-0000-000000000999";

const getRequiredServerEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
};

export const serverEnv = {
  get supabaseServiceRoleKey() {
    return getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get moniqOwnerId() {
    return process.env.MONIQ_OWNER_ID || defaultMoniqOwnerId;
  },
  get moniqDemoOwnerId() {
    return process.env.MONIQ_DEMO_OWNER_ID || defaultDemoOwnerId;
  },
};
