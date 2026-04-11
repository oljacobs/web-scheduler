create table if not exists public.scheduler_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.scheduler_state enable row level security;

drop policy if exists "scheduler_state_select" on public.scheduler_state;
create policy "scheduler_state_select"
on public.scheduler_state
for select
using (true);

drop policy if exists "scheduler_state_insert" on public.scheduler_state;
create policy "scheduler_state_insert"
on public.scheduler_state
for insert
with check (true);

drop policy if exists "scheduler_state_update" on public.scheduler_state;
create policy "scheduler_state_update"
on public.scheduler_state
for update
using (true)
with check (true);
