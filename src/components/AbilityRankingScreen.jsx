import React, { useState, useMemo } from 'react';
import { ScreenShell, ScreenHeader } from './GameUIComponents.jsx';
import ProspectBoardScreen from './ProspectBoardScreen.jsx';
import { TEAMS_DATA, getTeamAbbreviation } from '../teams-data.js';
import { calcPlayerOverall } from '../season/dispatchSystem.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { universityPool, highSchoolPool } from '../season/universityPool.js';
import { checkNPBDraftEligibility } from '../season/yearProgressionSystem.js';
import PlayerDetailModal from './PlayerDetailModal.jsx';

const RANK_COLORS = { S: 'text-yellow-400', A: 'text-red-400', B: 'text-blue-400', C: 'text-green-400', D: 'text-gray-300' };
// ⚠ **不透明にすること**。地色が明るいので、半透明のタイルはその明るい地の上で
//    薄まり、載っている淡い文字が読めなくなる（実測で6600箇所超が3.0未満）。
//    ランクの識別色は保ったまま、素の Tailwind の 950 段で不透明にしてある。
const RANK_BG = { S: 'bg-yellow-950 border-yellow-700/60', A: 'bg-red-950 border-red-700/60', B: 'bg-blue-950 border-blue-700/60', C: 'bg-green-950 border-green-700/60', D: 'bg-surface-2 border-gray-700/50' };

const getOverallColor = (v) => {
  if (v >= 70) return 'text-yellow-400';
  if (v >= 60) return 'text-red-400';
  if (v >= 50) return 'text-blue-400';
  if (v >= 40) return 'text-green-400';
  return 'text-gray-300';
};

const getStatColor = (v) => {
  if (v >= 80) return 'text-yellow-400';
  if (v >= 65) return 'text-red-400';
  if (v >= 50) return 'text-blue-400';
  if (v >= 35) return 'text-green-400';
  return 'text-gray-400';
};

const getTeamType = (team) => {
  if (team.corporateTeamId || team.corporateData) return 'corporate';
  if (team.universityData) return 'university';
  if (team.independentLeagueId) return 'independent';
  return 'user';
};

const TYPE_LABEL = {
  corporate: { text: '社会人', color: 'text-blue-400' },
  university: { text: '大学', color: 'text-amber-400' },
  independent: { text: '独立', color: 'text-green-400' },
  user: { text: '自チーム', color: 'text-emerald-400' },
  highschool: { text: '高校', color: 'text-pink-400' },
};

const toSource = (tt) => tt === 'user' ? 'independent' : tt;

const IL_PREFIX = { shikoku: 'IL', bc: 'BC', kyushu: 'KL', hokkaido: 'FL', kansai: 'KI' };

// ⚠ **チーム名を文字数で切らないこと**（選手名の `surnameOf` と同じ話）。
//    社会人・独立の315チームは**中央7文字 / 75%点9文字**あるのに `slice(0, 3)` で
//    切っており、`日本製鉄室蘭シャークス`→`日本製` / `JR北海道`→`JR北` /
//    `TRANSYS`→`TRA` と、**別のチーム名に読めるものが大半**だった。
//    ⚠ `team.abbreviation` は**どのチームも持っていない**（`corporateTeamsData` に
//    そのフィールドは存在しない）ので、この `||` は常に slice 側へ落ちていた。
//    フル名を返し、溢れるぶんは表示側の `truncate`（省略記号）と `title` に任せる。
//    「…」なら切れていることが読み手に分かるが、`東京ガ` は別名に見えてしまう。
const makeDisplayAbbr = (teamName, team) => {
  if (team?.independentLeagueId) {
    // リーグの接頭辞だけは残す（同名の街が別リーグにあるため）
    const prefix = IL_PREFIX[team.independentLeagueId] || 'IL';
    return `${prefix} ${teamName}`;
  }
  if (team?.universityData || team?.universityTeamId) {
    return normalizeUniAbbr(teamName);
  }
  return teamName;
};

