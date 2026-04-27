alter table public.transactions
  add column if not exists benefit_label text,
  add column if not exists actual_amount numeric(12, 2),
  add column if not exists final_amount numeric(12, 2),
  add column if not exists is_performance_eligible boolean not null default true,
  add column if not exists ledger_category text,
  add column if not exists is_fixed_cost boolean not null default false;

update public.transactions
set
  actual_amount = coalesce(actual_amount, amount),
  final_amount = coalesce(final_amount, amount),
  benefit_label = coalesce(benefit_label, ''),
  ledger_category = coalesce(ledger_category, ''),
  is_performance_eligible = coalesce(is_performance_eligible, true),
  is_fixed_cost = coalesce(is_fixed_cost, false)
where
  actual_amount is null
  or final_amount is null
  or benefit_label is null
  or ledger_category is null;

alter table public.transactions
  alter column actual_amount set not null,
  alter column final_amount set not null;

create policy "allow anon update transactions"
  on public.transactions
  for update
  to anon
  using (true)
  with check (true);

create policy "allow anon delete transactions"
  on public.transactions
  for delete
  to anon
  using (true);
