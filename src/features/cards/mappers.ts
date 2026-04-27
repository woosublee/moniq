import type { UserCardInsert } from "@/features/cards/types";

export const toUserCardInsert = (input: {
  ownerId: string;
  cardId: string;
  alias: string;
  isDefault: boolean;
}): UserCardInsert => ({
  owner_id: input.ownerId,
  card_id: input.cardId,
  alias: input.alias || null,
  is_default: input.isDefault,
});
