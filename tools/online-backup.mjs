// 停止中に共有状態一式を手元に退避する。ブラウザ/APIの巨大なダウンロードを避ける。
import { writeFile, readFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { SupabaseStore } from '../server/storage/supabaseStore.mjs';
import { requireOnline, ONLINE_SCHEMA } from '../src/online/shared.js';
const [mode, path] = process.argv.slice(2);
requireOnline(
  ['export', 'restore'].includes(mode) && path,
  '使用法: node --env-file=.env tools/online-backup.mjs export|restore /保存先/world.json.gz',
);
const members = [
  { userId: process.env.ONLINE_MEMBER_1 },
  { userId: process.env.ONLINE_MEMBER_2 },
];
requireOnline(
  members.every((m) => m.userId) && members[0].userId !== members[1].userId,
  '参加者の設定が必要です',
);
const store = new SupabaseStore({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  members,
  adminId: members[0].userId,
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
  requireOnline(
    source.league?.schema === ONLINE_SCHEMA &&
      source.league.engineVersion === 'online-1',
    'バックアップのバージョンが対応していません',
  );
  requireOnline(
    source.league.members
      .map((m) => m.userId)
      .sort()
      .join() ===
      members
        .map((m) => m.userId)
        .sort()
        .join(),
    'バックアップの参加者が異なります',
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
