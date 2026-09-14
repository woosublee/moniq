import type { MonthKey } from "@/features/card-benefits/periods";
import {
  demoWorkspaceMonth,
  getDemoHouseholdWorkspace,
} from "@/lib/demo/household-workspace";

export { demoWorkspaceMonth };

/** Card pages consume the card projection from the same read-only household snapshot. */
export function getDemoCardWorkspace(month: MonthKey) {
  return getDemoHouseholdWorkspace(month).cardWorkspace;
}
