import type { UserCardInsert } from "@/features/cards/types";

export const toUserCardInsert = (input: {
  cardId: string;
  alias: string;
  isDefault: boolean;
}): UserCardInsert => ({
  card_id: input.cardId,
  alias: input.alias || null,
  is_default: input.isDefault,
});
