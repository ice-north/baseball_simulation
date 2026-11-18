// ============================================================
// 1人用の年代記（E1）。オンラインで作った年間表彰（MVP・新人王・ベストナイン・最優秀バッテリー）と
// 節目の記録（通算100安打・シーズン30本塁打など）を、1人用のシーズン終了にも出す。
//
// ⚠ **成績から決めるだけで乱数を引かない**。能力にもご褒美にも効かない（飾りと記録）。
// ⚠ 選び方はオンラインと同じ（`src/online/seasonAwards.js` の `selectHonors`、
//    `src/online/milestones.js` の決まり）。違うのは次の2つだけ:
//    - 部は1つ（自分のリーグ＝タイトルと同じ `settings.teamNames`）
//    - 新人王は「22歳以下で、それまでの年の記録（`statsHistory`）が無い選手」。1人用には
//      オンラインのリーグの記録（`league.records`）が無いので、選手に付いた年ごとの記録で見る
//    - 最優秀バッテリーは捕手と投手の組の記録が1人用に無いので出さない
// ⚠ 通算は選手の `careerStats`（高校・大学・社会人をまたいだ通算）に今季を足したもの。
//    年度更新の前（`processSeasonEnd`）に呼ぶので、今季はまだ `careerStats` に入っていない。
//    同じ年に一度締めた選手（`seasonFinalizedYear`）だけは入っているので足さない。
// ⚠ 保存は `frozenAwards.honors` / `frozenAwards.milestones`（無ければ無いだけ）と、
//    年度の記録（`teamHistory[].awards`）の写し。版は上げない（足すだけ）。
// ============================================================
import { selectHonors, ROOKIE_MAX_AGE } from '../online/seasonAwards.js';
import { processSeasonEnd } from './yearProgressionSystem.js';
import { CAREER_MILESTONES, SEASON_MILESTONES, crossedCareer, crossedSeason } from '../online/milestones.js';

/** 1人用の部の名前（`honors` の鍵）。部は1つだけ */
export const SOLO_HONOR_KEY = 'solo';
/** 1年に残す節目の数の上限（年度の記録に写すので軽く） */
const KEEP_MILESTONES = 24;

/**
 * 1人用で残す通算の節目の下限。1人用は1部の球団が多く、通算100安打の人が毎年何十人も出て
 * 紙面が埋まるので、オンラインより高いところから残す（オンラインは球団ごとに20件まで）。
 */
const SOLO_CAREER_MIN = { hits: 500, homeruns: 50, rbis: 300, stolenBases: 100, wins: 50, saves: 50, holds: 50, strikeouts: 500 };

const num = (v) => (Number.isFinite(v) ? v : 0);

const leagueTeamNames = (seasonData, allTeams) =>
  (seasonData.settings?.teamNames?.length ? seasonData.settings.teamNames : Object.keys(allTeams)).filter(
    (name) => allTeams[name],
  );

/** 1人用の新人王の候補か（22歳以下で、それまでの年の記録が無い） */
export function isSoloRookie(player) {
  if ((player.age ?? 99) > ROOKIE_MAX_AGE) return false;
  return !(player.statsHistory || []).length;
}

/**
 * 1人用の年間表彰。`{ solo: { mvp, rookie, bestNine, battery: null } }` か、選べなければ null。
 */
export function soloHonors(seasonData, allTeams) {
  const names = leagueTeamNames(seasonData, allTeams);
  if (!names.length) return null;
  const league = {
    season: {
      year: seasonData.year,
      settings: {
        teamNames: names,
        gamesPerSeason: seasonData.settings?.gamesPerSeason || seasonData.schedule?.length || 0,
      },
      standings: seasonData.standings || [],
    },
    teams: names.map((name) => ({ name, league: SOLO_HONOR_KEY })),
    records: {},
  };
  const honors = selectHonors(league, allTeams, { rookie: isSoloRookie });
  const h = honors[SOLO_HONOR_KEY];
  if (!h || (!h.mvp && !h.rookie && !h.bestNine.length)) return null;
  return { [SOLO_HONOR_KEY]: { ...h, battery: null } };
}

/**
 * 今季の節目の記録（通算・シーズン）。新しい順ではなく、通算の大きい順→シーズンの順。
 * @returns {{ kind, label, value, name, team, playerId }[]}
 */
export function soloMilestones(seasonData, allTeams) {
  const found = [];
  for (const team of leagueTeamNames(seasonData, allTeams)) {
    for (const p of allTeams[team].players || []) {
      const season = p.seasonStats || {};
      const included = p.seasonFinalizedYear != null && p.seasonFinalizedYear === seasonData.year;
      for (const rule of CAREER_MILESTONES) {
        const now = num(season[rule.side]?.[rule.stat]);
        if (!now) continue;
        const career = num(p.careerStats?.[rule.side]?.[rule.stat]);
        const after = included ? career : career + now;
        const value = crossedCareer(rule, after - now, after);
        if (value && value >= (SOLO_CAREER_MIN[rule.stat] ?? 0))
          found.push({ kind: 'career', label: `通算${value}${rule.label}`, value, name: p.name, team, playerId: p.id });
      }
      for (const rule of SEASON_MILESTONES) {
        const now = num(season[rule.side]?.[rule.stat]);
        const value = crossedSeason(rule, 0, now);
        if (value)
          found.push({ kind: 'season', label: `シーズン${value}${rule.label}`, value, name: p.name, team, playerId: p.id });
      }
    }
  }
  const rank = (m) => (m.kind === 'career' ? 0 : 1);
  return found
    .sort((a, b) => rank(a) - rank(b) || b.value - a.value || String(a.name).localeCompare(String(b.name), 'ja'))
    .slice(0, KEEP_MILESTONES);
}

/** 年度の記録に写す軽い形（選手の id は落とす） */
export function slimHonors(honors) {
  if (!honors) return null;
  const pick = (x) => (x ? { name: x.name, team: x.team, line: x.line || null } : null);
  return Object.fromEntries(
    Object.entries(honors).map(([id, h]) => [
      id,
      {
        mvp: pick(h.mvp),
        rookie: pick(h.rookie),
        bestNine: (h.bestNine || []).map((x) => ({ ...pick(x), label: x.label })),
        battery: h.battery || null,
      },
    ]),
  );
}
export const slimMilestones = (list) =>
  list?.length ? list.map(({ label, name, team, kind }) => ({ label, name, team, kind })) : null;

/**
 * 1人用のシーズンの確定（タイトル8つ＋年間表彰＋節目）。`processSeasonEnd` の代わりに呼ぶ。
 * ⚠ オンラインは `processSeasonEnd` のあとに部ごとの表彰を自分で足す（`leagueEngine.mjs`）ので、
 *    `processSeasonEnd` 自体には足さない。
 */
export function soloSeasonEnd(seasonData, allTeams) {
  const awards = processSeasonEnd(seasonData, allTeams);
  const honors = soloHonors(seasonData, allTeams);
  const milestones = soloMilestones(seasonData, allTeams);
  if (honors) awards.honors = honors;
  if (milestones.length) awards.milestones = milestones;
  return awards;
}
