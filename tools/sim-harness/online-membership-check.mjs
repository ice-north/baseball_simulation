// 参加者モデル（1〜42人・招待制・途中参加）の検査。
//
// ⚠ 主目的は3つ。
//    1. 人数の境界（0人を拒む / 1人で成立する / 42人を超えない）
//    2. 途中参加が**必ずCリーグのCPU最下位**に入ること
//    3. 招待コードが**使い捨て**であること
// ⚠ 「最下位が実行のたびに変わらない」ことも見る。開幕前は全球団が同成績なので、
//    比べ方が足りないと参加するたびに違う球団が弾かれる。
import assert from 'node:assert/strict';
import {
  MAX_MEMBERS,
  JOIN_TIER,
  newInviteCode,
  INVITE_CODE_LENGTH,
  cpuTeams,
  weakestJoinableTeam,
  findInvite,
  assertCanJoin,
  applyJoin,
  assertMemberCount,
} from '../../src/online/membership.js';
import {
  generatePyramidTeams,
  PYRAMID_LEAGUES,
  PYRAMID_TEAM_COUNT,
  TEAMS_PER_LEAGUE,
} from '../../src/online/pyramidLeague.js';
import { createSeededRandom } from '../../src/game/rng.js';

const fresh = () => ({
  teams: generatePyramidTeams(20261029).map((t) => ({ ...t })),
  members: [],
  invites: [],
});
const invite = (league, code) => {
  league.invites.push({ code, createdAt: '2026-10-29T00:00:00.000Z', usedBy: null });
  return code;
};

// --- 人数の境界 ---------------------------------------------------
assert.equal(MAX_MEMBERS, PYRAMID_TEAM_COUNT);
assert.throws(() => assertMemberCount([]), /1人も居ません/);
assert.doesNotThrow(() => assertMemberCount([{ userId: 'a' }]));
assert.doesNotThrow(() =>
  assertMemberCount(Array.from({ length: MAX_MEMBERS }, (_, i) => ({ userId: `u${i}` }))),
);
assert.throws(
  () => assertMemberCount(Array.from({ length: MAX_MEMBERS + 1 }, (_, i) => ({ userId: `u${i}` }))),
  new RegExp(`${MAX_MEMBERS}人まで`),
);
assert.throws(() => assertMemberCount([{ userId: 'a' }, { userId: 'a' }]), /重複/);
assert.throws(() => assertMemberCount([{ userId: '' }]), /識別子/);

// --- 招待コード ---------------------------------------------------
const rand = createSeededRandom(1234);
const code = newInviteCode(rand);
assert.equal(code.length, INVITE_CODE_LENGTH);
// ⚠ 読み間違えやすい文字を含まないこと
assert.ok(!/[01OIL]/.test(code), `紛らわしい文字が入っている: ${code}`);
// シードが同じなら同じコード（サーバーと検査で同じ経路を通す）
assert.equal(newInviteCode(createSeededRandom(1234)), code);

// 大文字小文字・前後の空白を無視して引ける
{
  const l = fresh();
  invite(l, 'ABCD2345');
  assert.ok(findInvite(l, ' abcd2345 '));
  assert.equal(findInvite(l, 'ZZZZZZZZ'), null);
  assert.equal(findInvite(l, ''), null);
}

// --- 途中参加の入り先 ---------------------------------------------
{
  const l = fresh();
  assert.equal(cpuTeams(l).length, PYRAMID_TEAM_COUNT, '誰も参加していなければ全球団がCPU');

  const target = weakestJoinableTeam(l);
  const leagueOf = Object.fromEntries(PYRAMID_LEAGUES.map((x) => [x.id, x.tier]));
  // ⚠ **最下層であることを構造から確かめる**。`JOIN_TIER` で `JOIN_TIER` を
  //    検証すると定数を書き換えたときに素通りするので、
  //    「階層の最大値＝一番下」であることを別途求めて突き合わせる。
  const bottomTier = Math.max(...PYRAMID_LEAGUES.map((x) => x.tier));
  assert.equal(
    leagueOf[target.league],
    bottomTier,
    `途中参加は最下層に入る: ${target.league}`,
  );
  assert.equal(JOIN_TIER, bottomTier, 'JOIN_TIER が最下層を指している');

  // ⚠ 何度呼んでも同じ球団であること（開幕前は全球団が同成績）
  assert.equal(weakestJoinableTeam(l).name, target.name);
  assert.equal(weakestJoinableTeam({ ...l }).name, target.name);

  // 成績があるときは勝利数の少ない球団を選ぶ。
  // ⚠ **全候補に成績を与えること**。一部にしか与えないと、成績の無い球団が
  //    0勝扱いで最下位になり、何を試しているのか分からなくなる（実際そうなった）。
  const cTeams = cpuTeams(l).filter((t) => leagueOf[t.league] === JOIN_TIER);
  const other = cTeams.find((t) => t.name !== target.name);
  const standings = Object.fromEntries(
    cTeams.map((t) => [t.name, { wins: t.name === other.name ? 1 : 10, winRate: 0.5 }]),
  );
  assert.equal(weakestJoinableTeam(l, standings).name, other.name, '勝利数の少ない球団が選ばれる');
  // 勝利数が並んだら勝率で分ける
  const tie = Object.fromEntries(
    cTeams.map((t) => [t.name, { wins: 5, winRate: t.name === other.name ? 0.1 : 0.9 }]),
  );
  assert.equal(weakestJoinableTeam(l, tie).name, other.name, '勝率の低い球団が選ばれる');
}

