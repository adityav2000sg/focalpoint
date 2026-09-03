-- Product hardening for multi-device households, recoverability and account control.

alter table public.finance_spaces
  add column if not exists revision bigint not null default 0;

create table if not exists public.finance_space_history (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.finance_spaces(id) on delete cascade,
  revision bigint not null,
  data_json jsonb not null,
  summary text not null default 'Workspace updated',
  changed_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (space_id, revision)
);

create index if not exists finance_space_history_space_revision_idx
  on public.finance_space_history(space_id, revision desc);

alter table public.finance_space_history enable row level security;

drop policy if exists finance_history_select_accessible on public.finance_space_history;
create policy finance_history_select_accessible on public.finance_space_history
for select to authenticated
using (public.finance_is_space_owner(space_id) or public.finance_is_active_member(space_id));

revoke all on public.finance_space_history from anon;
grant select on public.finance_space_history to authenticated;

create or replace function public.save_finance_space_snapshot(
  p_space_id uuid,
  p_expected_revision bigint,
  p_data jsonb,
  p_summary text default 'Workspace updated'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision bigint;
  next_revision bigint;
begin
  if auth.uid() is null or not public.finance_can_write(p_space_id) then
    raise exception 'finance_space_forbidden' using errcode = '42501';
  end if;

  if p_data is null or octet_length(p_data::text) > 2000000 then
    raise exception 'finance_workspace_too_large' using errcode = '22001';
  end if;

  select revision into current_revision
  from public.finance_spaces
  where id = p_space_id
  for update;

  if current_revision is null then
    raise exception 'finance_space_not_found' using errcode = 'P0002';
  end if;

  if current_revision <> p_expected_revision then
    raise exception 'finance_workspace_conflict'
      using errcode = '40001', detail = current_revision::text;
  end if;

  next_revision := current_revision + 1;

  update public.finance_spaces
  set data_json = p_data,
      revision = next_revision
  where id = p_space_id;

  insert into public.finance_space_history (space_id, revision, data_json, summary, changed_by)
  values (p_space_id, next_revision, p_data, left(coalesce(nullif(trim(p_summary), ''), 'Workspace updated'), 160), auth.uid());

  delete from public.finance_space_history history
  where history.space_id = p_space_id
    and history.id not in (
      select recent.id
      from public.finance_space_history recent
      where recent.space_id = p_space_id
      order by recent.revision desc
      limit 25
    );

  return next_revision;
end;
$$;

revoke all on function public.save_finance_space_snapshot(uuid, bigint, jsonb, text) from public;
grant execute on function public.save_finance_space_snapshot(uuid, bigint, jsonb, text) to authenticated;

alter table public.finance_space_members
  add column if not exists invite_token uuid not null default gen_random_uuid();

create unique index if not exists finance_space_members_invite_token_key
  on public.finance_space_members(invite_token);

create or replace function public.get_finance_invite_token(p_space_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result uuid;
begin
  if auth.uid() is null or not public.finance_is_space_owner(p_space_id) then
    return null;
  end if;

  select member.invite_token into result
  from public.finance_space_members member
  where member.space_id = p_space_id
    and member.role <> 'owner'
    and member.status = 'pending'
  order by member.created_at desc
  limit 1;

  return result;
end
$$;

revoke all on function public.get_finance_invite_token(uuid) from public;
grant execute on function public.get_finance_invite_token(uuid) to authenticated;

create or replace function public.claim_finance_invite_token(p_invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_space_id uuid;
  signed_in_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or signed_in_email = '' then
    return null;
  end if;

  select member.space_id into claimed_space_id
  from public.finance_space_members member
  where member.invite_token = p_invite_token
    and lower(member.email) = signed_in_email
    and member.status = 'pending'
    and (member.user_id is null or member.user_id = auth.uid())
  limit 1;

  if claimed_space_id is null then
    return null;
  end if;

  update public.finance_space_members
  set user_id = auth.uid(), status = 'active'
  where space_id = claimed_space_id and invite_token = p_invite_token;

  insert into public.finance_profiles (user_id, email, display_name, active_household_id)
  values (auth.uid(), signed_in_email, split_part(signed_in_email, '@', 1), claimed_space_id)
  on conflict (user_id) do update
    set email = excluded.email,
        active_household_id = excluded.active_household_id;

  return claimed_space_id;
end;
$$;

revoke all on function public.claim_finance_invite_token(uuid) from public;
grant execute on function public.claim_finance_invite_token(uuid) to authenticated;

drop policy if exists finance_members_delete_self on public.finance_space_members;
create policy finance_members_delete_self on public.finance_space_members
for delete to authenticated
using (user_id = (select auth.uid()));

create table if not exists public.finance_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, action)
);

alter table public.finance_rate_limits enable row level security;
revoke all on public.finance_rate_limits from anon, authenticated;

create or replace function public.consume_finance_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if auth.uid() is null or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.finance_rate_limits (user_id, action, window_started_at, request_count)
  values (auth.uid(), left(p_action, 80), now(), 1)
  on conflict (user_id, action) do update
    set window_started_at = case
          when public.finance_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
            then now()
          else public.finance_rate_limits.window_started_at
        end,
        request_count = case
          when public.finance_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
            then 1
          else public.finance_rate_limits.request_count + 1
        end
  returning request_count <= p_limit into allowed;

  return allowed;
end;
$$;

revoke all on function public.consume_finance_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_finance_rate_limit(text, integer, integer) to authenticated;

create or replace function public.delete_finance_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_finance_account() from public;
grant execute on function public.delete_finance_account() to authenticated;
