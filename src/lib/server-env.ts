import "server-only";

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const moniqOwnerId = process.env.MONIQ_OWNER_ID;

if (!supabaseServiceRoleKey || !moniqOwnerId) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY and MONIQ_OWNER_ID are required.");
}

export const serverEnv = {
  supabaseServiceRoleKey,
  moniqOwnerId,
};
