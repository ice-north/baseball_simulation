import { TEAMS_DATA } from '../teams-data.js';
import { addToReleasedPool } from '../state/pools.js';
import { generateFullSeasonSchedule, fitGamesPerSeason } from './scheduleGenerator.js';
import { generateExpansionRoster } from './tryoutSystem.js';
import { getLeagueRankFromTeams, applyIndependentRank } from '../corporate/corporateInit.js';
import { WORLD_DATA } from '../corporate/worldData.js';

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
 * 独立リーグ・箱庭・大学（社会人は自チームだけなので触らない）。大学は部の入れ替えで
 * 自分の部の球団が替わり、年度更新が settings.teamNames を作り直すので、そのあとにも呼ぶ
 * （OffSeasonScreen）。以前は leagueConfig を始めたときのまま持ち、2年目以降も
 * 入れ替わる前の部の球団が App の allTeams に残っていた。
 * 設定に TEAMS_DATA に無い名前があるときは、どちらが正しいか分からないので触らない。
 * 揃っていればそのまま返す。
 */
export function repairLeagueConfig(leagueConfig, settings, gameMode) {
  if (gameMode !== 'normal' && gameMode !== 'sandbox' && gameMode !== 'university') return leagueConfig;
  const names = settings?.teamNames;
  if (!Array.isArray(names) || names.length === 0 || !names.every(name => TEAMS_DATA[name])) return leagueConfig;
  const current = (leagueConfig?.leagues || []).flatMap(league => league.teams || []);
  if (sameTeams(current, names)) return leagueConfig;
  return leagueConfigWithTeams(leagueConfig, names, settings.leagueFormat);
}

// ============================================================
// 球団の改名・解散・新規参入
//
// ⚠ **規定画面の行（#1, #2…）は球団そのもので、名前の欄はその球団の名前**（自チームはいつも #1）。
//    同じ行の名前を変えたら改名で、選手・ローテ・打順の保存・成績をそのまま引き継ぐ。
//    以前は名前だけで「TEAMS_DATA に無い名前＝新規参入」「前年にあって設定に無い名前＝解散」と
//    決めていたので、自チームの名前を変えると自チームが解散して選手が全員トライアウトのプールへ
//    移り、新しい名前で24人の別の名簿が作られ、`Object.keys(TEAMS_DATA)[0]`（多くの画面が
//    自チームとして読む）は2番目の球団に替わっていた。CPU の球団も同じだった。
//    解散・新規参入は球団数の増減（行の増減。規定画面は後ろの行から足し引きする）だけで起こす。
// ⚠ 記録（年度の成績・殿堂・大会の歴代・プールの選手の前所属）は、その年の名前のまま残す
//    （当時はその名前だった）。いまの世界で名前を引く所（TEAMS_DATA のキー・球団の name と略称・
//    leagueConfig・日程・順位表・チームランキング）だけを新しい名前にする
// ============================================================
/**
 * 前年のリーグの球団（prevNames）と確定した球団（nextNames）を行ごとに比べる。
 * 規定画面の予告と確定で同じものを使う（食い違わないように）。
 * @returns {{ renames: Array<{from:string,to:string}>, added: string[], dissolved: string[] }}
 */
export function planLeagueChanges(prevNames = [], nextNames = []) {
  const renames = [];
  for (let i = 0; i < Math.min(prevNames.length, nextNames.length); i++) {
    if (prevNames[i] !== nextNames[i]) renames.push({ from: prevNames[i], to: nextNames[i] });
  }
  return { renames, added: nextNames.slice(prevNames.length), dissolved: prevNames.slice(nextNames.length) };
}

/**
 * 確定する球団名の誤り。空・重なり・リーグの外（他の独立リーグ・社会人・大学）の球団と同じ名前は
 * 使えない（同じ名前の球団が2つになり、TEAMS_DATA の1つの枠を取り合う）。
 * @param {string[]} nextNames - 確定する球団名（行の順）
 * @param {string[]} currentTeams - いまのリーグの球団（この中の名前は行を移っても使える）
 */
export function validateLeagueTeamNames(nextNames = [], currentTeams = []) {
  const errors = [];
  const current = new Set(currentTeams);
  const seen = new Set();
  nextNames.forEach((name, i) => {
    if (!String(name ?? '').trim()) { errors.push(`#${i + 1}のチーム名が空です`); return; }
    if (seen.has(name)) errors.push(`チーム名「${name}」が重なっています`);
    else if (!current.has(name) && TEAMS_DATA[name]) errors.push(`「${name}」は別のリーグ・大会に同じ名前のチームがあるので使えません`);
    seen.add(name);
  });
  return errors;
}

// TEAMS_DATA のキーを付け替える。**並びはそのまま**（先頭は自チーム。監督移籍の並べ替えと同じ注意）
const renameTeams = (renames) => {
  const to = new Map(renames.filter(r => TEAMS_DATA[r.from]).map(r => [r.from, r.to]));
  if (to.size === 0) return;
  const entries = Object.entries(TEAMS_DATA);
  for (const [name] of entries) delete TEAMS_DATA[name];
  for (const [name, team] of entries) {
    const key = to.get(name) ?? name;
    if (to.has(name)) team.name = key;
    TEAMS_DATA[key] = team;
  }
  // チームランキング（年度更新で取った今の順位）も新しい名前で引けるようにする
  (WORLD_DATA._teamRanking || []).forEach(entry => { if (to.has(entry.name)) entry.name = to.get(entry.name); });
};

