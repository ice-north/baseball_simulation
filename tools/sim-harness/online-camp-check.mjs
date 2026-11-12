// キャンプの割り当ての検査。
//
// ⚠ 主目的は「**選手ごとの割り当てが本当に効くこと**」。以前は球団で1つ
//    メニューを選ぶだけで、一人用（1人ずつ割り当てる）とは別物だった。
//    画面だけ作って中身が全員同じ練習のままでも、見た目では気づけない。
// ⚠ もう1つは「**画面が出すメニューを、サーバーが必ず受け取れること**」。
//    `TRAINING_MENUS` にはオンラインのエンジンが動かさないもの
//    （新球種習得）があり、実測で画面に出ていた。選べるのに提出で弾かれる。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import {
  createLeague,
  submitPhase,
  loadLeagueWorld,
  recordCampRound,
  validateCampRound,
  runCampRound,
  campFallbackPlan,
} from '../../server/leagueEngine.mjs';
import { captureWorld } from '../../server/worldSnapshot.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import {
  CAMP_MENUS,
  CAMP_SUB_MENUS,
  CAMP_SUB_TARGETS,
  CAMP_PITCH_TYPES,
  CAMP_ROUNDS,
} from '../../src/online/shared.js';
import {
  SUB_TRAINING_MENUS,
  executeSubTraining,
  executeCampTraining,
  TALENT_STAT_MULTIPLIERS,
} from '../../src/season/campTraining.js';
import { menusFor, subMenusFor } from '../../src/online/campMenus.js';
import { createSeededRandom } from '../../src/game/rng.js';
import {
  DIRECTIONS,
  resolveTraining,
  playerWish,
  playerPolicy,
  recommendedPolicy,
  describeMood,
  moodMultiplier,
  PLAIN_SKILL_LINE,
  poleStats,
} from '../../src/season/trainingPolicy.js';
import { abilitySnapshot, abilityGains, campGainLabel } from '../../src/online/campGains.js';

// ノック・守備補強とスタッフ指導で伸びる能力も、成果から落とさない。
{
  const before = abilitySnapshot({ positionFitness: { short: 70 }, personality: { mental: 40 } });
  const after = abilitySnapshot({ positionFitness: { short: 78 }, personality: { mental: 41 } });
  assert.deepEqual(abilityGains(before, after), { 'personality.mental': 1, 'positionFitness.short': 8 });
  assert.equal(campGainLabel('positionFitness.short'), '遊撃適性');
  assert.equal(campGainLabel('personality.mental'), '精神');
  const state = { rounds: 0 };
  recordCampRound(state, { gains: { 1: { 'batting.meet': 2 } }, events: { 1: ['ミートが覚醒'] } });
  recordCampRound(state, { gains: { 1: { 'batting.meet': 1 } }, events: {} });
  assert.equal(state.rounds, 2);
  assert.deepEqual(state.gains, { 1: { 'batting.meet': 3 } });
  assert.deepEqual(state.events, { 1: ['ミートが覚醒'] }, '後のクールで覚醒の記録が消えた');
}

const NOW = '2026-10-26T15:00:00.000Z';
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};

/** セット選択まで済ませて、キャンプの手続きが開いたリーグを作る */
function leagueAtCamp() {
  const league = quiet(() =>
    createLeague({ members: [{ userId: 'a' }], now: NOW }),
  );
  assert.equal(league.phase.kind, 'pack_select', '前提: 開幕前はセット選択');
  quiet(() =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: { packId: league.packs[0].id },
        ready: true,
      },
      NOW,
    ),
  );
  assert.equal(league.phase.kind, 'camp', '前提: 次はキャンプ');
  return league;
}

const ownRoster = (league) =>
  league.game.teams[league.members[0].teamName].players;

/** 名簿の能力の合計。練習がどこを伸ばしたかを見る */
const totals = (players) => {
  const sum = (pick) => players.reduce((n, p) => n + (pick(p) || 0), 0);
  return {
    meet: sum((p) => p.batting?.meet),
    power: sum((p) => p.batting?.power),
    speed: sum((p) => p.physical?.speed),
    control: sum((p) => p.pitching?.control),
    velocity: sum((p) => p.pitching?.velocity),
    bodyStamina: sum((p) => p.physical?.bodyStamina),
  };
};

/** キャンプを、指定した割り当てで解決した結果の合計 */
function campWith(build) {
  const league = leagueAtCamp();
  const before = totals(ownRoster(league));
  const plan = { menu: 'standard', assignments: build(ownRoster(league)) };
  quiet(() =>
    submitPhase(
      league,
      'a',
      { phaseId: league.phase.id, plan, ready: true },
      NOW,
    ),
  );
  assert.notEqual(league.phase?.kind, 'camp', 'キャンプが解決していない');
  const after = totals(ownRoster(league));
  return Object.fromEntries(
    Object.keys(after).map((key) => [key, after[key] - before[key]]),
  );
}

// --- 画面が出すメニューを、サーバーが受け取れるか ----------------------
{
  // ⚠ 画面が出すメニューそのもの（`campMenus.js` の `menusFor`）を見る。以前は
  //    画面の絞り込みを写して持っていて、写しは画面と別の条件（区分）になっていた
  const offered = (isPitcher) => menusFor(isPitcher).map(([key]) => key);
  for (const isPitcher of [true, false]) {
    const list = offered(isPitcher);
    assert.ok(list.length >= 4, `${isPitcher ? '投手' : '野手'}のメニューが少なすぎる`);
    for (const key of list)
      assert.ok(CAMP_MENUS.includes(key), `${key} をサーバーが受け取れない`);
  }
  // ⚠ 投手に打撃練習、野手に投げ込みを出さない
  assert.ok(!offered(true).includes('batting'), '投手に打撃練習を出している');
  assert.ok(!offered(false).includes('control'), '野手に投げ込みを出している');
  // ⚠ **オンラインで動かさない練習を出さない**。実測で「新球種習得」が出ていた
  assert.ok(!offered(true).includes('newpitch'), '新球種習得を出している');
}