const normalizeUniAbbr = (name) => {
  let s = name;
  if (s.endsWith('大学')) s = s.slice(0, -1);
  const daiIdx = s.indexOf('大');
  if (daiIdx >= 0 && daiIdx <= 4) s = s.slice(0, daiIdx + 1);
  // ⚠ 「〇〇大学」→「〇〇大」は実在する略し方なので残す。ただし
  //    **「大」を含まない校名を機械的に3文字で切って『大』を足す**のは
  //    実在しない名前を作るので、その場合はフル名のままにする
  else if (!s.endsWith('大')) return name;
  return s;
};

// 12球団ドラフト戦略プロファイル（実際の傾向に基づく）
const SCOUT_PROFILES = [
  // ① 素材・長期育成型
  { abbr: 'オリックス', topN: 15, bias: (p, src) => {
    let b = src === 'highschool' ? 30 : src === 'university' ? 5 : src === 'corporate' ? -10 : -25;
    if (p.age <= 19) b += 18;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 145) b += 18;
    else if (p.position !== 'pitcher' && (p.physical?.speed || 0) >= 60) b += 10;
    if ((p.growthPotential || 1) >= 1.1) b += 15;
    return b;
  }},
  { abbr: '広島', topN: 14, bias: (p, src) => {
    let b = src === 'highschool' ? 22 : src === 'university' ? 10 : src === 'corporate' ? -5 : -20;
    if (p.age <= 20) b += 12;
    if ((p.growthPotential || 1) >= 1.05) b += 12;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 143) b += 10;
    if (p.fame >= 15) b += 8;
    return b;
  }},
  // ② 即戦力・センターライン型
  { abbr: '阪神', topN: 15, bias: (p, src) => {
    let b = src === 'university' ? 28 : src === 'corporate' ? 22 : src === 'highschool' ? -12 : -22;
    if (p.age >= 22) b += 12;
    if (['catcher', 'second', 'short', 'center'].includes(p.position)) b += 12;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 150) b += 15;
    if (p.position !== 'pitcher' && (p.batting?.meet || 0) >= 55) b += 10;
    if (p.position !== 'pitcher' && (p.fielding?.defense || 0) >= 55) b += 8;
    return b;
  }},
  { abbr: '横浜', topN: 15, bias: (p, src) => {
    let b = src === 'university' ? 28 : src === 'corporate' ? 18 : src === 'highschool' ? -10 : -22;
    if (p.age >= 22) b += 10;
    if (p.position !== 'pitcher' && (p.batting?.meet || 0) >= 50) b += 12;
    if (p.position !== 'pitcher' && (p.fielding?.defense || 0) >= 55) b += 10;
    if (['second', 'short', 'center'].includes(p.position)) b += 8;
    return b;
  }},
  // ③ 資金力・ハイブリッド型
  { abbr: 'ソフト', topN: 18, bias: (p, src) => {
    let b = src === 'highschool' ? 18 : src === 'university' ? 12 : src === 'corporate' ? 5 : -18;
    if ((p.growthPotential || 1) >= 1.15) b += 18;
    if (p.age <= 19) b += 12;
    if (p.fame >= 20) b += 10;
    return b;
  }},
  { abbr: '巨人', topN: 16, bias: (p, src) => {
    let b = src === 'university' ? 22 : src === 'highschool' ? 12 : src === 'corporate' ? 12 : -18;
    if (p.fame >= 15) b += 12;
    if (p.age <= 22 && p.age >= 20) b += 8;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 148) b += 10;
    return b;
  }},
  // ④ ピンポイント・弱点補強型
  { abbr: 'ヤクルト', topN: 14, bias: (p, src) => {
    let b = src === 'university' ? 18 : src === 'corporate' ? 12 : src === 'highschool' ? 0 : -18;
    if (p.position !== 'pitcher' && (p.batting?.power || 0) >= 55) b += 15;
    if (['first', 'second', 'short', 'third'].includes(p.position)) b += 8;
    if (p.age >= 22) b += 5;
    return b;
  }},
  { abbr: '中日', topN: 14, bias: (p, src) => {
    let b = src === 'university' ? 18 : src === 'corporate' ? 12 : src === 'highschool' ? 5 : -15;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 148) b += 12;
    if (p.position === 'pitcher' && (p.pitching?.control || 0) >= 55) b += 10;
    if (p.position !== 'pitcher' && (p.batting?.power || 0) >= 50) b += 8;
    return b;
  }},
  { abbr: '楽天', topN: 14, bias: (p, src) => {
    let b = src === 'university' ? 16 : src === 'corporate' ? 12 : src === 'highschool' ? 5 : -15;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 145) b += 12;
    if (p.position === 'pitcher' && (p.pitching?.stamina || 0) >= 70) b += 8;
    if (p.position !== 'pitcher' && (p.batting?.meet || 0) >= 50) b += 8;
    return b;
  }},
  { abbr: '西武', topN: 14, bias: (p, src) => {
    let b = src === 'university' ? 16 : src === 'corporate' ? 12 : src === 'highschool' ? 5 : -15;
    if (['catcher', 'second', 'short'].includes(p.position)) b += 10;
    if (p.position !== 'pitcher' && (p.fielding?.defense || 0) >= 55) b += 8;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 148) b += 10;
    return b;
  }},
  // ⑤ 独自データ・市場連動型
  { abbr: '日ハム', topN: 15, bias: (p, src) => {
    let b = src === 'university' ? 12 : src === 'highschool' ? 12 : src === 'corporate' ? 5 : -8;
    if ((p.physical?.speed || 0) >= 60) b += 15;
    if ((p.fielding?.defense || 0) >= 55) b += 10;
    if (['second', 'short', 'center'].includes(p.position)) b += 10;
    if (p.position === 'pitcher' && (p.pitching?.control || 0) >= 60) b += 8;
    return b;
  }},
  { abbr: 'ロッテ', topN: 15, bias: (p, src) => {
    let b = src === 'highschool' ? 22 : src === 'university' ? 10 : src === 'corporate' ? 5 : -15;
    if (p.position === 'pitcher' && (p.pitching?.velocity || 0) >= 148) b += 20;
    if (p.age <= 19 && p.position === 'pitcher') b += 12;
    if ((p.growthPotential || 1) >= 1.1) b += 8;
    return b;
  }},
];

