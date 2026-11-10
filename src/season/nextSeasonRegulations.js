import { TEAMS_DATA } from '../teams-data.js';
import { addToReleasedPool } from '../state/pools.js';
import { generateFullSeasonSchedule } from './scheduleGenerator.js';
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
export function applyNextSeasonRegulations({
  confirmedSettings, seasonData, setSeasonData, generatePitchingRotation,
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
  const schedule = generateFullSeasonSchedule({
    teams,
    gamesPerSeason: settings.gamesPerSeason || 60,
    startDate: { year: calendarYear, month: 3, day: 1 },
    endDate: { year: calendarYear, month: 9, day: 30 },
    leagueFormat: settings.leagueFormat || 'single',
    leagueNames: settings.leagueNames
  });
  setSeasonData(prev => ({
    ...prev,
    currentDate: { year: calendarYear, month: 1, day: 1 },
    schedule,
    standings: teams.map(t => ({
      team: t, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0
    }))
  }));
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
