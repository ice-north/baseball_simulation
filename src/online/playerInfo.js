import { BALL_EFFECTS, PITCHING_FORM_EFFECTS } from '../utils/constants.js';
import { getDeception } from '../game/deception.js';
import { getBatterType, BATTER_TYPE_LABEL } from '../game/batterType.js';
const n = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const handed = (value) =>
  ({ left: '左', right: '右', switch: '両' })[value] || '—';
// ============================================================
// 能力の並べ方は**効き方で分ける**（いしだ指摘 2026-11-08: 体幹などの細かい値が
// 結局何に効いているのか分からない）。試合に効くもの・疲れと勝負強さ・成長にだけ効くもの。
// 項目ごとの一言の説明は `ABILITY_HELP`（アプリの `AbilityHelp.kt` と同じ文）。
// ============================================================
export const ABILITY_GROUPS = [
  ['batting', '打撃・走塁'],
  ['pitching', '投球'],
  ['arsenal', '球種'],
  ['fielding', '守備'],
  ['positions', '守備適性'],
  ['body', '体力・精神'],
  ['growth', '成長の素質'],
  ['zone', '打撃の特徴'],
  ['profile', 'プロフィール'],
];

/**
 * 能力の一言の説明（何に・どう効くか）。PC版は項目名に触れる・押すと出し、アプリは押すと出す。
 *
 * ⚠ **アプリの `AbilityHelp.kt` と同じ文にすること**（`online-ability-help-check` が照らし合わせる）。
 * ⚠ 数字はゲームの実際の値から書く（マニュアルの数字は古い箇所がある）。出どころ:
 *    - 体力・回復: src/game/autoSimulation.js（試合後の疲労・休養日の回復）
 *    - 精神力: src/game/autoSimulation.js（得点圏の補正）
 *    - 体幹・器用さ: src/season/growthUtils.js（`physiqueMultFor`・`dexterityMult`）
 *    - プロ意識: src/season/campTraining.js（`disciplineMult`・覚醒・衰え始め）
 *    - 守備適性: src/game/autoSimulation.js（`buildDefense` の `fitnessMult`）
 *    ゲーム側の値を変えたら、ここも合わせて直すこと。
 */
export const ABILITY_HELP = {
  ミート: 'ボールに当てる力。安打の出やすさに効く。',
  パワー: '打球の強さ。長打と本塁打に効く。',
  選球眼: 'ボール球を見送る力。四球と三振に効く。',
  走力: '足の速さ。内野安打・走塁・盗塁と、守備の範囲に効く。',
  盗塁技術: '盗塁の成功しやすさ。',
  バント: 'バントの決まりやすさ。',
  打者型: '能力から決まる待ち方の型。相手投手の配球の読み合いに使われる。',
  球速: '速いほど打者が振り遅れる。疲れやスタミナ切れで落ちる。',
  制球: '狙ったコースに投げる力。四球と甘い球の出やすさに効く。',
  スタミナ: '1試合で投げられる量。減るほど球速と制球が落ちる。',
  回転: '直球のノビと変化球のキレ。高いほど球種の実際の効きが上がる。',
  出どころ: '球の見えにくさ。打者がタイミングを取りにくく、球種も見分けにくい。生まれつきで変わらない。',
  フォーム: '球速の出方（オーバー1.00倍〜アンダー0.92倍）と、球速・制球の伸びやすさが変わる。',
  守備: '打球の処理のうまさ。失策と、捕れる範囲に効く。',
  肩力: '送球の強さ。外野からの返球・内野の送球・捕手の盗塁阻止に効く。',
  捕手リード: '配球のうまさ。球種の選び方と失投の少なさに効く。制球の良い投手には際どいコースを多く求める。',
  体力: '疲れにくさ。野手は先発で出た日の疲れが7〜15（高いほど少ない）、投手は球数あたりの疲れが減る。休んだ日の回復量にも掛かる。',
  回復: '休んだ日に疲れが抜ける量。野手は「体力×25〜85%」、投手は0.7〜1.3倍。',
  精神力: '得点圏に走者がいるときだけ効く。打者はミート・パワー、投手は制球が「(精神力−50)÷10」だけ上下する。',
  体幹: 'パワー・肩力・走力・球速・体力の伸びやすさ（0.5〜1.5倍。50で等倍）。試合には効かない。',
  器用さ: 'ミート・選球眼・守備・制球・盗塁・バントの伸びやすさ（0.5〜1.5倍）。フォーム改造・新球種・両打ち・別の守備位置の覚えやすさにも効く。試合には効かない。',
  プロ意識: 'キャンプの伸び（0.5〜1.5倍）、覚醒の起きやすさ（30未満は起きない）、衰え始めの遅さ（80で+1歳、100で+2歳）。試合には効かない。',
  成長係数: '毎年の伸び全体に掛かる倍率（0.3〜1.8）。試合に出続けると少しずつ上がり、疲れたまま出続けると下がる。',
  守備適性: 'その位置で守ると、守備・走力・肩力が「0.5＋適性÷200」倍で効く（100で等倍、60で0.8倍）。',
};

