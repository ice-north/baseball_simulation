// ============================================================
// 多人数ペナントの参加者（1〜42人・招待制・途中参加）
//
// 設計は docs/online/PYRAMID_LEAGUE.md。
//
// 【なぜ必要か】現行は参加者を環境変数（ONLINE_MEMBER_1 / 2）で固定しており、
// 1人増やすたびに設定の編集と再デプロイが要る。`createLeague` にも
// `members.length === 2` の強制がある。これでは1人でも42人でも遊べない。
// **参加者はリーグのデータ側で持つ**形に変える。
//
// ⚠ **ここは純粋な計算だけを持つこと**。保存・通信・乱数の生成に触らない。
//    `Math.random()` を呼ばない（シードから決まる必要がある）。
//    配線（API・サーバー）は別のファイルで行う。
// ============================================================
import { requireOnline } from './shared.js';
import { PYRAMID_LEAGUES, PYRAMID_TEAM_COUNT } from './pyramidLeague.js';

/** 参加できる上限。球団数と同じ（全球団が人間でも成立する） */
export const MAX_MEMBERS = PYRAMID_TEAM_COUNT; // 42

/**
 * 途中参加が入れる階層。⚠ **最下層（C）だけ**。
 * 上の階層から始められると、昇降格で積み上げた順位の意味が消える。
 */
export const JOIN_TIER = 2;

const joinableLeagueIds = () =>
  PYRAMID_LEAGUES.filter((l) => l.tier === JOIN_TIER).map((l) => l.id);

/** 招待コードの文字種。⚠ 0/O/1/I/l を除く（読み上げ・書き写しの事故を防ぐ） */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const INVITE_CODE_LENGTH = 8;

/**
 * 招待コードを作る。`rand` は 0〜1 を返す関数（シード乱数を渡すこと）。
 * ⚠ **生成はここでしない**。呼ぶ側が乱数を渡す（サーバーとテストで同じ経路にする）。
 */
export function newInviteCode(rand) {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return code;
}

/** 人間が持っていない球団（＝CPU） */
export function cpuTeams(league) {
  const held = new Set((league.members || []).map((m) => m.teamName));
  return (league.teams || []).filter((t) => !held.has(t.name));
}

/**
 * 途中参加者が入る枠を決める。**C リーグのCPUの中で一番弱い球団**。
 *
 * 弱さの順は 勝利数 → 勝率 → 球団の格付け → 名前 の順で比べる。
 * ⚠ **最後に名前まで見ること**。開幕前は全球団が 0勝0敗・同じ格付けになり得るので、
 *    そこで止めると「どれが最下位か」が実行のたびに変わる。
 */
export function weakestJoinableTeam(league, standings = {}) {
  const ids = joinableLeagueIds();
  const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  const candidates = cpuTeams(league).filter((t) => ids.includes(t.league));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const sa = standings[a.name] || {};
    const sb = standings[b.name] || {};
    return (
      (sa.wins || 0) - (sb.wins || 0) ||
      (sa.winRate || 0) - (sb.winRate || 0) ||
      (RANK_ORDER[b.rank] ?? 9) - (RANK_ORDER[a.rank] ?? 9) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    );
  })[0];
}

/** 未使用の招待コードを探す。大文字小文字と空白は無視する */
export function findInvite(league, code) {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return null;
  return (league.invites || []).find((i) => i.code === key) || null;
}

/**
 * 参加できるかを検査する。できないときは理由付きで止める。
 * ⚠ **理由を分けて返すこと**。「参加できません」だけだと、コードが違うのか
 *    満員なのか既に参加済みなのかが分からず、受け取った人が詰む。
 */
export function assertCanJoin(league, userId, code) {
  requireOnline(league, 'リーグがまだありません', 409);
  requireOnline(
    !(league.members || []).some((m) => m.userId === userId),
    'すでに参加しています',
    409,
  );
  requireOnline(
    (league.members || []).length < MAX_MEMBERS,
    `参加できるのは${MAX_MEMBERS}人までです`,
    409,
  );
  const invite = findInvite(league, code);
  requireOnline(invite, '招待コードが違います', 403);
  requireOnline(!invite.usedBy, 'この招待コードは使用済みです', 409);
  const team = weakestJoinableTeam(league);
  requireOnline(team, '空いている球団がありません', 409);
  return { invite, team };
}

/**
 * 参加を反映する。`league` を書き換えて返す。
 *
 * 弾かれたCPU球団の扱いは **A方式（引き継ぎ）**。
 * 新しい参加者がその枠と選手をそのまま受け取り、球団名だけ自分のものにする。
 * ⚠ B方式（球団ごと消して新規に作る）へ変えるなら**ここだけ**を差し替える。
 *    選手の行き先（プール・分配・消滅）を決める必要がある。
 */
// ⚠ **この関数は `league` と、その中の球団オブジェクトを書き換える**（engine 側の流儀に合わせている）。
//    呼ぶ側が「参加前の球団名」を参照で持っていると、書き換えで一緒に変わる。
//    比べたいなら**文字列で控えてから**呼ぶこと（検査で実際に踏んだ）。
export function applyJoin(league, { userId, label, teamName, code, now }) {
  const { invite, team } = assertCanJoin(league, userId, code);
  const name = String(teamName || '').trim() || team.name;
  requireOnline(
    !(league.teams || []).some((t) => t.name === name && t.name !== team.name),
    'その球団名は使われています',
    409,
  );
  const previousName = team.name;
  team.name = name;
  team.takenOverFrom = team.takenOverFrom || previousName;
  league.members = [
    ...(league.members || []),
    { userId, label: label || name, teamName: name, joinedAt: now },
  ];
  invite.usedBy = userId;
  invite.usedAt = now;
  return { league, teamName: name, previousName, leagueId: team.league };
}

/**
 * 参加者の人数が成立しているか。1人でも成立する。
 * ⚠ **0人を許さないこと**。誰も居ないリーグは進める意味が無く、
 *    管理者が不在なので停止も再開もできなくなる。
 */
export function assertMemberCount(members) {
  requireOnline(Array.isArray(members), '参加者の設定が必要です');
  requireOnline(members.length >= 1, '参加者が1人も居ません');
  requireOnline(
    members.length <= MAX_MEMBERS,
    `参加できるのは${MAX_MEMBERS}人までです`,
  );
  requireOnline(
    members.every((m) => typeof m.userId === 'string' && m.userId),
    '参加者の識別子が不正です',
  );
  requireOnline(
    new Set(members.map((m) => m.userId)).size === members.length,
    '同じ参加者が重複しています',
  );
}
