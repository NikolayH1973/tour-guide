-- =========================================================
-- 001: таблица туров и правила доступа
-- Тур = одна строка, весь trip.json лежит в колонке data (jsonb).
-- =========================================================

create table public.tours (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),   -- имя для ссылки ?t=...
  agency     text,
  status     text not null default 'draft'
             check (status in ('draft', 'published', 'archived')),
  data       jsonb not null,                                            -- весь trip.json
  owner      uuid not null default auth.uid()
             references auth.users (id) on delete cascade,              -- кто создал (ты после входа)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Правила доступа включены: без явного разрешения никто ничего не видит
alter table public.tours enable row level security;

-- updated_at ставится сам при каждом изменении
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger tours_set_updated_at
  before update on public.tours
  for each row execute function public.set_updated_at();

-- Вошедший пользователь (ты) работает только со СВОИМИ турами
grant select, insert, update, delete on public.tours to authenticated;

create policy "Свои туры: читать"   on public.tours for select to authenticated
  using (owner = (select auth.uid()));
create policy "Свои туры: создавать" on public.tours for insert to authenticated
  with check (owner = (select auth.uid()));
create policy "Свои туры: менять"   on public.tours for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Свои туры: удалять"  on public.tours for delete to authenticated
  using (owner = (select auth.uid()));

-- Турист (без входа) НЕ читает таблицу напрямую — иначе можно было бы
-- выгрузить список всех опубликованных туров всех агентств.
-- Вместо этого — функция: «дай тур по точному имени, если он опубликован».
create or replace function public.get_tour(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select data from public.tours
  where slug = p_slug and status = 'published'
$$;

revoke all on function public.get_tour(text) from public;
grant execute on function public.get_tour(text) to anon, authenticated;