// --- サブ練習の出し分け ------------------------------------------------
// ⚠ **効かないサブ練習を出さないこと**。変化球練習・新球種習得・スピン解析は
//    投手にしか効かず、Cリード学習は捕手だけ。出すと、選べるのにそのクールが
//    丸ごと無駄になる（`executeSubTraining` が何もせずに返る）。
// ⚠ **フォーム改造・打席変更はまだ出さない**（対象の種類が増える）。
//    サブポジ練習は `CAMP_SUB_TARGETS` に載せて対象を選べるようにしたので出す。
//    これが欠けていた間、**野手のサブ練習は体づくり系だけ**だった。
{
  // 画面が出すサブ練習そのもの（`campMenus.js` の `subMenusFor`）
  const offered = (player) => subMenusFor(player).map(([key]) => key);
  const pitcher = { position: 'pitcher' };
  const catcher = { position: 'catcher' };
  const fielder = { position: 'left' };
  for (const key of ['form_change', 'switch_hit'])
    assert.ok(
      !CAMP_SUB_MENUS.includes(key),
      `対象の種類が無いサブ練習を出している: ${key}`,
    );
  for (const key of CAMP_SUB_MENUS)
    assert.ok(SUB_TRAINING_MENUS[key], `知らないサブ練習がある: ${key}`);
  // ⚠ **野手に守備の伸ばし方を出すこと**。サブポジ練習が抜けると、野手の
  //    サブ練習が体づくり系（基礎体力・ウエイト・ストレッチ）だけになる
  for (const player of [catcher, fielder])
    assert.ok(
      offered(player).includes('subposition'),
      `${player.position} にサブポジ練習が出ていない`,
    );
  // ⚠ 対象を選べるものは**全部** `SUB_TRAINING_MENUS` にあり、かつ画面に出ること。
  //    載せただけで `CAMP_SUB_MENUS` に入れ忘れると、対象の欄が誰にも出ない
  for (const key of Object.keys(CAMP_SUB_TARGETS)) {
    assert.ok(SUB_TRAINING_MENUS[key], `対象の表に知らない練習がある: ${key}`);
    assert.ok(CAMP_SUB_MENUS.includes(key), `対象を選べるのに出していない: ${key}`);
  }
  // 投手だけのもの
  for (const key of ['breaking', 'newpitch', 'spin_analysis']) {
    assert.ok(offered(pitcher).includes(key), `投手に ${key} が出ていない`);
    assert.ok(!offered(fielder).includes(key), `野手に ${key} が出ている`);
  }
  // 捕手だけのもの
  assert.ok(offered(catcher).includes('clead_study'), '捕手にCリード学習が出ていない');
  assert.ok(!offered(fielder).includes('clead_study'), '野手にCリード学習が出ている');
  // 誰でもできるもの
  for (const key of ['physique', 'weight', 'stretch', 'defense_sub', 'long_throw', 'eye'])
    for (const player of [pitcher, catcher, fielder])
      assert.ok(offered(player).includes(key), `${player.position} に ${key} が出ていない`);
}

