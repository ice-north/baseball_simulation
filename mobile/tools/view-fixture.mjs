// アプリの検査に使う実際の窓口の答えを作り直す。
//   node mobile/tools/view-fixture.mjs
//   node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json   # 続けて必ず
//
// 書き出すもの（どれも mobile/shared/src/jvmTest/resources/ の下）:
//   view-running.json … 開幕3日目（4月4日。宮崎-那覇の3連戦のあと）のビュー。検証モードは切ってから取る。
//                       ViewTest・LogicTest・TipsTest・TwoWayTest と expect-logic.mjs が使う
//   front/view.json・game.json・games.json・team.json … 同じリーグを6月12日まで進めたビュー、
//                       自球団の最新の試合の詳細（game）、今季の自球団の試合（games。size=200）、
//                       次の相手の名簿（team）。FrontPageTest（紙面）が使う
//
// 開発サーバー（server/dev.mjs）と同じ設定の LeagueService で、作成 → 初期メンバー → キャンプ（どちらも標準案）→ 開幕。
// ⚠ 試合の結果は命令の requestId で決まる（`step:<requestId>:<日>` が乱数の種）。同じコードと同じ requestId なら
//    毎回同じ結果、試合の計算を変えると変わる。ViewTest の紙面の検査は「4月4日の自球団の最新の試合が負け」を
//    前提にしているので、requestId に回数を入れて、その形になる回まで作り直す
//    （前の監査の判断待ち: docs/audit/2026-11-08.md の 2）。
//    紙面の検査は勝敗投手の欄を見るので、6月の最新の試合が引き分けなら1日ずつ進める。
// ⚠ LogicTest の期待値（logic-expected.json）は view-running.json の名簿から作るので、書き出し直すこと。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';

const resources = new URL('../shared/src/jvmTest/resources/', import.meta.url);
const write = (name, value) => {
  const url = new URL(name, resources);
  writeFileSync(url, JSON.stringify(value));
  console.log(`書き出した: ${url.pathname}`);
};
const before = (date, month, day) => date.month * 100 + date.day < month * 100 + day;
const ownGames = (view) => view.results.filter((g) => g.home === view.teamName || g.away === view.teamName);

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
    const running = await view();
    const last = ownGames(running).at(-1);
    const date = running.currentDate;
    console.log(
      `${n}回目: ${date?.month}/${date?.day} ${running.teamName} ` +
        ownGames(running).map((g) => `${g.away} ${g.awayScore}-${g.homeScore} ${g.home}`).join(' / '),
    );
    const mine = (g) => (g.home === running.teamName ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore]);
    if (running.status !== 'running' || !last || !(mine(last)[0] < mine(last)[1])) return false;
    write('view-running.json', running);

    // 紙面（6月12日まで。最新の試合が引き分けなら決着のつく日まで）
    await send('testmode', { on: true });
    for (let guard = 0; guard < 20; guard++) {
      const d = (await view()).currentDate;
      if (!before(d, 6, 12)) break;
      const days = Math.round((Date.UTC(d.year, 5, 12) - Date.UTC(d.year, d.month - 1, d.day)) / 86400000);
      await send('step', { turns: Math.min(24, Math.max(1, days)) });
    }
    let front = await view();
    for (let guard = 0; guard < 5; guard++) {
      const g = ownGames(front).at(-1);
      if (g && g.homeScore !== g.awayScore) break;
      await send('step', { turns: 1 });
      front = await view();
    }
    const team = front.teamName;
    const game = ownGames(front).at(-1);
    const next = front.nextGames.find((g) => g.home === team || g.away === team);
    mkdirSync(new URL('front/', resources), { recursive: true });
    write('front/view.json', front);
    write('front/game.json', await service.gameInfo('player1', String(game.gameId), String(front.year)));
    write('front/games.json', await service.games('player1', { year: String(front.year), page: '0', scope: 'own', size: '200' }));
    write('front/team.json', await service.teamInfo('player1', next.home === team ? next.away : next.home));
    console.log(`紙面: ${front.currentDate.month}/${front.currentDate.day} ${game.away} ${game.awayScore}-${game.homeScore} ${game.home}`);
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (let n = 1; n <= 30; n++) if (await attempt(n)) process.exit(0);
console.error('30回作っても4月4日の自球団の最新の試合が負けにならなかった（ViewTest の紙面の検査の前提）');
process.exit(1);