/**
 * @param {string[]} [currentTeams] - いまのリーグの球団（画面は `allTeams`）。前年の球団として比べる。
 *   無いとき・TEAMS_DATA に無い名前があるときは `seasonData.settings.teamNames` を使う
 * @returns {boolean} 確定したら true（球団名が使えないときは何も変えずに false）
 */
export function applyNextSeasonRegulations({
  confirmedSettings, seasonData, currentTeams, setSeasonData, setLeagueConfig, generatePitchingRotation,
  setManagementView, nextView, notify = (message) => globalThis.alert?.(message),
}) {
  const settings = confirmedSettings || seasonData.settings || {};
  const calendarYear = 2024 + seasonData.year - 1;
  const configuredTeams = settings.teamNames || [];
  const prevLeagueTeams = currentTeams?.length > 0 && currentTeams.every(name => TEAMS_DATA[name])
    ? currentTeams
    : (seasonData.settings?.teamNames || []);

  // 規定画面でも同じ検査をしてから呼ぶ。ここは呼ぶ側が増えたときの保険
  const nameErrors = configuredTeams.length > 0 ? validateLeagueTeamNames(configuredTeams, prevLeagueTeams) : [];
  if (nameErrors.length > 0) {
    notify('設定エラー:\n' + nameErrors.join('\n'));
    return false;
  }
  const plan = configuredTeams.length > 0
    ? planLeagueChanges(prevLeagueTeams, configuredTeams)
    : { renames: [], added: [], dissolved: [] };

  // 解散: 減らした行の球団だけ。先に外す（改名の行き先が外れる球団の名前のこともある）。
  // ※ TEAMS_DATA全体を対象にすると、並行世界（他の独立リーグ・社会人・大学）まで
  //   まとめて削除してしまい、翌年トレード相手やランキングから消える不具合になる。
  const dissolvedTeamNames = plan.dissolved.filter(t => TEAMS_DATA[t]);
  let dissolvedPlayerCount = 0;
  dissolvedTeamNames.forEach(teamName => {
    (TEAMS_DATA[teamName].players || []).forEach(player => {
      // 戦力外（ContractScreen）と同じ形でプールへ。前所属は `previousTeam`（以前の `formerTeam` は
      // どこも読まず、トライアウトに「前所属: 不明」と出ていた）
      const entry = JSON.parse(JSON.stringify(player));
      delete entry._isDH;
      Object.assign(entry, {
        isStarter: false,
        battingOrder: 0,
        releasedYear: Math.max(1, (seasonData.year || 2) - 1),
        previousTeam: teamName,
        attemptsInPool: 0,
      });
      addToReleasedPool(entry);
      dissolvedPlayerCount++;
    });
    delete TEAMS_DATA[teamName];
  });

  renameTeams(plan.renames);

  // 略称は規定画面の欄のとおりにする（以前は新規参入の球団にしか入れず、続ける球団の略称の変更は捨てていた）
  const abbrs = settings.teamAbbreviations || [];
  configuredTeams.forEach((teamName, i) => {
    if (TEAMS_DATA[teamName] && abbrs[i]) TEAMS_DATA[teamName].abbreviation = abbrs[i];
  });

  // 新規参入: 増やした行（と、前年の球団が見つからない行）
  const existingTeams = new Set(Object.keys(TEAMS_DATA));
  const newTeamNames = configuredTeams.filter(t => !existingTeams.has(t));

  if (newTeamNames.length > 0) {
    // ⚠ **リーグの格を渡すこと**。渡さないと新チームだけAリーグ相当の選手で
    //    埋まる（Cリーグなら スタメン野手のミ+パ が 64 対 103）。格の算出は
    //    TryoutScreen と同じ `getLeagueRankFromTeams` を使う（表を二重に作らない）。
    const expansionRank = getLeagueRankFromTeams(configuredTeams.filter(t => existingTeams.has(t)));
    // 独立リーグなら、新しい球団にも同じリーグの印（`independentLeagueId`・格付け）を付ける。
    // ⚠ 以前は読み直したとき（App のロードの `ensureUserIndependentLeagueTagged`）まで印が無く、
    //    その年はチームランキング・トレード・紙面の「独立リーグの球団」の分け方から漏れていた。
    //    読み直すとプリセットの名前で引いて 'D' になり、作った選手の格とも食い違った
    const leagueId = configuredTeams.map(t => existingTeams.has(t) && TEAMS_DATA[t]?.independentLeagueId).find(Boolean);
    newTeamNames.forEach(teamName => {
      const idx = configuredTeams.indexOf(teamName);
      const abbr = abbrs[idx] || teamName.slice(0, 3);
      TEAMS_DATA[teamName] = {
        name: teamName,
        abbreviation: abbr,
        players: generateExpansionRoster(seasonData.year || 1, 24, expansionRank),
        pitchingRotation: null
      };
      if (leagueId) applyIndependentRank(teamName, expansionRank || 'D', leagueId);
      generatePitchingRotation(teamName);
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
  return true;
}