// --- 1クールの伸びの大きさ ---------------------------------------------
// ⚠ **「どの練習でも必ず+1」に戻さないこと**（いしだ指摘: 2〜3年目から能力が
//    インフレする）。以前は主対象に「最低+1」の保証があり、才能係数も
//    メニューの係数も高能力の減衰も、すべてそこに押し流されていた。
//    実測（オンライン12球団・1年）で 走力+2.3・制球+2.5 に対しミート+1.0、
//    5年でリーグ平均の制球が 49.8→65.7 まで上がっていた。
// ⚠ ここは**期待値**で見る（1クールの伸びは0か1で、確率的に丸めている）。
//    乱数を種で固定して、同じ数が出ることを前提にする。
{
  const TRIALS = 600;
  const real = Math.random;
  /** その練習をこの選手に1クール当てたときの、能力ごとの平均の伸び */
  const perRound = (menu, build) => {
    Math.random = createSeededRandom(20261110);
    const sums = {};
    try {
      for (let i = 0; i < TRIALS; i += 1) {
        const before = build();
        const after = executeCampTraining(before, menu, null, null, 0, 1.0).player;
        for (const [key, path] of [
          ['meet', 'batting.meet'],
          ['speed', 'physical.speed'],
          ['arm', 'physical.arm'],
          ['defense', 'fielding.defense'],
          ['control', 'pitching.control'],
        ]) {
          const get = (p) => path.split('.').reduce((o, k) => o?.[k], p) ?? 0;
          sums[key] = (sums[key] || 0) + (get(after) - get(before));
        }
      }
    } finally {
      Math.random = real;
    }
    return Object.fromEntries(
      Object.entries(sums).map(([k, v]) => [k, v / TRIALS]),
    );
  };
  const fielder = (over = {}) => () => ({
    id: 1, name: '検査野手', age: 21, position: 'left', experience: 100,
    growthPotential: 1.0,
    personality: { discipline: 50, mental: 50 },
    batting: { meet: 45, power: 40, eye: 45, bunt: 30, steal: 30, bats: 'right' },
    physical: { speed: 45, arm: 45, bodyStamina: 50, recovery: 50, muscle: 50, dexterity: 50 },
    fielding: { defense: 45 },
    ...over,
  });
  const pitcher = (over = {}) => () => ({
    id: 2, name: '検査投手', age: 21, position: 'pitcher', experience: 100,
    growthPotential: 1.0,
    personality: { discipline: 50, mental: 50 },
    batting: { meet: 20, power: 20, eye: 20, bunt: 20, steal: 20, bats: 'right' },
    physical: { speed: 40, arm: 50, bodyStamina: 50, recovery: 50, muscle: 50, dexterity: 50 },
    fielding: { defense: 40 },
    pitching: { velocity: 135, control: 45, stamina: 100, spinRate: 50, form: 'threeQuarter', arsenal: [{ id: 1, type: 'straight', level: 50 }] },
    ...over,
  });

  const bat = perRound('batting', fielder());
  const run = perRound('baserunning', fielder());
  const knock = perRound('fielding', fielder());
  const pitch = perRound('control', pitcher());

  // ⚠ **1クールで必ず+1にならないこと**。保証が戻ると、ここが1.0に貼り付く
  for (const [name, value] of [
    ['打撃練習のミート', bat.meet],
    ['走塁練習の走力', run.speed],
    ['投げ込みの制球', pitch.control],
  ])
    assert.ok(
      value < 0.98,
      `${name}が毎クール必ず伸びている（最低+1の保証が戻っている）: ${value.toFixed(2)}`,
    );

  // ⚠ **才能依存（足・肩）は、技術（ミート・守備）より伸びにくいこと**
  assert.ok(
    run.speed < bat.meet * 0.7,
    `走力が伸びやすすぎる: 走塁練習${run.speed.toFixed(2)} / 打撃練習のミート${bat.meet.toFixed(2)}`,
  );
  assert.ok(
    knock.arm < knock.defense,
    `肩力が守備より伸びている: 肩${knock.arm.toFixed(2)} / 守備${knock.defense.toFixed(2)}`,
  );
  assert.ok(
    TALENT_STAT_MULTIPLIERS.speed < 1 && TALENT_STAT_MULTIPLIERS.arm < 1,
    '才能依存の係数が1以上になっている',
  );

  // ⚠ **投手の制球だけが積み上がらないこと**。投手は選べるメニューが少なく、
  //    制球が毎クール選ばれる。1クールの伸びがミートより速いと年々開く
  assert.ok(
    pitch.control < bat.meet * 1.5,
    `制球が打撃より伸びやすい: 制球${pitch.control.toFixed(2)} / ミート${bat.meet.toFixed(2)}`,
  );

  // ⚠ **伸び切った能力は鈍ること**（高能力の減衰）。しきい値は技術系65
  const high = perRound('batting', fielder({ batting: { meet: 85, power: 40, eye: 45, bunt: 30, steal: 30, bats: 'right' } }));
  assert.ok(
    high.meet < bat.meet * 0.5,
    `高い能力が鈍っていない: ミート85で${high.meet.toFixed(2)} / ミート45で${bat.meet.toFixed(2)}`,
  );
  // ⚠ しきい値より下では**これまでどおり伸びる**こと（打撃を巻き添えにしない）
  const mid = perRound('batting', fielder({ batting: { meet: 60, power: 40, eye: 45, bunt: 30, steal: 30, bats: 'right' } }));
  assert.ok(
    mid.meet > bat.meet * 0.8,
    `しきい値の下なのに鈍っている: ミート60で${mid.meet.toFixed(2)} / ミート45で${bat.meet.toFixed(2)}`,
  );

  // ⚠ **覚醒には減衰を掛けないこと**（いしだ方針: 覚醒は限界突破なので、
  //    能力が高くても伸びてほしい）。伸び幅の減衰は `baseGrowth` にだけ掛け、
  //    覚醒ぶんは足すだけ——という作りを、ここで固定する。
  //    実測: 覚醒したときのミートの伸びは ミート40で4.89・95で4.25
  //    （減るのは上限100の頭打ちぶんだけ）
  {
    const real = Math.random;
    /** 覚醒したクールだけ拾って、伸び幅の平均を出す */
    const burst = (meet) => {
      Math.random = createSeededRandom(20261111);
      let sum = 0;
      let n = 0;
      try {
        // ⚠ 覚醒は1クール・1能力あたり1.4%（4クール合わせて20%前後にそろえた）。
        //    2000回では数十回しか出ず、平均がぶれる
        for (let i = 0; i < 12000; i += 1) {
          const before = fielder({
            batting: { meet, power: 40, eye: 45, bunt: 30, steal: 30, bats: 'right' },
          })();
          // 経験値は1シーズン出ずっぱりの主力ぶん。覚醒倍率はオンラインと同じ1.5
          before.experience = 240;
          const out = executeCampTraining(before, 'batting', null, null, 1.5, 1.0);
          const rep = out.growthReport.find((x) => x.stat === 'meet');
          if (rep?.isAwakening) {
            sum += rep.growth;
            n += 1;
          }
        }
      } finally {
        Math.random = real;
      }
      return { 平均: n ? sum / n : 0, 回数: n };
    };
    const low = burst(40);
    const high2 = burst(85);
    assert.ok(low.回数 > 50 && high2.回数 > 50, `覚醒が起きていない: ${low.回数}/${high2.回数}回`);
    assert.ok(
      high2.平均 > low.平均 * 0.8,
      `覚醒まで減衰している: ミート40で${low.平均.toFixed(2)} / ミート85で${high2.平均.toFixed(2)}`,
    );
    assert.ok(high2.平均 >= 3, `覚醒の伸びが小さすぎる: ${high2.平均.toFixed(2)}`);
  }

  // ⚠ **覚醒率はクールごとに下がらないこと**（いしだ要望: 均す）。経験値を
  //    クールごとに消費していた頃は 63.7% → 22.0% → 0% → 0% で、覚醒は
  //    1クール目だけのものだった。消費はキャンプの最後の1クールで1回。
  // ⚠ **4クール合わせて20%前後**（いしだ要望）。打撃練習は4能力に当たるので
  //    4クールで16回引く。実測 18.9%（経験240・プロ意識50・覚醒倍率1.5）
  {
    const real = Math.random;
    const TRIALS = 3000;
    const perRoundHits = [0, 0, 0, 0];
    let anyHits = 0;
    Math.random = createSeededRandom(20261112);
    try {
      for (let t = 0; t < TRIALS; t += 1) {
        let p = fielder()();
        // 1シーズン出ずっぱりの主力ぶん（`calculateSeasonExperience`）
        p.experience = 240;
        let any = false;
        for (let r = 0; r < CAMP_ROUNDS; r += 1) {
          const out = executeCampTraining(p, 'batting', null, null, 1.5, 1.0, {
            spendExperience: r === CAMP_ROUNDS - 1,
          });
          p = out.player;
          if (out.growthReport.some((x) => x.isAwakening)) {
            perRoundHits[r] += 1;
            any = true;
          }
        }
        if (any) anyHits += 1;
      }
    } finally {
      Math.random = real;
    }
    const rates = perRoundHits.map((n) => (n / TRIALS) * 100);
    const camp = (anyHits / TRIALS) * 100;
    // 最後のクールが1クール目の半分を下回ったら「均していない」
    assert.ok(
      rates[3] > rates[0] * 0.5,
      `覚醒率がクールごとに下がっている: ${rates.map((v) => v.toFixed(1)).join(' / ')}%`,
    );
    assert.ok(
      camp >= 13 && camp <= 28,
      `4クール合わせた覚醒率が20%前後から外れている: ${camp.toFixed(1)}%`,
    );
  }
}

