-- AlgoVision: per-user Postgres persistence. Apply once in a Supabase project.
begin;
create table public.av_products (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,32}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  category text not null check (length(btrim(category)) between 1 and 40),
  price numeric not null check (price between 0 and 10000000),
  stock integer not null check (stock between 0 and 1000000),
  priority integer not null check (priority between 1 and 10),
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index av_products_price on public.av_products(owner_id, price);
create table public.av_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  processed integer not null check (processed between 0 and 5000),
  accepted integer not null check (accepted between 0 and 5000),
  duplicates integer not null check (duplicates between 0 and 5000),
  errors jsonb not null default '[]' check (jsonb_typeof(errors) = 'array' and octet_length(errors::text) <= 500000),
  kind text not null default 'import' check (kind in ('import','reset')),
  created_at timestamptz not null default now()
);
create index av_imports_history on public.av_imports(owner_id, created_at desc);
create table public.av_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('allocation','route')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 200000),
  created_at timestamptz not null default now()
);
create index av_runs_history on public.av_runs(owner_id, created_at desc);

alter table public.av_products enable row level security;
alter table public.av_imports enable row level security;
alter table public.av_runs enable row level security;
revoke all on public.av_products, public.av_imports, public.av_runs from anon, authenticated;
grant select, insert, delete on public.av_products to authenticated;
grant select, insert on public.av_imports, public.av_runs to authenticated;
create policy av_products_read on public.av_products for select to authenticated using ((select auth.uid()) = owner_id);
create policy av_products_insert on public.av_products for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy av_products_delete on public.av_products for delete to authenticated using ((select auth.uid()) = owner_id);
create policy av_imports_read on public.av_imports for select to authenticated using ((select auth.uid()) = owner_id);
create policy av_imports_insert on public.av_imports for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy av_runs_read on public.av_runs for select to authenticated using ((select auth.uid()) = owner_id);
create policy av_runs_insert on public.av_runs for insert to authenticated with check ((select auth.uid()) = owner_id);

-- Serialize writes per user and enforce catalog capacity even for direct REST inserts.
create function public.av_enforce_capacity() returns trigger language plpgsql security invoker set search_path = '' as $$
declare u uuid;
begin
  for u in select distinct owner_id from inserted_rows loop
    perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
    if (select count(*) from public.av_products where owner_id = u) > 10000 then
      raise exception 'Catalog capacity is 10,000 records' using errcode = '23514';
    end if;
  end loop;
  return null;
end $$;
create trigger av_products_capacity after insert on public.av_products referencing new table as inserted_rows for each statement execute function public.av_enforce_capacity();

-- Validation happens in Node and constraints above; this transaction prevents partial writes.
create function public.av_ingest(p_records jsonb, p_processed integer, p_duplicates integer, p_errors jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare added integer; skipped integer; receipt uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 5000 then raise exception 'Invalid batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  insert into public.av_products (id, name, category, price, stock, priority)
  select r.id, r.name, r.category, r.price, r.stock, r.priority
  from jsonb_to_recordset(p_records) as r(id text, name text, category text, price numeric, stock integer, priority integer)
  on conflict (owner_id, id) do nothing;
  get diagnostics added = row_count;
  skipped := p_duplicates + jsonb_array_length(p_records) - added;
  insert into public.av_imports(processed,accepted,duplicates,errors)
  values(p_processed,added,skipped,p_errors) returning id into receipt;
  return jsonb_build_object('id',receipt,'accepted',added,'duplicates',skipped,'processed',p_processed,'errors',p_errors);
end $$;
create function public.av_reset(p_records jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  delete from public.av_products where owner_id = auth.uid();
  result := public.av_ingest(p_records,jsonb_array_length(p_records),0,'[]'::jsonb);
  -- Receipt kind distinguishes deliberate replacement from append imports.
  -- Imports are append-only to clients; reset has its own standalone history row.
  insert into public.av_imports(processed,accepted,duplicates,errors,kind)
  values(0,0,0,'[]','reset');
  return result;
end $$;
revoke all on function public.av_enforce_capacity() from public, anon, authenticated;
revoke all on function public.av_ingest(jsonb,integer,integer,jsonb) from public, anon;
revoke all on function public.av_reset(jsonb) from public, anon;
grant execute on function public.av_ingest(jsonb,integer,integer,jsonb), public.av_reset(jsonb) to authenticated;
commit;
