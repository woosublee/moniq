export type CardType = "credit_card" | "check_card";

export type CardRecord = {
  id: string;
  issuer: string;
  name: string;
  card_type: CardType;
  network: string | null;
  annual_fee: number | null;
  image_url: string | null;
  searchable_text: string;
  created_at: string;
};

export type UserCardRecord = {
  id: string;
  alias: string | null;
  is_default: boolean;
  created_at: string;
  card_id?: string;
  card: CardRecord;
};

export type UserCardInsert = {
  card_id: string;
  alias: string | null;
  is_default: boolean;
};

export type CardSearchParams = {
  query?: string;
};

export type UserCardFormState = {
  status: "idle" | "success" | "error";
  message: string;
};
