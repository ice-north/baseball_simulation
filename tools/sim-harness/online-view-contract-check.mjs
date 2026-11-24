// ============================================================
// ビューの約束（mobile/tools/view-contract.mjs）を、本物のサーバーの答えで確かめる。
// アプリが読む項目のうち、名前を変えると黙って空になるもの（画面の検査では気づきにくい）が、
// 開幕直後（`live: true`）と、1年を進めたときのその時期（`when`）の答えにあるか。
//
//   node tools/sim-harness/online-view-contract-check.mjs         開幕直後だけ（check）
//   node tools/sim-harness/online-view-contract-check.mjs --year  年度更新のあとのキャンプまで進めて、時期の項目も（check:full）
//
// ⚠ ここが落ちたら、サーバーで名前を変えた（消した）項目がある。アプリの読むところと
//    view-contract.mjs を一緒に直す（古いアプリが黙って空になるので、名前は変えずに足す方が安全）。
// ============================================================
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quiet, quietAsync } from './lib/quiet.mjs';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { createLeague, defaultPhasePlan, submitPhase, advanceLeagueDay } from '../../server/leagueEngine.mjs';
import { projectLeague, projectTeamInfo, projectPlayerInfo, projectTransactions } from '../../server/projection.mjs';
import { VIEW_CONTRACT, hasPath } from '../../mobile/tools/view-contract.mjs';

const year = process.argv.includes('--year');
const dir = mkdtempSync(join(tmpdir(), 'view-contract-'));
const missing = [];
const seen = new Set();
const look = (endpoint, value, filter, label) => {
  for (const item of VIEW_CONTRACT[endpoint].filter(filter)) {
    const key = `${endpoint}:${item.path}`;
    if (hasPath(value, item.path)) seen.add(key);
    else if (item.live && label === '開幕直後') missing.push(`${endpoint} の ${item.path}（${label}。${item.why}）`);
  }
};
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
      requestId: `contract-${++seq}`,
      revision: (await view()).revision ?? 0,
      type,
      payload,
    });
  await quietAsync(async () => {
    await send('create');
    await send('testmode', { on: true });
    for (let guard = 0; guard < 5 && (await view()).status !== 'running'; guard++) await send('resolve');
    await send('step', { turns: 3 });
  });
  const reads = async (label, filter) => {
    const v = await view();
    look('view', v, filter, label);
    const own = v.roster.find((p) => p.position !== 'pitcher');
    const other = v.teamNames.find((name) => name !== v.teamName);
    look('team', await service.teamInfo('player1', other), filter, label);
    look('player', await service.playerInfo('player1', String(own.id)), filter, label);
    look('transactions', await service.transactions('player1', {}), filter, label);
    return v;
  };
  const opening = await reads('開幕直後', () => true);
  assert.equal(opening.status, 'running', '開幕しなかった');
  if (year) {
    // 年度更新のあとのキャンプまで、手続きは標準案で締め切って進める（chronicle-fixtures.mjs と同じ進め方）。
    // 10日ごとと、手続きの間は毎回、答えを見る
    let now = new Date('2026-10-28T00:00:00Z');
    const league = createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now: now.toISOString() });
    const bundle = () => ({ league, sessions: {} });
    const readAll = (label) => {
      const v = projectLeague(bundle(), 'a', null, null);
      look('view', v, () => true, label);
      const other = v.teamNames.find((name) => name !== v.teamName);
      look('team', projectTeamInfo(bundle(), 'a', other), () => true, label);
      const own = v.roster.find((p) => p.position !== 'pitcher');
      if (own) look('player', projectPlayerInfo(bundle(), 'a', String(own.id)), () => true, label);
      look('transactions', projectTransactions(bundle(), 'a', {}), () => true, label);
    };
    const startYear = league.season.year;
    quiet(() => {
      for (let day = 0; day < 400; day++) {
        if (league.status === 'waiting') {
          readAll('手続き');
          if (league.phase?.kind === 'camp' && league.season.year > startYear) break;
          for (const m of league.members)
            if (league.phase)
              submitPhase(league, m.userId, { phaseId: league.phase.id, plan: defaultPhasePlan(league, m.teamName), ready: true }, now.toISOString());
          continue;
        }
        now = new Date(now.getTime() + 4 * 3600000);
        advanceLeagueDay(league, `contract:${day}`, now.toISOString());
        if (day % 10 === 0) readAll('シーズン');
      }
    });
    assert.ok(league.season.year > startYear, '年度更新まで進まなかった');
    // 時期の項目（when）が1年のどこかで出たか。⚠ 'pro'（プロのその後の便り・途中参加の時刻）・'staff'（指導者の人事）・
    //    'elsewhere'（CPU の席・本番の保存先だけ）は出る年・人・保存先が限られるので、ここでは見ない
    for (const [endpoint, items] of Object.entries(VIEW_CONTRACT))
      for (const item of items)
        if (item.when && !['pro', 'staff', 'elsewhere'].includes(item.when) && !seen.has(`${endpoint}:${item.path}`))
          missing.push(`${endpoint} の ${item.path}（1年のどこにも無い。${item.why}）`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
assert.deepEqual(missing, [], `アプリが読む項目がサーバーの答えに無い:\n  ${missing.join('\n  ')}`);
const total = Object.values(VIEW_CONTRACT).flat().length;
console.log(`■ ビューの約束: OK（${year ? '1年通して' : '開幕直後'}・${seen.size}/${total}項目がサーバーの答えにある）`);
