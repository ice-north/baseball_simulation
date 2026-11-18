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
import { yearSummaryFor } from '../../server/yearSummary.mjs';

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

// --- その年のまとめ（年度更新の直後に出す。`server/yearSummary.mjs`）-----
// ⚠ いしだ 2026-11-18「キャンプの結果やオフの成長は要りません。その年の順位、
//    入退団の選手、主なトピックに止めて下さい」。出すのは**3つだけ**。
{
  const standing = (team, wins, losses, winRate) => ({ team, wins, losses, draws: 0, winRate });
  const league = {
    season: { year: 3 },
    teams: [
      // 自球団はこの年度更新で1部へ上がった（前年の部は `history.leagues`）
      { name: '三陸', league: 'A' },
      { name: '庄内', league: 'B' },
      { name: '秋田', league: 'B' },
      { name: '高知', league: 'A' },
    ],
    history: [
      {
        year: 2,
        standings: [
          standing('高知', 80, 40, 0.667),
          standing('三陸', 70, 50, 0.583),
          standing('庄内', 60, 60, 0.5),
          standing('秋田', 50, 70, 0.417),
        ],
        leagues: { 三陸: 'B', 庄内: 'B', 秋田: 'B', 高知: 'A' },
        playoffChampion: '三陸',
        awards: {
          battingChampion: { name: '打率太郎', team: '三陸', avg: 0.345 },
          honors: { B: { mvp: { name: 'MVP次郎', team: '三陸', line: '打率.330' } } },
        },
      },
    ],
    transactions: [
      { year: 2, kind: 'signing', teams: ['三陸'], date: { month: 11, day: 10 },
        moves: [{ name: '新人一郎', position: 'pitcher', from: null, to: '三陸' }] },
      { year: 2, kind: 'release', teams: ['三陸'], date: { month: 11, day: 1 },
        moves: [{ name: '退団二郎', position: 'left', from: '三陸', to: null }] },
      { year: 2, kind: 'trade', teams: ['三陸', '庄内'], date: { month: 6, day: 1 },
        moves: [
          { name: '交換三郎', position: 'short', from: '三陸', to: '庄内' },
          { name: '交換四郎', position: 'catcher', from: '庄内', to: '三陸' },
        ] },
      // ⚠ 別の年・別の球団の取引は混ぜない
      { year: 1, kind: 'signing', teams: ['三陸'], moves: [{ name: '去年五郎', position: 'first', from: null, to: '三陸' }] },
      { year: 2, kind: 'signing', teams: ['庄内'], moves: [{ name: 'よその六郎', position: 'first', from: null, to: '庄内' }] },
    ],
    chronicle: {
      retired: [{ year: 2, team: '三陸', name: '引退七郎', position: 'pitcher' }],
      proDrafted: [{ year: 2, team: '三陸', name: 'プロ八郎', position: 'center', npbTeam: '中日' }],
      milestones: [{ year: 2, team: '三陸', name: '節目九郎', label: '通算100本塁打' }],
    },
  };
  const s = yearSummaryFor(league, '三陸');
  assert.equal(s.year, 2, 'まとめるのは終わった年');
  // ① 順位は**自分の部だけ**（1部と2部を混ぜると「10位」のような順位になる）
  assert.deepEqual(
    s.standings.map((r) => r.team),
    ['三陸', '庄内', '秋田'],
    `順位に他の部が混ざっている: ${s.standings.map((r) => r.team)}`,
  );
  assert.equal(s.rank, 1, 'その年の順位がちがう');
  assert.equal(s.standings.find((r) => r.mine)?.team, '三陸', '自球団に印が付いていない');
  assert.deepEqual(s.record, { wins: 70, losses: 50, draws: 0 });
  // ② 入退団は**その年・その球団のぶんだけ**（入団・退団・トレード・引退・プロ入り）
  assert.deepEqual(
    s.joined.map((m) => m.name).sort(),
    ['交換四郎', '新人一郎'],
    `入団がちがう: ${s.joined.map((m) => m.name)}`,
  );
  assert.deepEqual(
    s.left.map((m) => m.name).sort(),
    ['プロ八郎', '交換三郎', '引退七郎', '退団二郎'],
    `退団がちがう: ${s.left.map((m) => m.name)}`,
  );
  assert.ok(
    s.joined.every((m) => m.year === 2) && s.left.every((m) => m.year === 2),
    '別の年の入退団が混ざっている',
  );
  // ③ 主なトピック（優勝・昇降格・表彰・節目）
  assert.ok(s.topics.includes('プレーオフ優勝'), `優勝が出ない: ${s.topics}`);
  assert.ok(s.topics.some((t) => t.includes('1部へ昇格')), `昇格が出ない: ${s.topics}`);
  assert.ok(s.topics.some((t) => t.includes('打率太郎')), `タイトルが出ない: ${s.topics}`);
  assert.ok(s.topics.some((t) => t.includes('MVP次郎')), `MVPが出ない: ${s.topics}`);
  assert.ok(s.topics.some((t) => t.includes('節目九郎')), `節目が出ない: ${s.topics}`);
  // ⚠ 長くしない（年が替わった画面で読み飛ばされる）
  assert.ok(s.topics.length <= 8, `トピックが多すぎる: ${s.topics.length}件`);
  // ⚠ **キャンプの結果・オフの成長は入れない**（いしだ要望）
  assert.deepEqual(
    Object.keys(s).filter((k) => /camp|gain|growth/i.test(k)),
    [],
    'まとめにキャンプ・成長の項目が入っている',
  );
  // 年度の記録がまだ無い年（1年目のシーズン前）は出さない
  assert.equal(yearSummaryFor({ history: [] }, '三陸'), null, '年度の記録が無いのにまとめを出した');
}

console.log('online-stove-check: ok');
