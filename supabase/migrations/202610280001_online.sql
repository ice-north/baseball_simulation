-- private Storage + DBリース。ブラウザはテーブル/RPC/Storageを直接操作しない。
begin;
create table public.online_control (
  id text primary key check (id = 'pennant'),
  generation bigint not null default 0,
  snapshot_path text,
  previous_paths text[] not null default '{}',
  views jsonb not null default '{}',
  sessions jsonb not null default '{}',
  lease_token uuid,
  lease_until timestamptz
);
alter table public.online_control enable row level security;
revoke all on public.online_control from public, anon, authenticated;
grant all on public.online_control to service_role;
insert into public.online_control(id) values ('pennant');

create function public.online_claim(p_token uuid)
returns setof public.online_control language sql security definer set search_path = '' as $$
  update public.online_control set lease_token = p_token, lease_until = clock_timestamp() + interval '10 minutes'
  where id = 'pennant' and (lease_until is null or lease_until < clock_timestamp()) returning *;
$$;
create function public.online_publish(p_token uuid, p_generation bigint, p_path text, p_views jsonb, p_sessions jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.online_control set generation = generation + 1, snapshot_path = p_path,
    previous_paths = (array_prepend(snapshot_path, previous_paths))[1:2],
    views = p_views, sessions = p_sessions, lease_token = null, lease_until = null
  where id = 'pennant' and lease_token = p_token and generation = p_generation and lease_until > clock_timestamp();
  return found;
end;
$$;
create function public.online_release(p_token uuid)
returns void language sql security definer set search_path = '' as $$
  update public.online_control set lease_token = null, lease_until = null where id = 'pennant' and lease_token = p_token;
$$;
revoke all on function public.online_claim(uuid) from public, anon, authenticated;
revoke all on function public.online_publish(uuid,bigint,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.online_release(uuid) from public, anon, authenticated;
grant execute on function public.online_claim(uuid) to service_role;
grant execute on function public.online_publish(uuid,bigint,text,jsonb,jsonb) to service_role;
grant execute on function public.online_release(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('online-world','online-world',false,52428800,array['application/gzip']);
-- Storageのanon/authenticatedポリシーは作らない。service_roleだけがアクセスする。
commit;
