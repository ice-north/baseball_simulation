import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';

const NPB_TEAMS_INFO = [
  { name: '読売ジャイアンツ', short: '読売', color: '#FF6600', textColor: '#000', league: 'ce', flag: 'giants' },
  { name: '阪神タイガース', short: '阪神', color: '#FFD700', textColor: '#000', league: 'ce', flag: 'tigers' },
  { name: '横浜DeNAベイスターズ', short: '横浜DeNA', color: '#003DA5', textColor: '#fff', league: 'ce', flag: 'baystars' },
  { name: '広島東洋カープ', short: '広島東洋', color: '#CC0000', textColor: '#fff', league: 'ce', flag: 'carp' },
  { name: '中日ドラゴンズ', short: '中日', color: '#003DA5', textColor: '#fff', league: 'ce', flag: 'dragons' },
  { name: 'ヤクルトスワローズ', short: '東京ヤクルト', color: '#006633', textColor: '#fff', league: 'ce', flag: 'swallows' },
  { name: 'オリックス・バファローズ', short: 'オリックス', color: '#002D62', textColor: '#fff', league: 'pa', flag: 'buffaloes' },
  { name: 'ソフトバンクホークス', short: '福岡ソフトバンク', color: '#DAA520', textColor: '#000', league: 'pa', flag: 'hawks' },
  { name: '西武ライオンズ', short: '埼玉西武', color: '#003366', textColor: '#fff', league: 'pa', flag: 'lions' },
  { name: '楽天ゴールデンイーグルス', short: '東北楽天', color: '#8B0000', textColor: '#fff', league: 'pa', flag: 'eagles' },
  { name: '千葉ロッテマリーンズ', short: '千葉ロッテ', color: '#808080', textColor: '#fff', league: 'pa', flag: 'marines' },
  { name: '日本ハムファイターズ', short: '北海道日本ハム', color: '#004080', textColor: '#fff', league: 'pa', flag: 'fighters' },
];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const buildGridOrder = (npbStandings) => {
  if (npbStandings && npbStandings.length === 12) {
    // npbStandings = [セ1位, パ1位, セ2位, パ2位, ..., セ6位, パ6位] (or パ先)
    // グリッド配置（そのまま4列×3行）:
    // セ1位  パ1位  セ2位  パ2位
    // セ3位  パ3位  セ4位  パ4位
    // セ5位  パ5位  セ6位  パ6位
    return npbStandings.map(name =>
      NPB_TEAMS_INFO.find(t => t.name === name) || NPB_TEAMS_INFO[0]
    );
  }
  const ce = shuffle(NPB_TEAMS_INFO.filter(t => t.league === 'ce'));
  const pa = shuffle(NPB_TEAMS_INFO.filter(t => t.league === 'pa'));
  const [left, right] = Math.random() < 0.5 ? [ce, pa] : [pa, ce];
  const grid = [];
  for (let row = 0; row < 3; row++) {
    grid.push(left[row], right[row], left[row + 3], right[row + 3]);
  }
  return grid;
};

const KNOWN_ROUND_ORDER = ['ドラフト1位', 'ドラフト2位', 'ドラフト3位', 'ドラフト4位', 'ドラフト5位', 'ドラフト6位', 'ドラフト7位', 'ドラフト8位', 'ドラフト9位', 'ドラフト10位'];
const sortRoundLabel = (label) => {
  const idx = KNOWN_ROUND_ORDER.indexOf(label);
  if (idx >= 0) return idx;
  const regularMatch = label.match(/ドラフト(\d+)位/);
  if (regularMatch) return parseInt(regularMatch[1]) - 1;
  if (label.startsWith('育成')) return 100 + parseInt(label.match(/\d+/)?.[0] || '0');
  return 999;
};

const ROUND_STYLES = {
  'ドラフト1位': { badge: 'bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]', border: 'border-l-4 border-red-500', glow: 'shadow-[0_2px_16px_rgba(239,68,68,0.18)]' },
  'ドラフト2位': { badge: 'bg-orange-500 text-white', border: 'border-l-4 border-orange-500', glow: '' },
};
const DEFAULT_ROUND_STYLE = { badge: 'bg-yellow-700 text-yellow-200', border: 'border-l-4 border-yellow-600', glow: '' };
const IKU_ROUND_STYLE = { badge: 'bg-gray-600 text-gray-200', border: 'border-l-4 border-gray-500', glow: '' };

const SOURCE_LABELS = {
  highschool: { label: '高校', color: 'text-green-400 bg-green-900/40 border-green-600/40' },
  university: { label: '大学', color: 'text-blue-400 bg-blue-900/40 border-blue-600/40' },
  corporate:  { label: '社会人', color: 'text-orange-400 bg-orange-900/40 border-orange-600/40' },
  independent: { label: '独立', color: 'text-purple-400 bg-purple-900/40 border-purple-600/40' },
};

const DRAFT_POSITION_NAMES = {
  pitcher: '投手', catcher: '捕手',
  first: '内野手', second: '内野手', third: '内野手', short: '内野手',
  left: '外野手', center: '外野手', right: '外野手', dh: 'DH',
};

const COLLISION_STYLES = [
  { bg: 'bg-pink-100', border: 'border-2 border-pink-300', label: 'text-pink-600' },
  { bg: 'bg-cyan-100', border: 'border-2 border-cyan-300', label: 'text-cyan-600' },
  { bg: 'bg-green-100', border: 'border-2 border-green-300', label: 'text-green-600' },
  { bg: 'bg-yellow-100', border: 'border-2 border-yellow-400', label: 'text-yellow-600' },
  { bg: 'bg-purple-100', border: 'border-2 border-purple-300', label: 'text-purple-600' },
];

const getTeamInfo = (name) => NPB_TEAMS_INFO.find(t => t.name === name) || { short: name, color: '#666', textColor: '#fff' };

const TeamFlag = ({ teamName, size = 20 }) => {
  const info = NPB_TEAMS_INFO.find(t => t.name === teamName);
  if (!info?.flag) return null;
  return (
    <img
      src={`/flag/${info.flag}.png`}
      alt=""
      className="inline-block shrink-0"
      style={{ height: size, width: size * 1.5, objectFit: 'contain' }}
    />
  );
};

