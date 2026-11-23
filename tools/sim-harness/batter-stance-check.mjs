#!/usr/bin/env node
// ============================================================
// 打撃フォームと体格が内外角の得手不得手を動かす（`src/game/batterZone.js`）
//
// ⚠ いしだ 2026-11-23:
//    「打撃フォームを取り入れようと思います。種類は３つ。オープン、スクエア、クローズ。
//      オープン：インコースが得意になり、アウトコースが苦手になる／スクエア：平均的／
//      クローズ：アウトコースが得意になり、インコースが苦手になる。
//      また、体格によっても違いを出します（大柄：アウトコースが得意／普通：平均的／
//      小柄：インコースが得意）。元々の打撃タイプに加え、個人の好み。この２つに
//      フォームと体格によるレイヤーを加え、苦手を無くす打撃フォームにするか、
//      得意を伸ばす打撃フォームにするか、プレイヤーの判断で変わります」
//
// 見るのは6つ。
//   1. **向き**。オープンは内角が得意（`inside` がマイナス側）、クローズは逆。
//      大柄は外角が得意、小柄は内角が得意。
//   2. **重ねられる**。フォームと体格を同じ向きに積むと端へ寄り、逆向きだと打ち消し合う。
//      ＝「得意を伸ばす」「苦手を無くす」のどちらも選べる。
//   3. **既定は名前とIDから決まる**（生成箇所を1行も触らずに全選手が持つ）。
//      スクエアが半分、オープンとクローズが4分の1ずつ。
//   4. **リーグ全体の平均は動かない**（フォームの分布が対称なので打高打低に振れない）。
//   5. **キャンプのフォーム改造で変わる**（成否にかかわらず変わる。成功率は器用さで上下）。
//   6. 試合の補正（`getZoneMatchupEffect`）に実際に効く。
// 終了コード: 全PASSで0、FAILで1。
// ============================================================
import assert from 'node:assert/strict';
import {
  getZoneProfile,
  getZoneMatchupEffect,
  battingStanceOf,
  describeBatterShape,
  BATTING_STANCES,
  BUILD_INSIDE,
} from '../../src/game/batterZone.js';
import { executeSubTraining } from '../../src/season/campTraining.js';

/** 同じ素材の打者を、フォームと体格だけ変えて作る */
const batter = (stance, build, extra = {}) => ({
  id: 7,
  name: '検査 太郎',
  position: 'shortstop',
  battingStance: stance,
  batting: { meet: 55, power: 45, eye: 50 },
  physical: { build, dexterity: 50 },
  ...extra,
});
const insideOf = (stance, build) => getZoneProfile(batter(stance, build)).inside;

// --- 1. 向き（`inside` は内角の苦手さ。マイナス＝内角が得意） ---
{
  const open = insideOf('open', 'medium');
  const square = insideOf('square', 'medium');
  const closed = insideOf('closed', 'medium');
  assert.ok(open < square, `オープンが内角寄りでない（${open} / ${square}）`);
  assert.ok(closed > square, `クローズが外角寄りでない（${closed} / ${square}）`);
  assert.equal(
    Math.round((square - open) * 100) / 100,
    Math.round((closed - square) * 100) / 100,
    'オープンとクローズの幅が同じでない（スクエアを中心にすること）',
  );
  const small = insideOf('square', 'small');
  const large = insideOf('square', 'large');
  assert.ok(small < square, `小柄が内角寄りでない（${small} / ${square}）`);
  assert.ok(large > square, `大柄が外角寄りでない（${large} / ${square}）`);
  // ⚠ 体格はフォームより**弱い**（選べないものが選べるものを上回らない）
  assert.ok(
    Math.abs(large - square) < Math.abs(closed - square),
    '体格の効きがフォームより強い（選べないものを強くしない）',
  );
}

// --- 2. 重ねられる（得意を伸ばす／苦手を無くす） ---
{
  // 同じ向きに積む＝得意を伸ばす
  const sharpened = insideOf('closed', 'large');
  const base = insideOf('square', 'medium');
  assert.ok(
    sharpened - base > 0.5,
    `フォームと体格を同じ向きに積んでも伸びない（${sharpened} 対 ${base}）`,
  );
  // 逆向きに積む＝打ち消す（大柄がクローズではなくオープンにすると中心へ戻る）
  const covered = insideOf('open', 'large');
  assert.ok(
    Math.abs(covered - base) < Math.abs(insideOf('square', 'large') - base),
    `逆向きのフォームで体格の偏りを打ち消せていない（${covered}）`,
  );
  // 端（±1）で頭打ちになること
  for (const [st, b] of [['closed', 'large'], ['open', 'small']])
    assert.ok(Math.abs(insideOf(st, b)) <= 1, `${st}/${b} で ±1 を超えている`);
}