// --- サブ練習の対象が効くか --------------------------------------------
// ⚠ **「選べるのに効かない」をここで止める**。画面に対象の欄を足しても、
//    `runCampRound` が `executeSubTraining` へ渡さなければ中で抽選され、
//    「スライダーを選んだのにシュートを覚えた」になる。見た目では気づけない。
{
  // 新球種: 乱数を固定して**必ず成功**させ、覚えた球種が指定どおりか見る。
  // ⚠ 指定が無いときに何を引くかを先に測り、**それとは違う球種**を指定する。
  //    同じものを指定すると、渡っていなくても通ってしまう
  const makePitcher = () => ({
    id: 1,
    name: '検査投手',
    position: 'pitcher',
    physical: { dexterity: 50 },
    pitching: { form: 'overhand', arsenal: [{ type: 'straight', level: 50 }] },
  });
  const fixedRandom = (fn) => {
    const real = Math.random;
    Math.random = () => 0;
    try {
      return fn();
    } finally {
      Math.random = real;
    }
  };
  const learned = (player) =>
    (player.pitching.arsenal || []).map((a) => a.type).filter((t) => t !== 'straight');
  const auto = makePitcher();
  fixedRandom(() => executeSubTraining(auto, 'newpitch', {}, null));
  assert.equal(learned(auto).length, 1, '前提: 乱数を固定すると必ず習得する');
  const other = CAMP_PITCH_TYPES.find((t) => t !== learned(auto)[0]);
  const aimed = makePitcher();
  fixedRandom(() => executeSubTraining(aimed, 'newpitch', { targetPitch: other }, null));
  assert.deepEqual(
    learned(aimed),
    [other],
    `選んだ球種を覚えていない（おまかせ: ${learned(auto)[0]}）`,
  );

  // 変化球練習: 持っている球種のうち**指定した1つだけ**が伸びること
  const two = {
    id: 2,
    name: '検査投手2',
    position: 'pitcher',
    age: 22,
    physical: { dexterity: 50 },
    pitching: {
      form: 'overhand',
      arsenal: [
        { type: 'straight', level: 50 },
        { type: 'slider', level: 40 },
        { type: 'curve', level: 40 },
      ],
    },
  };
  executeSubTraining(two, 'breaking', { targetPitch: 'curve' }, null);
  const levelOf = (t) => two.pitching.arsenal.find((a) => a.type === t).level;
  assert.equal(levelOf('slider'), 40, '指定していない球種が伸びた');
  assert.ok(levelOf('curve') > 40, '指定した球種が伸びていない');

  // サブポジ練習: 指定した守備位置**だけ**の適性が上がること。
  // ⚠ **「おまかせ」が何を引くかを固定してから測る**。全部同じ適性だと自動でも
  //    1/7 で当たってしまい、対象が渡っていなくても通る。遊撃を一段高くすると
  //    自動は必ず遊撃を選ぶ（高いものを100へ寄せる規則）ので、二塁が伸びたら
  //    それは指定が効いた証拠になる
  const fielder = {
    id: 3,
    name: '検査野手',
    position: 'left',
    physical: { dexterity: 50 },
    positionFitness: { catcher: 30, first: 30, second: 30, third: 30, short: 90, left: 100, center: 30, right: 30 },
  };
  executeSubTraining(fielder, 'subposition', { targetPosition: 'second' }, null);
  assert.ok(fielder.positionFitness.second > 30, '指定した守備位置が伸びていない');
  assert.equal(fielder.positionFitness.short, 90, 'おまかせの引き先（遊撃）が伸びた');
  for (const pos of ['catcher', 'first', 'third', 'center', 'right'])
    assert.equal(fielder.positionFitness[pos], 30, `指定していない守備位置が伸びた: ${pos}`);
}

// --- 対象がサーバーを通って練習まで届くか -------------------------------
{
  const league = leagueAtCamp();
  const teamName = league.members[0].teamName;
  const roster = ownRoster(league);
  const fielder = roster.find(
    (p) => p.position !== 'pitcher' && p.position !== 'second' && p.position !== 'short',
  );
  const aim = 'second';
  const decoy = 'short';
  const plan = validateCampRound(league, teamName, {
    policy: { direction: 'balanced', phase: 'skill' },
    main: { [fielder.id]: 'batting' },
    sub: { [fielder.id]: 'subposition' },
    subTarget: { [fielder.id]: aim },
  });
  assert.ok(plan.subTarget, '入口が対象を返していない');
  assert.equal(plan.subTarget[fielder.id], aim, '入口で対象が落ちている');
  loadLeagueWorld(league);
  const livePlayer = () => TEAMS_DATA[teamName].players.find((p) => p.id === fielder.id);
  // ⚠ **「おまかせ」の引き先を固定してから測る**（単体の検査と同じ理由）。
  //    遊撃だけ一段高くすると、対象が渡っていなければ必ず遊撃が伸びる
  livePlayer().positionFitness = {
    catcher: 30, first: 30, second: 30, third: 30, short: 90, left: 30, center: 30, right: 30,
    [fielder.position]: 100,
  };
  const fitnessOf = () => ({ ...livePlayer().positionFitness });
  const before = fitnessOf();
  quiet(() => runCampRound(league, teamName, plan));
  const after = fitnessOf();
  assert.ok(
    (after[aim] || 0) > (before[aim] || 0),
    `選んだ守備位置（${aim}）が伸びていない: ${before[aim]} → ${after[aim]}`,
  );
  // ⚠ **おまかせの引き先が伸びていないこと**。渡っていなければ中で抽選されるので、
  //    「どれかが伸びた」だけでは対象が効いている証明にならない
  assert.equal(after[decoy], before[decoy], 'おまかせの引き先（遊撃）が伸びた');

  // ⚠ **食い違う対象は断る**。黙って捨てると、画面で選んだのに効かない
  const reject = (payload, re, message) =>
    assert.throws(() => validateCampRound(league, teamName, payload), re, message);
  reject(
    {
      sub: { [fielder.id]: 'physique' },
      subTarget: { [fielder.id]: 'second' },
    },
    /対象を選べない練習/,
    '対象を取らない練習に対象を付けられた',
  );
  reject(
    {
      sub: { [fielder.id]: 'subposition' },
      subTarget: { [fielder.id]: 'pitcher' },
    },
    /練習の対象が不正/,
    'サブポジ練習で投手を選べた',
  );
  const pitcher = roster.find((p) => p.position === 'pitcher');
  reject(
    {
      sub: { [pitcher.id]: 'newpitch' },
      subTarget: { [pitcher.id]: 'second' },
    },
    /練習の対象が不正/,
    '新球種に守備位置を選べた',
  );
}