const getLotteryMissHistory = (firstRoundData) => {
  if (!firstRoundData?.phases) return {};
  const history = {};
  firstRoundData.phases.forEach((phase, pIdx) => {
    phase.lotteryResults.forEach(lr => {
      lr.competitors.forEach(team => {
        if (team !== lr.winner) {
          if (!history[team]) history[team] = [];
          history[team].push({ playerName: lr.playerName, phaseIdx: pIdx });
        }
      });
    });
  });
  return history;
};

const PlayerCardContent = ({ name, position, teamName }) => (
  <div className="w-fit mx-auto">
    <div className="text-gray-900 font-black text-lg sm:text-2xl leading-tight tracking-wide text-center">
      {name}
    </div>
    <div className="text-gray-600 text-xs sm:text-sm mt-1.5 font-medium text-left">
      {DRAFT_POSITION_NAMES[position] || position}
    </div>
    <div className="text-gray-500 text-xs mt-0.5 text-left">
      {teamName}
    </div>
  </div>
);

const DraftConferenceScreen = ({ draftedPlayers, firstRoundData, npbStandings, onComplete }) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [gridOrder] = useState(() => buildGridOrder(npbStandings));
  const timerRef = useRef(null);

  const [waiverRevealed, setWaiverRevealed] = useState(new Set());
  const [roundComplete, setRoundComplete] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const waiverRevRef = useRef(waiverRevealed);
  waiverRevRef.current = waiverRevealed;

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseState, setPhaseState] = useState('revealing');
  const [settled, setSettled] = useState({});
  const [phaseRevealed, setPhaseRevealed] = useState(new Set());
  const phaseRevRef = useRef(phaseRevealed);
  phaseRevRef.current = phaseRevealed;

  const { roundData, activeRounds } = useMemo(() => {
    const data = {};
    const rounds = [];
    const seen = new Set();
    draftedPlayers.forEach(p => {
      if (!seen.has(p.draftRound)) {
        seen.add(p.draftRound);
        rounds.push(p.draftRound);
      }
      if (!data[p.draftRound]) {
        const teamMap = {};
        NPB_TEAMS_INFO.forEach(t => { teamMap[t.name] = []; });
        data[p.draftRound] = teamMap;
      }
      if (data[p.draftRound][p.npbTeam]) {
        data[p.draftRound][p.npbTeam].push(p);
      }
    });
    const orderMap = {};
    KNOWN_ROUND_ORDER.forEach((r, i) => { orderMap[r] = i; });
    rounds.sort((a, b) => sortRoundLabel(a) - sortRoundLabel(b));
    return { roundData: data, activeRounds: rounds };
  }, [draftedPlayers]);

  const currentRound = activeRounds[currentRoundIdx];
  const currentTeamMap = currentRound ? roundData[currentRound] : null;
  const isFirstRound = currentRound === 'ドラフト1位' && firstRoundData?.phases?.length > 0;
  const isIkuRound = currentRound?.startsWith('育成');

  const rankLabels = useMemo(() => {
    if (!npbStandings || npbStandings.length !== 12) return {};
    const labels = {};
    for (let i = 0; i < 12; i++) {
      const rank = Math.floor(i / 2) + 1;
      const info = NPB_TEAMS_INFO.find(t => t.name === npbStandings[i]);
      const league = info?.league === 'ce' ? 'セ' : 'パ';
      labels[npbStandings[i]] = `${league}${rank}位`;
    }
    return labels;
  }, [npbStandings]);

  const currentPhase = isFirstRound ? (firstRoundData.phases[phaseIdx] || null) : null;
  const hasLottery = currentPhase?.lotteryResults?.length > 0;

  const phaseRevealOrder = useMemo(() => {
    if (!currentPhase) return [];
    const pos = {};
    gridOrder.forEach((t, i) => { pos[t.name] = i; });
    return currentPhase.picks.map(p => p.npbTeam).sort((a, b) => (pos[a] ?? 99) - (pos[b] ?? 99));
  }, [currentPhase, gridOrder]);

  // 各チームが最初に選択終了になるラウンドindex（本指名ラウンドのみ）
  const firstSelectionComplete = useMemo(() => {
    const result = {};
    NPB_TEAMS_INFO.forEach(t => {
      for (let i = 0; i < activeRounds.length; i++) {
        const rd = activeRounds[i];
        if (rd.startsWith('育成')) continue;
        const picks = roundData[rd]?.[t.name] || [];
        if (picks.length === 0) { result[t.name] = i; break; }
      }
    });
    return result;
  }, [roundData, activeRounds]);

  // 各チームが育成ラウンドで最初に選択終了になるラウンドindex
  const firstIkuSelectionComplete = useMemo(() => {
    const result = {};
    NPB_TEAMS_INFO.forEach(t => {
      for (let i = 0; i < activeRounds.length; i++) {
        const rd = activeRounds[i];
        if (!rd.startsWith('育成')) continue;
        const picks = roundData[rd]?.[t.name] || [];
        if (picks.length === 0) { result[t.name] = i; break; }
      }
    });
    return result;
  }, [roundData, activeRounds]);

  const waiverRevealOrder = useMemo(() => {
    if (!currentTeamMap || isFirstRound) return [];
    const isIku = currentRound?.startsWith('育成');
    const roundPicks = new Set(draftedPlayers.filter(p => p.draftRound === currentRound).map(p => p.npbTeam));
    return gridOrder.filter(t => {
      if (roundPicks.has(t.name)) return true;
      // 初回選択終了のみフラッグ開示に含める（2回目以降は即表示）
      // 育成ラウンドは育成内での初回を別途追跡
      const sc = isIku ? firstIkuSelectionComplete[t.name] : firstSelectionComplete[t.name];
      return sc === currentRoundIdx;
    }).map(t => t.name);
  }, [currentTeamMap, isFirstRound, draftedPlayers, currentRound, gridOrder, firstSelectionComplete, firstIkuSelectionComplete, currentRoundIdx]);

  const collisionColors = useMemo(() => {
    if (!currentPhase) return {};
    const colors = {};
    let idx = 0;
    const seen = {};
    const pos = {};
    gridOrder.forEach((t, i) => { pos[t.name] = i; });
    const sorted = [...currentPhase.picks].sort((a, b) => (pos[a.npbTeam] ?? 99) - (pos[b.npbTeam] ?? 99));
    for (const pick of sorted) {
      if (!phaseRevealed.has(pick.npbTeam)) continue;
      if (seen[pick.playerId]) {
        if (colors[pick.playerId] === undefined) colors[pick.playerId] = idx++;
      } else {
        seen[pick.playerId] = true;
      }
    }
    return colors;
  }, [currentPhase, phaseRevealed, gridOrder]);

  useEffect(() => {
    if (!isFirstRound || phaseState !== 'revealing') return;
    if (phaseRevealOrder.length === 0) return;
    if (!phaseRevealOrder.every(n => phaseRevealed.has(n))) return;
    setPhaseState(hasLottery ? 'allRevealed' : 'noLotteryDone');
  }, [isFirstRound, phaseState, phaseRevealed, phaseRevealOrder, hasLottery]);

  useEffect(() => {
    if (isFirstRound || roundComplete) return;
    if (waiverRevealOrder.length === 0 || waiverRevealOrder.every(n => waiverRevealed.has(n))) {
      setRoundComplete(true);
    }
  }, [isFirstRound, waiverRevealOrder, waiverRevealed, roundComplete]);

  const revealNext = useCallback(() => {
    if (isFirstRound) {
      const unrevealed = phaseRevealOrder.filter(n => !phaseRevRef.current.has(n));
      if (unrevealed.length === 0) return;
      setIsRevealing(true);
      timerRef.current = setTimeout(() => {
        setPhaseRevealed(prev => new Set([...prev, unrevealed[0]]));
        setIsRevealing(false);
      }, 500);
    } else {
      const unrevealed = waiverRevealOrder.filter(n => !waiverRevRef.current.has(n));
      if (unrevealed.length === 0) return;
      setIsRevealing(true);
      timerRef.current = setTimeout(() => {
        setWaiverRevealed(prev => new Set([...prev, unrevealed[0]]));
        setIsRevealing(false);
      }, 500);
    }
  }, [isFirstRound, phaseRevealOrder, waiverRevealOrder]);

  const revealAll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isFirstRound) {
      setPhaseRevealed(new Set(phaseRevealOrder));
    } else {
      setWaiverRevealed(new Set(waiverRevealOrder));
      setRoundComplete(true);
    }
    setIsRevealing(false);
  }, [isFirstRound, phaseRevealOrder, waiverRevealOrder]);

  const settleAndAdvance = useCallback((winnersOnly) => {
    const newSettled = { ...settled };
    if (winnersOnly && hasLottery) {
      const losers = new Set();
      currentPhase.lotteryResults.forEach(lr => {
        lr.competitors.filter(t => t !== lr.winner).forEach(t => losers.add(t));
      });
      currentPhase.picks.forEach(p => {
        if (!losers.has(p.npbTeam)) newSettled[p.npbTeam] = p;
      });
    } else {
      currentPhase.picks.forEach(p => { newSettled[p.npbTeam] = p; });
    }
    setSettled(newSettled);
    if (phaseIdx < firstRoundData.phases.length - 1) {
      setPhaseIdx(prev => prev + 1);
      setPhaseState('revealing');
      setPhaseRevealed(new Set());
    } else {
      setPhaseState('roundDone');
    }
  }, [settled, currentPhase, hasLottery, phaseIdx, firstRoundData]);

  const nextRound = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentRoundIdx < activeRounds.length - 1) {
      setCurrentRoundIdx(prev => prev + 1);
      setWaiverRevealed(new Set());
      setRoundComplete(false);
      setIsRevealing(false);
      setPhaseIdx(0);
      setPhaseState('revealing');
      setSettled({});
      setPhaseRevealed(new Set());
    } else {
      onComplete();
    }
  }, [currentRoundIdx, activeRounds.length, onComplete]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!currentRound || !currentTeamMap) { onComplete(); return null; }

  const renderFirstRoundCard = (team) => {
    const settledPick = settled[team.name];
    const phasePick = currentPhase?.picks?.find(p => p.npbTeam === team.name);
    const isInPhase = !!phasePick;
    const revealed = phaseRevealed.has(team.name);
    const rank = rankLabels[team.name];
    if (settledPick) {
      return (
        <div key={team.name} className="relative rounded-lg overflow-hidden shadow-lg flex flex-col" style={{ aspectRatio: '3/2' }}>
          <div className="flex items-center bg-gray-200 px-1 py-0.5 shrink-0" style={{ minHeight: '24px', maxHeight: '28px' }}>
            <img src={`/flag/${team.flag}.png`} alt="" className="shrink-0 object-contain" style={{ height: '20px', width: '30px' }} />
            <div className="flex-1 flex items-center justify-center gap-1 px-1 font-bold text-xs tracking-wide min-w-0">
              <span className="text-gray-600 truncate">{team.short}</span>
              {rank && <span className="text-gray-400 text-[10px] shrink-0">{rank}</span>}
            </div>
          </div>
          <div className="bg-white flex-1 flex flex-col justify-center p-2 min-h-0">
            <PlayerCardContent name={settledPick.name} position={settledPick.position} teamName={settledPick.teamName} />
          </div>
        </div>
      );
    }

    if (isInPhase) {
      const colorIdx = collisionColors[phasePick.playerId];
      const hasCollision = colorIdx !== undefined;
      const cStyle = hasCollision ? COLLISION_STYLES[colorIdx % COLLISION_STYLES.length] : null;
      const isLoser = hasLottery && currentPhase.lotteryResults.some(r =>
        r.competitors.includes(team.name) && r.winner !== team.name);
      const isWinner = hasLottery && currentPhase.lotteryResults.some(r => r.winner === team.name);

      let cardBg = 'bg-white', borderClass = '';
      if (revealed && hasCollision && cStyle) {
        if (phaseState !== 'lotteryShown' || isWinner) {
          cardBg = cStyle.bg;
          borderClass = cStyle.border;
        }
      }

      return (
        <div key={team.name} className="relative rounded-lg overflow-hidden shadow-lg flex flex-col" style={{ aspectRatio: '3/2' }}>
          <div className="flex items-center bg-gray-200 px-1 py-0.5 shrink-0" style={{ minHeight: '24px', maxHeight: '28px' }}>
            {revealed && <img src={`/flag/${team.flag}.png`} alt="" className="shrink-0 object-contain" style={{ height: '20px', width: '30px' }} />}
            <div className="flex-1 flex items-center justify-center gap-1 px-1 font-bold text-xs tracking-wide min-w-0">
              <span className="text-gray-600 truncate">{team.short}</span>
              {rank && <span className="text-gray-400 text-[10px] shrink-0">{rank}</span>}
            </div>
          </div>
          <div className={`${cardBg} ${borderClass} flex-1 flex flex-col justify-center p-2 min-h-0`}>
            {phaseState === 'lotteryShown' && isLoser ? (
              <div className="text-center">
                <div className="text-red-400 text-xs font-bold">抽選外れ</div>
                <div className="text-gray-400 text-[10px] mt-1">再指名待ち...</div>
              </div>
            ) : (
              <div className="w-full space-y-1">
                <PlayerCardContent name={phasePick.name} position={phasePick.position} teamName={phasePick.teamName} />
                {(phaseState === 'revealing' || phaseState === 'allRevealed') && hasCollision && cStyle && (
                  <div className={`text-center text-[10px] font-bold mt-1 ${cStyle.label}`}>※ 競合</div>
                )}
                {phaseState === 'lotteryShown' && isWinner && (
                  <div className="text-center text-green-600 text-[10px] font-bold mt-1">✓ 抽選当選</div>
                )}
              </div>
            )}
          </div>
          <div className="absolute inset-0 z-20"
               style={{ opacity: revealed ? 0 : 1, transition: revealed ? 'opacity 0.8s ease-out' : 'none', pointerEvents: revealed ? 'none' : 'auto' }}>
            <img src={`/flag/${team.flag}.png`} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      );
    }

    return (
      <div key={team.name} className="relative rounded-lg overflow-hidden shadow-lg flex flex-col" style={{ aspectRatio: '3/2' }}>
        <div className="flex items-center bg-gray-200 px-1 py-0.5 shrink-0" style={{ minHeight: '24px', maxHeight: '28px' }}>
          <img src={`/flag/${team.flag}.png`} alt="" className="shrink-0 object-contain" style={{ height: '20px', width: '30px' }} />
          <div className="flex-1 flex items-center justify-center gap-1 px-1 font-bold text-xs tracking-wide min-w-0">
            <span className="text-gray-600 truncate">{team.short}</span>
            {rank && <span className="text-gray-400 text-[10px] shrink-0">{rank}</span>}
          </div>
        </div>
        <div className="bg-white flex-1 flex flex-col justify-center p-2 min-h-0">
          <div className="text-gray-200 text-xs text-center">—</div>
        </div>
      </div>
    );
  };

  const renderWaiverCard = (team) => {
    const picks = currentTeamMap[team.name] || [];
    const hasPick = picks.length > 0;
    const revealed = waiverRevealed.has(team.name);
    const rank = rankLabels[team.name];
    // 初回選択終了はフラッグ開示、2回目以降は即表示（育成ラウンドは育成内での初回を追跡）
    const sc = isIkuRound ? firstIkuSelectionComplete[team.name] : firstSelectionComplete[team.name];
    const isFirstSC = !hasPick && sc === currentRoundIdx;
    const needsReveal = hasPick || isFirstSC;
    return (
      <div key={team.name} className="relative rounded-lg overflow-hidden shadow-lg flex flex-col" style={{ aspectRatio: '3/2' }}>
        <div className="flex items-center bg-gray-200 px-1 py-0.5 shrink-0" style={{ minHeight: '24px', maxHeight: '28px' }}>
          {(revealed || !needsReveal) && <img src={`/flag/${team.flag}.png`} alt="" className="shrink-0 object-contain" style={{ height: '20px', width: '30px' }} />}
          <div className="flex-1 flex items-center justify-center gap-1 px-1 font-bold text-xs tracking-wide min-w-0">
            <span className="text-gray-600 truncate">{team.short}</span>
            {rank && <span className="text-gray-400 text-[10px] shrink-0">{rank}</span>}
          </div>
        </div>
        <div className="bg-white flex-1 flex flex-col justify-center p-2 min-h-0">
          {!hasPick ? (
            <div className="text-gray-900 text-base text-center font-bold">選択終了</div>
          ) : (
            <div className="w-full space-y-1">
              {picks.map((entry, pi) => (
                <PlayerCardContent key={pi} name={entry.name} position={entry.position} teamName={entry.teamName} />
              ))}
            </div>
          )}
        </div>
        {needsReveal && (
          <div className="absolute inset-0 z-20"
               style={{ opacity: revealed ? 0 : 1, transition: revealed ? 'opacity 0.8s ease-out' : 'none', pointerEvents: revealed ? 'none' : 'auto' }}>
            <img src={`/flag/${team.flag}.png`} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    );
  };

  const renderButtons = () => {
    if (isFirstRound) {
      if (phaseState === 'revealing') {
        const allDone = phaseRevealOrder.every(n => phaseRevealed.has(n));
        return (
          <>
            <button onClick={revealNext} disabled={isRevealing || allDone}
              className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-red-500/30 active:scale-95">
              次の指名を発表
            </button>
            <button onClick={revealAll} className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2.5 rounded-lg font-bold text-sm transition active:scale-95">一斉発表</button>
            <button onClick={onComplete} className="text-gray-500 hover:text-gray-300 text-xs transition underline">スキップ</button>
          </>
        );
      }
      if (phaseState === 'allRevealed') {
        return (
          <>
            <button onClick={() => setPhaseState('lotteryShown')}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-red-500/30 active:scale-95">
              抽選を行う
            </button>
            <button onClick={onComplete} className="text-gray-500 hover:text-gray-300 text-xs transition underline">スキップ</button>
          </>
        );
      }
      if (phaseState === 'lotteryShown') {
        const loserCount = currentPhase.lotteryResults.reduce((sum, lr) => sum + lr.competitors.length - 1, 0);
        const hasMore = phaseIdx < firstRoundData.phases.length - 1;
        return (
          <>
            <button onClick={() => settleAndAdvance(true)}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-red-500/30 active:scale-95">
              {hasMore ? `外れ${loserCount}チーム 再指名へ` : '1巡目確定'}
            </button>
            <button onClick={onComplete} className="text-gray-500 hover:text-gray-300 text-xs transition underline">スキップ</button>
          </>
        );
      }
      if (phaseState === 'noLotteryDone') {
        return (
          <>
            <button onClick={() => settleAndAdvance(false)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-blue-500/30 active:scale-95">
              確定
            </button>
            <button onClick={onComplete} className="text-gray-500 hover:text-gray-300 text-xs transition underline">スキップ</button>
          </>
        );
      }
      return (
        <>
          <button onClick={nextRound}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-blue-500/30 active:scale-95">
            {currentRoundIdx < activeRounds.length - 1 ? `次のラウンドへ → ${activeRounds[currentRoundIdx + 1]}` : '結果一覧へ →'}
          </button>
          <button onClick={onComplete} className="text-gray-500 hover:text-gray-300 text-xs transition underline">スキップ</button>
        </>
      );
    }
    if (!roundComplete) {
      return (
        <>
          <button onClick={revealNext} disabled={isRevealing || waiverRevealOrder.every(n => waiverRevealed.has(n))}
            className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-red-500/30 active:scale-95">
            次の指名を発表
          </button>
          <button onClick={revealAll} className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2.5 rounded-lg font-bold text-sm transition active:scale-95">一斉発表</button>
          <button onClick={onComplete} className="text-gray-500 hover:text-gray-300 text-xs transition underline">スキップ</button>
        </>
      );
    }
    return (
      <>
        <button onClick={nextRound}
          className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-blue-500/30 active:scale-95">
          {currentRoundIdx < activeRounds.length - 1 ? `次のラウンドへ → ${activeRounds[currentRoundIdx + 1]}` : '結果一覧へ →'}
        </button>
        <button onClick={onComplete} className="text-gray-500 hover:text-gray-300 text-xs transition underline">スキップ</button>
      </>
    );
  };

  const renderLotteryPanel = () => {
    if (!isFirstRound || !hasLottery) return null;
    if (phaseState === 'allRevealed') {
      return (
        <div className="max-w-3xl mx-auto mb-4">
          <div className="bg-white/90 rounded-lg p-4 shadow-lg">
            <h3 className="text-gray-900 font-black text-base mb-3 text-center">競合指名</h3>
            <div className="space-y-2">
              {currentPhase.lotteryResults.map((lr, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-3 flex-wrap">
                  <span className="text-gray-900 font-black text-sm">{lr.playerName}</span>
                  <span className="text-gray-400 text-xs">←</span>
                  {lr.competitors.map(t => {
                    const ti = getTeamInfo(t);
                    return <span key={t} className="text-xs font-bold px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ backgroundColor: ti.color, color: ti.textColor }}><TeamFlag teamName={t} size={14} />{ti.short}</span>;
                  })}
                  <span className="text-gray-500 text-xs ml-auto">{lr.competitors.length}球団競合</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    if (phaseState === 'lotteryShown') {
      return (
        <div className="max-w-3xl mx-auto mb-4">
          <div className="bg-white/90 rounded-lg p-4 shadow-lg">
            <h3 className="text-gray-900 font-black text-base mb-3 text-center">抽選結果</h3>
            <div className="space-y-2">
              {currentPhase.lotteryResults.map((lr, idx) => {
                const winnerInfo = getTeamInfo(lr.winner);
                return (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-3 flex-wrap">
                    <span className="text-gray-900 font-black text-sm">{lr.playerName}</span>
                    <span className="text-gray-400 text-xs">→</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ backgroundColor: winnerInfo.color, color: winnerInfo.textColor }}>
                      <TeamFlag teamName={lr.winner} size={14} />
                      {winnerInfo.short} 当選
                    </span>
                    <span className="text-gray-400 text-xs ml-2">
                      ({lr.competitors.filter(t => t !== lr.winner).map(t => getTeamInfo(t).short).join('・')} 外れ)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const statusText = () => {
    if (isFirstRound) {
      const phaseLabel = phaseIdx === 0 ? '' : `外れ${'外れ'.repeat(phaseIdx - 1)}1位 — `;
      if (phaseState === 'revealing') {
        const count = phaseRevealOrder.filter(n => phaseRevealed.has(n)).length;
        return `${phaseLabel}${count} / ${phaseRevealOrder.length} 球団発表済み`;
      }
      if (phaseState === 'allRevealed') return `${phaseLabel}競合あり — 抽選待ち`;
      if (phaseState === 'lotteryShown') return `${phaseLabel}抽選結果`;
      if (phaseState === 'noLotteryDone') return `${phaseLabel}全チーム確定`;
      return '1巡目確定';
    }
    return `${waiverRevealed.size} / ${waiverRevealOrder.length} 球団発表済み`;
  };

  const roundBadgeLabel = isIkuRound ? currentRound : currentRound;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 via-green-900 to-green-950 p-3 sm:p-6">
      <div className="text-center mb-5">
        <div className="text-green-300/60 text-[10px] tracking-[0.3em] uppercase mb-0.5">NPB Draft Conference</div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">プロ野球ドラフト会議</h1>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-red-500/60" />
          <span className={`text-sm font-black px-4 py-1.5 rounded-lg ${
            currentRound === 'ドラフト1位' ? 'bg-red-600 text-white shadow-lg shadow-red-500/30' :
            isIkuRound ? 'bg-gray-600 text-white' :
            'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
          }`}>
            {roundBadgeLabel}
            {isFirstRound && phaseIdx > 0 && ` (外れ${'外れ'.repeat(phaseIdx - 1)}1位)`}
          </span>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-red-500/60" />
        </div>
        <div className="text-gray-500 text-xs mt-1.5 mb-1">
          {currentRoundIdx + 1} / {activeRounds.length} ラウンド
          {isFirstRound && ' (入札制)'}
          {!isFirstRound && currentRoundIdx % 2 === 1 && ' (ウェーバー制 ← 下位球団から)'}
          {!isFirstRound && currentRoundIdx % 2 === 0 && ' (逆ウェーバー制 → 上位球団から)'}
        </div>
        <div className="max-w-xs mx-auto flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${((currentRoundIdx + 1) / activeRounds.length) * 100}%`,
                background: `linear-gradient(90deg, #ef4444, #f59e0b ${Math.min(100, ((currentRoundIdx + 1) / activeRounds.length) * 150)}%, #22c55e)`,
              }}
            />
          </div>
          <span className="text-[10px] text-gray-500 whitespace-nowrap">{Math.round(((currentRoundIdx + 1) / activeRounds.length) * 100)}%</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {gridOrder.map(team => isFirstRound ? renderFirstRoundCard(team) : renderWaiverCard(team))}
      </div>

      {renderLotteryPanel()}

      <div className="max-w-5xl mx-auto flex items-center justify-center gap-3 flex-wrap">
        {renderButtons()}
      </div>

      <div className="text-center mt-3 text-gray-600 text-xs">{statusText()}</div>
    </div>
  );
};

const PITCH_NAMES = {
  straight: 'ストレート', slider: 'スライダー', curve: 'カーブ',
  fork: 'フォーク', changeup: 'チェンジアップ', sinker: 'シンカー',
  shoot: 'シュート', cutter: 'カッター', splitter: 'スプリッター',
  twoSeam: 'ツーシーム', palm: 'パーム', knuckle: 'ナックル',
};
const FORM_NAMES = { overhand: 'オーバー', threeQuarter: 'スリークォーター', sidearm: 'サイド', submarine: 'アンダー' };
const FULL_POS_NAMES = { pitcher: '投手', catcher: '捕手', first: '一塁手', second: '二塁手', third: '三塁手', short: '遊撃手', left: '左翼手', center: '中堅手', right: '右翼手' };

const TRAIT_NAMES = {
  speedster: '俊足', slugger: '強打者', defender: '守備職人', contactHitter: '巧打者',
  eyeMaster: '選球眼', baserunner: '走塁巧者', armStrong: '強肩', speedContact: '俊足巧打',
  powerArm: '強肩強打', fireballer: '速球派', controlPitcher: '制球派', ironman: '鉄腕',
  breakingBall: '変化球', sinkerballer: 'シンカーボーラー', strikeoutArtist: '奪三振',
};

const StatBar = ({ label, value, suffix, maxVal }) => {
  const max = maxVal || 100;
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 text-xs w-16 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{
          width: `${pct}%`,
          backgroundColor: value >= 80 ? '#ef4444' : value >= 60 ? '#f59e0b' : value >= 40 ? '#3b82f6' : '#9ca3af'
        }} />
      </div>
      <span className={`text-xs font-bold w-10 text-right ${getAbilityColor(maxVal === 170 ? value / 1.7 : value)}`}>
        {value}{suffix || ''}
      </span>
    </div>
  );
};

const DraftPlayerDetail = ({ player }) => {
  if (!player) return null;
  const p = player;
  const isPitcher = p.position === 'pitcher';
  const bats = p.batting?.bats === 'left' ? '左' : p.batting?.bats === 'switch' ? '両' : '右';
  const throws = p.physical?.throws === 'left' ? '左' : '右';
  const build = p.physical?.build === 'large' ? '大柄' : p.physical?.build === 'small' ? '小柄' : '中肉';
  const traits = p.traits || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
        <span className="font-semibold text-gray-800">{FULL_POS_NAMES[p.position] || p.position}</span>
        <span className="px-1.5 py-0.5 bg-gray-100 rounded">{throws}投{bats}打</span>
        <span className="px-1.5 py-0.5 bg-gray-100 rounded">{build}</span>
        {isPitcher && p.pitching?.form && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{FORM_NAMES[p.pitching.form] || p.pitching.form}</span>}
      </div>

      {traits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {traits.map((t, i) => (
            <span key={i} className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded">
              {TRAIT_NAMES[t] || t}
            </span>
          ))}
        </div>
      )}

      {isPitcher && (
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">投球能力</div>
          <div className="space-y-1">
            <StatBar label="球速" value={p.pitching?.velocity || 0} suffix="km" maxVal={170} />
            <StatBar label="制球" value={p.pitching?.control || 0} />
            <StatBar label="スタミナ" value={p.pitching?.stamina || 0} />
          </div>
          {p.pitching?.arsenal?.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">球種</div>
              <div className="flex flex-wrap gap-1.5">
                {p.pitching.arsenal.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 text-xs">
                    <span className="text-gray-700">{PITCH_NAMES[b.type] || b.type}</span>
                    <span className={`font-bold ${getAbilityColor(b.level)}`}>{b.level}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">打撃能力</div>
        <div className="space-y-1">
          <StatBar label="ミート" value={p.batting?.meet || 0} />
          <StatBar label="パワー" value={p.batting?.power || 0} />
          <StatBar label="選球眼" value={p.batting?.eye || 0} />
          <StatBar label="盗塁" value={p.batting?.steal || 0} />
          {p.batting?.bunt != null && <StatBar label="バント" value={p.batting.bunt} />}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">フィジカル</div>
        <div className="space-y-1">
          <StatBar label="走力" value={p.physical?.speed || 0} />
          <StatBar label="肩力" value={p.physical?.arm || 0} />
          <StatBar label="守備" value={p.fielding?.defense || 0} />
          {p.physical?.bodyStamina != null && <StatBar label="体力" value={p.physical.bodyStamina} />}
          {p.physical?.recovery != null && <StatBar label="回復" value={p.physical.recovery} />}
        </div>
      </div>

      {p.position === 'catcher' && p.catching?.lead != null && (
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">捕手能力</div>
          <StatBar label="リード" value={p.catching.lead} />
        </div>
      )}

      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">素質</div>
        <div className="space-y-1">
          {p.growthPotential != null && <StatBar label="成長力" value={Math.round(p.growthPotential * 50)} />}
          {p.personality?.discipline != null && <StatBar label="プロ意識" value={p.personality.discipline} />}
          {p.personality?.mental != null && <StatBar label="精神力" value={p.personality.mental} />}
        </div>
      </div>
    </div>
  );
};

const DraftPlayerModal = ({ entry, onClose }) => {
  if (!entry) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white rounded-t-2xl px-5 py-3.5 border-b border-gray-200 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
              entry.draftRound === 'ドラフト1位' ? 'bg-red-100 text-red-700' :
              entry.draftRound?.startsWith('育成') ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'
            }`}>{entry.draftRound?.replace('ドラフト', '')}</span>
            <span className="font-bold text-gray-900 text-lg">{entry.name}</span>
            <span className="text-gray-400 text-sm">({entry.age}歳)</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors">✕</button>
        </div>
        <div className="px-5 py-4">
          <div className="text-xs text-gray-500 mb-3">{entry.teamName} / {DRAFT_POSITION_NAMES[entry.position] || entry.position}</div>
          <DraftPlayerDetail player={entry.player} />
        </div>
      </div>
    </div>
  );
};

const DraftTeamSummaryScreen = ({ draftedPlayers, firstRoundData, npbStandings, onContinue }) => {
  const [summaryGrid] = useState(() => buildGridOrder(npbStandings));
  const [selectedEntry, setSelectedEntry] = useState(null);
  const teamPicks = useMemo(() => {
    const map = {};
    NPB_TEAMS_INFO.forEach(t => { map[t.name] = []; });
    draftedPlayers.forEach(p => { if (map[p.npbTeam]) map[p.npbTeam].push(p); });
    return map;
  }, [draftedPlayers]);

  const missHistory = useMemo(() => getLotteryMissHistory(firstRoundData), [firstRoundData]);

  const sortRound = sortRoundLabel;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 via-green-900 to-green-950 p-3 sm:p-6">
      <div className="text-center mb-5">
        <div className="text-green-300/60 text-[10px] tracking-[0.3em] uppercase mb-0.5">NPB Draft Results</div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">全球団指名一覧</h1>
      </div>
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {summaryGrid.map(team => {
          const picks = teamPicks[team.name] || [];
          if (picks.length === 0) return null;
          const sorted = [...picks].sort((a, b) => sortRound(a.draftRound) - sortRound(b.draftRound));
          const misses = missHistory[team.name] || [];
          return (
            <div key={team.name} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-1.5 font-bold text-xs sm:text-sm tracking-wide" style={{ backgroundColor: team.color, color: team.textColor }}>
                <TeamFlag teamName={team.name} size={20} />
                <span>{team.name} ({picks.length}名)</span>
              </div>
              <div className="divide-y divide-gray-200">
                {sorted.map((entry, idx) => {
                  const isFirst = entry.draftRound === 'ドラフト1位';
                  const displayLabel = entry.draftRound.replace('ドラフト', '');
                  return (
                    <div key={idx}>
                      {isFirst && misses.length > 0 && (
                        <div className="px-3 py-1.5 bg-red-50">
                          {misses.map((m, mi) => (
                            <div key={mi} className="flex items-center gap-1.5 text-red-400 text-[10px]">
                              <span className="font-bold">✕ 外れ{mi > 0 ? '外れ'.repeat(mi) : ''}</span>
                              <span>{m.playerName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                           onClick={() => setSelectedEntry(entry)}>
                        <div className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            isFirst ? 'bg-red-100 text-red-700' :
                            entry.draftRound.startsWith('育成') ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'
                          }`}>{displayLabel}</span>
                          <span className="text-gray-900 font-bold text-sm shrink-0">{entry.name}</span>
                          <span className="text-gray-500 text-xs shrink-0">({entry.age})</span>
                          <span className="text-gray-500 text-xs shrink-0">{DRAFT_POSITION_NAMES[entry.position] || entry.position}</span>
                          <span className="text-gray-400 text-xs truncate">{entry.teamName}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-center">
        <button onClick={onContinue} className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-3 rounded-xl font-bold text-base transition-all duration-200 shadow-lg hover:shadow-blue-500/30 active:scale-95">
          結果詳細へ →
        </button>
      </div>
      <DraftPlayerModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
};

const DraftSummaryScreen = ({ draftedPlayers, nearMissPlayers, proBonus, draftBySource, userTeamName, onContinue }) => {
  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;
  const myTeamDrafted = draftedPlayers.filter(d => d.teamName === userTeamName);
  const myTeamProBonus = proBonus?.filter(b => b.teamName === userTeamName) || [];
  const myTeamNearMiss = nearMissPlayers?.filter(n => n.teamName === userTeamName) || [];

  const sortRound = sortRoundLabel;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <style>{`
        @keyframes slideInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        .draft-card { animation: slideInUp 0.45s cubic-bezier(.22,.68,0,1.2) both; }
        .gold-shimmer { background: linear-gradient(90deg, #f59e0b 0%, #fde68a 40%, #f59e0b 60%, #b45309 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 3s linear infinite; }
      `}</style>

      <div className="text-center mb-6">
        <p className="text-gray-400 text-sm font-semibold tracking-[0.2em] uppercase mb-1">NPB Draft</p>
        <h1 className="text-4xl font-black text-white tracking-tight">ドラフト結果</h1>
        <div className="flex items-center justify-center gap-3 mt-2">
          <div className="h-px w-20 bg-gradient-to-r from-transparent to-yellow-500/80" />
          <span className="gold-shimmer text-base font-black">{userTeamName}</span>
          <div className="h-px w-20 bg-gradient-to-l from-transparent to-yellow-500/80" />
        </div>
      </div>

      {draftBySource && hasDrafted && (
        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          {[['highschool', '高校'], ['university', '大学'], ['corporate', '社会人'], ['independent', '独立']].map(([key, label]) => (
            <div key={key} className="bg-gray-800/80 rounded-xl px-4 py-2 border border-gray-700/50 text-center min-w-[80px]">
              <div className="text-xs text-gray-400">{label}</div>
              <div className={`text-lg font-black ${SOURCE_LABELS[key]?.color?.split(' ')[0] || 'text-white'}`}>{draftBySource[key] || 0}名</div>
            </div>
          ))}
          <div className="bg-gray-800/80 rounded-xl px-4 py-2 border border-yellow-600/40 text-center min-w-[80px]">
            <div className="text-xs text-yellow-400">全体</div>
            <div className="text-lg font-black text-yellow-300">{draftBySource.total || 0}名</div>
          </div>
        </div>
      )}

      {myTeamDrafted.length > 0 ? (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 mb-4">
          <h2 className="text-base font-black text-yellow-400 mb-3 flex items-center gap-2">
            自チームからの指名選手
            <span className="ml-auto text-sm font-bold text-gray-400">{myTeamDrafted.length}名</span>
          </h2>
          <div className="space-y-2.5">
            {[...myTeamDrafted].sort((a, b) => sortRound(a.draftRound) - sortRound(b.draftRound)).map((entry, idx) => {
              const style = ROUND_STYLES[entry.draftRound] || (entry.draftRound.startsWith('育成') ? IKU_ROUND_STYLE : DEFAULT_ROUND_STYLE);
              const filteredReasons = entry.reasons.filter(r => !/ミート|パワー|選球眼|走力|守備|肩力|盗塁|球速|制球|スタミナ|俊足/.test(r));
              return (
                <div key={idx} className={`draft-card bg-gray-700/60 rounded-xl p-3.5 ${style.border} ${style.glow}`} style={{ animationDelay: `${idx * 0.07}s` }}>
                  <div className="flex items-center gap-2.5 whitespace-nowrap overflow-hidden">
                    <span className={`font-black text-sm px-2.5 py-1 rounded-lg shrink-0 ${style.badge}`}>{entry.draftRound || '指名'}</span>
                    <span className="text-yellow-300 font-bold text-base shrink-0 flex items-center gap-1">
                      <TeamFlag teamName={entry.npbTeam} size={16} />
                      {entry.npbTeam}
                    </span>
                    <span className="text-white font-black text-lg shrink-0">{entry.name}</span>
                    <span className="text-gray-400 text-sm shrink-0">{entry.age}歳</span>
                    <span className="text-blue-400 font-semibold text-sm shrink-0">{POSITION_NAMES[entry.position] || entry.position}</span>
                    {entry.player?.physical && entry.player?.batting && (
                      <span className="text-sm shrink-0">
                        <span className={entry.player.physical.throws === 'left' ? 'text-green-400 font-bold' : 'text-gray-400'}>
                          {entry.player.physical.throws === 'left' ? '左' : '右'}投
                        </span>
                        <span className={entry.player.batting.bats === 'left' ? 'text-green-400 font-bold' : entry.player.batting.bats === 'switch' ? 'text-purple-400 font-bold' : 'text-gray-400'}>
                          {entry.player.batting.bats === 'left' ? '左' : entry.player.batting.bats === 'switch' ? '両' : '右'}打
                        </span>
                      </span>
                    )}
                  </div>
                  {filteredReasons.length > 0 && (
                    <div className="text-sm text-yellow-300/70 mt-2 pl-1 border-t border-gray-600/40 pt-1.5">{filteredReasons.join('  /  ')}</div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-gray-500 text-sm mt-3">指名された選手はチームから離脱し、NPBへ移籍しました。</p>
        </div>
      ) : (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-10 mb-4 text-center">
          <p className="text-gray-200 font-bold text-lg mb-1">今シーズン、自チームからのNPB指名はありませんでした</p>
          <p className="text-gray-500 text-sm">選手がドラフト指名条件に達しませんでした。来シーズンに期待しましょう。</p>
        </div>
      )}

      {myTeamProBonus.length > 0 && (
        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-2xl p-4 mb-4 border border-green-600/30">
          <h2 className="text-base font-black text-green-400 mb-3">プロ輩出ボーナス</h2>
          <div className="space-y-2">
            {myTeamProBonus.map((bonus, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-bold text-base">{bonus.teamName}</span>
                  <span className="text-green-400 font-black text-base">+{bonus.reputationGain} 育成評判</span>
                </div>
                <div className="text-gray-400 text-sm flex gap-4 flex-wrap">
                  <span>プロ輩出 {bonus.draftCount}人</span>
                  <span>育成評判 {bonus.currentReputation}pt</span>
                  {bonus.boostedYoungPlayers > 0 && <span className="text-green-300 font-semibold">若手{bonus.boostedYoungPlayers}人が刺激を受けて成長!</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myTeamNearMiss.length > 0 && (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 mb-4">
          <h2 className="text-base font-black text-gray-300 mb-3">NPB候補に迫る選手</h2>
          <div className="space-y-1.5">
            {myTeamNearMiss.slice(0, 10).map((entry, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold text-base">{entry.name}</span>
                  <span className="text-gray-400 text-sm">{entry.age}歳</span>
                  <span className="text-blue-400 font-semibold text-sm">{POSITION_NAMES[entry.position] || entry.position}</span>
                </div>
                <div className="text-sm text-orange-300/80">{entry.reasons.join(' / ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center pt-2">
        <button onClick={onContinue}
          className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-12 py-3.5 rounded-xl font-black text-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/30 hover:scale-105 active:scale-95">
          次へ進む →
        </button>
      </div>
    </div>
  );
};

const DraftTitleOverlay = ({ onComplete }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFading(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fading) {
      const timer = setTimeout(onComplete, 600);
      return () => clearTimeout(timer);
    }
  }, [fading, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center pl-56 cursor-pointer transition-opacity duration-[600ms] ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => setFading(true)}
    >
      <style>{`
        @keyframes draftTitleIn {
          0% { opacity: 0; letter-spacing: 0.5em; }
          25% { opacity: 1; letter-spacing: 0.3em; }
          65% { opacity: 1; letter-spacing: 0.3em; }
          100% { opacity: 0; letter-spacing: 0.2em; }
        }
        @keyframes draftSubIn {
          0% { opacity: 0; }
          30% { opacity: 0; }
          50% { opacity: 0.6; }
          65% { opacity: 0.6; }
          100% { opacity: 0; }
        }
      `}</style>
      <div className="text-center">
        <h1 className="text-4xl sm:text-6xl font-black text-white" style={{ animation: 'draftTitleIn 3s ease-in-out forwards' }}>
          プロ野球ドラフト会議
        </h1>
        <div className="mt-6 text-gray-400 text-sm tracking-[0.4em] uppercase" style={{ animation: 'draftSubIn 3s ease-in-out forwards' }}>
          NPB Draft Conference
        </div>
      </div>
    </div>
  );
};

const DraftResultScreen = ({ draftedPlayers, nearMissPlayers, proBonus, draftBySource, firstRoundData, npbStandings, userTeamName, onContinue }) => {
  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;
  const [phase, setPhase] = useState(() => hasDrafted ? 'title' : 'summary');
  const [showTitleOverlay, setShowTitleOverlay] = useState(() => hasDrafted);

  const handleTitleComplete = useCallback(() => {
    setShowTitleOverlay(false);
    setPhase('conference');
  }, []);

  const conferenceVisible = (phase === 'title' || phase === 'conference') && hasDrafted;

  return (
    <>
      {conferenceVisible && (
        <DraftConferenceScreen draftedPlayers={draftedPlayers} firstRoundData={firstRoundData} npbStandings={npbStandings} onComplete={() => setPhase('teamSummary')} />
      )}
      {phase === 'teamSummary' && hasDrafted && (
        <DraftTeamSummaryScreen draftedPlayers={draftedPlayers} firstRoundData={firstRoundData} npbStandings={npbStandings} onContinue={() => setPhase('summary')} />
      )}
      {phase === 'summary' && (
        <DraftSummaryScreen draftedPlayers={draftedPlayers} nearMissPlayers={nearMissPlayers} proBonus={proBonus}
          draftBySource={draftBySource} userTeamName={userTeamName} onContinue={onContinue} />
      )}
      {showTitleOverlay && (
        <DraftTitleOverlay onComplete={handleTitleComplete} />
      )}
    </>
  );
};

export default DraftResultScreen;
