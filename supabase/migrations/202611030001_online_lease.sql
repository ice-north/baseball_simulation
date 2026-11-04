-- 処理の占有（リース）を10分から6分に短くする。
-- ⚠ Vercel の関数は300秒で打ち切られる（vercel.json の maxDuration）。打ち切られると
--    リースを返さずに終わるので、10分だと残り約5分間、全員の操作と定期処理が
--    「他の処理が実行中です」で弾かれ続けた。打ち切りより少し長い6分にする。
--    300秒を超えて動き続ける処理は無いので、生きている処理の占有を奪うことはない。
-- 既存の 202610280001_online.sql を適用済みの環境に、続けて適用する（再実行しても同じ結果）。
create or replace function public.online_claim(p_token uuid)
returns setof public.online_control language sql security definer set search_path = '' as $$
  update public.online_control set lease_token = p_token, lease_until = clock_timestamp() + interval '6 minutes'
  where id = 'pennant' and (lease_until is null or lease_until < clock_timestamp()) returning *;
$$;
revoke all on function public.online_claim(uuid) from public, anon, authenticated;
grant execute on function public.online_claim(uuid) to service_role;