// --- まとめて割り当て（方針 → メニュー）がサーバーを通るか --------------
{
  const league = leagueAtCamp();
  const roster = ownRoster(league);
  for (const player of roster) {
    // ⚠ 本人の希望が読めること（画面が出す）
    const wish = playerWish(player);
    assert.ok(DIRECTIONS[wish.direction], `希望の方針が読めない: ${player.name}`);
    for (const direction of Object.keys(DIRECTIONS))
      for (const phase of ['physique', 'skill']) {
        const { main } = resolveTraining(player, direction, phase);
        assert.ok(
          CAMP_MENUS.includes(main),
          `方針から引いたメニューをサーバーが受け取れない: ${main}（${direction}/${phase}）`,
        );
      }
  }
}

// --- 選手ごとの方針（おすすめ・全員を希望どおり・上書き） ----------------
// ⚠ いしだ指摘: 方針が球団で1つだと、希望の違う選手が必ず「身が入らない」で
//    残り、一括指定が有効に見えない。決め方を選べ、1人ずつ合わせられること
{
  const league = leagueAtCamp();
  const roster = ownRoster(league);
  const teamName = league.members[0].teamName;
  const toneOf = (p, own) => describeMood(p, own.direction, own.phase).tone;
  for (const p of roster) {
    // 全員を希望どおり → 全員「意欲的」
    assert.equal(toneOf(p, playerPolicy(p, { mode: 'wish' })), 'good');
    // おすすめ → 身が入らない選手は出ない。変えるのは平凡な選手の短所埋めだけ
    const rec = recommendedPolicy(p);
    assert.notEqual(toneOf(p, rec), 'bad', `おすすめで身が入らない: ${p.name}`);
    const wish = playerWish(p);
    if (wish.direction === 'patch' && poleStats(p, 'skill').bestValue < PLAIN_SKILL_LINE)
      assert.deepEqual(rec, { direction: 'sharpen', phase: wish.phase });
    else assert.deepEqual(rec, wish);
    // 上書きはどの決め方よりも先に効く
    const own = { direction: 'patch', phase: 'physique' };
    assert.deepEqual(playerPolicy(p, { mode: 'wish' }, { [p.id]: own }), own);
  }
  // 決め方が無い（前の版の画面・保存した指示）なら全員同じ方針
  assert.deepEqual(playerPolicy(roster[0], { direction: 'patch', phase: 'skill' }), {
    direction: 'patch',
    phase: 'skill',
  });
  // 入口: 決め方と上書きを受け取る。受け取れない方針は弾く
  const target = roster[0];
  const plan = validateCampRound(league, teamName, {
    policy: { mode: 'wish' },
    players: { [target.id]: { direction: 'patch', phase: 'physique' }, 999999: { direction: 'patch', phase: 'skill' } },
  });
  assert.equal(plan.policy.mode, 'wish');
  assert.deepEqual(plan.players, { [target.id]: { direction: 'patch', phase: 'physique' } }, '他球団の選手の上書きが残った');
  assert.equal(validateCampRound(league, teamName, { policy: { mode: 'nope' } }).policy.mode, 'team');
  assert.throws(
    () => validateCampRound(league, teamName, { players: { [target.id]: { direction: 'x', phase: 'skill' } } }),
    /育成方針が不正/,
  );
  // 実行: やる気は**選手ごとの方針**で決まる（全員を希望どおりなら全員 1.15 倍、
  //    上書きした1人だけその方針の倍率）
  loadLeagueWorld(league);
  const { moods } = quiet(() =>
    runCampRound(league, teamName, {
      policy: { mode: 'wish' },
      players: { [target.id]: { direction: 'patch', phase: 'physique' } },
    }),
  );
  // 締め切り: 何もしなかった人はおすすめ（画面の既定と同じ）、CPU球団は全員同じ
  assert.equal(campFallbackPlan({ userId: 'a' }, { menu: 'standard', assignments: {} }).policy.mode, 'recommended');
  assert.equal(campFallbackPlan(null, undefined).policy, undefined);
  const submitted = { policy: { mode: 'team', direction: 'patch', phase: 'skill' }, players: { 1: { direction: 'sharpen', phase: 'skill' } } };
  assert.deepEqual(campFallbackPlan({ userId: 'a' }, submitted).policy, submitted.policy, '提出した決め方が消えた');
  assert.deepEqual(campFallbackPlan({ userId: 'a' }, submitted).players, submitted.players, '提出した上書きが消えた');
  for (const p of roster)
    assert.equal(
      moods[p.id],
      p.id === target.id ? moodMultiplier(p, 'patch', 'physique') : 1.15,
      `やる気が選手ごとの方針になっていない: ${p.name}`,
    );
}

