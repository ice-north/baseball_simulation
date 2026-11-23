// オンラインの保存とビューの大きさが、決めた上限（予算）を超えていないかを確かめる。
// 2人のリーグを1年目の開幕から2年目の20試合まで進め、開始・年度更新の直後・終わりの3時点で
// 保存の部分（芯・記録・世界…）と、画面へ返すビュー・球団の情報の大きさを測る。
//
//   node tools/sim-harness/online-size-budget-check.mjs            # 測って上限と比べる（約3分）
//   node tools/sim-harness/online-size-budget-check.mjs --update   # いまの大きさ×1.2 を上限に書き直す
//
// 上限は size-budget.json。**保存する項目を足して落ちたら、まず減らせないかを考える**
// （内訳は online-size-probe.mjs で見られる）。要る増え方なら --update で上限を上げ、
// 何が増えたかを PR に書く。上限よりずっと小さくなったら（60%未満）下げどきを知らせる。
// ⚠ 記録（records）は軽い読みでも毎回読む。芯も毎回読み書きする。ここが増えると全員の待ち時間が延びる
import { quiet } from './lib/quiet.mjs';
import { createLeague, defaultPhasePlan, submitPhase, advanceLeagueDay } from '../../server/leagueEngine.mjs';
import { touchPresence } from '../../server/social.mjs';
import { projectLeague, projectTeamInfo } from '../../server/projection.mjs';
import { splitBundle } from '../../server/storage/snapshotParts.mjs';
import { gzipSync } from 'node:zlib';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_FILE = process.env.SIZE_BUDGET_FILE || join(dirname(fileURLToPath(import.meta.url)), 'size-budget.json');
const UPDATE = process.argv.includes('--update');
const HEADROOM = 1.2; // --update のときの余裕
const LOOSE = 0.6; // 上限のこの割合を下回ったら「下げどき」

const rawKb = (v) => Buffer.byteLength(JSON.stringify(v ?? null)) / 1024;
const gzKb = (v) => gzipSync(JSON.stringify(v ?? null)).length / 1024;

// 測るもの。key は size-budget.json の名前
const LABELS = {
  core: '芯（毎回読み書き）',
  records: '記録（軽い読みでも毎回読む）',
  world: '世界',
  otherParts: 'そのほかの部分の合計',
  storedGzip: '保存の合計（gzip 後）',
  view: 'ビュー（画面へ返す全体）',
  viewGzip: 'ビュー（gzip 後・転送量）',
  teamInfo: '球団の情報',
};

let now = new Date('2026-10-28T00:00:00Z');
const league = quiet(() => createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now: now.toISOString() }));
const bundle = () => ({ league, sessions: {} });
const startYear = league.season.year;

/** いまの大きさ（KB）。部分は名前を決め打ちしない（保存の分け方が増えても合計に入る） */
function measure() {
  const { core, parts } = splitBundle(bundle());
  const sizes = { core: rawKb(core), records: 0, world: 0, otherParts: 0, storedGzip: gzKb(core) };
  const detail = {};
  for (const [name, part] of Object.entries(parts)) {
    const kb = rawKb(part);
    detail[name] = kb;
    if (name === 'records' || name === 'world') sizes[name] = kb;
    else sizes.otherParts += kb;
    sizes.storedGzip += gzKb(part);
  }
  const view = quiet(() => projectLeague(bundle(), 'a', null, null));
  sizes.view = rawKb(view);
  sizes.viewGzip = gzKb(view);
  sizes.teamInfo = rawKb(quiet(() => projectTeamInfo(bundle(), 'a', league.members[0].teamName)));
  return { sizes, detail };
}

const points = [];
const mark = (label) => {
  const m = measure();
  points.push({ label, ...m });
  const parts = Object.entries(m.detail)
    .map(([name, kb]) => `${name} ${Math.round(kb)}KB`)
    .join(' / ');
  console.log(`[${label}] 芯 ${Math.round(m.sizes.core)}KB / ${parts} / 保存の合計 gzip ${Math.round(m.sizes.storedGzip)}KB / ビュー ${Math.round(m.sizes.view)}KB`);
};

