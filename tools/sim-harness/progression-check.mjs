#!/usr/bin/env node
// ============================================================
// 多年次プログレッション検証
//
// 独立リーグモードのフルワールド（ユーザーリーグ + 社会人179 + 他独立 +
// 大学234校 + 高校生プール、計約560チーム/15,000選手）を構築し、実物の年次進行
// （表彰→ドラフト→advanceToNextYear→翌年高校生生成）をN年回して、世界の
// 長期健全性を検証する。
//
// これが捕まえるバグの種別:
//   - プール漏れ/爆発（例: 過去にあった「大学卒業生のリリースプール消失」）
//     → 人口保存の帯で検出
//   - デモグラフィ崩壊（若年層が痩せる/老人だらけになる）→ 年齢ピラミッドで検出
//   - 多年次のクラブ過剰指名 → クラブ指名シェアで検出
//   - 年次進行のクラッシュ（成長/引退/大学/ドラフトのどこかで落ちる）→ 完走で検出
//   - ドラフト規模の暴走 → 総指名数の帯で検出
//
// 使い方:
//   node tools/sim-harness/progression-check.mjs [年数]
//
// 終了コード: 全PASSで0、FAILで1。所要 ≈ 1 + 0.5×年数 秒。
// ============================================================

import './lib/bootstrap.mjs';
import { Report } from './lib/report.mjs';
import { bootstrapWorld, advanceYear } from './lib/world.mjs';

const YEARS = Number(process.argv[2]) || 5;
console.log(`\n▶ 多年次プログレッション検証: フルワールドを ${YEARS} 年進行`);

const { seasonData: initial } = bootstrapWorld();

const history = [];
let crashed = null;
let sd = initial;
for (let y = 1; y <= YEARS; y++) {
  sd.year = y;
  try {
    const m = advanceYear(sd);
    history.push(m);
    sd = m.nextSeasonData;
  } catch (e) {
    crashed = { year: y, error: e?.message || String(e) };
    break;
  }
}

// --- 年次サマリを表示 ---
console.log('\n  年 | 指名 [高% 大% 社% 独% クラブ] | 人口   引退');
console.log('  ' + '─'.repeat(52));
for (const m of history) {
  const t = m.draftTotal || 1;
  const p = (x) => String(Math.round(x / t * 100)).padStart(2);
  console.log(`  Y${String(m.year).padStart(2)}| ${String(m.draftTotal).padStart(3)} ` +
    `[高${p(m.bySource.highschool)} 大${p(m.bySource.university)} 社${p(m.bySource.corporate)} 独${p(m.bySource.independent)} ク${m.draftClub}] | ` +
    `${String(m.population).padStart(5)}  ${m.retirements}`);
}

const first = history[0], last = history[history.length - 1];
const startPopulation = first?.population || 0;
const maxClubShare = Math.max(...history.map(m => m.draftTotal ? m.draftClub / m.draftTotal * 100 : 0));
const draftMin = Math.min(...history.map(m => m.draftTotal));
const draftMax = Math.max(...history.map(m => m.draftTotal));
const retMin = Math.min(...history.map(m => m.retirements));
const retMax = Math.max(...history.map(m => m.retirements));
const g = last?.ageGroups || {};

const r = new Report(`■ 長期健全性（${history.length}年）`);
r.assert(`${YEARS}年間クラッシュせず完走`, crashed === null,
  crashed ? `Y${crashed.year}: ${crashed.error}` : `${history.length}年完走`);
// 人口保存: 初年比 ±12% を超える増減はプール漏れ/爆発の兆候
r.band('人口保存(最終/初年)', last ? last.population / startPopulation : 0, 0.88, 1.12,
  v => (v * 100).toFixed(1) + '%');
r.band('年間指名数(最小)', draftMin, 60, 140, v => v.toFixed(0) + '名');
r.band('年間指名数(最大)', draftMax, 60, 140, v => v.toFixed(0) + '名');
r.band('クラブ指名シェア(最大)', maxClubShare, 0, 8, v => v.toFixed(1) + '%');
r.band('年間引退数(最小)', retMin, 150, 600, v => v.toFixed(0) + '名');
r.band('年間引退数(最大)', retMax, 150, 600, v => v.toFixed(0) + '名');
// 年齢ピラミッド健全性: 若年層ほど厚い（単調減少）であること
r.assert('年齢ピラミッドが単調減少',
  g['18-21'] > g['22-25'] && g['22-25'] > g['26-29'] &&
  g['26-29'] > g['30-33'] && g['30-33'] > g['34+'],
  `18-21:${g['18-21']} 22-25:${g['22-25']} 26-29:${g['26-29']} 30-33:${g['30-33']} 34+:${g['34+']}`);
r.assert('若年層(18-21)が最大層', g['18-21'] === Math.max(...Object.values(g)), '');
// ポジションバランス: 全年で投手過多/捕手不足に陥っていないか
// （初期の健全値: 投手~30% 捕手~8% 内野~32% 外野~30%）
const posMaxPitcher = Math.max(...history.map(m => m.positions.pitcher));
const posMinCatcher = Math.min(...history.map(m => m.positions.catcher));
r.band('投手シェア(最大)', posMaxPitcher, 22, 42, v => v.toFixed(1) + '%');
r.band('捕手シェア(最小)', posMinCatcher, 5, 12, v => v.toFixed(1) + '%');
r.print();

// --- 参考: ドラフト比率の推移（初年が最も忠実）---
if (first) {
  const t = first.draftTotal || 1;
  console.log(`  初年ドラフト比率(最も忠実): 高${Math.round(first.bySource.highschool/t*100)}% ` +
    `大${Math.round(first.bySource.university/t*100)}% 社${Math.round(first.bySource.corporate/t*100)}% ` +
    `独${Math.round(first.bySource.independent/t*100)}%  （CLAUDE.md目標: 高30/大35/社20/独14）`);
  console.log('  注) 年を追うと高校比率が上がる傾向は、実試合を消化せず出場由来の成長/表彰を');
  console.log('      過小評価する近似の影響を含む。比率推移は参考値、クラブ/人口/年齢が合否対象。\n');
}

process.exit(r.passed ? 0 : 1);
