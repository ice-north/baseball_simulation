// アプリの画面確認（CI の screens ジョブ）用に、開発サーバーの保存を場面ごとに作る。
//   node mobile/tools/seed-league.mjs <出力先のフォルダ>
// できるもの（どれも server/dev.mjs の ONLINE_DATA_FILE にそのまま渡せる）:
//   pack.json.gz     … 作りたて（初期メンバー選択）
//   camp.json.gz     … 春季キャンプ（1クール済み）
//   running.json.gz  … シーズン中（試合を何日か消化）
//   contract.json.gz・tryout.json.gz … 11月の手続き（契約更改・トライアウト）
import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';

const out = resolve(process.argv[2] || 'seed-out');
mkdirSync(out, { recursive: true });
const file = join(out, 'work.json.gz');
const store = new FileStore(file);
const service = new LeagueService(store, {
  local: true,
  adminId: 'player1',
  members: [{ userId: 'player1', label: 'プレイヤー1' }],
});
const session = (await service.login('player1')).sessionId;
let seq = 0;
const view = () => service.view('player1', session);
const send = async (type, payload) =>
  service.command('player1', session, {
    requestId: `seed-${++seq}-${Date.now()}`,
    revision: (await view()).revision ?? 0,
    type,
    payload,
  });
const save = (name) => {
  copyFileSync(file, join(out, `${name}.json.gz`));
  console.log('保存:', name);
};

await send('create');
await send('testmode', { on: true });
save('pack');
await send('resolve');
let v = await view();
console.log('手続き:', v.phase?.kind);
if (v.phase?.kind === 'camp') {
  // 1クールだけ実行（練習の結果が出ている形を見るため）。中身は標準案
  const defaults = await service.defaults('player1', session);
  await send('campRound', { round: 1, ...defaults.plan, main: {}, sub: {}, policy: { direction: 'balanced', phase: 'skill' } }).catch((e) => console.log('キャンプ1クール:', e.message));
  save('camp');
  await send('resolve');
}
const seen = new Set();
// シーズン中を3回ぶん進めて「シーズン中」を残し、そのあと11月の手続き（契約更改・トライアウト）まで進める
for (let i = 0; i < 3; i++) await send('step', { turns: 8 });
save('running');
for (let guard = 0; guard < 60 && !seen.has('tryout'); guard++) {
  v = await view();
  if (v.status === 'running') {
    await send('step', { turns: 24 });
    continue;
  }
  const kind = v.phase?.kind;
  if (!kind) break;
  if (!seen.has(kind)) {
    seen.add(kind);
    save(kind);
  }
  await send('resolve');
}
console.log('できた場面:', ['pack', 'camp', 'running', ...seen].join(' '));
