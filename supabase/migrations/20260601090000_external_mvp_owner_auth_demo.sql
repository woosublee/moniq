drop policy if exists "allow authenticated select own user cards" on public.user_cards;
create policy "allow authenticated select own user cards"
  on public.user_cards
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "allow authenticated insert own user cards" on public.user_cards;
create policy "allow authenticated insert own user cards"
  on public.user_cards
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "allow authenticated update own user cards" on public.user_cards;
create policy "allow authenticated update own user cards"
  on public.user_cards
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "allow authenticated delete own user cards" on public.user_cards;
create policy "allow authenticated delete own user cards"
  on public.user_cards
  for delete
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "allow authenticated select own transactions" on public.transactions;
create policy "allow authenticated select own transactions"
  on public.transactions
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "allow authenticated insert own transactions" on public.transactions;
create policy "allow authenticated insert own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "allow authenticated update own transactions" on public.transactions;
create policy "allow authenticated update own transactions"
  on public.transactions
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "allow authenticated delete own transactions" on public.transactions;
create policy "allow authenticated delete own transactions"
  on public.transactions
  for delete
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "allow authenticated select own transaction benefit applications" on public.transaction_benefit_applications;
create policy "allow authenticated select own transaction benefit applications"
  on public.transaction_benefit_applications
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "allow authenticated insert own transaction benefit applications" on public.transaction_benefit_applications;
create policy "allow authenticated insert own transaction benefit applications"
  on public.transaction_benefit_applications
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "allow authenticated update own transaction benefit applications" on public.transaction_benefit_applications;
create policy "allow authenticated update own transaction benefit applications"
  on public.transaction_benefit_applications
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "allow authenticated delete own transaction benefit applications" on public.transaction_benefit_applications;
create policy "allow authenticated delete own transaction benefit applications"
  on public.transaction_benefit_applications
  for delete
  to authenticated
  using (owner_id = auth.uid());
