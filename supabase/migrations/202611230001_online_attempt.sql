-- 定期処理の「試行中」の印と回数（監査 2026-11-23、いしだ「おすすめで」）。
-- ⚠ 定期処理（tick）が Vercel の300秒で打ち切られると、例外の処理（status を error にする所）を
--    通らずに終わり、保存は何も変わらない。リースが切れた後の cron が同じ日を最初からやり直し、
--    `STALL_AFTER_MS`（8ターン≒6時間）を過ぎるまで約10分おきに繰り返していた。そのたびに約5分
--    ロックを持ち、参加者の操作が「処理中」で弾かれた。
--    重い処理を始める前に、保存（Storage）とは別に**この行へ**印（同じリーグ・同じ日を表す鍵）と
--    回数を書く。打ち切られても印は残るので、同じ鍵の試行が3回続けて終わらなければ、
--    サーバーが error で止めて管理者に知らせる（`server/leagueService.mjs` の tick）。
--    正常に終わった公開（`online_publish_attempt`）で回数を消す。
-- 既存の 202610280001_online.sql・202611030001_online_lease.sql を適用済みの環境に、
-- 続けて適用する（再実行しても同じ結果）。
-- ⚠ サーバーを更新する前に適用すること。適用前のサーバーでも動く（印を持たない従来の動き）が、
--    適用しないと打ち切りのやり直しは止まらない。
alter table public.online_control
  add column if not exists attempt_key text,
  add column if not exists attempt_count integer not null default 0;

-- 試行を始める。占有（リース）を持っている処理だけが書ける。
-- 返り値はこれより前に**終わらなかった**同じ鍵の試行の数（鍵が変わったら 0）。
-- 占有を失っていたら null（何も書かない）。
create or replace function public.online_attempt(p_token uuid, p_key text)
returns integer language plpgsql security definer set search_path = '' as $$
declare previous integer;
begin
  update public.online_control
     set attempt_count = case when attempt_key = p_key then attempt_count + 1 else 1 end,
         attempt_key = p_key
   where id = 'pennant' and lease_token = p_token and lease_until > clock_timestamp()
  returning attempt_count - 1 into previous;
  return previous;
end;
$$;

-- 公開して試行を終える（`online_publish` と同じ条件で公開し、印と回数を消す）。
-- ⚠ 参加者の操作の公開（`online_publish`）では消さない。打ち切りのやり直しの合間に
--    操作が通るたびに回数が消えると、いつまでも止まらないため。
create or replace function public.online_publish_attempt(p_token uuid, p_generation bigint, p_path text, p_views jsonb, p_sessions jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.online_control set generation = generation + 1, snapshot_path = p_path,
    previous_paths = (array_prepend(snapshot_path, previous_paths))[1:2],
    views = p_views, sessions = p_sessions, lease_token = null, lease_until = null,
    attempt_key = null, attempt_count = 0
  where id = 'pennant' and lease_token = p_token and generation = p_generation and lease_until > clock_timestamp();
  return found;
end;
$$;

revoke all on function public.online_attempt(uuid,text) from public, anon, authenticated;
revoke all on function public.online_publish_attempt(uuid,bigint,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.online_attempt(uuid,text) to service_role;
grant execute on function public.online_publish_attempt(uuid,bigint,text,jsonb,jsonb) to service_role;
-- 新しい関数を API（PostgREST）にすぐ見せる
notify pgrst, 'reload schema';
