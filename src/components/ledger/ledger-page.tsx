import "server-only";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { CardsSearchParams } from "@/features/cards/workspace-view";
import { ledgerQueryEndMonth, parseLedgerQuery } from "@/features/ledger/workspace-view";
import { getOwnerContext } from "@/lib/auth/owner";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
import { getLedgerWorkspace } from "@/lib/card-workspace/load";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";
import { demoWorkspaceMonth, getDemoHouseholdWorkspace } from "@/lib/demo/household-workspace";
import { householdHref, type HouseholdView } from "./ledger-filters";
import { LedgerWorkspaceView } from "./ledger-workspace";

export async function renderLedgerPage(searchParams: Promise<CardsSearchParams>, view: HouseholdView) {
  await connection();
  const [params, owner] = await Promise.all([searchParams, getOwnerContext()]);
  const synthetic = owner.ownerId === DEMO_OWNER_ID;
  const state = parseLedgerQuery(params, synthetic ? demoWorkspaceMonth : currentSeoulMonth());
  if (synthetic && state.period.kind === "month" && params.month !== state.period.month) redirect(householdHref(state, view));
  const month = ledgerQueryEndMonth(state);
  const workspace = synthetic
    ? getDemoHouseholdWorkspace(month)
    : await getLedgerWorkspace(month);
  return <LedgerWorkspaceView workspace={workspace} state={state} view={view} canMutate={owner.canMutate && !synthetic} synthetic={synthetic} />;
}
