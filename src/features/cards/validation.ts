import { z } from "zod";

export const registerUserCardSchema = z.object({
  cardId: z.string().uuid("카드 식별자가 올바르지 않습니다."),
  alias: z.string().trim().max(60, "별칭은 60자 이하로 입력해 주세요."),
});
