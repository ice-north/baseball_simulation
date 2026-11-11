import { TEAMS_DATA } from '../teams-data.js';
import { addToReleasedPool } from '../state/pools.js';
import { generateFullSeasonSchedule, fitGamesPerSeason } from './scheduleGenerator.js';
import { generateExpansionRoster } from './tryoutSystem.js';
import { getLeagueRankFromTeams } from '../corporate/corporateInit.js';

// ============================================================
// 翌年のレギュレーション確定（新規参入・解散・日程の作り直し）
//
// ⚠ 画面（ManagementScreen.jsx）から分けてある。node の検査（oneplayer-fix-check）で
//    遷移まで確かめるため（JSX は node から読めない）。
// ⚠ **通常(`regulations_next`)と箱庭(`sandbox_next_regulations`)の2箇所で
//    79行を丸ごとコピペしていた**（違いは最後の遷移先だけ）。CLAUDE.md にも
//    「呼び出し側は ManagementScreen の2箇所。片方だけ直さないこと」という
//    ⚠ を置いて運用で回避していたが、関数にすれば⚠ごと要らなくなる。
// ============================================================
// ============================================================
// リーグの球団の並び（App の `leagueConfig`。`allTeams`・`userTeamName = allTeams[0]` の元）
//
// ⚠ **球団の顔ぶれを変えたら leagueConfig も同じ操作で揃えること**。以前は年度更新で
//    日程と順位表だけ作り直し、leagueConfig は新しく始めた時・ロード・監督移籍でしか
//    書き換えなかった。増やした球団はキャンプ・トライアウト・選手成績・箱庭のチーム設定に
//    出ず、減らすと解散した球団が残って、箱庭のチーム設定は「選手が16人足りません」で
//    開幕できなかった。保存にも古いまま入っていた
// ============================================================
// リーグの名前（新しく始めた時は「リーグ」、監督移籍の後は所属リーグの名前）はそのまま残す
export const leagueConfigWithTeams = (prev, teams, format) => ({
  ...(prev || {}),
  format: format || prev?.format || 'single',
  teamsPerLeague: teams.length,
  leagues: [{ name: prev?.leagues?.[0]?.name || 'リーグ', teams: [...teams] }],
});

const sameTeams = (a = [], b = []) => a.length === b.length && a.every((name, i) => name === b[i]);

/**
 * ロードした保存の leagueConfig を、設定の球団（`settings.teamNames`）に合わせる。
 * 上の不具合で、球団数を変えた年より後の保存は leagueConfig が古いまま入っている。
 * 独立リーグ・箱庭だけ（社会人は自チームだけ、大学は部の入れ替えで別に決まる）。
 * 設定に TEAMS_DATA に無い名前があるときは、どちらが正しいか分からないので触らない。
 * 揃っていればそのまま返す。
 */
export function repairLeagueConfig(leagueConfig, settings, gameMode) {
  if (gameMode !== 'normal' && gameMode !== 'sandbox') return leagueConfig;
  const names = settings?.teamNames;
  if (!Array.isArray(names) || names.length === 0 || !names.every(name => TEAMS_DATA[name])) return leagueConfig;
  const current = (leagueConfig?.leagues || []).flatMap(league => league.teams || []);
  if (sameTeams(current, names)) return leagueConfig;
  return leagueConfigWithTeams(leagueConfig, names, settings.leagueFormat);
}