export function abilityRows(player, group) {
  const b = player.batting || {},
    p = player.pitching || {},
    f = player.physical || {};
  const rows = {
    batting: [
      ['ミート', n(b.meet)],
      ['パワー', n(b.power)],
      ['選球眼', n(b.eye)],
      ['走力', n(f.speed)],
      ['盗塁技術', n(b.steal)],
      ['バント', n(b.bunt)],
      [
        '打者型',
        player.batting ? BATTER_TYPE_LABEL[getBatterType(player)] : null,
      ],
    ],
    pitching: [
      ['球速', n(p.velocity)],
      ['制球', n(p.control)],
      ['スタミナ', n(p.stamina)],
      ['回転', n(p.spinRate)],
      ['出どころ', player.pitching ? getDeception(player) : null],
      ['フォーム', PITCHING_FORM_EFFECTS[p.form]?.name || p.form || null],
    ],
    // ⚠ 走力は「打撃・走塁」、肩力は「守備」に1回だけ出す（以前は身体と守備に2回ずつ出ていた）
    fielding: [
      ['守備', n(player.fielding?.defense)],
      ['肩力', n(f.arm)],
      ['捕手リード', n(player.catching?.lead)],
    ],
    // 試合に効く身体と精神（疲れと、得点圏の勝負強さ）
    body: [
      ['体力', n(f.bodyStamina)],
      ['回復', n(f.recovery)],
      ['精神力', n(player.personality?.mental)],
    ],
    positions: [
      'pitcher',
      'catcher',
      'first',
      'second',
      'third',
      'short',
      'left',
      'center',
      'right',
    ].map((id, i) => [
      ['投手', '捕手', '一塁', '二塁', '三塁', '遊撃', '左翼', '中堅', '右翼'][
        i
      ],
      n(player.positionFitness?.[id]),
    ]),
    // 成長にだけ効く素質。試合の強さには効かない
    growth: [
      ['体幹', n(f.muscle)],
      ['器用さ', n(f.dexterity)],
      ['プロ意識', n(player.personality?.discipline)],
      [
        '成長係数',
        n(player.growthPotential) === null
          ? null
          : Math.max(
              0.3,
              Math.min(
                1.8,
                player.growthPotential + (n(player.growthModifier) ?? 0),
              ),
            ).toFixed(2),
      ],
    ],
    profile: [
      ['背番号', player.number ?? null],
      ['年齢', n(player.age)],
      ['投げ', handed(f.throws)],
      ['打ち', handed(b.bats)],
      [
        '体格',
        { large: '大柄', medium: '中肉', normal: '中肉', small: '小柄' }[
          f.build
        ] ||
          f.build ||
          null,
      ],
      ['出身高校', player.origin?.highSchool || null],
      ['出身大学', player.origin?.university || null],
      ['前所属', player.origin?.previousTeam || null],
    ],
    arsenal: (p.arsenal || []).map((pitch) => [
      BALL_EFFECTS[pitch.type]?.name || pitch.type,
      n(pitch.level),
    ]),
  };
  return rows[group] || [];
}
