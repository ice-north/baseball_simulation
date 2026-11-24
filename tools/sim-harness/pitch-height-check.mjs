#!/usr/bin/env node
// ============================================================
// 高さと球種の噛み合い（`src/game/pitchCalling.js`）
//
// ⚠ いしだ 2026-11-24「低めのストレートは、意図と違いますね。低めに決まったストレートは
//    高めとはまた違う。**高めは空振りを誘い、低めは手が出ない**→スイングしにくいということ」。
//    それまでは「低めの速球＝抜け球と同じでいちばん打たれる」として、当たりの質に
//    +6/+4 の大盤振る舞いをしていた。決まった低めの速球は良い球で、打たれるのは浮いた速球。
//
// 高さの効き方は**球種で種類が違う**。
//   高めの速球   … 振ってもらえる（スイング率↑）が当たりは悪い（ミート↓）＝空振りが増える
//   低めの速球   … そもそも手が出ない（スイング率↓）。当たりの質はわずかに甘いだけ
//   低めの変化球 … 落ちる球。当たりが悪い（スイング率は触らない）
//   高めの変化球 … 「抜けたスライダー」。当たりが良い＝長打になる
//
// 終了コード: 全PASSで0、FAILで1。
// ============================================================
import assert from 'node:assert/strict';
import {
  getHeightPitchEffect,
  heightSwingBias,
  swingProbability,
} from '../../src/game/pitchCalling.js';
import { objectiveRowScore } from '../../src/game/pitchSituation.js';

const HIGH = 1;
const MID = 2;
const LOW = 3;
const quality = (row, isBreaking) => getHeightPitchEffect(row, isBreaking);
const swing = (row, isBreaking) =>
  swingProbability({ inZone: true, quality: 'good', isBreaking, row });

// --- 1. 速球: 高めは当たりが悪く、低めは「甘い球」ではない ---
{
  const high = quality(HIGH, false);
  const low = quality(LOW, false);
  const mid = quality(MID, false);
  assert.ok(high.meet < 0, `高めの速球が打ちにくくない（ミート${high.meet}）`);
  assert.deepEqual(mid, { meet: 0, power: 0 }, '真ん中の速球に偏りが付いている');
  // ⚠ **ここが指示の中心**。低めの速球は「いちばん打たれる球」ではない。
  //    +6/+4 の大盤振る舞いに戻すとここで落ちる
  assert.ok(
    low.meet <= 2 && low.power <= 2,
    `低めの速球が甘すぎる（ミート+${low.meet}/パワー+${low.power}）。決まった低めは良い球`,
  );
  assert.ok(low.meet >= 0, `低めの速球が高めと同じ扱いになっている（ミート${low.meet}）`);
}

// --- 2. 速球: 高めは振ってもらえ、低めは手が出ない ---
{
  const high = swing(HIGH, false);
  const mid = swing(MID, false);
  const low = swing(LOW, false);
  assert.ok(high > mid, `高めの速球のスイング率が上がらない（${high} / ${mid}）`);
  assert.ok(low < mid, `低めの速球のスイング率が下がらない（${low} / ${mid}）`);
  // 幅は1割前後（打者の得意コース 0.20 より小さいこと。球種と高さが個性を上回らない）
  const spread = (high - low) / mid;
  assert.ok(
    spread > 0.15 && spread < 0.40,
    `高めと低めのスイング率の差が外れている（${(spread * 100).toFixed(0)}%）`,
  );
  // ⚠ **空振りを誘う**＝「振ってもらえる」と「当たりが悪い」が同時に立つこと
  assert.ok(
    high > mid && quality(HIGH, false).meet < 0,
    '高めの速球が「振ってもらえるのに当たらない」になっていない',
  );
}

// --- 3. 変化球: 低いほど効く（対称。スイング率は触らない） ---
{
  const high = quality(HIGH, true);
  const low = quality(LOW, true);
  assert.ok(low.meet < 0, `低めの変化球が効かない（ミート${low.meet}）`);
  assert.ok(high.meet > 0, `高めの変化球（抜け球）が打たれない（ミート${high.meet}）`);
  assert.equal(low.meet, -high.meet, '変化球の高低が対称でない');
  for (const row of [HIGH, MID, LOW])
    assert.equal(heightSwingBias(row, true), 0, `変化球のスイング率を動かしている（row ${row}）`);
}

// --- 4. 配球のAIが噛み合っている（三振狙いは速球なら高め・変化球なら低め） ---
{
  // rowAxisValue: -1=高め / +1=低め。点が大きいほどそのセルを選ぶ
  assert.ok(
    objectiveRowScore('strikeout', -1, false) > objectiveRowScore('strikeout', 1, false),
    '三振狙いの速球で高めを選ばない',
  );
  assert.ok(
    objectiveRowScore('strikeout', 1, true) > objectiveRowScore('strikeout', -1, true),
    '三振狙いの変化球で低めを選ばない',
  );
  // ゴロ狙いは球種によらず低め
  for (const isBreaking of [false, true])
    assert.ok(
      objectiveRowScore('groundball', 1, isBreaking) > objectiveRowScore('groundball', -1, isBreaking),
      `ゴロ狙いで低めを選ばない（${isBreaking ? '変化球' : '速球'}）`,
    );
}

// --- 5. ボール球でも高さの向きは同じ（枠の外でも手が出る/出ない） ---
{
  const out = (row) => swingProbability({ inZone: false, quality: 'edge', isBreaking: false, row });
  assert.ok(out(0) > out(4), `枠外でも高めの方が手が出ることになっていない（${out(0)} / ${out(4)}）`);
}

console.log(
  '■ 高さと球種: OK（高めの速球は振らせて当てさせない・低めの速球は手が出ない・'
    + '変化球は低いほど効く・配球のAIが噛み合う / '
    + `スイング率 高め${(swing(HIGH, false) * 100).toFixed(1)}% 真ん中${(swing(MID, false) * 100).toFixed(1)}% `
    + `低め${(swing(LOW, false) * 100).toFixed(1)}%）`,
);
