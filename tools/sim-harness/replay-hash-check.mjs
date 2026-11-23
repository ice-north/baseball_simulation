#!/usr/bin/env node
// ============================================================
// 固定の種で回した結果のハッシュを、記録しておいた値と比べる（動きを変えない整理の安全網）。
//
//   node tools/sim-harness/replay-hash-check.mjs           # 比べる（普段・check に入っている）
//   node tools/sim-harness/replay-hash-check.mjs --year    # 年度更新をまたぐ1年ぶんも比べる（重い。check:full）
//   node tools/sim-harness/replay-hash-check.mjs --update  # 今の結果を正として書き直す
//
// 回すもの:
//   game   一人用の自動試合（6球団×120試合。`Math.random` を種で固定）→ 全選手のデータ
//   online オンラインのリーグ（種で決まる）を開幕から40回進める → リーグ本体と参加者2人のビュー
//   year   （--year のときだけ）オンラインのリーグを次の年の開幕まで進める → 同じもの
//
// ⚠ **結果が変わる直しをしたら、それが狙った変化かを確かめてから `--update` する**。
//    「動きは変えない」整理でここが変わったら、どこかで乱数の順か計算が変わっている。
//    ハッシュは選手・試合の中身の JSON（キーの並びを揃えたもの）から取る。
// ============================================================

import { quiet } from './lib/quiet.mjs';
import './lib/bootstrap.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { withSeededRandom } from '../../src/game/rng.js';
import { buildLeague, runSeason, TEAMS_DATA } from './lib/league.mjs';
import { createLeague, defaultPhasePlan, submitPhase, advanceLeagueDay } from '../../server/leagueEngine.mjs';
import { projectLeague } from '../../server/projection.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, 'replay-hashes.json');
const UPDATE = process.argv.includes('--update');
const YEAR = process.argv.includes('--year') || UPDATE;

/** キーの並びを揃えた JSON（オブジェクトのキーの入る順が変わっただけでハッシュが変わらないように） */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined && typeof value[k] !== 'function')
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
  return JSON.stringify(value) ?? 'null';
}
const hash = (value) => createHash('sha256').update(stable(value)).digest('hex').slice(0, 16);

const results = {};

// ── 一人用の自動試合 ─────────────────────────────
{
  const t0 = Date.now();
  quiet(() =>
    withSeededRandom(20261123, () => {
      const names = buildLeague(6, 28, 1);
      runSeason(names, 120);
      results.game = hash(names.map((n) => [n, TEAMS_DATA[n].players]));
    }),
  );
  console.log(`  game   ${results.game}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`);
}

// ── オンラインのリーグ ───────────────────────────
// ⚠ 時刻は固定して渡す（`now` を引数で受けるので、壁時計に左右されない）
const ADMIN = 'a';
let now = new Date('2026-10-28T00:00:00Z');
const league = quiet(() =>
  createLeague({ seed: 20261123, members: [{ userId: 'a' }, { userId: 'b' }], now: now.toISOString() }),
);
const startYear = league.season.year;
const step = (i) => {
  if (league.status === 'waiting' && league.phase) {
    const phase = league.phase;
    for (const m of league.members) {
      // 先の人の提出で手続きが閉じたら、残りの人は出さない
      if (league.phase?.id !== phase.id) break;
      quiet(() =>
        submitPhase(league, m.userId, { phaseId: phase.id, plan: defaultPhasePlan(league, m.teamName), ready: true }, now.toISOString()),
      );
    }
    if (league.phase?.id === phase.id && league.status === 'waiting')
      throw new Error(`手続き ${phase.kind} が進まない`);
    return;
  }
  now = new Date(now.getTime() + 4 * 3600000);
  quiet(() => advanceLeagueDay(league, `replay:${i}`, now.toISOString()));
};
const onlineHash = () => {
  const bundle = { league, sessions: { a: {}, b: {} } };
  return hash({
    league,
    views: league.members.map((m) => quiet(() => projectLeague(bundle, m.userId, null, ADMIN))),
  });
};
{
  const t0 = Date.now();
  for (let i = 0; i < 40; i += 1) step(i);
  results.online = onlineHash();
  console.log(`  online ${results.online}（${((Date.now() - t0) / 1000).toFixed(1)}秒・${league.season.currentDate.month}/${league.season.currentDate.day}）`);
}
if (YEAR) {
  const t0 = Date.now();
  let i = 40;
  // 次の年に入り、その年の最初の試合が済むまで
  while (!(league.season.year > startYear && league.season.results.length > 0)) {
    step(i);
    i += 1;
    if (i > 5000) throw new Error('年度更新まで進まない');
  }
  results.year = onlineHash();
  console.log(`  year   ${results.year}（${((Date.now() - t0) / 1000).toFixed(1)}秒・${i}回）`);
}

const expected = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
if (UPDATE) {
  writeFileSync(FILE, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\n書き直した: ${FILE}`);
  process.exit(0);
}
const failed = Object.keys(results).filter((k) => expected[k] !== results[k]);
for (const k of failed) console.log(`  ✗ ${k}: 記録 ${expected[k] || '(無し)'} → 今 ${results[k]}`);
if (failed.length) {
  console.log(
    '\n✗ 固定の種で回した結果が記録と違う。動きを変えない整理なら、どこかで乱数の順か計算が変わっている。' +
      '\n  狙った変化なら `node tools/sim-harness/replay-hash-check.mjs --update` で書き直す。',
  );
  process.exit(1);
}
console.log('\n✓ 固定の種で回した結果が記録と同じ');
