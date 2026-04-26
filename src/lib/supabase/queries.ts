import { cache } from "react";

import type { CardRecord, UserCardRecord } from "@/features/cards/types";
import type {
  TransactionFilters,
  TransactionRecord,
} from "@/features/transactions/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getRecentTransactions = cache(
  async (filters: TransactionFilters = {}): Promise<TransactionRecord[]> => {
    const supabase = createSupabaseServerClient();
    let request = supabase
      .from("transactions")
      .select(
        "id, occurred_at, merchant_name, amount, actual_amount, benefit_label, benefit_amount, final_amount, eligible_spend_amount, is_performance_eligible, payment_method, ledger_category, is_fixed_cost, card_id, user_card_id, memo, user_cards(id, alias, is_default, card_id, card:cards(id, issuer, name, card_type, network, annual_fee, image_url, searchable_text, created_at))",
      )
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (filters.startDate) {
      request = request.gte("occurred_at", `${filters.startDate}T00:00:00`);
    }

    if (filters.endDate) {
      request = request.lte("occurred_at", `${filters.endDate}T23:59:59`);
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

    return (data ?? []) as TransactionRecord[];
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
      "id, alias, is_default, created_at, card_id, card:cards(id, issuer, name, card_type, network, annual_fee, image_url, searchable_text, created_at)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserCardRecord[];
});

export const getDefaultUserCard = cache(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(
      "id, alias, is_default, created_at, card_id, card:cards(id, issuer, name, card_type, network, annual_fee, image_url, searchable_text, created_at)",
    )
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserCardRecord | null;
});
