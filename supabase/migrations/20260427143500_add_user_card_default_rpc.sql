create or replace function public.set_default_user_card(
  target_owner_id uuid,
  target_user_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_cards
    where id = target_user_card_id
      and owner_id = target_owner_id
  ) then
    raise exception 'user card not found';
  end if;

  update public.user_cards
  set is_default = false
  where owner_id = target_owner_id
    and is_default = true;

  update public.user_cards
  set is_default = true
  where id = target_user_card_id
    and owner_id = target_owner_id;
end;
$$;

create or replace function public.delete_user_card_and_promote_default(
  target_owner_id uuid,
  target_user_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was_default boolean;
  next_user_card_id uuid;
begin
  select is_default
    into was_default
  from public.user_cards
  where id = target_user_card_id
    and owner_id = target_owner_id;

  if was_default is null then
    raise exception 'user card not found';
  end if;

  delete from public.user_cards
  where id = target_user_card_id
    and owner_id = target_owner_id;

  if was_default then
    select id
      into next_user_card_id
    from public.user_cards
    where owner_id = target_owner_id
    order by created_at asc
    limit 1;

    if next_user_card_id is not null then
      update public.user_cards
      set is_default = true
      where id = next_user_card_id
        and owner_id = target_owner_id;
    end if;
  end if;
end;
$$;
