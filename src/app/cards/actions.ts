"use server";

import { revalidatePath } from "next/cache";

import { initialUserCardFormState } from "@/features/cards/constants";
import { toUserCardInsert } from "@/features/cards/mappers";
import type { UserCardFormState } from "@/features/cards/types";
import { registerUserCardSchema } from "@/features/cards/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function registerUserCard(
  _prevState: UserCardFormState,
  formData: FormData,
): Promise<UserCardFormState> {
  const parsed = registerUserCardSchema.safeParse({
    cardId: String(formData.get("cardId") ?? ""),
    alias: String(formData.get("alias") ?? "").trim(),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  try {
    const supabase = createSupabaseServerClient();
    const { count } = await supabase
      .from("user_cards")
      .select("id", { count: "exact", head: true });

    const { data: existingCard, error: existingCardError } = await supabase
      .from("user_cards")
      .select("id")
      .eq("card_id", parsed.data.cardId)
      .maybeSingle();

    if (existingCardError) {
      return {
        status: "error",
        message: existingCardError.message,
      };
    }

    if (existingCard) {
      return {
        status: "error",
        message: "이미 내 카드에 등록된 카드입니다.",
      };
    }

    const payload = toUserCardInsert({
      cardId: parsed.data.cardId,
      alias: parsed.data.alias,
      isDefault: (count ?? 0) === 0,
    });

    const { error } = await supabase.from("user_cards").insert(payload);

    if (error) {
      return {
        status: "error",
        message:
          error.code === "23505"
            ? "이미 내 카드에 등록된 카드입니다."
            : error.message,
      };
    }

    revalidatePath("/cards");
    revalidatePath("/cards/search");
    revalidatePath("/transactions/new");

    return {
      status: "success",
      message: "내 카드에 등록되었습니다.",
    };
  } catch (error) {
    return {
      ...initialUserCardFormState,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "카드 등록 중 오류가 발생했습니다.",
    };
  }
}

export async function setDefaultUserCard(userCardId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("user_cards").select("id");

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data) {
    const { error: updateError } = await supabase
      .from("user_cards")
      .update({ is_default: row.id === userCardId })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath("/cards");
  revalidatePath("/transactions/new");
}

export async function deleteUserCard(userCardId: string) {
  const supabase = createSupabaseServerClient();
  const { data: currentCard, error: currentCardError } = await supabase
    .from("user_cards")
    .select("id, is_default")
    .eq("id", userCardId)
    .maybeSingle();

  if (currentCardError) {
    throw new Error(currentCardError.message);
  }

  const { error: deleteError } = await supabase
    .from("user_cards")
    .delete()
    .eq("id", userCardId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (currentCard?.is_default) {
    const { data: nextCard, error: nextCardError } = await supabase
      .from("user_cards")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextCardError) {
      throw new Error(nextCardError.message);
    }

    if (nextCard) {
      const { error: resetError } = await supabase
        .from("user_cards")
        .update({ is_default: true })
        .eq("id", nextCard.id);

      if (resetError) {
        throw new Error(resetError.message);
      }
    }
  }

  revalidatePath("/cards");
  revalidatePath("/cards/search");
  revalidatePath("/transactions/new");
}
