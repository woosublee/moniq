import { describe, expect, it } from "vitest";
import { createLedgerFormAttempt } from "./ledger-request-fields";

type State = { status: "idle" | "success" | "error" | "outcome_unknown" | "saved_needs_review"; message: string };
const idle: State = { status: "idle", message: "" };
const data = () => { const form = new FormData(); form.set("requestId", ""); form.set("entryId", ""); form.set("merchantName", "synthetic cafe"); form.set("amount", "1000"); return form; };

describe("form request lifecycle with real FormData", () => {
  it("fills IDs before sending and rotates both after each committed creation, even when reset posts old hidden values", async () => {
    const sent: FormData[] = [];
    const action = createLedgerFormAttempt(async (_: State, form: FormData): Promise<State> => { sent.push(form); return { status: "success", message: "saved" }; }, { create: true, month: "2026-02" });
    const first = await action(idle, data());
    const reset = data(); reset.set("requestId", String(sent[0].get("requestId"))); reset.set("entryId", String(sent[0].get("entryId")));
    await action(first, reset);
    for (const field of ["requestId", "entryId"]) { expect(sent[0].get(field)).toMatch(/^[0-9a-f-]{36}$/); expect(sent[1].get(field)).not.toBe(sent[0].get(field)); }
    expect(sent[0].get("month")).toBe("2026-02");
  });
  it("replays the identical captured payload after response loss despite reset/edited fields", async () => {
    const sent: FormData[] = [];
    const action = createLedgerFormAttempt(async (_: State, form: FormData): Promise<State> => { sent.push(form); return { status: sent.length === 1 ? "outcome_unknown" : "success", message: "result" }; }, { create: true, month: "2026-02" });
    const original = data(); const first = await action(idle, original);
    original.set("amount", "9000");
    await action(first, new FormData());
    expect([...sent[1]]).toEqual([...sent[0]]);
    expect(sent[1].get("amount")).toBe("1000");
  });
  it("retains the mounted version/month instead of accepting refreshed defaults and blocks editing again after commit", async () => {
    const sent: FormData[] = [];
    const action = createLedgerFormAttempt(async (_: State, form: FormData): Promise<State> => { sent.push(form); return { status: "success", message: "saved" }; }, { version: "9007199254740993", month: "2026-02" });
    const refreshed = data(); refreshed.set("version", "9007199254740994"); refreshed.set("month", "2026-03");
    const result = await action(idle, refreshed);
    expect(sent[0].get("version")).toBe("9007199254740993"); expect(sent[0].get("month")).toBe("2026-02");
    expect((await action(result, refreshed)).status).toBe("error"); expect(sent).toHaveLength(1);
  });
  it("accepts corrected input with a new request after definite rejection", async () => {
    const sent: FormData[] = [];
    const action = createLedgerFormAttempt(async (_: State, form: FormData): Promise<State> => { sent.push(form); return { status: sent.length === 1 ? "error" : "success", message: "result" }; }, { create: true });
    const rejected = await action(idle, data());
    const corrected = data(); corrected.set("amount", "2000");
    await action(rejected, corrected);
    expect(sent[1].get("amount")).toBe("2000");
    expect(sent[1].get("requestId")).not.toBe(sent[0].get("requestId"));
  });
  it("retains identity and original data when the server action transport throws", async () => {
    const sent: FormData[] = [];
    const action = createLedgerFormAttempt(async (_: State, form: FormData): Promise<State> => { sent.push(form); if(sent.length === 1) throw new Error("connection lost"); return { status: "success", message: "saved" }; }, { create: true });
    const result = await action(idle, data()); expect(result.status).toBe("outcome_unknown");
    await action(result, new FormData()); expect([...sent[1]]).toEqual([...sent[0]]);
  });
});