export function applyNextSeasonRegulations({
  confirmedSettings, seasonData, setSeasonData, setLeagueConfig, generatePitchingRotation,
  setManagementView, nextView, notify = (message) => globalThis.alert?.(message),
}) {
  const settings = confirmedSettings || seasonData.settings || {};
  const calendarYear = 2024 + seasonData.year - 1;

  // 新チーム検出: settings.teamNamesにあるがTEAMS_DATAに存在しないチーム
  const configuredTeams = settings.teamNames || [];
  const existingTeams = new Set(Object.keys(TEAMS_DATA));
  const newTeamNames = configuredTeams.filter(t => !existingTeams.has(t));

  if (newTeamNames.length > 0) {
    const abbrs = settings.teamAbbreviations || [];
    // ⚠ **リーグの格を渡すこと**。渡さないと新チームだけAリーグ相当の選手で
    //    埋まる（Cリーグなら スタメン野手のミ+パ が 64 対 103）。格の算出は
    //    TryoutScreen と同じ `getLeagueRankFromTeams` を使う（表を二重に作らない）。
    const expansionRank = getLeagueRankFromTeams(configuredTeams.filter(t => existingTeams.has(t)));
    newTeamNames.forEach(teamName => {
      const idx = configuredTeams.indexOf(teamName);
      const abbr = abbrs[idx] || teamName.slice(0, 3);
      TEAMS_DATA[teamName] = {
        name: teamName,
        abbreviation: abbr,
        players: generateExpansionRoster(seasonData.year || 1, 24, expansionRank),
        pitchingRotation: null
      };
      generatePitchingRotation(teamName);
    });
  }

  // 解散チーム検出: 「前年の自リーグ所属」だが今年の設定に居ないチームのみ。
  // ※ TEAMS_DATA全体を対象にすると、並行世界（他の独立リーグ・社会人・大学）まで
  //   まとめて削除してしまい、翌年トレード相手やランキングから消える不具合になる。
  const configuredSet = new Set(configuredTeams);
  const prevLeagueTeams = seasonData.settings?.teamNames || [];
  const dissolvedTeamNames = prevLeagueTeams.filter(t => configuredTeams.length > 0 && !configuredSet.has(t) && TEAMS_DATA[t]);
  let dissolvedPlayerCount = 0;

  if (dissolvedTeamNames.length > 0) {
    dissolvedTeamNames.forEach(teamName => {
      const teamData = TEAMS_DATA[teamName];
      if (teamData && teamData.players) {
        teamData.players.forEach(player => {
          addToReleasedPool({
            ...JSON.parse(JSON.stringify(player)),
            formerTeam: teamName,
            attemptsInPool: 0
          });
          dissolvedPlayerCount++;
        });
      }
      delete TEAMS_DATA[teamName];
    });
  }

  const teams = configuredTeams.length > 0 ? configuredTeams : Object.keys(TEAMS_DATA);
  const leagueFormat = settings.leagueFormat || 'single';
  // ⚠ **試合数は選べる値に合わせ、設定にも書き戻す**（規定画面と同じ `fitGamesPerSeason`）。
  //    古い保存は選べない値を持つことがあり（2リーグの奇数球団など）、以前は日程だけが
  //    別の数（球団ごとにばらばら）になって、規定画面・規定打席の基準と食い違った
  const gamesPerSeason = fitGamesPerSeason({ teamsCount: teams.length, leagueFormat, games: settings.gamesPerSeason || 60 });
  const schedule = generateFullSeasonSchedule({
    teams,
    gamesPerSeason,
    startDate: { year: calendarYear, month: 3, day: 1 },
    endDate: { year: calendarYear, month: 9, day: 30 },
    leagueFormat,
    leagueNames: settings.leagueNames
  });
  setSeasonData(prev => ({
    ...prev,
    ...(prev.settings?.gamesPerSeason === gamesPerSeason
      ? {}
      : { settings: { ...(prev.settings || settings), gamesPerSeason } }),
    currentDate: { year: calendarYear, month: 1, day: 1 },
    schedule,
    standings: teams.map(t => ({
      team: t, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0
    }))
  }));
  // 日程と同じ球団にする（上の `leagueConfigWithTeams` の説明を参照）
  if (configuredTeams.length > 0) {
    setLeagueConfig?.(prev => leagueConfigWithTeams(prev, configuredTeams, leagueFormat));
  }
  const alerts = [];
  if (newTeamNames.length > 0) {
    alerts.push(`新規参入チーム（${newTeamNames.join('、')}）にロスター24人を自動編成しました`);
  }
  if (dissolvedTeamNames.length > 0) {
    alerts.push(`${dissolvedTeamNames.join('、')}が解散しました。所属${dissolvedPlayerCount}名の選手はフリーエージェントプールに移動し、次回トライアウトに参加します`);
  }
  if (alerts.length > 0) {
    notify(alerts.join('\n\n'));
  }
  // ⚠ **最後に次の画面へ移る**。関数にまとめたとき（d2a147b）この1行が抜け、
  //    「確定 → キャンプへ進む」を押しても画面が変わらず、独立リーグ・箱庭は2年目に進めなかった
  setManagementView(nextView);
}
