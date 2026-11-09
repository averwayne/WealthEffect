-- Wealth Effect: initial schema. Every user-owned table is protected by row-level security.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  last_checkin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 24),
  asset_class text not null check (asset_class in ('index', 'stocks', 'bonds', 'options', 'cash')),
  name text,
  manual_price numeric,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trade_date date not null,
  type text not null check (type in ('deposit', 'withdrawal', 'buy', 'sell', 'dividend')),
  symbol text,
  quantity numeric,
  price numeric,
  amount numeric not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions (user_id, trade_date);

create table public.balance_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('asset', 'liability')),
  name text not null,
  amount numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index balance_items_user_idx on public.balance_items (user_id);

create table public.snapshots (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null,
  net_worth numeric not null,
  portfolio numeric not null,
  contributions numeric not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, month)
);

-- Shared market data caches: readable by signed-in users, written only by the server (service role).
create table public.quotes (
  symbol text primary key,
  price numeric,
  change numeric,
  change_pct numeric,
  prev_close numeric,
  quote_time timestamptz,
  fetched_at timestamptz not null default now()
);

create table public.market_series (
  series text not null,
  obs_date date not null,
  value numeric not null,
  primary key (series, obs_date)
);

create table public.market_meta (
  series text primary key,
  fetched_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.positions enable row level security;
alter table public.transactions enable row level security;
alter table public.balance_items enable row level security;
alter table public.snapshots enable row level security;
alter table public.quotes enable row level security;
alter table public.market_series enable row level security;
alter table public.market_meta enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own positions" on public.positions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own transactions" on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own balance items" on public.balance_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own snapshots" on public.snapshots for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "read quotes" on public.quotes for select to authenticated using (true);
create policy "read market series" on public.market_series for select to authenticated using (true);
create policy "read market meta" on public.market_meta for select to authenticated using (true);

-- Create a profile row for every new user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
