-- アカウント設定後に実行する例。マイグレーションの自動実行対象には含めない。
-- Dashboardでpg_cron / pg_netを有効にし、Vaultに以下を登録する:
-- online_tick_url: https://YOUR_DEPLOYMENT/api/online?action=tick
-- online_cron_secret: VercelのONLINE_CRON_SECRETと同じ32文字以上のランダム値
-- DB/CronのタイムゾーンをUTCとして設定する（JSTではない）。

-- ⚠ **入れ直しのときもこのファイルをそのまま流す**。同じ名前のジョブは
--    下の cron.schedule が上書きする（pg_cron は名前で upsert する）。
--    刻みが変わったかは、最後の確認クエリで schedule 列を見ること。
-- ⚠ 以前の版のジョブ（1日2回・半日刻みの頃）が残っていたら先に止める。
--    残ったままだと、枠以外にも余計な起動が続く（進行は nextAdvanceAt で
--    1回に限られるが、毎回スナップショットを読みに行く）。無ければ何もしない。
select cron.unschedule(jobname)
from cron.job
where jobname in ('online-day-hour', 'online-day-half');

select cron.schedule(job_name, expression, $command$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'online_tick_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'online_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
$command$)
from (values
  ('online-turn', '*/5 * * * *')
) as jobs(job_name, expression);
-- 1ターン＝45分。1日32枠（00:00, 00:45, 01:30, ... 23:15）で、月〜金の160ターンが
-- レギュラーシーズン（120試合＋休養40）。シーズン後の試合の無い日はまとめて進み、
-- 土曜にストーブリーグ、日曜にキャンプ（各32ターン）。1週224ターン。
-- ⚠ **45分はcronで直に書けない**ので5分ごとに叩き、進む枠かどうかは
--    アプリ側のnextAdvanceAtに任せる（枠の時刻でなければ何もしないで戻る）。
--    45分の枠ごとに9回（5分おき）当たるので、通知の取りこぼしにも備わる。
-- 分だけの指定なのでUTCとJSTのずれは効かないが、DB/CronのタイムゾーンはUTCのままでよい。
-- cron.job_run_detailsのSQL成功だけではHTTP/ゲーム更新成功を証明しない。
-- net._http_responseとゲームのrevision/日付も確認する。

-- 入れ直したあとの確認（schedule が */5 * * * * になっていること）:
--   select jobname, schedule, active from cron.job where jobname = 'online-turn';
