// 停止中に共有状態一式を手元に退避する。ブラウザ/APIの巨大なダウンロードを避ける。
import { writeFile, readFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { SupabaseStore } from '../server/storage/supabaseStore.mjs';
import { requireOnline, assertLeagueVersion } from '../src/online/shared.js';
const [mode, path] = process.argv.slice(2);
requireOnline(
  ['export', 'restore'].includes(mode) && path,
  '使用法: node --env-file=.env tools/online-backup.mjs export|restore /保存先/world.json.gz',
);
// ⚠ 参加者はリーグのデータ側が正本。ここで要るのは管理者だけ
const adminId = process.env.ONLINE_ADMIN;
requireOnline(adminId, '管理者（ONLINE_ADMIN）の設定が必要です');
const members = [{ userId: adminId }];
const store = new SupabaseStore({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  members,
  adminId,
});
if (mode === 'export') {
  // 1つの公開済みbundleを読む。書込み中の途中状態を混ぜない。
  const bundle = await store.read();
  requireOnline(
    bundle.league && bundle.league.status !== 'running',
    '管理画面で進行を停止してから退避してください',
  );
  await writeFile(path, gzipSync(JSON.stringify(bundle)), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('共有状態一式を退避しました（既存ファイルは上書きしません）');
} else {
  const source = JSON.parse(gunzipSync(await readFile(path)));
  assertLeagueVersion(source.league);
  // ⚠ **別の環境のバックアップを持ち込ませない**。以前は参加者の集合が
  //    環境変数と完全一致することを求めていたが、参加者は招待で増えるので
  //    もう固定の集合ではない。管理者が含まれているかで判断する。
  requireOnline(
    source.league.members.some((m) => m.userId === adminId),
    'このバックアップに管理者が含まれていません（別の環境のものです）',
  );
  await store.transaction((current) => {
    requireOnline(
      !current.league || ['paused', 'error'].includes(current.league.status),
      '現在のリーグを停止してから復元してください',
    );
    const revision =
      Math.max(current.league?.revision || 0, source.league.revision) + 1;
    current.league = source.league;
    current.league.revision = revision;
    current.league.status = current.league.phase ? 'waiting' : 'paused';
    current.league.nextAdvanceAt = null;
    current.league.updatedAt = new Date().toISOString();
    // 以前の端末の書込み権限を復活させない。再ログインして確認する。
    current.sessions = {};
    current.receipts = { ...source.receipts, ...current.receipts };
    current.backup = source.backup;
  });
  console.log(
    '復元しました。再ログインして状態を確認し、管理画面から再開してください',
  );
}
