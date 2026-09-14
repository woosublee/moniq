export type CardType = "credit_card" | "check_card";
export type CardBenefitSupportStatus = "full" | "partial" | "none";

export type CardRecord = {
  id: string;
  issuer: string;
  name: string;
  card_type: CardType;
  network: string | null;
  annual_fee: number | null;
  image_url: string | null;
  benefit_support_status: CardBenefitSupportStatus;
  benefit_summary: string | null;
  searchable_text: string;
  created_at: string;
};

export type CardInstanceFields = {
  version: import("@/features/card-benefits/types").RevisionValue;
  last_four: string | null;
  issued_on: string | null;
  tracking_started_on: string | null;
  sort_order: number;
  archived_at: string | null;
  target_scope_key: string | null;
  target_tier_key: string | null;
};

/** Existing projections may omit new fields until the workspace query switches. */
export type UserCardRecord = Partial<CardInstanceFields> & {
  id: string;
  owner_id: string;
  alias: string | null;
  is_default: boolean;
  created_at: string;
  card_id: string;
  card: CardRecord;
};

export type CardInstanceRecord = UserCardRecord & CardInstanceFields;

export type UserCardInsert = Partial<CardInstanceFields> & {
  owner_id: string;
  card_id: string;
  alias: string | null;
  is_default: boolean;
};

export type CardSearchParams = {
  query?: string;
};

export type UserCardFormState = {
  status: "idle" | "success" | "error" | "saved_needs_review" | "outcome_unknown";
  message: string;
  requestId?: string;
  resultIds?: string[];
};