// --- 提出の検証 ---------------------------------------------------------
{
  const league = leagueAtCamp();
  const roster = ownRoster(league);
  // 受け取れないメニューは弾く
  assert.throws(
    () =>
      quiet(() =>
        submitPhase(
          league,
          'a',
          {
            phaseId: league.phase.id,
            plan: { menu: 'standard', assignments: { [roster[0].id]: 'newpitch' } },
            ready: false,
          },
          NOW,
        ),
      ),
    /練習メニューが不正/,
  );
  // ⚠ **提出の側でも守備位置を見ること**（`campRound` の入口と同じ規則）。
  //    片方だけ見ていると、締め切りで回るぶんに効かない練習が混ざる
  {
    const fielder = roster.find((p) => p.position !== 'pitcher');
    assert.throws(
      () =>
        quiet(() =>
          submitPhase(
            league,
            'a',
            {
              phaseId: league.phase.id,
              plan: {
                menu: 'standard',
                subAssignments: { [fielder.id]: 'breaking' },
              },
              ready: false,
            },
            NOW,
          ),
        ),
      /サブ練習が不正/,
      '提出で野手に変化球練習を通した',
    );
  }

  // ⚠ **他球団の選手は落とす**。混ぜられると練習が飛ぶ
  quiet(() =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: {
          menu: 'standard',
          assignments: { [roster[0].id]: 'fielding', 999999999: 'batting' },
        },
        ready: false,
      },
      NOW,
    ),
  );
  const saved = league.phase.submissions.a.plan;
  assert.deepEqual(
    Object.keys(saved.assignments),
    [String(roster[0].id)],
    '名簿に居ない選手の割り当てが残っている',
  );
}

// --- 割り当てが本当に効くか（ここが本丸） -------------------------------
// ⚠ 同じ種のリーグを2回作り、**割り当てだけ**を変えて比べる。乱数の流れは
//    手続きのidから決まるので、差は割り当てによるものになる。
const all = (key) => (roster) =>
  Object.fromEntries(roster.map((p) => [p.id, key]));
const batting = campWith(all('batting'));
const running = campWith(all('baserunning'));
assert.ok(
  batting.meet > running.meet,
  `打撃練習でミートが伸びていない: 打撃${batting.meet} / 走塁${running.meet}`,
);
assert.ok(
  running.speed > batting.speed,
  `走塁練習で走力が伸びていない: 走塁${running.speed} / 打撃${batting.speed}`,
);

// 投手も同じ（投げ込みと球速練習を比べる）
const control = campWith(all('control'));
const velocity = campWith(all('velocity'));
assert.ok(
  control.control > velocity.control,
  `投げ込みで制球が伸びていない: 投げ込み${control.control} / 球速${velocity.control}`,
);
assert.ok(
  velocity.velocity > control.velocity,
  `球速練習で球速が伸びていない: 球速${velocity.velocity} / 投げ込み${control.velocity}`,
);

