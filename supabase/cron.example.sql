-- アカウント設定後に実行する例。マイグレーションの自動実行対象には含めない。
-- Dashboardでpg_cron / pg_netを有効にし、Vaultに以下を登録する:
-- online_tick_url: https://YOUR_DEPLOYMENT/api/online?action=tick
-- online_cron_secret: VercelのONLINE_CRON_SECRETと同じ32文字以上のランダム値
-- DB/CronのタイムゾーンをUTCとして設定する（JSTではない）。
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
  ('online-day-hour', '0,5,10 4,9,14,23 * * *'),
  ('online-day-half', '30,35,40 1,6,11 * * *')
) as jobs(job_name, expression);
-- JST 08:00 / 10:30 / 13:00 / 15:30 / 18:00 / 20:30 / 23:00。
-- cron.job_run_detailsのSQL成功だけではHTTP/ゲーム更新成功を証明しない。
-- net._http_responseとゲームのrevision/日付も確認する。

-- 各枠の5分後・10分後は通知欠落/処理中に備えた再送。進行はnextAdvanceAtで1回に限定する。
