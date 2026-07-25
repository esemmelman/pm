create extension if not exists pgcrypto;

create table if not exists public.northstar_projects (
  id text not null, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, description text not null default '', color text not null default '#dbe88f',
  start_date date, end_date date, sort_order integer not null default 0, updated_at timestamptz not null default now(),
  primary key (user_id, id), check ((start_date is null and end_date is null) or (start_date is not null and end_date >= start_date))
);

create table if not exists public.northstar_tasks (
  id text not null, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id text not null, name text not null,
  status text not null check (status in ('To do', 'In progress', 'Review', 'Done')),
  owner text not null default '', start_date date not null, end_date date not null, notes text not null default '',
  sort_order integer not null default 0, updated_at timestamptz not null default now(), primary key (user_id, id),
  foreign key (user_id, project_id) references public.northstar_projects(user_id, id) on delete cascade,
  check (end_date >= start_date)
);

create table if not exists public.northstar_migrations (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  source_key text not null, backup_downloaded_at timestamptz not null, migrated_at timestamptz not null default now()
);

alter table public.northstar_projects enable row level security;
alter table public.northstar_tasks enable row level security;
alter table public.northstar_migrations enable row level security;
drop policy if exists "northstar projects are private" on public.northstar_projects;
drop policy if exists "northstar tasks are private" on public.northstar_tasks;
drop policy if exists "northstar migrations are private" on public.northstar_migrations;
create policy "northstar projects are private" on public.northstar_projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "northstar tasks are private" on public.northstar_tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "northstar migrations are private" on public.northstar_migrations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.northstar_replace_workspace(payload jsonb, backup_time timestamptz default null)
returns void language plpgsql security invoker set search_path = public as $$
declare p jsonb; t jsonb; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  delete from northstar_tasks where user_id = uid; delete from northstar_projects where user_id = uid;
  for p in select * from jsonb_array_elements(coalesce(payload->'projects', '[]'::jsonb)) loop
    insert into northstar_projects (id,user_id,name,description,color,start_date,end_date,sort_order)
    values (p->>'id',uid,p->>'name',coalesce(p->>'description',''),coalesce(p->>'color','#dbe88f'),nullif(p->>'start','')::date,nullif(p->>'end','')::date,coalesce((p->>'sort_order')::int,0));
    for t in select * from jsonb_array_elements(coalesce(p->'tasks', '[]'::jsonb)) loop
      insert into northstar_tasks (id,user_id,project_id,name,status,owner,start_date,end_date,notes,sort_order)
      values (t->>'id',uid,p->>'id',t->>'name',t->>'status',coalesce(t->>'owner',''),(t->>'start')::date,(t->>'end')::date,coalesce(t->>'notes',''),coalesce((t->>'sort_order')::int,0));
    end loop;
  end loop;
  if backup_time is not null then
    insert into northstar_migrations(user_id,source_key,backup_downloaded_at) values(uid,'northstar-project-manager-v2',backup_time)
    on conflict(user_id) do update set backup_downloaded_at=excluded.backup_downloaded_at,migrated_at=now();
  end if;
end $$;
revoke all on function public.northstar_replace_workspace(jsonb,timestamptz) from public, anon;
grant execute on function public.northstar_replace_workspace(jsonb,timestamptz) to authenticated;