const getBestBreaking = (player) => {
  const arsenal = player.pitching?.arsenal || [];
  return arsenal
    .filter(a => a.type !== 'straight')
    .reduce((max, a) => Math.max(max, a.level || 0), 0);
};

const ScoutBadges = ({ npbScouts, amScouts }) => {
  if ((!npbScouts || npbScouts.length === 0) && (!amScouts || amScouts.length === 0)) return null;
  return (
    <div className="flex flex-wrap gap-0.5">
      {/* ⚠ 赤だった（`bg-red-900/40` + `text-red-300`）。カードが紺なので**補色**になって
          目がちらつくうえ、`text-red-400`（ランク色）とも意味が衝突する。
          球団名は識別色を持たない情報なので中立にする（実測 5.52:1） */}
      {npbScouts?.map(t => (
        <span key={t} className="text-xs px-1 py-0 rounded bg-gray-700 text-gray-100 leading-tight">{t}</span>
      ))}
      {amScouts?.map(t => (
        <span key={t} className="text-xs px-1 py-0 rounded bg-purple-900/40 text-purple-300 leading-tight">{t}</span>
      ))}
    </div>
  );
};

const AbilityRankingScreen = () => {
  const [mode, setMode] = useState('player');
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState('overall');
  const [limit, setLimit] = useState(50);
  const [teamRankFilter, setTeamRankFilter] = useState('all');
  // 選手名クリックで詳細（選手検索・チーム情報・推薦スカウトと同じ共有モーダル）
  const [detailPlayer, setDetailPlayer] = useState(null);

  const { allPlayers, allTeamStats, hsPlayers } = useMemo(() => {
    const players = [];
    const teamMap = {};

    for (const [teamName, team] of Object.entries(TEAMS_DATA)) {
      if (!team?.players) continue;
      const type = getTeamType(team);
      const rank = team.corporateData?.rank || team.universityData?.rank || null;

      const displayAbbr = makeDisplayAbbr(teamName, team);
      const teamEntry = {
        name: teamName, abbr: displayAbbr,
        type, rank,
        count: 0, total: 0,
        pitchers: 0, pitcherTotal: 0,
        fielders: 0, fielderTotal: 0,
        topPlayers: [],
      };

      for (const p of team.players) {
        const overall = calcPlayerOverall(p);
        const { totalScore: draftScore } = checkNPBDraftEligibility(p, 0);
        const entry = { ...p, teamName, teamAbbr: teamEntry.abbr, teamType: type, overall, draftScore };
        players.push(entry);
        teamEntry.count++;
        teamEntry.total += overall;
        if (p.position === 'pitcher') { teamEntry.pitchers++; teamEntry.pitcherTotal += overall; }
        else { teamEntry.fielders++; teamEntry.fielderTotal += overall; }
        teamEntry.topPlayers.push({ name: p.name, position: p.position, overall, age: p.age });
      }

      teamEntry.avg = teamEntry.count > 0 ? teamEntry.total / teamEntry.count : 0;
      teamEntry.pitcherAvg = teamEntry.pitchers > 0 ? teamEntry.pitcherTotal / teamEntry.pitchers : 0;
      teamEntry.fielderAvg = teamEntry.fielders > 0 ? teamEntry.fielderTotal / teamEntry.fielders : 0;
      teamEntry.topPlayers.sort((a, b) => b.overall - a.overall);
      teamEntry.topPlayers = teamEntry.topPlayers.slice(0, 5);
      teamMap[teamName] = teamEntry;
    }

    const uniTeamMap = {};
    const teamsDataNames = new Set(Object.keys(TEAMS_DATA));
    Object.values(universityPool).forEach(cohort => {
      if (!cohort) return;
      cohort.forEach(entry => {
        const tName = entry.universityTeamName;
        if (!tName || teamsDataNames.has(tName)) return;
        if (!uniTeamMap[tName]) {
          uniTeamMap[tName] = {
            name: tName, abbr: normalizeUniAbbr(tName), type: 'university',
            rank: entry.universityRank || null,
            count: 0, total: 0,
            pitchers: 0, pitcherTotal: 0,
            fielders: 0, fielderTotal: 0,
            topPlayers: [],
          };
        }
        const te = uniTeamMap[tName];
        if (entry.universityRank && (!te.rank || 'SABCD'.indexOf(entry.universityRank) < 'SABCD'.indexOf(te.rank))) {
          te.rank = entry.universityRank;
        }
        const p = entry.player;
        const overall = calcPlayerOverall(p);
        const { totalScore: draftScore } = checkNPBDraftEligibility(p, 0);
        const pEntry = { ...p, teamName: tName, teamAbbr: normalizeUniAbbr(tName), teamType: 'university', overall, draftScore };
        players.push(pEntry);
        te.count++;
        te.total += overall;
        if (p.position === 'pitcher') { te.pitchers++; te.pitcherTotal += overall; }
        else { te.fielders++; te.fielderTotal += overall; }
        te.topPlayers.push({ name: p.name, position: p.position, overall, age: p.age });
      });
    });
    Object.values(uniTeamMap).forEach(te => {
      te.avg = te.count > 0 ? te.total / te.count : 0;
      te.pitcherAvg = te.pitchers > 0 ? te.pitcherTotal / te.pitchers : 0;
      te.fielderAvg = te.fielders > 0 ? te.fielderTotal / te.fielders : 0;
      te.topPlayers.sort((a, b) => b.overall - a.overall);
      te.topPlayers = te.topPlayers.slice(0, 5);
      teamMap[`uni_${te.name}`] = te;
    });

    const hs = (highSchoolPool.players || []).map(p => {
      const overall = calcPlayerOverall(p);
      const { totalScore: draftScore } = checkNPBDraftEligibility(p, 0);
      const schoolLabel = p.highSchool ? p.highSchool.name : '無名校';
      return { ...p, teamName: schoolLabel, teamAbbr: schoolLabel, teamType: 'highschool', overall, draftScore };
    });

    // === 12球団スカウト注目マップ（球団戦略に基づく上位N名選出）===
    const allCandidates = [...players, ...hs].filter(c => c.draftScore >= 80);
    const scoutMap = {};
    for (const profile of SCOUT_PROFILES) {
      const scored = allCandidates
        .map(c => ({ id: c.id, score: c.draftScore + profile.bias(c, toSource(c.teamType)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, profile.topN);
      for (const { id } of scored) {
        if (!scoutMap[id]) scoutMap[id] = [];
        scoutMap[id].push(profile.abbr);
      }
    }

    players.forEach(p => { p.npbScouts = scoutMap[p.id] || []; });
    hs.forEach(p => {
      p.npbScouts = scoutMap[p.id] || [];
      const amScouts = [];
      if (p.overall >= 38 || (p.growthPotential || 1) >= 1.05) amScouts.push('大学');
      if (p.overall >= 42 || p.fame >= 10) amScouts.push('社会人');
      p.amScouts = amScouts;
    });

    return { allPlayers: players, allTeamStats: Object.values(teamMap), hsPlayers: hs };
  }, [Object.keys(TEAMS_DATA).length]);

  const filteredPlayers = useMemo(() => {
    let list = sortKey === 'draft' ? [...allPlayers, ...hsPlayers] : allPlayers;
    if (category === 'pitcher') list = list.filter(p => p.position === 'pitcher');
    else if (category === 'catcher') list = list.filter(p => p.position === 'catcher');
    else if (category === 'infielder') list = list.filter(p => ['first', 'second', 'third', 'short'].includes(p.position));
    else if (category === 'outfielder') list = list.filter(p => ['left', 'center', 'right'].includes(p.position));

    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === 'overall') diff = b.overall - a.overall;
      else if (sortKey === 'meet') diff = (b.batting?.meet || 0) - (a.batting?.meet || 0);
      else if (sortKey === 'power') diff = (b.batting?.power || 0) - (a.batting?.power || 0);
      else if (sortKey === 'speed') diff = (b.physical?.speed || 0) - (a.physical?.speed || 0);
      else if (sortKey === 'defense') diff = (b.fielding?.defense || 0) - (a.fielding?.defense || 0);
      else if (sortKey === 'eye') diff = (b.batting?.eye || 0) - (a.batting?.eye || 0);
      else if (sortKey === 'arm') diff = (b.physical?.arm || 0) - (a.physical?.arm || 0);
      else if (sortKey === 'velocity') diff = (b.pitching?.velocity || 0) - (a.pitching?.velocity || 0);
      else if (sortKey === 'control') diff = (b.pitching?.control || 0) - (a.pitching?.control || 0);
      else if (sortKey === 'stamina') diff = (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0);
      else if (sortKey === 'breaking') diff = getBestBreaking(b) - getBestBreaking(a);
      else if (sortKey === 'age') diff = (a.age || 99) - (b.age || 99);
      else if (sortKey === 'draft') diff = (b.draftScore || 0) - (a.draftScore || 0);
      else diff = b.overall - a.overall;
      return diff !== 0 ? diff : b.overall - a.overall;
    });

    return list.slice(0, limit);
  }, [allPlayers, hsPlayers, category, sortKey, limit]);

  const filteredHsPlayers = useMemo(() => {
    let list = hsPlayers;
    if (category === 'pitcher') list = list.filter(p => p.position === 'pitcher');
    else if (category === 'catcher') list = list.filter(p => p.position === 'catcher');
    else if (category === 'infielder') list = list.filter(p => ['first', 'second', 'third', 'short'].includes(p.position));
    else if (category === 'outfielder') list = list.filter(p => ['left', 'center', 'right'].includes(p.position));

    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === 'draft') diff = (b.draftScore || 0) - (a.draftScore || 0);
      else if (sortKey === 'overall') diff = b.overall - a.overall;
      else if (sortKey === 'velocity') diff = (b.pitching?.velocity || 0) - (a.pitching?.velocity || 0);
      else if (sortKey === 'control') diff = (b.pitching?.control || 0) - (a.pitching?.control || 0);
      else if (sortKey === 'breaking') diff = getBestBreaking(b) - getBestBreaking(a);
      else if (sortKey === 'meet') diff = (b.batting?.meet || 0) - (a.batting?.meet || 0);
      else if (sortKey === 'power') diff = (b.batting?.power || 0) - (a.batting?.power || 0);
      else if (sortKey === 'speed') diff = (b.physical?.speed || 0) - (a.physical?.speed || 0);
      else if (sortKey === 'defense') diff = (b.fielding?.defense || 0) - (a.fielding?.defense || 0);
      else diff = b.overall - a.overall;
      return diff !== 0 ? diff : b.overall - a.overall;
    });

    return list.slice(0, limit);
  }, [hsPlayers, category, sortKey, limit]);

  const filteredTeams = useMemo(() => {
    let list = allTeamStats;
    if (teamRankFilter !== 'all') {
      if (teamRankFilter === 'user') list = list.filter(t => t.type === 'user');
      else if (teamRankFilter === 'independent') list = list.filter(t => t.type === 'independent' || t.type === 'user');
      else if (teamRankFilter === 'corporate') list = list.filter(t => t.type === 'corporate');
      else if (teamRankFilter === 'university') list = list.filter(t => t.type === 'university');
      else list = list.filter(t => t.rank === teamRankFilter);
    }
    return [...list].sort((a, b) => b.avg - a.avg);
  }, [allTeamStats, teamRankFilter]);

  const isFielderCategory = ['catcher', 'infielder', 'outfielder'].includes(category);

  const getSortOptions = (forMode) => {
    const fielderOpts = [
      { key: 'overall', label: '総合' }, { key: 'meet', label: 'ミート' },
      { key: 'power', label: 'パワー' }, { key: 'speed', label: '走力' },
      { key: 'defense', label: '守備' }, { key: 'eye', label: '選球眼' },
      { key: 'draft', label: 'ドラフト' }, { key: 'age', label: '年齢' },
    ];
    const pitcherOpts = [
      { key: 'overall', label: '総合' }, { key: 'velocity', label: '球速' },
      { key: 'control', label: '制球' }, { key: 'breaking', label: '変化球' },
      { key: 'stamina', label: 'スタミナ' }, { key: 'draft', label: 'ドラフト' },
      { key: 'age', label: '年齢' },
    ];
    if (forMode === 'highschool') {
      if (category === 'pitcher') return [
        { key: 'draft', label: 'ドラフト' }, { key: 'overall', label: '総合' },
        { key: 'velocity', label: '球速' }, { key: 'control', label: '制球' },
        { key: 'breaking', label: '変化球' },
      ];
      if (isFielderCategory) return [
        { key: 'draft', label: 'ドラフト' }, { key: 'overall', label: '総合' },
        { key: 'meet', label: 'ミート' }, { key: 'power', label: 'パワー' },
        { key: 'speed', label: '走力' }, { key: 'defense', label: '守備' },
      ];
      return [{ key: 'draft', label: 'ドラフト' }, { key: 'overall', label: '総合' }];
    }
    if (category === 'pitcher') return pitcherOpts;
    if (isFielderCategory) return fielderOpts;
    return [{ key: 'overall', label: '総合' }, { key: 'draft', label: 'ドラフト' }, { key: 'age', label: '年齢' }];
  };

  const renderPlayerTable = (playerList, showAmScouts = false) => {
    return (
      <div className="bg-surface-2 rounded-lg overflow-hidden">
        <table className="tabular-nums w-full text-sm">
          <thead>
            <tr className="text-gray-300 text-xs border-b border-gray-700">
              {/* ⚠ 1文字の略記（ミ/パ/走/守/眼/変/ス）だったのでフル表記にした。
                  ⚠ **「守」が2つあった**——3列目は守備**位置**、9列目は守備**力**で
                  別物なので、位置は選手検索と同じ `ポジ` に揃える（表記を二重に作らない） */}
              <th className="px-1.5 py-2 text-left w-6">#</th>
              <th className="px-1.5 py-2 text-left">選手</th>
              <th className="px-1.5 py-2 text-center">ポジ</th>
              <th className="px-1.5 py-2 text-center">年齢</th>
              <th className="px-1.5 py-2 text-left">所属</th>
              <th className="px-1.5 py-2 text-center font-bold">総合</th>
              <th className="px-1 py-2 text-center">ミート</th>
              <th className="px-1 py-2 text-center">パワー</th>
              <th className="px-1 py-2 text-center">走力</th>
              <th className="px-1 py-2 text-center">守備</th>
              <th className="px-1 py-2 text-center">選球眼</th>
              <th className="px-1 py-2 text-center">球速</th>
              <th className="px-1 py-2 text-center">制球</th>
              <th className="px-1 py-2 text-center">変化球</th>
              <th className="px-1 py-2 text-center">スタミナ</th>
              <th className="px-1 py-2 text-left">スカウト注目</th>
            </tr>
          </thead>
          <tbody>
            {playerList.map((p, i) => {
              const isPitcher = p.position === 'pitcher';
              const typeInfo = TYPE_LABEL[p.teamType] || TYPE_LABEL.user;
              const bestBrk = getBestBreaking(p);
              return (
                <tr key={`${p.id}-${i}`} className={`border-b border-gray-700/30 hover:bg-gray-700/30 ${i < 3 ? 'bg-gray-700/20' : ''}`}>
                  <td className="px-1.5 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-1.5 py-1.5 text-xs">
                    <button onClick={() => setDetailPlayer(p)}
                      className="font-bold text-white hover:text-accent hover:underline text-left"
                      title="クリックで選手の詳細">
                      {p.name}
                    </button>
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-gray-300 text-xs">{POSITION_NAMES[p.position] || p.position}</td>
                  <td className="px-1.5 py-1.5 text-center text-gray-300 text-xs">{p.age}</td>
                  <td className="px-1.5 py-1.5 text-xs">
                    <span className={`${typeInfo.color} inline-block max-w-[150px] truncate align-bottom`} title={p.teamName}>{p.teamAbbr}</span>
                  </td>
                  <td className={`px-1.5 py-1.5 text-center font-bold ${getOverallColor(p.overall)}`}>{p.overall}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-400' : getStatColor(p.batting?.meet || 0)}`}>{p.batting?.meet || 0}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-400' : getStatColor(p.batting?.power || 0)}`}>{p.batting?.power || 0}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-400' : getStatColor(p.physical?.speed || 0)}`}>{p.physical?.speed || 0}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-400' : getStatColor(p.fielding?.defense || 0)}`}>{p.fielding?.defense || 0}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-400' : getStatColor(p.batting?.eye || 0)}`}>{p.batting?.eye || 0}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-400' : getStatColor((p.pitching?.velocity || 130) - 100)}`}>{p.pitching?.velocity || 0}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-400' : getStatColor(p.pitching?.control || 0)}`}>{p.pitching?.control || 0}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-400' : getStatColor(bestBrk)}`}>{bestBrk}</td>
                  <td className={`px-1 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-400' : getStatColor(p.pitching?.stamina || 0)}`}>{p.pitching?.stamina || 0}</td>
                  <td className="px-1 py-1 text-xs">
                    <ScoutBadges npbScouts={p.npbScouts} amScouts={showAmScouts ? p.amScouts : null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const currentSortOptions = getSortOptions(mode);

  return (
    <ScreenShell className="text-white">
      <ScreenHeader title="能力ランキング" sub="全チーム・全選手の能力ランキング" />

      <div className="flex gap-2 mb-4">
        {[
          { key: 'player', label: '選手ランキング' },
          { key: 'team', label: 'チームランキング' },
          { key: 'highschool', label: `高校3年生${hsPlayers.length > 0 ? ` (${hsPlayers.length})` : ''}` },
          { key: 'prospects', label: '注目選手（将来性）' },
        ].map(t => (
          <button key={t.key}
            onClick={() => { setMode(t.key); setCategory('all'); setSortKey(t.key === 'highschool' ? 'draft' : 'overall'); }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              mode === t.key ? 'seg-on' : 'seg'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {mode === 'prospects' && <ProspectBoardScreen embedded />}

      {(mode === 'player' || mode === 'highschool') && (
        <>
          <div className="flex flex-wrap gap-1 mb-3">
            {[{ key: 'all', label: '全選手' }, { key: 'pitcher', label: '投手' }, { key: 'catcher', label: '捕手' }, { key: 'infielder', label: '内野手' }, { key: 'outfielder', label: '外野手' }].map(t => (
              <button key={t.key}
                onClick={() => { setCategory(t.key); setSortKey(mode === 'highschool' ? 'draft' : 'overall'); }}
                className={`px-3 py-1.5 rounded text-sm font-bold transition ${
                  category === t.key ? 'seg-on' : 'seg'
                }`}
              >{t.label}</button>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-3">
            {/* ⚠ 以下の数箇所は**地色の上に直に載る**（カードの外）ので暗い文字にすること */}
            <span className="text-xs text-ink-sub">ソート:</span>
            <div className="flex flex-wrap gap-1">
              {currentSortOptions.map(o => (
                <button key={o.key}
                  onClick={() => setSortKey(o.key)}
                  className={`px-2 py-1 rounded text-xs font-bold transition ${
                    sortKey === o.key ? 'seg-on' : 'seg'
                  }`}
                >{o.label}</button>
              ))}
            </div>
            <div className="ml-auto flex gap-1">
              {[50, 100, 200].map(n => (
                <button key={n} onClick={() => setLimit(n)}
                  className={`px-2 py-1 rounded text-xs ${limit === n ? 'seg-on' : 'seg'}`}
                >Top{n}</button>
              ))}
            </div>
          </div>

          {mode === 'player' ? (
            <>
              {renderPlayerTable(filteredPlayers, sortKey === 'draft')}
              <div className="text-xs text-ink-sub mt-2">
                全{allPlayers.length}選手{sortKey === 'draft' && hsPlayers.length > 0 ? ` + 高校生${hsPlayers.length}名` : ''}中 上位{Math.min(limit, filteredPlayers.length)}名を表示
              </div>
            </>
          ) : (
            <>
              {hsPlayers.length === 0 ? (
                <div className="text-ink-sub text-center py-8">高校3年生はまだ生成されていません（4月に生成されます）</div>
              ) : (
                <>
                  {renderPlayerTable(filteredHsPlayers, true)}
                  <div className="text-xs text-ink-sub mt-2">
                    全{hsPlayers.length}名中 上位{Math.min(limit, filteredHsPlayers.length)}名を表示
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {mode === 'team' && (
        <>
          <div className="flex flex-wrap gap-1 mb-4">
            {[
              { key: 'all', label: '全チーム' },
              { key: 'independent', label: '独立リーグ' },
              { key: 'corporate', label: '社会人' },
              { key: 'university', label: '大学' },
              { key: 'S', label: 'Sランク' },
              { key: 'A', label: 'Aランク' },
              { key: 'B', label: 'Bランク' },
              { key: 'C', label: 'Cランク' },
              { key: 'D', label: 'Dランク' },
            ].map(t => (
              <button key={t.key}
                onClick={() => setTeamRankFilter(t.key)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition ${
                  teamRankFilter === t.key
                    ? (RANK_COLORS[t.key] ? `seg-on ${RANK_COLORS[t.key]}` : 'seg-on')
                    : 'seg'
                }`}
              >{t.label}</button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredTeams.map((team, i) => {
              const typeInfo = TYPE_LABEL[team.type] || TYPE_LABEL.user;
              const rankKey = team.rank || (team.type === 'user' ? 'B' : null);
              const bgClass = rankKey ? RANK_BG[rankKey] : 'bg-surface-2 border-gray-700/50';

              return (
                <div key={`${team.type}_${team.name}`} className={`rounded-lg border p-3 ${bgClass}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-6">{i + 1}.</span>
                      <span className="font-bold text-sm">{team.name}</span>
                      <span className={`text-xs ${typeInfo.color}`}>{typeInfo.text}</span>
                      {team.rank && <span className={`text-xs font-bold ${RANK_COLORS[team.rank]}`}>{team.rank}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-300">{team.count}人</span>
                      <span>
                        総合<span className={`font-bold ml-1 ${getOverallColor(team.avg)}`}>{team.avg.toFixed(1)}</span>
                      </span>
                      <span>
                        投手<span className={`ml-1 ${getOverallColor(team.pitcherAvg)}`}>{team.pitcherAvg.toFixed(1)}</span>
                      </span>
                      <span>
                        野手<span className={`ml-1 ${getOverallColor(team.fielderAvg)}`}>{team.fielderAvg.toFixed(1)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {team.topPlayers.map((tp, j) => (
                      <span key={j} className="text-xs bg-gray-900/50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                        <span className="text-gray-400">{POSITION_NAMES[tp.position]}</span>
                        <span className="text-white">{tp.name}</span>
                        <span className={`font-bold ${getOverallColor(tp.overall)}`}>{tp.overall}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-ink-sub mt-3">
            {filteredTeams.length}チーム表示
          </div>
        </>
      )}

      {detailPlayer && <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />}
    </ScreenShell>
  );
};

export default AbilityRankingScreen;
