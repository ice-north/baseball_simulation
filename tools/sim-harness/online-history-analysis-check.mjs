// 先方5項目（2026-11-20）の中身の検査（軽い。画面は online-lineup-board-ui-check などで見る）。
//   - 順位表のゲーム差: すぐ上の球団との差・1位は無し・小数1桁
//   - 指導者の詳細能力: 0〜100・何度作っても同じ・乱数を引かない（強さには効かない飾り）
//   - 指導者のこれまでの球団と役職・主な指導選手
//   - チーム能力値: 起用に就いた選手から作る・起用を変えると変わる
//   - 球団の歩み: 縦軸の位置（1部1位＝1、2部1位＝7）
//   node tools/sim-harness/online-history-analysis-check.mjs
import assert from 'node:assert/strict';
import { gamesBehind, gapText } from '../../src/online/standingsGap.js';
import { coachAbilities, COACH_ABILITY_ITEMS } from '../../src/online/coaches.js';
import { coachStints, coachPupils } from '../../server/coachView.mjs';
import { teamRatings, RATING_AXES } from '../../src/online/teamRatings.js';
import { slotOf } from '../../src/online/teamHistory.js';

// ---------- ゲーム差 ----------
{
  const rows = [
    { wins: 10, losses: 5 },
    { wins: 9, losses: 6 },
    { wins: 9, losses: 6 },
    { wins: 6, losses: 8 },
  ];
  assert.deepEqual(gamesBehind(rows), [null, 1, 0, 2.5], 'ゲーム差はすぐ上の球団との差');
  assert.deepEqual(gamesBehind(rows).map(gapText), ['—', '1.0', '0.0', '2.5']);
  assert.equal(gapText(-0), '0.0', '-0.0 と出さない');
}

// ---------- 指導者の詳細能力 ----------
{
  const coach = {
    id: 'c7',
    name: '山田 一郎',
    specialty: 'pitching',
    origin: { kind: 'player', position: 'pitcher', legend: true },
    vision: { attack: 'speed', defense: 'fielding', flagship: 'defense', horizon: 'develop' },
    personality: { temper: -1, stubborn: 1, trust: 2 },
    career: [],
  };
  const before = Math.random;
  let draws = 0;
  Math.random = () => {
    draws++;
    return before();
  };
  const a = coachAbilities(coach);
  const b = coachAbilities(structuredClone(coach));
  Math.random = before;
  assert.equal(draws, 0, '詳細能力で乱数を引いている');
  assert.deepEqual(a, b, '同じ人で詳細能力が変わる');
  assert.deepEqual(Object.keys(a), COACH_ABILITY_ITEMS.map((x) => x.key));
  for (const v of Object.values(a)) assert.ok(Number.isInteger(v) && v >= 1 && v <= 99, `詳細能力の値が範囲外: ${v}`);
  assert.ok(a.pitchingCoach > a.battingCoach, '投手コーチ向きの元投手なのに投手指導が低い');
  // 経験で上がる（下がらない）
  const veteran = coachAbilities({ ...coach, career: Array.from({ length: 6 }, (_, i) => ({ year: i + 1, role: 'pitching' })) });
  assert.ok(veteran.pitchingCoach >= a.pitchingCoach, '経験で投手指導が下がった');
}