// --- 参加の反映 ---------------------------------------------------
{
  const l = fresh();
  invite(l, 'JOIN0001');
  // ⚠ **名前は文字列で控えること**。`applyJoin` は球団オブジェクトを
  //    その場で書き換えるので、参照で持つと比較対象まで新しい名前に変わる。
  const beforeName = weakestJoinableTeam(l).name;
  const result = applyJoin(l, {
    userId: 'u1',
    teamName: '新潟ドリーマーズ',
    code: 'join0001',
    now: '2026-10-29T01:00:00.000Z',
  });

  // ⚠ **内部名は変わらない**。変えると記録の選手キーまで迷子になる
  assert.equal(result.teamName, beforeName, '内部名は引き継いだ球団のまま');
  assert.equal(result.displayName, '新潟ドリーマーズ');
  assert.equal(l.members.length, 1);
  assert.equal(l.members[0].teamName, beforeName, '照合は内部名で行う');
  assert.equal(l.members[0].displayName, '新潟ドリーマーズ');
  // ⚠ 球団数は42のまま（A方式＝引き継ぎ。球団は消えない）
  assert.equal(l.teams.length, PYRAMID_TEAM_COUNT, '参加で球団数が変わってはいけない');
  assert.equal(cpuTeams(l).length, PYRAMID_TEAM_COUNT - 1);
  assert.equal(
    l.teams.find((t) => t.name === beforeName).displayName,
    '新潟ドリーマーズ',
    '表示名だけを付け替える',
  );
  // 招待コードが使い捨てになっている
  assert.equal(l.invites[0].usedBy, 'u1');
  assert.throws(() => assertCanJoin(l, 'u2', 'JOIN0001'), /使用済み/);
}

// --- 断る理由が分かれていること -----------------------------------
{
  const l = fresh();
  invite(l, 'GOOD0001');
  assert.throws(() => assertCanJoin(l, 'u1', 'BAD00001'), /招待コードが違います/);
  applyJoin(l, { userId: 'u1', teamName: '', code: 'GOOD0001', now: 'x' });
  invite(l, 'GOOD0002');
  assert.throws(() => assertCanJoin(l, 'u1', 'GOOD0002'), /すでに参加しています/);
  assert.throws(() => assertCanJoin(null, 'u2', 'GOOD0002'), /リーグがまだありません/);
}

// 球団名を空で参加すると、引き継いだ球団の名前をそのまま使う
{
  const l = fresh();
  invite(l, 'EMPTY001');
  const emptyBefore = weakestJoinableTeam(l).name;
  const r = applyJoin(l, { userId: 'u9', teamName: '   ', code: 'EMPTY001', now: 'x' });
  assert.equal(r.displayName, emptyBefore, '空なら元の球団名をそのまま使う');
}

// 既に使われている球団名は拒む
{
  const l = fresh();
  invite(l, 'DUP00001');
  const taken = l.teams.find((t) => t.league !== weakestJoinableTeam(l).league).name;
  assert.throws(
    () => applyJoin(l, { userId: 'u1', teamName: taken, code: 'DUP00001', now: 'x' }),
    /使われています/,
  );
  // 長すぎる名前は拒む
  assert.throws(
    () => applyJoin(l, { userId: 'u2', teamName: 'あ'.repeat(25), code: 'DUP00001', now: 'x' }),
    /長すぎます/,
  );
}

// --- 42人まで入れる（Cの24枠を超えたら空きが無くなる） ------------
{
  const l = fresh();
  let joined = 0;
  for (let i = 0; i < PYRAMID_TEAM_COUNT + 6; i++) {
    invite(l, `BULK${String(i).padStart(4, '0')}`);
    try {
      applyJoin(l, { userId: `b${i}`, teamName: `球団${i}`, code: `BULK${String(i).padStart(4, '0')}`, now: 'x' });
      joined++;
    } catch (error) {
      assert.match(error.message, /空いている球団がありません/);
      break;
    }
  }
  // 最下層の枠が埋まったら途中参加は止まる
  const bottom = Math.max(...PYRAMID_LEAGUES.map((x) => x.tier));
  const slots = PYRAMID_LEAGUES.filter((x) => x.tier === bottom).length * TEAMS_PER_LEAGUE;
  assert.equal(joined, slots, `最下層の枠だけ埋まるはず: ${joined} / ${slots}`);
  assert.equal(l.teams.length, PYRAMID_TEAM_COUNT, '球団数は変わらない');
}

console.log(
  `■ 参加者モデル: OK（1〜${MAX_MEMBERS}人 / 招待は使い捨て / 途中参加は最下層のCPU最下位）`,
);
