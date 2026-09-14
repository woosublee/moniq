import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputs } from "@/features/card-benefits/replay.fixtures";
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), paths: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => boundary.paths.push(path) }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerContext: async () => ({ ownerId: "synthetic-owner", canMutate: true, mode: "authenticated" }), assertCanMutate: () => undefined, createAuthorizedSupabaseServerClient: async () => ({ rpc: boundary.rpc }) }));
vi.mock("@/lib/supabase/queries", () => ({ searchCards: async () => [] }));
const id = "22222222-2222-4222-8222-222222222901";
const requestId = "11111111-1111-4111-8111-111111111901";
describe("card mutation command integration", () => {
  beforeEach(() => {
    boundary.rpc.mockReset(); boundary.paths.length = 0;
    boundary.rpc.mockResolvedValueOnce({ data: { requestId, ownerRevision: "1", resultIds: [id], replayed: false }, error: null })
      .mockResolvedValueOnce({ data: { ownerId: "synthetic-owner", ownerRevision: "1", throughMonth: "2026-02", inputs: inputs() }, error: null });
  });
  it("changes default card through versioned command rather than legacy definer RPC", async () => {
    const { setDefaultUserCard } = await import("./actions");
    const data = new FormData(); data.set("requestId", requestId); data.set("version", "9"); data.set("month", "2026-02");
    await setDefaultUserCard(id, data);
    expect(boundary.rpc.mock.calls[0]).toEqual(["apply_ledger_command", { request_id: requestId, command: { kind: "card.default", id, expected_version: "9" } }]);
    expect(boundary.paths).toContain("/cards/[userCardId]");
  });
});
