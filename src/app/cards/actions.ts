"use server";

import { revalidatePath } from "next/cache";

import { initialUserCardFormState } from "@/features/cards/constants";
import { toUserCardInsert } from "@/features/cards/mappers";
import type { UserCardFormState } from "@/features/cards/types";
import { registerUserCardSchema } from "@/features/cards/validation";
import { serverEnv } from "@/lib/server-env";
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
      .select("id", { count: "exact", head: true })
      .eq("owner_id", serverEnv.moniqOwnerId);

    const { data: existingCard, error: existingCardError } = await supabase
      .from("user_cards")
      .select("id")
      .eq("owner_id", serverEnv.moniqOwnerId)
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
      ownerId: serverEnv.moniqOwnerId,
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
  const { error } = await supabase.rpc("set_default_user_card", {
    target_owner_id: serverEnv.moniqOwnerId,
    target_user_card_id: userCardId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/cards");
  revalidatePath("/transactions/new");
}

export async function deleteUserCard(userCardId: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_user_card_and_promote_default", {
    target_owner_id: serverEnv.moniqOwnerId,
    target_user_card_id: userCardId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/cards");
  revalidatePath("/cards/search");
  revalidatePath("/transactions/new");
}
