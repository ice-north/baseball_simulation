// アプリの検査（ViewTest・LogicTest・TipsTest・TwoWayTest）に使う実際のビュー（view-running.json）を作り直す。
//   node mobile/tools/view-fixture.mjs
//   node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json   # 続けて必ず
//
// 開発サーバー（server/dev.mjs）と同じ設定の LeagueService で、作成 → 初期メンバー → キャンプ →
// 開幕3日目（4月4日。宮崎-那覇の3連戦のあと）まで進め、検証モードを切ってからビューを書き出す。
// ⚠ 試合の結果は毎回変わる。ViewTest の紙面の検査は「自球団の最新の試合が負け」を前提にしているので、
//    その形になるまで作り直す（前の監査の判断待ち: 2026-11-08 の 2）。
// ⚠ LogicTest の期待値（logic-expected.json）はこのビューの名簿から作るので、書き出し直すこと。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';

const out = new URL('../shared/src/jvmTest/resources/view-running.json', import.meta.url);

async function attempt(n) {
  const dir = mkdtempSync(join(tmpdir(), 'view-fixture-'));
  try {
    const service = new LeagueService(new FileStore(join(dir, 'league.json.gz')), {
      local: true,
      adminId: 'player1',
      members: [{ userId: 'player1', label: 'プレイヤー1' }],
    });
    const session = (await service.login('player1')).sessionId;
    let seq = 0;
    const view = () => service.view('player1', session);
    const send = async (type, payload) =>
      service.command('player1', session, {
        requestId: `fixture-${n}-${++seq}`,
        revision: (await view()).revision ?? 0,
        type,
        payload,
      });
    await send('create');
    await send('testmode', { on: true });
    // 初期メンバー・キャンプは標準案で締め切る（開幕まで）
    for (let guard = 0; guard < 5 && (await view()).status !== 'running'; guard++) await send('resolve');
    await send('step', { turns: 3 });
    await send('testmode', { on: false });
    return await view();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (let n = 1; n <= 30; n++) {
  const view = await attempt(n);
  const own = view.results.filter((g) => g.home === view.teamName || g.away === view.teamName);
  const last = own.at(-1);
  const ours = last && (last.home === view.teamName ? last.homeScore : last.awayScore);
  const theirs = last && (last.home === view.teamName ? last.awayScore : last.homeScore);
  const date = view.currentDate;
  console.log(
    `${n}回目: ${date?.month}/${date?.day} ${view.teamName} ` +
      own.map((g) => `${g.away} ${g.awayScore}-${g.homeScore} ${g.home}`).join(' / '),
  );
  if (view.status === 'running' && last && ours < theirs) {
    writeFileSync(out, JSON.stringify(view));
    console.log(`書き出した: ${out.pathname}`);
    process.exit(0);
  }
}
console.error('30回作っても最新の試合が負けにならなかった');
process.exit(1);