// --- 1クールずつ自分で実行する（ここが本丸） ---------------------------
// ⚠ **自分で回したクールを数えること**。数えないと、画面で4回やった球団が
//    締め切りでもう4回やって**8クールぶん**成長する。
{
  const dir = await mkdtemp(join(tmpdir(), 'pennant-camp-'));
  try {
    const store = new FileStore(join(dir, 'state.gz'));
    const service = new LeagueService(store, {
      members: [{ userId: 'admin', label: '管理者' }],
      adminId: 'admin',
      clock: () => NOW,
    });
    const admin = (await service.login('admin')).sessionId;
    let seq = 0;
    const send = async (type, payload) => {
      const l = (await store.read()).league;
      seq += 1;
      return service.command('admin', admin, {
        requestId: `campchk-${type}-${seq}`,
        revision: l?.revision ?? 0,
        type,
        payload,
      });
    };
    await send('create');
    const created = (await store.read()).league;
    await send('submit', {
      phaseId: created.phase.id,
      plan: { packId: created.packs[0].id },
      ready: true,
      baseSubmission: null,
    });
    const atCamp = (await store.read()).league;
    assert.equal(atCamp.phase.kind, 'camp', '前提: キャンプが開いている');
    const teamName = atCamp.members[0].teamName;
    const sumOf = (league) => totals(league.game.teams[teamName].players);
    const start = sumOf(atCamp);

    // ⚠ ビューに進み具合が載ること（載らないと画面が毎回「第1クール」になる）
    const view0 = await service.view('admin', admin);
    assert.equal(view0.phase.camp?.rounds, 0, 'クールの進みが渡っていない');
    assert.equal(view0.phase.camp?.total, 4, 'クール数が渡っていない');

    const roster = atCamp.game.teams[teamName].players;
    // ⚠ **経験値はキャンプで1回しか使わない**（覚醒率をクールごとに均すため）。
    //    クールごとに7割ずつ消すと4クールで 0.3^4＝0.8% まで落ち、3クール目
    //    以降の覚醒率が0になる。保存されている世界に印を付けて、最後に確かめる
    await store.transaction((value) => {
      for (const p of value.league.game.teams[teamName].players)
        p.experience = 240;
    });
    const round = (n) =>
      send('campRound', {
        round: n,
        policy: { direction: 'balanced', phase: 'skill' },
        main: Object.fromEntries(
          roster.map((p) => [
            p.id,
            p.position === 'pitcher' ? 'control' : 'batting',
          ]),
        ),
        sub: Object.fromEntries(roster.map((p) => [p.id, 'physique'])),
      });

    // ⚠ **起動したての関数でも通ること**（いしだ報告: キャンプで「球団が
    //    見つかりません」）。入口の検査がメモリ上の世界（`TEAMS_DATA`）を
    //    見ていて、別の命令で世界を読んだ後でないと空だった。本番の Vercel は
    //    呼び出しごとに新しい関数のことがあり、最初のクールで止まった。
    //    メモリ上の世界を空にしてから送る
    for (const name of Object.keys(TEAMS_DATA)) delete TEAMS_DATA[name];
    await round(1);
    const after1 = (await store.read()).league;
    assert.equal(after1.phase.camp.admin.rounds, 1, '1クール目が数えられていない');
    const one = sumOf(after1);
    assert.ok(one.meet > start.meet, '1クールで伸びていない');
    // ⚠ **サブ練習も実行すること**。基礎体力は「体力+2〜4/クール確定」なので、
    //    1クールで人数×2以上は必ず伸びる。メインだけ回していると伸びない
    assert.ok(
      one.bodyStamina - start.bodyStamina >= roster.length * 2,
      `サブ練習（基礎体力）が効いていない: 体力の伸び ${one.bodyStamina - start.bodyStamina}（${roster.length}人）`,
    );

    // ⚠ **伸びを残すこと**（いしだ指摘: 能力は伸びているのに結果がまとまって
    //    おらず、成長が実感できない）。記録した伸びが名簿の実際の差と一致すること
    const camp1 = after1.phase.camp.admin;
    assert.equal(camp1.last?.round, 1, 'このクールの伸びが残っていない');
    const recorded = (gains, key) =>
      Object.values(gains || {}).reduce((n, g) => n + (g[key] || 0), 0);
    assert.equal(
      Math.round(recorded(camp1.last.gains, 'batting.meet')),
      one.meet - start.meet,
      '記録したミートの伸びが実際の差と合わない',
    );
    assert.equal(
      Math.round(recorded(camp1.last.gains, 'physical.bodyStamina')),
      one.bodyStamina - start.bodyStamina,
      '記録した体力の伸び（サブ練習）が実際の差と合わない',
    );
    assert.deepEqual(camp1.gains, camp1.last.gains, '1クール目の通算がこのクールと違う');
    const viewed = (await service.view('admin', admin)).phase.camp;
    assert.deepEqual(viewed.last, camp1.last, 'このクールの伸びがビューに渡っていない');
    assert.deepEqual(viewed.gains, camp1.gains, '通算の伸びがビューに渡っていない');

    // ⚠ **効かないサブ練習は入口で断ること**。野手に変化球練習を当てても
    //    何も起きず、そのクールが丸ごと無駄になる
    const outfielder = roster.find((p) => p.position !== 'pitcher');
    await assert.rejects(
      () =>
        send('campRound', {
          round: 2,
          policy: { direction: 'balanced', phase: 'skill' },
          main: {},
          sub: { [outfielder.id]: 'breaking' },
        }),
      /サブ練習が不正/,
      '野手に変化球練習を当てられた',
    );
    // ⚠ 投手なら通る
    const pitcher = roster.find((p) => p.position === 'pitcher');
    await send('campRound', {
      round: 2,
      policy: { direction: 'balanced', phase: 'skill' },
      main: Object.fromEntries(
        roster.map((p) => [p.id, p.position === 'pitcher' ? 'control' : 'batting']),
      ),
      sub: Object.fromEntries(
        roster.map((p) => [
          p.id,
          p.id === pitcher.id ? 'breaking' : 'long_throw',
        ]),
      ),
    });
    // ⚠ 遠投は肩力を上げる。全員に当てたので、肩の合計は必ず伸びる
    const afterThrow = (await store.read()).league;
    const armOf = (l) =>
      l.game.teams[teamName].players.reduce(
        (n, p) => n + (p.physical?.arm || 0),
        0,
      );
    assert.ok(
      armOf(afterThrow) > armOf(after1),
      '遠投で肩力が伸びていない',
    );
    // 通算は2クールぶんを足したもの
    const camp2 = afterThrow.phase.camp.admin;
    assert.equal(camp2.last?.round, 2, '2クール目の伸びが残っていない');
    assert.equal(
      Math.round(recorded(camp2.gains, 'physical.arm')),
      armOf(afterThrow) - armOf(atCamp),
      '通算の肩力の伸びが実際の差と合わない',
    );

    // ⚠ **同じクールを2回走らせない**。押し直しや再送で成長が二重に積まれる
    await assert.rejects(
      () => round(1),
      (e) => e.status === 409,
      '同じクールを2回実行できた',
    );
    // ⚠ 飛ばして先のクールも実行できない
    await assert.rejects(
      () => round(4),
      (e) => e.status === 409,
      'クールを飛ばして実行できた',
    );

    await round(3);
    const two = sumOf((await store.read()).league);
    assert.ok(two.meet > one.meet, '3クール目が効いていない');

    // ⚠ 残り2クールは締め切りで自動。合計4クールぶんで止まること
    await send('testmode', { on: true });
    await send('resolve');
    const done = (await store.read()).league;
    assert.notEqual(done.phase?.kind, 'camp', 'キャンプが終わっていない');
    const finished = sumOf(done);
    const completed = done.campResults.admin;
    assert.equal(completed.rounds, 4, '締切で回したクールの成果を数えていない');
    assert.equal(completed.last.round, 4, '締切実行の最終クール成果が残っていない');
    assert.equal(
      Math.round(recorded(completed.gains, 'batting.meet')),
      finished.meet - start.meet,
      '自動実行を含むキャンプ成果が実際の成長と合わない',
    );
    assert.deepEqual((await service.view('admin', admin)).lastCamp, completed, '完了後の成果がビューから消えた');
    // ⚠ **経験値の消費はキャンプ全体で1回**（240 → 72）。クールごとに消すと
    //    4クールで 240→72→21→6→1 まで落ちる。覚醒がキャンプの1クール目
    //    だけのものに戻っていないかを、ここ（通しの進行）で見る
    {
      const after = done.game.teams[teamName].players
        .map((p) => p.experience || 0)
        .filter((v) => v > 0);
      assert.ok(after.length >= 10, '経験値が全員0になっている（消費しすぎ）');
      const max = Math.max(...after);
      assert.ok(
        max >= 60 && max <= 80,
        `キャンプの経験値の消費が1回でない: 240→${max}（1回なら72）`,
      );
    }
    // ⚠ ここまで**自分で3クール**回した。締め切りで回るのは残り1クールだけ。
    //    数えていないと、さらに4クール回って合計7クールぶん伸びる。
    //    3クールぶんの伸びを基準に、4クールぶん（約1.33倍）の範囲に収まること。
    const perThree = two.meet - start.meet;
    const all4 = finished.meet - start.meet;
    assert.ok(
      all4 > perThree,
      `残りのクールが回っていない: 3クール${perThree} / 全部${all4}`,
    );
    assert.ok(
      all4 < perThree * 1.9,
      `自分で回したぶんが数えられていない（二重に成長した）: 3クール${perThree} / 全部${all4}`,
    );

    // ⚠ キャンプが終わったら打順が組み直されていること（空のまま開幕させない）
    const order = done.game.teams[teamName].lineupSettings?.battingOrder || [];
    assert.equal(order.length, 9, 'キャンプ後の打順が9人でない');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- 4クール終えたら、締め切りを待たずに次へ進むこと ---------------------
// ⚠ **印（`submissions[...].ready`）を直に立てても解決しない**。手続きを
//    解決するのは `submitPhase` の中（最後の1人が決定した瞬間）で、印だけ
//    立てると誰も解決しない。実測で、4クール終えてもキャンプが終わらず、
//    日付が1月1日のまま止まっていた。
{
  const dir = await mkdtemp(join(tmpdir(), 'pennant-camp4-'));
  try {
    const store = new FileStore(join(dir, 'state.gz'));
    const service = new LeagueService(store, {
      members: [{ userId: 'admin', label: '管理者' }],
      adminId: 'admin',
      clock: () => NOW,
    });
    const admin = (await service.login('admin')).sessionId;
    let seq = 0;
    const send = async (type, payload) => {
      const l = (await store.read()).league;
      seq += 1;
      return service.command('admin', admin, {
        requestId: `camp4-${type}-${seq}`,
        revision: l?.revision ?? 0,
        type,
        payload,
      });
    };
    await send('create');
    const created = (await store.read()).league;
    await send('submit', {
      phaseId: created.phase.id,
      plan: { packId: created.packs[0].id },
      ready: true,
      baseSubmission: null,
    });
    const atCamp = (await store.read()).league;
    const teamName = atCamp.members[0].teamName;
    const roster = atCamp.game.teams[teamName].players;
    for (let r = 1; r <= 4; r += 1)
      await send('campRound', {
        round: r,
        policy: { direction: 'balanced', phase: 'skill' },
        main: Object.fromEntries(
          roster.map((p) => [
            p.id,
            p.position === 'pitcher' ? 'control' : 'batting',
          ]),
        ),
        sub: Object.fromEntries(roster.map((p) => [p.id, 'physique'])),
      });
    const after = (await store.read()).league;
    assert.ok(!after.phase, '4クール終えてもキャンプが終わらない');
    assert.equal(after.status, 'running', '開幕待ちになっていない');
    assert.equal(after.campResults.admin.last.round, 4, '手動最終クールの成果が消えた');
    const finalView = await service.view('admin', admin);
    assert.deepEqual(finalView.lastCamp, after.campResults.admin);
    assert.ok(Object.keys(finalView.lastCamp.gains).length > 0, '完了後の通算成果が空');
    // ⚠ キャンプが終わると日付が開幕日（4/1）へ動く。動いていなければ
    //    手続きの解決そのものが走っていない
    assert.equal(after.season.currentDate.month, 4, '日付が開幕日へ動いていない');
    assert.equal(after.season.currentDate.day, 1, '日付が開幕日へ動いていない');
    // ⚠ 5クール目は受け付けない
    await assert.rejects(
      () =>
        send('campRound', {
          round: 5,
          policy: { direction: 'balanced', phase: 'skill' },
          main: {},
          sub: {},
        }),
      (e) => e.status === 409,
      'キャンプが終わったのに実行できた',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- 版を上げる前に4クール済ませていた人が居ても、締め切りで止まらないこと ----
// ⚠ 前の版のキャンプの記録は `rounds` と `plan` だけ（`last`・`gains` が無い）。
//    完了結果を作るときに `clone(state.last)`（＝ `JSON.parse(undefined)`）で投げ、
//    締め切りの解決が毎回失敗してリーグが止まっていた
{
  const dir = await mkdtemp(join(tmpdir(), 'pennant-camp-legacy-'));
  try {
    const store = new FileStore(join(dir, 'state.gz'));
    const service = new LeagueService(store, {
      members: [{ userId: 'admin', label: '管理者' }],
      adminId: 'admin',
      clock: () => NOW,
    });
    const admin = (await service.login('admin')).sessionId;
    let seq = 0;
    const send = async (type, payload) => {
      const l = (await store.read()).league;
      seq += 1;
      return service.command('admin', admin, {
        requestId: `camp-legacy-${type}-${seq}`,
        revision: l?.revision ?? 0,
        type,
        payload,
      });
    };
    await send('create');
    const created = (await store.read()).league;
    await send('submit', {
      phaseId: created.phase.id,
      plan: { packId: created.packs[0].id },
      ready: true,
      baseSubmission: null,
    });
    assert.equal((await store.read()).league.phase?.kind, 'camp', 'キャンプに入っていない');
    await store.transaction((b) => {
      b.league.phase.camp = {
        admin: { rounds: CAMP_ROUNDS, plan: { policy: { direction: 'balanced', phase: 'skill' } } },
      };
    });
    await send('testmode', { on: true });
    await send('resolve');
    const after = (await store.read()).league;
    assert.notEqual(after.phase?.kind, 'camp', '前の版の記録が残っているとキャンプが終わらない');
    assert.equal(after.campResults.admin.rounds, CAMP_ROUNDS);
    assert.equal(after.campResults.admin.last, null, '無い記録を作り出している');
    assert.equal((await service.view('admin', admin)).lastCamp.year, after.campResults.admin.year);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ⚠ **割り当ての無い選手は全体の方針で埋める**（携帯・未提出の球団のため）。
//    1人だけ割り当てて、残りが既定のまま伸びることを見る
{
  const league = leagueAtCamp();
  const roster = ownRoster(league);
  const one = roster.find((p) => p.position !== 'pitcher');
  const before = totals(roster);
  quiet(() =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: { menu: 'baserunning', assignments: { [one.id]: 'batting' } },
        ready: true,
      },
      NOW,
    ),
  );
  const after = totals(ownRoster(league));
  assert.ok(
    after.speed - before.speed > 0,
    '割り当ての無い選手が全体の方針で練習していない',
  );
}

// ⚠ 世界を汚したまま終わらない（ほかの検査と同じプロセスで動くことがある）
loadLeagueWorld(leagueAtCamp());
captureWorld();

console.log(
  '■ キャンプ: OK（選手ごとに効く / 1クールずつ実行して数える / 同じクールを2回走らせない / 残りは締め切りで自動 / 前の版の記録でも締め切りで止まらない / 画面のメニューをサーバーが受け取れる / 選んだ対象が練習まで届く / 1クールの伸びが「必ず+1」にならず、才能（足・肩）と伸び切った能力は鈍る / 覚醒には減衰を掛けず、クールごとに均して4クールで20%前後）',
);
