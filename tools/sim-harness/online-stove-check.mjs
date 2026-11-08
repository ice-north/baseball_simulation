// シーズン後（ストーブリーグ）の見せ方の検査。
//
// ⚠ いしだ指摘（2026-11-08）: シーズン後の流れ・いまの段階・何をすればいいか、
//    キャンプや年度更新でどれだけ伸びたか、契約更改・トライアウトの判断材料が
//    分からない。ここでは画面が読む**決まりの部分**を確かめる。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SEASON_STEPS, seasonStage, CAMP_POLICY_GUIDE, CAMP_DIRECTIONS, CAMP_PHASES } from '../../src/online/shared.js';
import { relevantGains } from '../../src/online/campGains.js';
import { teamFitRank, DEFAULT_WEIGHTS } from '../../src/online/tryoutPlan.js';
import { getAIReleaseCandidates, releaseScore } from '../../src/game/contractRules.js';

// --- いまの段階 ---------------------------------------------------------
const at = (month, day) => ({ year: 2027, month, day });
const stage = (s) => seasonStage({ regularLeft: false, regularPlayed: true, ...s });
assert.deepEqual(stage({ regularLeft: true, date: at(5, 1) }), { key: 'season', open: true });
assert.deepEqual(
  stage({ regularLeft: true, regularPlayed: false, date: at(4, 1) }),
  { key: 'opening', open: false },
  'キャンプの後、開幕までは「開幕待ち」',
);
assert.deepEqual(stage({ date: at(9, 8) }), { key: 'postseason', open: true });
assert.deepEqual(stage({ phaseKind: 'contract', date: at(11, 9) }), { key: 'contract', open: true });
assert.deepEqual(
  stage({ date: at(11, 9) }),
  { key: 'tryout', open: false },
  '契約更改の後は「次にトライアウトが開く」（何も無いように見せない）',
);
assert.deepEqual(stage({ date: at(11, 12) }), { key: 'year_end', open: false });
assert.deepEqual(stage({ phaseKind: 'offseason', date: at(11, 30) }), { key: 'year_end', open: true }, '古い保存の年度更新');
assert.deepEqual(stage({ phaseKind: 'camp', date: at(11, 30) }), { key: 'camp', open: true });
assert.deepEqual(stage({ phaseKind: 'pack_select', date: at(4, 1) }), { key: 'pack_select', open: true });
for (const key of ['season', 'postseason', 'contract', 'tryout', 'year_end', 'camp', 'opening'])
  assert.ok(SEASON_STEPS.some((s) => s.key === key), `段階 ${key} の説明が無い`);

// アプリの表と同じ文であること（帯の文が片方だけ古くならない）
const kotlin = await readFile(
  new URL('../../mobile/shared/src/commonMain/kotlin/jp/icenorth/baseball/shared/Tables.kt', import.meta.url),
  'utf8',
);
for (const s of SEASON_STEPS)
  for (const text of [s.label, s.when, s.todo])
    assert.ok(kotlin.includes(`"${text}"`), `アプリの SEASON_STEPS に「${text}」が無い`);

// --- キャンプの目安は全方針ぶんある -------------------------------------
for (const d of CAMP_DIRECTIONS)
  for (const p of CAMP_PHASES)
    assert.ok(CAMP_POLICY_GUIDE[`${d}:${p}`]?.fielder && CAMP_POLICY_GUIDE[`${d}:${p}`]?.pitcher, `${d}:${p} の目安が無い`);

// --- 年度更新の伸びの見せ方 ---------------------------------------------
assert.deepEqual(
  relevantGains({ position: 'pitcher' }, { 'batting.meet': 1, 'pitching.control': 2, 'pitch.curve': 1 }),
  { 'pitching.control': 2, 'pitch.curve': 1 },
  '投手の打撃の伸びは出さない',
);
assert.deepEqual(
  relevantGains({ position: 'short' }, { 'batting.meet': 1, 'pitching.control': 2, 'pitch.curve': 1 }),
  { 'batting.meet': 1 },
);

// --- 契約更改: 標準案の理由は選び方と同じ式 -----------------------------
const fielder = (id, age, v) => ({
  id,
  age,
  position: 'second',
  batting: { meet: v, power: v },
  physical: { speed: v, arm: v },
  fielding: { defense: v },
});
const roster = Array.from({ length: 22 }, (_, i) => fielder(i + 1, 22, 60));
roster.push(fielder(100, 34, 60), fielder(101, 22, 30));
const picked = getAIReleaseCandidates(roster);
assert.ok(picked.includes(100) && picked.includes(101));
assert.deepEqual(releaseScore(roster.at(-2)).reasons, ['34歳']);
assert.deepEqual(releaseScore(roster.at(-1)).reasons, ['能力が低い']);
assert.equal(picked.length, 3, '標準案は少なくとも3人出す（3人目は理由なし＝枠を空けるため）');

// --- トライアウト: 名簿の同じ区分で何番手か -----------------------------
const own = [fielder(1, 25, 70), fielder(2, 25, 50), { ...fielder(3, 25, 90), position: 'center' }];
assert.deepEqual(teamFitRank(fielder(9, 20, 60), own, DEFAULT_WEIGHTS), { group: 'infielder', rank: 2, of: 2 });
assert.deepEqual(teamFitRank(fielder(9, 20, 80), own, DEFAULT_WEIGHTS), { group: 'infielder', rank: 1, of: 2 });

console.log('online-stove-check: ok');
