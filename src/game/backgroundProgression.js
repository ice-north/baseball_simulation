// 背景球界の大会をUIのマウントに依存させず進行する。
import { WORLD_DATA } from '../corporate/worldData.js';
import { generateRegionalTournament, generateToshitaikou, generateNihonSenshuken,
  generateClubSenshuken, createMainTournament, createSenshukenMainTournament,
  autoPlayBracket, autoPlayQualifier, autoPlayMainTournament,
  simulateRegionalTournamentOnDate, simulateQualifierOnDate,
  simulateMainTournamentOnDate, simulateNihonSenshukenOnDate } from '../corporate/toshitaikou.js';

export function generateBackgroundTournaments(currentDate) {
  if (!WORLD_DATA.initialized) return;
  const { month } = currentDate;
  const calYear = currentDate.year;
  // 地域トーナメント（4月〜生成）
  const rtWasNull = !WORLD_DATA.corporateRegionalTournament?.generated;
  if (month >= 4 && !WORLD_DATA.corporateRegionalTournament?.generated) {
    try {
      const rt = generateRegionalTournament({ userTeamName: null, calendarYear: calYear });
      WORLD_DATA.corporateRegionalTournament = { ...rt, generated: true };
    } catch (_) {
      WORLD_DATA.corporateRegionalTournament = { generated: true, done: true };
    }
  }
  // catch-up: 6月以降に初回生成（セーブロード後の再生成）→ 即完了
  if (rtWasNull && WORLD_DATA.corporateRegionalTournament?.generated && !WORLD_DATA.corporateRegionalTournament.done && month >= 6) {
    const rt = WORLD_DATA.corporateRegionalTournament;
    for (const regionId of Object.keys(rt.brackets || {})) {
      const r = rt.brackets[regionId];
      autoPlayBracket(r.bracket, r.teamDefsMap);
      if (r.bracket.champion) { r.champion = r.bracket.champion; r.phase = 'done'; }
    }
    rt.phase = 'done'; rt.done = true;
  }
  // 都市対抗予選（5月〜生成）
  const toshiWasNull = !WORLD_DATA.corporateToshitaikou?.generated;
  if (month >= 5 && !WORLD_DATA.corporateToshitaikou?.generated) {
    try {
      const tournament = generateToshitaikou({ userTeamName: null, calendarYear: calYear });
      WORLD_DATA.corporateToshitaikou = { ...tournament, generated: true, qualifiersDone: false, mainDone: false };
    } catch (_) {
      WORLD_DATA.corporateToshitaikou = { generated: true, qualifiersDone: true, mainDone: true };
    }
  }
  // catch-up: 7月以降に初回生成 → 予選を即完了
  if (toshiWasNull && WORLD_DATA.corporateToshitaikou?.generated && !WORLD_DATA.corporateToshitaikou.qualifiersDone && WORLD_DATA.corporateToshitaikou.qualifiers && month >= 7) {
    const td = WORLD_DATA.corporateToshitaikou;
    for (const rid of Object.keys(td.qualifiers)) autoPlayQualifier(td.qualifiers[rid], null);
    td.qualifiersDone = true;
  }
  // 都市対抗本戦（予選完了後に生成）
  const toshiMainWasNull = !!(WORLD_DATA.corporateToshitaikou?.qualifiersDone && !WORLD_DATA.corporateToshitaikou?.mainTournament && !WORLD_DATA.corporateToshitaikou?.mainDone);
  if (WORLD_DATA.corporateToshitaikou?.qualifiersDone && !WORLD_DATA.corporateToshitaikou?.mainTournament && !WORLD_DATA.corporateToshitaikou?.mainDone) {
    try {
      const td = WORLD_DATA.corporateToshitaikou;
      const mainTournament = createMainTournament(td.qualifiers, null, calYear);
      WORLD_DATA.corporateToshitaikou = { ...td, mainTournament };
    } catch (_) {
      WORLD_DATA.corporateToshitaikou = { ...WORLD_DATA.corporateToshitaikou, mainDone: true };
    }
  }
  // catch-up: 9月以降に本戦が初回生成 → 即完了
  if (toshiMainWasNull && WORLD_DATA.corporateToshitaikou?.mainTournament && !WORLD_DATA.corporateToshitaikou.mainDone && month >= 9) {
    const td = WORLD_DATA.corporateToshitaikou;
    autoPlayMainTournament(td.mainTournament);
    td.champion = td.mainTournament.champion; td.runnerUp = td.mainTournament.runnerUp; td.mainDone = true;
  }
  // 日本選手権（9月〜生成）
  const nsWasNull = !WORLD_DATA.corporateNihonSenshuken?.generated;
  if (month >= 9 && !WORLD_DATA.corporateNihonSenshuken?.generated) {
    try {
      const ns = generateNihonSenshuken({ userTeamName: null, calendarYear: calYear });
      WORLD_DATA.corporateNihonSenshuken = { ...ns, generated: true, phase: 'qualifiers' };
    } catch (_) {
      WORLD_DATA.corporateNihonSenshuken = { generated: true, done: true };
    }
  }
  // catch-up: 11月以降に初回生成 → 予選を即完了
  if (nsWasNull && WORLD_DATA.corporateNihonSenshuken?.generated && !WORLD_DATA.corporateNihonSenshuken.done && WORLD_DATA.corporateNihonSenshuken.qualifiers && month >= 11) {
    const ns = WORLD_DATA.corporateNihonSenshuken;
    for (const rid of Object.keys(ns.qualifiers)) autoPlayQualifier(ns.qualifiers[rid], null);
    ns.phase = 'qualifiers_done';
  }
  // 日本選手権本戦（予選完了後に生成）
  const nsMainWasNull = !!(WORLD_DATA.corporateNihonSenshuken?.phase === 'qualifiers_done' && !WORLD_DATA.corporateNihonSenshuken?.mainTournament);
  if (WORLD_DATA.corporateNihonSenshuken?.phase === 'qualifiers_done' && !WORLD_DATA.corporateNihonSenshuken?.mainTournament) {
    try {
      const ns = WORLD_DATA.corporateNihonSenshuken;
      const mainTournament = createSenshukenMainTournament(ns.qualifiers, calYear, 'corporate');
      WORLD_DATA.corporateNihonSenshuken = { ...ns, mainTournament, phase: 'main' };
    } catch (_) {
      WORLD_DATA.corporateNihonSenshuken = { ...WORLD_DATA.corporateNihonSenshuken, done: true };
    }
  }
  // catch-up: 11月以降に本戦が初回生成 → 即完了
  if (nsMainWasNull && WORLD_DATA.corporateNihonSenshuken?.mainTournament && !WORLD_DATA.corporateNihonSenshuken.done && month >= 11) {
    const ns = WORLD_DATA.corporateNihonSenshuken;
    autoPlayMainTournament(ns.mainTournament);
    ns.champion = ns.mainTournament.champion; ns.runnerUp = ns.mainTournament.runnerUp; ns.done = true;
  }
  // クラブ選手権（9月〜生成）
  const csWasNull = !WORLD_DATA.corporateClubSenshuken?.generated;
  if (month >= 9 && !WORLD_DATA.corporateClubSenshuken?.generated) {
    try {
      const cs = generateClubSenshuken({ userTeamName: null, calendarYear: calYear });
      WORLD_DATA.corporateClubSenshuken = { ...cs, generated: true, phase: 'qualifiers' };
    } catch (_) {
      WORLD_DATA.corporateClubSenshuken = { generated: true, done: true };
    }
  }
  // catch-up: 11月以降に初回生成 → 予選を即完了
  if (csWasNull && WORLD_DATA.corporateClubSenshuken?.generated && !WORLD_DATA.corporateClubSenshuken.done && WORLD_DATA.corporateClubSenshuken.qualifiers && month >= 11) {
    const cs = WORLD_DATA.corporateClubSenshuken;
    for (const rid of Object.keys(cs.qualifiers)) autoPlayQualifier(cs.qualifiers[rid], null);
    cs.phase = 'qualifiers_done';
  }
  // クラブ選手権本戦（予選完了後に生成）
  const csMainWasNull = !!(WORLD_DATA.corporateClubSenshuken?.phase === 'qualifiers_done' && !WORLD_DATA.corporateClubSenshuken?.mainTournament);
  if (WORLD_DATA.corporateClubSenshuken?.phase === 'qualifiers_done' && !WORLD_DATA.corporateClubSenshuken?.mainTournament) {
    try {
      const cs = WORLD_DATA.corporateClubSenshuken;
      const mainTournament = createSenshukenMainTournament(cs.qualifiers, calYear, 'club');
      WORLD_DATA.corporateClubSenshuken = { ...cs, mainTournament, phase: 'main' };
    } catch (_) {
      WORLD_DATA.corporateClubSenshuken = { ...WORLD_DATA.corporateClubSenshuken, done: true };
    }
  }
  // catch-up: 11月以降に本戦が初回生成 → 即完了
  if (csMainWasNull && WORLD_DATA.corporateClubSenshuken?.mainTournament && !WORLD_DATA.corporateClubSenshuken.done && month >= 11) {
    const cs = WORLD_DATA.corporateClubSenshuken;
    autoPlayMainTournament(cs.mainTournament);
    cs.champion = cs.mainTournament.champion; cs.runnerUp = cs.mainTournament.runnerUp; cs.done = true;
  }
}