mark('開始');
let days = 0;
let seenYear = startYear;
while (days < 800) {
  if (league.status === 'waiting') {
    for (const m of league.members)
      quiet(() =>
        submitPhase(
          league,
          m.userId,
          { phaseId: league.phase.id, plan: defaultPhasePlan(league, m.teamName), ready: true },
          now.toISOString(),
        ),
      );
    continue;
  }
  if (league.season.year > startYear && league.season.results.length >= 20) break;
  now = new Date(now.getTime() + 4 * 3600000);
  for (const m of league.members) touchPresence(league, m.userId, now.toISOString());
  quiet(() => advanceLeagueDay(league, `budget:${days}`, now.toISOString()));
  days++;
  if (league.season.year !== seenYear) {
    mark(`${seenYear}年目を終えて`);
    seenYear = league.season.year;
  }
}
if (league.season.year <= startYear) {
  console.error(`✗ ${days}日進めても2年目に入らなかった（進行が止まっている）`);
  process.exit(1);
}
mark(`${league.season.year}年目の20試合`);

// どの時点でも超えないこと。時点ごとの最大を上限と比べる
const peak = {};
for (const key of Object.keys(LABELS)) {
  const top = points.reduce((best, p) => (p.sizes[key] > best.sizes[key] ? p : best));
  peak[key] = { kb: top.sizes[key], at: top.label };
}

if (UPDATE) {
  const budget = {};
  for (const key of Object.keys(LABELS)) budget[key] = Math.max(1, Math.ceil((peak[key].kb * HEADROOM) / 10) * 10);
  const old = existsSync(BUDGET_FILE) ? JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) : {};
  writeFileSync(BUDGET_FILE, `${JSON.stringify({ ...old, unit: 'KB', budget }, null, 2)}\n`);
  console.log(`\nsize-budget.json を書き直した（いまの大きさ×${HEADROOM}）`);
  for (const key of Object.keys(LABELS)) console.log(`  ${LABELS[key]}: ${Math.round(peak[key].kb)}KB → 上限 ${budget[key]}KB`);
  process.exit(0);
}

const { budget } = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
const rows = [];
const over = [];
const loose = [];
for (const key of Object.keys(LABELS)) {
  const limit = budget[key];
  const { kb, at } = peak[key];
  if (!(limit > 0)) {
    over.push(`${LABELS[key]}: size-budget.json に上限 ${key} が無い`);
    continue;
  }
  const ratio = kb / limit;
  const state = ratio > 1 ? '✗ 超えた' : ratio < LOOSE && kb >= 1 ? '下げどき' : 'OK';
  rows.push({ label: LABELS[key], kb: Math.round(kb), limit, percent: Math.round(ratio * 100), at, state });
  if (ratio > 1) over.push(`${LABELS[key]}: ${Math.round(kb)}KB > 上限 ${limit}KB（${at}）`);
  else if (state === '下げどき') loose.push(LABELS[key]);
}

console.log('\n大きさと上限（3時点の最大）');
for (const r of rows) console.log(`  ${r.state === 'OK' ? '  ' : r.state.startsWith('✗') ? '✗ ' : '・'}${r.label}: ${r.kb}KB / 上限 ${r.limit}KB（${r.percent}%・${r.at}）`);

// CI では実行のまとめに表を出す（PR を開かなくても増え方が分かる）
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### 保存とビューの大きさ',
    '',
    '| 測ったもの | 大きさ | 上限 | 割合 | 最大の時点 | |',
    '|---|--:|--:|--:|---|---|',
    ...rows.map((r) => `| ${r.label} | ${r.kb}KB | ${r.limit}KB | ${r.percent}% | ${r.at} | ${r.state} |`),
    '',
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (loose.length)
  console.log(`\n上限よりずっと小さい: ${loose.join('、')}。--update で上限を下げると、次の増え方に気づける`);
if (over.length) {
  console.error('\n✗ 上限を超えた');
  for (const line of over) console.error(`  ${line}`);
  console.error('  内訳は node tools/sim-harness/online-size-probe.mjs で見る。要る増え方なら --update で上限を上げ、PR に理由を書く');
  process.exit(1);
}
console.log('\nPASS 保存とビューの大きさは上限の内');