// --- 3. 既定は名前とIDから決まる（持っていない選手も必ず持つ） ---
{
  const count = { open: 0, square: 0, closed: 0 };
  for (let i = 0; i < 6000; i += 1)
    count[battingStanceOf({ name: `選手${i}`, id: i })] += 1;
  const share = (k) => count[k] / 6000;
  assert.ok(Math.abs(share('square') - 0.5) < 0.03, `スクエアが半分でない（${share('square').toFixed(3)}）`);
  assert.ok(Math.abs(share('open') - 0.25) < 0.03, `オープンが4分の1でない（${share('open').toFixed(3)}）`);
  assert.ok(Math.abs(share('closed') - 0.25) < 0.03, `クローズが4分の1でない（${share('closed').toFixed(3)}）`);
  // 同じ選手なら何度呼んでも同じ
  const p = { name: '同じ 選手', id: 3 };
  assert.equal(battingStanceOf(p), battingStanceOf({ ...p }), '同じ名前とIDで違うフォームが出る');
  // 持っていれば持っているものが勝つ
  assert.equal(battingStanceOf({ ...p, battingStance: 'closed' }), 'closed', '選手が持つフォームが使われない');
  // 知らない値は既定に落とす（古い保存・壊れた値）
  assert.equal(battingStanceOf({ ...p, battingStance: 'いいかげん' }), battingStanceOf(p), '知らないフォームで落ちている');
  assert.equal(battingStanceOf(null), 'square', '選手が無いときはスクエア');
}

// --- 4. リーグ全体の平均は動かない（打高打低に振れない） ---
{
  let withLayer = 0;
  let withoutLayer = 0;
  const N = 4000;
  for (let i = 0; i < N; i += 1) {
    const p = { name: `平均${i}`, id: i, batting: { meet: 50, power: 50 }, physical: {} };
    withLayer += getZoneProfile(p).inside;
    withoutLayer += getZoneProfile({ ...p, name: `平均${i}`, battingStance: 'square' }).inside;
  }
  assert.ok(
    Math.abs(withLayer / N - withoutLayer / N) < 0.02,
    `フォームを入れるとリーグ全体の内外角の平均が動く（${(withLayer / N).toFixed(3)} 対 ${(withoutLayer / N).toFixed(3)}）`,
  );
  // 体格も3種が揃えば平均0（大柄+0.20 / 中肉0 / 小柄-0.20）
  assert.equal(BUILD_INSIDE.large + BUILD_INSIDE.medium + BUILD_INSIDE.small, 0, '体格の3つが打ち消し合わない');
}

// --- 5. キャンプのフォーム改造で変わる ---
{
  let changed = 0;
  let success = 0;
  const N = 600;
  for (let i = 0; i < N; i += 1) {
    const p = batter('square', 'medium', { personality: { discipline: 50 } });
    const before = battingStanceOf(p);
    executeSubTraining(p, 'form_change', { targetStance: 'closed' });
    if (battingStanceOf(p) !== before) changed += 1;
    if (p.battingStance === 'closed') success += 1;
  }
  assert.equal(changed, N, `フォーム改造でフォームが変わらない回があった（${changed}/${N}）`);
  assert.equal(success, N, '指定した打撃フォームにならない回があった');
  // 成否は器用さで動く（成功は2割前後。ここでは「必ず成功」でも「必ず失敗」でもないことだけ見る）
  let ok = 0;
  for (let i = 0; i < 800; i += 1) {
    const p = batter('square', 'medium', { personality: { discipline: 50 } });
    const r = executeSubTraining(p, 'form_change', { targetStance: 'open' });
    if (r.growthReport.some((g) => g.statName === '打撃フォーム改造成功')) ok += 1;
  }
  assert.ok(ok > 40 && ok < 400, `フォーム改造の成功率が外れている（${ok}/800）`);
}

// --- 6. 試合の補正に効く（内角のセルで、オープンとクローズが逆になる） ---
{
  // col 4 が内角・col 0 が外角（打者から見た向き）
  const inner = { col: 4, row: 2 };
  const outer = { col: 0, row: 2 };
  const openP = getZoneProfile(batter('open', 'medium'));
  const closedP = getZoneProfile(batter('closed', 'medium'));
  const openInner = getZoneMatchupEffect(inner, openP).meet;
  const closedInner = getZoneMatchupEffect(inner, closedP).meet;
  const openOuter = getZoneMatchupEffect(outer, openP).meet;
  const closedOuter = getZoneMatchupEffect(outer, closedP).meet;
  assert.ok(openInner > closedInner, `内角でオープンが有利でない（${openInner} / ${closedInner}）`);
  assert.ok(closedOuter > openOuter, `外角でクローズが有利でない（${closedOuter} / ${openOuter}）`);
  assert.ok(
    openInner - closedInner > 2,
    `フォームの差が試合でほとんど出ない（内角のミート差 ${(openInner - closedInner).toFixed(1)}）`,
  );
}

// --- 表示 ---
assert.equal(describeBatterShape(batter('open', 'small')), 'オープン・小柄', '説明の文が違う');
assert.equal(describeBatterShape(batter('square', 'medium')), 'スクエア', '中肉のときに体格を書いている');
assert.deepEqual(Object.keys(BATTING_STANCES), ['open', 'square', 'closed'], '打撃フォームの3つが変わっている');

console.log(
  '■ 打撃フォーム: OK（オープン/スクエア/クローズの向き・体格の重ね・既定の散らばり'
    + '・リーグ平均は不変・キャンプで変わる・試合の補正に効く / '
    + `内角のミート差 オープン対クローズ ${(
      getZoneMatchupEffect({ col: 4, row: 2 }, getZoneProfile(batter('open', 'medium'))).meet
      - getZoneMatchupEffect({ col: 4, row: 2 }, getZoneProfile(batter('closed', 'medium'))).meet
    ).toFixed(1)}）`,
);
