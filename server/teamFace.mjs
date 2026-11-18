// ============================================================
// 球団の顔（C2）: 背番号・主将・永久欠番・生え抜き。
//
// ⚠ 先方回答（2026-11-16）「余裕があれば」C2。**効き目は無い**（紙面と球団史に残るだけ）。
// ⚠ オンラインの選手には背番号が無かった（一人用は `ensureTeamJerseyNumbers` で付ける）。
//    リーグの12球団だけ、世界を保存する前に付ける（足りない人・重なった人・欠番を付けた人だけ。冪等）。
// ⚠ 保存に足すのは世界の球団の `captainId`（主将の記録の鍵）・`retiredNumbers`（永久欠番）と、
//    選手の `number`、年度の記録の `captains`（その年の主将）、引退の記録の `number`。どれも**無ければ無いだけ**
//    （版は上げない。年間表彰と同じく項目を足すだけ）。
// ============================================================
import { ensureTeamJerseyNumbers } from '../src/utils/jerseyNumbers.js';
import { requireOnline } from '../src/online/shared.js';
import { keyFor } from './recordedStats.mjs';

/** 永久欠番にできる数（球団ごと） */
export const RETIRED_NUMBERS_MAX = 10;

const reservedOf = (team) => new Set((team?.retiredNumbers || []).map((r) => r.number));

/** リーグの球団に背番号を付ける（`teams` は `TEAMS_DATA`。直に書き換える。保存の直前に呼ぶ） */
export function numberLeagueTeams(teamNames, teams) {
  for (const name of teamNames || []) {
    const team = teams[name];
    if (team?.players) ensureTeamJerseyNumbers(team, reservedOf(team));
  }
}

/** 主将（いま名簿にいる人だけ。出ていったら居ない扱い） */
export function captainOf(team) {
  if (!team?.captainId) return null;
  return (team.players || []).find((p) => p.onlinePlayerId === team.captainId) || null;
}

/**
 * 主将・永久欠番を変える（世界を読んだあとに呼ぶ。`TEAMS_DATA` を書き換える）。
 * payload: `{ captain: 選手id | null }` / `{ retire: { name, year } }`（引退した人の番号を欠番に）/
 *          `{ unretire: 番号 }`
 */
export function updateTeamFace(league, team, teamName, payload = {}) {
  if (Object.hasOwn(payload, 'captain')) {
    if (payload.captain == null) {
      delete team.captainId;
      return { captain: null };
    }
    const player = team.players.find((p) => p.id === Number(payload.captain));
    requireOnline(player, 'その選手は名簿にいません', 409);
    // 記録の鍵（初めての試合で付く。まだ無ければ記録と同じ作り方で付ける）
    player.onlinePlayerId ||= keyFor(teamName, player);
    team.captainId = player.onlinePlayerId;
    return { captain: player.name };
  }
  if (payload.retire) {
    const { name, year } = payload.retire;
    const r = (league.chronicle?.retired || []).find((x) => x.team === teamName && x.name === name && x.year === Number(year));
    requireOnline(r, 'その引退選手が見つかりません', 409);
    requireOnline(Number.isInteger(r.number), 'この選手の背番号の記録がありません（背番号を付ける前の引退）', 409);
    const list = (team.retiredNumbers ||= []);
    requireOnline(!list.some((x) => x.number === r.number), `背番号${r.number}はもう永久欠番です`, 409);
    requireOnline(list.length < RETIRED_NUMBERS_MAX, `永久欠番は${RETIRED_NUMBERS_MAX}までです`, 409);
    // ⚠ 本人がまだ名簿にいる（引退の記録の前）なら断る。**別の人が付けていても欠番にできる**:
    //    引退した人の番号は良い番号から振るのですぐ次の人に付き、断ると欠番にできなかった。
    //    付けている人は、欠番を避けて番号を振り直す（`ensureTeamJerseyNumbers`）
    const wearing = team.players.find((p) => p.number === r.number);
    requireOnline(!wearing || wearing.name !== r.name, `背番号${r.number}はいま${wearing?.name}が付けています`, 409);
    list.push({ number: r.number, name: r.name, year: r.year, position: r.position || null });
    list.sort((a, b) => a.number - b.number);
    if (wearing) {
      ensureTeamJerseyNumbers(team, reservedOf(team));
      return { retired: r.number, renumbered: { name: wearing.name, number: wearing.number } };
    }
    return { retired: r.number };
  }
  if (payload.unretire != null) {
    const n = Number(payload.unretire);
    const before = team.retiredNumbers?.length || 0;
    team.retiredNumbers = (team.retiredNumbers || []).filter((x) => x.number !== n);
    requireOnline(team.retiredNumbers.length < before, `背番号${n}は永久欠番ではありません`, 409);
    return { unretired: n };
  }
  requireOnline(false, '変える内容がありません');
}

/** 年度の記録に、その年の主将を残す（年度更新の前。名簿にいる人だけ） */
export function captainsOfYear(teamNames, teams) {
  const out = {};
  for (const name of teamNames || []) {
    const c = captainOf(teams[name]);
    if (c) out[name] = { name: c.name, number: c.number ?? null };
  }
  return out;
}

/**
 * 在籍の長い順（いま名簿にいる人）。`years`: この球団で記録のある年数、`homegrown`: ほかの球団の記録が無い。
 * 記録（`league.records`）から数える（この球団に来る前のリーグの外の経歴は数えない）
 */
export function tenureOf(league, teamName, players) {
  const keys = new Map(players.filter((p) => p.onlinePlayerId).map((p) => [p.onlinePlayerId, p]));
  const stat = new Map();
  for (const season of Object.values(league.records?.seasons || {}))
    for (const [key, rec] of Object.entries(season.players || {})) {
      if (!keys.has(key)) continue;
      const s = stat.get(key) || { years: 0, other: false };
      if (rec.teams?.includes(teamName)) s.years += 1;
      if ((rec.teams || []).some((t) => t !== teamName)) s.other = true;
      stat.set(key, s);
    }
  return [...stat.entries()]
    .filter(([, s]) => s.years > 0)
    .map(([key, s]) => ({ id: keys.get(key).id, name: keys.get(key).name, number: keys.get(key).number ?? null, years: s.years, homegrown: !s.other }))
    .sort((a, b) => b.years - a.years || Number(b.homegrown) - Number(a.homegrown) || a.name.localeCompare(b.name, 'ja'));
}

/** 球団史に出す「球団の顔」 */
export function teamFaceView(league, teamName, team) {
  const captain = captainOf(team);
  return {
    captain: captain ? { id: captain.id, name: captain.name, number: captain.number ?? null } : null,
    captains: (league.history || [])
      .filter((h) => h.captains?.[teamName])
      .map((h) => ({ year: h.year, name: h.captains[teamName].name, number: h.captains[teamName].number ?? null }))
      .reverse(),
    retiredNumbers: team?.retiredNumbers || [],
    // 欠番にできる人（この球団で引退し、背番号の記録がある人。まだ欠番でない番号）
    candidates: (league.chronicle?.retired || [])
      .filter((r) => r.team === teamName && Number.isInteger(r.number) && !(team?.retiredNumbers || []).some((x) => x.number === r.number))
      .map((r) => ({ name: r.name, year: r.year, number: r.number, line: r.line || null })),
    tenure: tenureOf(league, teamName, team?.players || []).slice(0, 8),
  };
}