export function advanceBackgroundTournaments(currentDate) {
  if (!WORLD_DATA.initialized) return;
  const dateObj = currentDate;
  // 地域トーナメント
  const wdRT = WORLD_DATA.corporateRegionalTournament;
  if (wdRT?.generated && wdRT.phase !== 'done') {
    simulateRegionalTournamentOnDate(wdRT, dateObj, null);
  }
  // 都市対抗予選
  const wdTD = WORLD_DATA.corporateToshitaikou;
  if (wdTD?.generated && !wdTD.mainDone) {
    if (!wdTD.qualifiersDone && wdTD.qualifiers) {
      for (const regionId of Object.keys(wdTD.qualifiers)) {
        simulateQualifierOnDate(wdTD.qualifiers[regionId], dateObj, null);
      }
      wdTD.qualifiersDone = Object.values(wdTD.qualifiers).every(q => q.phase === 'done');
    }
    if (wdTD.mainTournament && wdTD.mainTournament.phase !== 'done') {
      simulateMainTournamentOnDate(wdTD.mainTournament, dateObj, null);
      if (wdTD.mainTournament.phase === 'done') {
        wdTD.champion = wdTD.mainTournament.champion;
        wdTD.runnerUp = wdTD.mainTournament.runnerUp;
        wdTD.mainDone = true;
      }
    }
  }
  // 日本選手権
  const wdNS = WORLD_DATA.corporateNihonSenshuken;
  if (wdNS?.generated && !wdNS.done) {
    simulateNihonSenshukenOnDate(wdNS, dateObj, null);
    if (wdNS.mainTournament?.phase === 'done') {
      wdNS.champion = wdNS.mainTournament.champion;
      wdNS.runnerUp = wdNS.mainTournament.runnerUp;
      wdNS.done = true;
    } else if (wdNS.phase === 'qualifiers') {
      const allQDone = wdNS.qualifiers && Object.values(wdNS.qualifiers).every(q => q.phase === 'done');
      if (allQDone) wdNS.phase = 'qualifiers_done';
    }
  }
  // クラブ選手権
  const wdCS = WORLD_DATA.corporateClubSenshuken;
  if (wdCS?.generated && !wdCS.done) {
    simulateNihonSenshukenOnDate(wdCS, dateObj, null);
    if (wdCS.mainTournament?.phase === 'done') {
      wdCS.champion = wdCS.mainTournament.champion;
      wdCS.runnerUp = wdCS.mainTournament.runnerUp;
      wdCS.done = true;
    } else if (wdCS.phase === 'qualifiers') {
      const allQDone = wdCS.qualifiers && Object.values(wdCS.qualifiers).every(q => q.phase === 'done');
      if (allQDone) wdCS.phase = 'qualifiers_done';
    }
  }
}