// ---------- これまでの球団と役職・主な指導選手 ----------
{
  const label = (n) => `${n}球団`;
  const coach = {
    id: 'c1',
    career: [
      { year: 1, team: 'A', role: 'pitching' },
      { year: 2, team: 'A', role: 'pitching' },
      { year: 3, team: 'B', role: 'manager' },
    ],
    job: { team: 'B', role: 'manager', since: 3 },
  };
  const stints = coachStints(coach, label);
  assert.deepEqual(
    stints.map((s) => s.text),
    ['1年目〜2年目 A球団 投手コーチ', '3年目〜 B球団 監督（現職）'],
  );
  // ⚠ 同じ球団・同じ役職でも、年が続いていなければまとめない（離れて戻った人。監査 2026-11-20）
  const pitchingA = [
    { year: 1, team: 'A', role: 'pitching' },
    { year: 2, team: 'A', role: 'pitching' },
  ];
  assert.deepEqual(
    coachStints({ id: 'c2', career: pitchingA, job: { team: 'A', role: 'pitching', since: 4 } }, label).map((s) => s.text),
    ['1年目〜2年目 A球団 投手コーチ', '4年目〜 A球団 投手コーチ（現職）'],
    '離れて戻った人が通しで在任していたように出る',
  );
  // 続けて在任している間は `since` が就いた年のまま。まとめて「1年目〜（現職）」
  assert.deepEqual(
    coachStints({ id: 'c3', career: pitchingA, job: { team: 'A', role: 'pitching', since: 1 } }, label).map((s) => s.text),
    ['1年目〜 A球団 投手コーチ（現職）'],
  );
  // 年の切り替わりで就いたばかり（今季の行はまだ無い）でも続きならまとめる
  assert.deepEqual(
    coachStints({ id: 'c4', career: pitchingA, job: { team: 'A', role: 'pitching', since: 3 } }, label).map((s) => s.text),
    ['1年目〜 A球団 投手コーチ（現職）'],
  );
  const rec = (key, team, pa, bf) => ({
    key,
    name: key,
    teams: [team],
    stats: { batting: { plateAppearances: pa, atBats: pa, hits: Math.round(pa * 0.3), homeruns: 1 }, pitching: { battersFaced: bf, wins: 2, inningsPitched: bf, earnedRuns: 3 } },
  });
  const league = {
    season: { year: 4 },
    records: {
      seasons: {
        1: { players: { p1: rec('投手甲', 'A', 0, 300), h1: rec('打者乙', 'A', 400, 0) } },
        3: { players: { h2: rec('打者丙', 'B', 300, 0), p2: rec('投手丁', 'B', 0, 200), x: rec('他球団', 'C', 500, 0) } },
        4: { players: { h2: rec('打者丙', 'B', 50, 0) } },
      },
    },
  };
  const pupils = coachPupils(league, coach);
  const names = pupils.map((p) => p.name);
  assert.ok(!names.includes('他球団'), '指導していない球団の選手が入った');
  assert.ok(!names.includes('打者乙'), '投手コーチの年の打者を数えた');
  assert.ok(names.includes('投手甲') && names.includes('打者丙'));
  assert.equal(pupils.find((p) => p.name === '打者丙').years, 2, '今の席の今季も数える');
}

// ---------- チーム能力値 ----------
{
  const hitter = (id, position, meet) => ({
    id,
    position,
    batting: { meet, power: 50, eye: 50 },
    fielding: { defense: 60 },
    physical: { speed: 55, arm: 50 },
  });
  const pitcher = (id, velocity) => ({
    id,
    position: 'pitcher',
    pitching: { velocity, control: 60, stamina: 120, arsenal: [{ type: 'slider', level: 60 }] },
  });
  const fielders = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const players = [
    ...fielders.map((pos, i) => hitter(i + 1, pos, 50)),
    hitter(20, 'left', 90),
    pitcher(30, 150),
    pitcher(31, 140),
    pitcher(32, 135),
  ];
  const lineup = {
    battingOrder: fielders.map((pos, i) => ({ battingOrder: i + 1, playerId: i + 1, position: pos })),
    starters: [30],
    pitcherRoles: { 31: 'closer', 32: 'setup' },
  };
  const r = teamRatings(players, lineup);
  assert.deepEqual(Object.keys(r), RATING_AXES.map((a) => a.key));
  for (const v of Object.values(r)) assert.ok(v >= 0 && v <= 100);
  // 打てる人を控えから左翼へ: 攻撃力が上がり、控え戦力は下がる
  const swapped = teamRatings(players, {
    ...lineup,
    battingOrder: lineup.battingOrder.map((e) => (e.position === 'left' ? { ...e, playerId: 20 } : e)),
  });
  assert.ok(swapped.offense > r.offense, '起用を変えても攻撃力が変わらない');
  assert.ok(swapped.bench < r.bench, '起用を変えても控え戦力が変わらない');
  assert.equal(teamRatings(players, null), null, '起用が無いのに値を出した');
}

// ---------- 球団の歩みの位置 ----------
{
  assert.equal(slotOf({ league: '1部', rank: 1 }), 1);
  assert.equal(slotOf({ league: '1部', rank: 6 }), 6);
  assert.equal(slotOf({ league: '2部', rank: 1 }), 7);
  assert.equal(slotOf({ league: null, rank: 3 }), null);
}

console.log('■ リーグ史・チーム分析・指導者: OK（ゲーム差 / 指導者の詳細能力は決まった値で乱数なし / 指導した球団と主な指導選手 / チーム能力値は起用から / 球団の歩みの位置）');
