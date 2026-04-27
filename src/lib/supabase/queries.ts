import { cache } from "react";

import type { CardRecord, UserCardRecord } from "@/features/cards/types";
import type {
  TransactionFilters,
  TransactionRecord,
} from "@/features/transactions/types";
import { serverEnv } from "@/lib/server-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const transactionSelect =
  "id, owner_id, occurred_at, merchant_name, amount, actual_amount, benefit_label, benefit_amount, final_amount, eligible_spend_amount, is_performance_eligible, payment_method, ledger_category, is_fixed_cost, user_card_id, memo, user_cards(id, owner_id, alias, is_default, card_id, card:cards(id, issuer, name, card_type, network, annual_fee, image_url, searchable_text, created_at))";

const getLocalDateBoundary = (
  date: string,
  time: "00:00:00" | "23:59:59",
  timezoneOffset = "0",
) => {
  const offsetMinutes = Number(timezoneOffset);
  const localDate = new Date(`${date}T${time}Z`);

  return new Date(localDate.getTime() + offsetMinutes * 60_000).toISOString();
};

const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);

export const getRecentTransactions = cache(
  async (filters: TransactionFilters = {}): Promise<TransactionRecord[]> => {
    const supabase = createSupabaseServerClient();
    let request = supabase
      .from("transactions")
      .select(transactionSelect)
      .eq("owner_id", serverEnv.moniqOwnerId)
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (filters.startDate) {
      request = request.gte(
        "occurred_at",
        getLocalDateBoundary(filters.startDate, "00:00:00", filters.timezoneOffset),
      );
    }

    if (filters.endDate) {
      request = request.lte(
        "occurred_at",
        getLocalDateBoundary(filters.endDate, "23:59:59", filters.timezoneOffset),
      );
    }

    if (filters.paymentMethod && filters.paymentMethod !== "all") {
      request = request.eq("payment_method", filters.paymentMethod);
    }

    if (filters.userCardId) {
      request = request.eq("user_card_id", filters.userCardId);
    }

    const { data, error } = await request;

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as unknown as TransactionRecord[];
  },
);

export const getCurrentMonthTransactions = cache(
  async (): Promise<TransactionRecord[]> => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select(transactionSelect)
      .eq("owner_id", serverEnv.moniqOwnerId)
      .gte("occurred_at", getLocalDateBoundary(toDateInputValue(monthStart), "00:00:00"))
      .lte("occurred_at", getLocalDateBoundary(toDateInputValue(monthEnd), "23:59:59"))
      .order("occurred_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as unknown as TransactionRecord[];
  },
);

export const searchCards = cache(async (query: string): Promise<CardRecord[]> => {
  const supabase = createSupabaseServerClient();
  let request = supabase
    .from("cards")
    .select("id, issuer, name, card_type, network, annual_fee, image_url, searchable_text, created_at")
    .order("issuer", { ascending: true })
    .limit(20);

  if (query.trim()) {
    request = request.ilike("searchable_text", `%${query.trim()}%`);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CardRecord[];
});

export const getUserCards = cache(async (): Promise<UserCardRecord[]> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(
      "id, owner_id, alias, is_default, created_at, card_id, card:cards(id, issuer, name, card_type, network, annual_fee, image_url, searchable_text, created_at)",
    )
    .eq("owner_id", serverEnv.moniqOwnerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as UserCardRecord[];
});

export const getDefaultUserCard = cache(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(
      "id, owner_id, alias, is_default, created_at, card_id, card:cards(id, issuer, name, card_type, network, annual_fee, image_url, searchable_text, created_at)",
    )
    .eq("owner_id", serverEnv.moniqOwnerId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as UserCardRecord | null;
});
