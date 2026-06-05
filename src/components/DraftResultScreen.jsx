import React, { useState, useEffect, useCallback, useRef } from 'react';
import { POSITION_NAMES } from '../utils/constants.js';

const NPB_TEAMS_INFO = [
  { name: '読売ジャイアンツ', short: '巨人', color: '#FF6600', textColor: '#000' },
  { name: '阪神タイガース', short: '阪神', color: '#FFD700', textColor: '#000' },
  { name: '横浜DeNAベイスターズ', short: 'DeNA', color: '#003DA5', textColor: '#fff' },
  { name: '広島東洋カープ', short: '広島', color: '#CC0000', textColor: '#fff' },
  { name: '中日ドラゴンズ', short: '中日', color: '#003DA5', textColor: '#fff' },
  { name: 'ヤクルトスワローズ', short: 'ヤクルト', color: '#006633', textColor: '#fff' },
  { name: 'オリックス・バファローズ', short: 'オリックス', color: '#002D62', textColor: '#fff' },
  { name: 'ソフトバンクホークス', short: 'ソフトバンク', color: '#DAA520', textColor: '#000' },
  { name: '西武ライオンズ', short: '西武', color: '#003366', textColor: '#fff' },
  { name: '楽天ゴールデンイーグルス', short: '楽天', color: '#8B0000', textColor: '#fff' },
  { name: '千葉ロッテマリーンズ', short: 'ロッテ', color: '#000080', textColor: '#fff' },
  { name: '日本ハムファイターズ', short: '日本ハム', color: '#004080', textColor: '#fff' },
];

const ROUND_ORDER = ['ドラフト1位', 'ドラフト2位', 'ドラフト3位', 'ドラフト4位', 'ドラフト5位', 'ドラフト6位', '育成指名'];

const ROUND_STYLES = {
  'ドラフト1位': {
    badge: 'bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    border: 'border-l-4 border-red-500',
    glow: 'shadow-[0_2px_16px_rgba(239,68,68,0.18)]',
  },
  'ドラフト2位': {
    badge: 'bg-orange-500 text-white',
    border: 'border-l-4 border-orange-500',
    glow: '',
  },
  '育成指名': {
    badge: 'bg-gray-600 text-gray-200',
    border: 'border-l-4 border-gray-500',
    glow: '',
  },
};
const DEFAULT_ROUND_STYLE = {
  badge: 'bg-yellow-700 text-yellow-200',
  border: 'border-l-4 border-yellow-600',
  glow: '',
};

const SOURCE_LABELS = {
  highschool: { label: '高校', color: 'text-green-400 bg-green-900/40 border-green-600/40' },
  university: { label: '大学', color: 'text-blue-400 bg-blue-900/40 border-blue-600/40' },
  corporate:  { label: '社会人', color: 'text-orange-400 bg-orange-900/40 border-orange-600/40' },
  independent: { label: '独立', color: 'text-purple-400 bg-purple-900/40 border-purple-600/40' },
};

const DraftConferenceScreen = ({ draftedPlayers, onComplete }) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [revealedTeams, setRevealedTeams] = useState(new Set());
  const [isRevealing, setIsRevealing] = useState(false);
  const [roundComplete, setRoundComplete] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const timerRef = useRef(null);

  const roundData = React.useMemo(() => {
    const data = {};
    ROUND_ORDER.forEach(round => {
      const teamMap = {};
      NPB_TEAMS_INFO.forEach(t => { teamMap[t.name] = []; });
      const roundPlayers = draftedPlayers.filter(p => p.draftRound === round);
      roundPlayers.forEach(p => {
        if (teamMap[p.npbTeam]) teamMap[p.npbTeam].push(p);
      });
      if (roundPlayers.length > 0) data[round] = teamMap;
    });
    return data;
  }, [draftedPlayers]);

  const activeRounds = ROUND_ORDER.filter(r => roundData[r]);
  const currentRound = activeRounds[currentRoundIdx];
  const currentTeamMap = currentRound ? roundData[currentRound] : null;

  const teamsWithPicks = React.useMemo(() => {
    if (!currentTeamMap) return [];
    return NPB_TEAMS_INFO.filter(t => currentTeamMap[t.name]?.length > 0);
  }, [currentTeamMap]);

  const allRevealed = teamsWithPicks.length > 0 && teamsWithPicks.every(t => revealedTeams.has(t.name));

  useEffect(() => {
    if (allRevealed && !roundComplete) setRoundComplete(true);
  }, [allRevealed, roundComplete]);

  const revealNext = useCallback(() => {
    if (!teamsWithPicks.length || isRevealing) return;
    const unrevealed = teamsWithPicks.filter(t => !revealedTeams.has(t.name));
    if (unrevealed.length === 0) return;
    setIsRevealing(true);
    const next = unrevealed[0];
    timerRef.current = setTimeout(() => {
      setRevealedTeams(prev => new Set([...prev, next.name]));
      setIsRevealing(false);
    }, 600);
  }, [teamsWithPicks, revealedTeams, isRevealing]);

  useEffect(() => {
    if (autoMode && !isRevealing && !roundComplete && teamsWithPicks.length > 0) {
      const unrevealed = teamsWithPicks.filter(t => !revealedTeams.has(t.name));
      if (unrevealed.length > 0) {
        timerRef.current = setTimeout(() => { revealNext(); }, 800);
      }
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [autoMode, isRevealing, roundComplete, revealedTeams, teamsWithPicks, revealNext]);

  const revealAll = useCallback(() => {
    setAutoMode(false);
    const allNames = teamsWithPicks.map(t => t.name);
    setRevealedTeams(new Set(allNames));
    setRoundComplete(true);
  }, [teamsWithPicks]);

  const nextRound = useCallback(() => {
    if (currentRoundIdx < activeRounds.length - 1) {
      setCurrentRoundIdx(prev => prev + 1);
      setRevealedTeams(new Set());
      setRoundComplete(false);
      setAutoMode(false);
    } else {
      onComplete();
    }
  }, [currentRoundIdx, activeRounds.length, onComplete]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!currentRound || !currentTeamMap) {
    onComplete();
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 p-3 sm:p-6">
      <style>{`
        @keyframes cardReveal {
          0% { opacity: 0; transform: perspective(600px) rotateY(90deg) scale(0.9); }
          50% { opacity: 1; transform: perspective(600px) rotateY(-5deg) scale(1.02); }
          100% { opacity: 1; transform: perspective(600px) rotateY(0deg) scale(1); }
        }
        @keyframes confettiDrop {
          0% { opacity: 1; transform: translateY(-10px) rotate(0deg); }
          100% { opacity: 0; transform: translateY(40px) rotate(180deg); }
        }
        .card-reveal { animation: cardReveal 0.6s cubic-bezier(.22,.68,0,1.1) forwards; }
      `}</style>

      {/* ヘッダー */}
      <div className="text-center mb-5">
        <div className="text-gray-400 text-[10px] tracking-[0.3em] uppercase mb-0.5">NPB Draft Conference</div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">プロ野球ドラフト会議</h1>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-red-400/60" />
          <span className={`text-sm font-black px-4 py-1.5 rounded-lg ${
            currentRound === 'ドラフト1位' ? 'bg-red-600 text-white shadow-lg shadow-red-500/30' :
            currentRound === '育成指名' ? 'bg-gray-600 text-white' :
            'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
          }`}>
            {currentRound}
          </span>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-red-400/60" />
        </div>
        <div className="text-gray-400 text-xs mt-1.5">
          {currentRoundIdx + 1} / {activeRounds.length} ラウンド
        </div>
      </div>

      {/* 3×4 球団グリッド — 白背景カード */}
      <div className="max-w-5xl mx-auto grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {NPB_TEAMS_INFO.map(team => {
          const picks = currentTeamMap[team.name] || [];
          const hasPick = picks.length > 0;
          const isRevealed = revealedTeams.has(team.name);

          return (
            <div
              key={team.name}
              className="relative rounded-lg overflow-hidden shadow-md border border-gray-200"
              style={{ minHeight: '150px' }}
            >
              {/* 球団ヘッダー */}
              <div
                className="px-3 py-1.5 text-center font-bold text-sm tracking-wide"
                style={{ backgroundColor: team.color, color: team.textColor }}
              >
                {team.short}
              </div>

              {/* 選手表示エリア — 白背景 */}
              <div className="bg-white p-3 flex flex-col items-center justify-center" style={{ minHeight: '115px' }}>
                {!hasPick ? (
                  <div className="text-gray-300 text-xs">指名なし</div>
                ) : !isRevealed ? (
                  <div className="text-center">
                    <div className="text-3xl sm:text-4xl mb-1 opacity-30 select-none">?</div>
                    <div className="text-gray-300 text-[10px]">未発表</div>
                  </div>
                ) : (
                  <div className="card-reveal text-center w-full space-y-1">
                    {picks.map((entry, pi) => (
                      <div key={pi}>
                        <div className="text-gray-900 font-black text-lg sm:text-xl leading-tight tracking-wide">
                          {entry.name}
                        </div>
                        <div className="text-gray-600 text-xs sm:text-sm mt-1 font-medium">
                          {POSITION_NAMES[entry.position] || entry.position}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {entry.teamName}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* コントロールボタン */}
      <div className="max-w-5xl mx-auto flex items-center justify-center gap-3 flex-wrap">
        {!roundComplete ? (
          <>
            <button
              onClick={revealNext}
              disabled={isRevealing || allRevealed}
              className="bg-red-600 hover:bg-red-500 disabled:bg-gray-300 disabled:text-gray-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-red-500/30 active:scale-95"
            >
              次の指名を発表
            </button>
            <button
              onClick={() => setAutoMode(prev => !prev)}
              className={`px-4 py-2.5 rounded-lg font-bold text-sm transition active:scale-95 ${
                autoMode ? 'bg-green-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              {autoMode ? '自動発表中...' : '自動発表'}
            </button>
            <button
              onClick={revealAll}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2.5 rounded-lg font-bold text-sm transition active:scale-95"
            >
              一斉発表
            </button>
            <button
              onClick={onComplete}
              className="text-gray-400 hover:text-gray-600 text-xs transition underline"
            >
              スキップ
            </button>
          </>
        ) : (
          <>
            <button
              onClick={nextRound}
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-blue-500/30 active:scale-95"
            >
              {currentRoundIdx < activeRounds.length - 1 ? `次のラウンドへ → ${activeRounds[currentRoundIdx + 1]}` : '結果一覧へ →'}
            </button>
            <button
              onClick={onComplete}
              className="text-gray-400 hover:text-gray-600 text-xs transition underline"
            >
              スキップ
            </button>
          </>
        )}
      </div>

      {/* 発表済みカウント */}
      <div className="text-center mt-3 text-gray-400 text-xs">
        {revealedTeams.size} / {teamsWithPicks.length} 球団発表済み
      </div>
    </div>
  );
};

// 球団別指名一覧画面（全ラウンド終了後に表示）
const DraftTeamSummaryScreen = ({ draftedPlayers, onContinue }) => {
  const teamPicks = React.useMemo(() => {
    const map = {};
    NPB_TEAMS_INFO.forEach(t => { map[t.name] = []; });
    draftedPlayers.forEach(p => {
      if (map[p.npbTeam]) map[p.npbTeam].push(p);
    });
    return map;
  }, [draftedPlayers]);

  const roundOrder = {};
  ROUND_ORDER.forEach((r, i) => { roundOrder[r] = i; });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 p-3 sm:p-6">
      <div className="text-center mb-5">
        <div className="text-gray-400 text-[10px] tracking-[0.3em] uppercase mb-0.5">NPB Draft Results</div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">全球団指名一覧</h1>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {NPB_TEAMS_INFO.map(team => {
          const picks = teamPicks[team.name] || [];
          if (picks.length === 0) return null;
          const sorted = [...picks].sort((a, b) => (roundOrder[a.draftRound] ?? 99) - (roundOrder[b.draftRound] ?? 99));
          return (
            <div key={team.name} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div
                className="px-3 py-2 font-bold text-sm tracking-wide"
                style={{ backgroundColor: team.color, color: team.textColor }}
              >
                {team.short} ({picks.length}名)
              </div>
              <div className="divide-y divide-gray-100">
                {sorted.map((entry, idx) => (
                  <div key={idx} className="px-3 py-2 flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      entry.draftRound === 'ドラフト1位' ? 'bg-red-100 text-red-700' :
                      entry.draftRound === '育成指名' ? 'bg-gray-100 text-gray-500' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {entry.draftRound.replace('ドラフト', '')}
                    </span>
                    <span className="text-gray-900 font-bold text-sm truncate">{entry.name}</span>
                    <span className="text-gray-500 text-xs shrink-0">{POSITION_NAMES[entry.position] || entry.position}</span>
                    <span className="text-gray-400 text-[10px] ml-auto shrink-0 truncate max-w-[80px]">{entry.teamName}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <button
          onClick={onContinue}
          className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-3 rounded-xl font-bold text-base transition-all duration-200 shadow-lg hover:shadow-blue-500/30 active:scale-95"
        >
          結果詳細へ →
        </button>
      </div>
    </div>
  );
};

// ドラフト結果サマリー画面
const DraftSummaryScreen = ({ draftedPlayers, nearMissPlayers, proBonus, draftBySource, onContinue }) => {
  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <style>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .draft-card { animation: slideInUp 0.45s cubic-bezier(.22,.68,0,1.2) both; }
        .gold-shimmer {
          background: linear-gradient(90deg, #f59e0b 0%, #fde68a 40%, #f59e0b 60%, #b45309 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
      `}</style>

      <div className="text-center mb-6">
        <p className="text-gray-400 text-sm font-semibold tracking-[0.2em] uppercase mb-1">NPB Draft</p>
        <h1 className="text-4xl font-black text-white tracking-tight">ドラフト結果</h1>
        <div className="flex items-center justify-center gap-3 mt-2">
          <div className="h-px w-20 bg-gradient-to-r from-transparent to-yellow-500/80" />
          <span className="gold-shimmer text-base font-black">指名選手一覧</span>
          <div className="h-px w-20 bg-gradient-to-l from-transparent to-yellow-500/80" />
        </div>
      </div>

      {draftBySource && hasDrafted && (
        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          {[['highschool', '高校'], ['university', '大学'], ['corporate', '社会人'], ['independent', '独立']].map(([key, label]) => (
            <div key={key} className="bg-gray-800/80 rounded-xl px-4 py-2 border border-gray-700/50 text-center min-w-[80px]">
              <div className="text-xs text-gray-400">{label}</div>
              <div className={`text-lg font-black ${SOURCE_LABELS[key]?.color?.split(' ')[0] || 'text-white'}`}>
                {draftBySource[key] || 0}名
              </div>
            </div>
          ))}
          <div className="bg-gray-800/80 rounded-xl px-4 py-2 border border-yellow-600/40 text-center min-w-[80px]">
            <div className="text-xs text-yellow-400">合計</div>
            <div className="text-lg font-black text-yellow-300">{draftBySource.total || 0}名</div>
          </div>
        </div>
      )}

      {hasDrafted ? (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 mb-4">
          <h2 className="text-base font-black text-yellow-400 mb-3 flex items-center gap-2">
            ドラフト指名選手
            <span className="ml-auto text-sm font-bold text-gray-400">{draftedPlayers.length}名</span>
          </h2>
          <div className="space-y-2.5">
            {[...draftedPlayers].sort((a, b) => {
              const roundOrder = { 'ドラフト1位': 0, 'ドラフト2位': 1, 'ドラフト3位': 2, 'ドラフト4位': 3, 'ドラフト5位': 4, 'ドラフト6位': 5, '育成指名': 6 };
              return (roundOrder[a.draftRound] ?? 7) - (roundOrder[b.draftRound] ?? 7);
            }).map((entry, idx) => {
              const style = ROUND_STYLES[entry.draftRound] || DEFAULT_ROUND_STYLE;
              const careerTitles = entry.player?.professionalCareer?.achievements || [];
              const currentSeasonTitles = (entry.seasonAwards || [])
                .filter(a => a.endsWith('1位'))
                .map(a => a.replace('1位', ''));
              const titleCounts = {};
              careerTitles.forEach(a => { titleCounts[a.title] = (titleCounts[a.title] || 0) + 1; });
              currentSeasonTitles.forEach(t => { titleCounts[t] = (titleCounts[t] || 0) + 1; });
              const allTitles = Object.entries(titleCounts);
              const filteredReasons = entry.reasons.filter(
                r => !/ミート|パワー|選球眼|走力|守備|肩力|盗塁|球速|制球|スタミナ|俊足/.test(r)
              );
              return (
                <div
                  key={idx}
                  className={`draft-card bg-gray-700/60 rounded-xl p-3.5 ${style.border} ${style.glow}`}
                  style={{ animationDelay: `${idx * 0.07}s` }}
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`font-black text-sm px-2.5 py-1 rounded-lg shrink-0 ${style.badge}`}>
                      {entry.draftRound || '指名'}
                    </span>
                    <span className="text-yellow-300 font-bold text-base shrink-0">{entry.npbTeam}</span>
                    <span className="text-white font-black text-lg shrink-0">{entry.name}</span>
                    <span className="text-gray-400 text-sm shrink-0">{entry.age}歳</span>
                    <span className="text-blue-400 font-semibold text-sm shrink-0">
                      {POSITION_NAMES[entry.position] || entry.position}
                    </span>
                    {entry.player?.physical && entry.player?.batting && (
                      <span className="text-sm shrink-0">
                        <span className={entry.player.physical.throws === 'left' ? 'text-green-400 font-bold' : 'text-gray-400'}>
                          {entry.player.physical.throws === 'left' ? '左' : '右'}投
                        </span>
                        <span className={
                          entry.player.batting.bats === 'left' ? 'text-green-400 font-bold' :
                          entry.player.batting.bats === 'switch' ? 'text-purple-400 font-bold' :
                          'text-gray-400'
                        }>
                          {entry.player.batting.bats === 'left' ? '左' :
                           entry.player.batting.bats === 'switch' ? '両' : '右'}打
                        </span>
                      </span>
                    )}
                    {SOURCE_LABELS[entry.source] && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${SOURCE_LABELS[entry.source].color}`}>
                        {SOURCE_LABELS[entry.source].label}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 shrink-0">元 {entry.teamName}</span>
                    {allTitles.map(([title, count], i) => (
                      <span
                        key={i}
                        className="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-0.5 rounded-full font-bold border border-yellow-600/40 shrink-0"
                      >
                        {title}{count > 1 ? `x${count}` : ''}
                      </span>
                    ))}
                  </div>
                  {filteredReasons.length > 0 && (
                    <div className="text-sm text-yellow-300/70 mt-2 pl-1 border-t border-gray-600/40 pt-1.5">
                      {filteredReasons.join('  /  ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-gray-500 text-sm mt-3">指名された選手はチームから離脱し、NPBへ移籍しました。</p>
        </div>
      ) : (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-10 mb-4 text-center">
          <p className="text-gray-200 font-bold text-lg mb-1">今シーズン、NPBからの指名はありませんでした</p>
          <p className="text-gray-500 text-sm">ドラフト指名条件に達した選手がいませんでした。</p>
        </div>
      )}

      {proBonus && proBonus.length > 0 && hasDrafted && (
        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-2xl p-4 mb-4 border border-green-600/30">
          <h2 className="text-base font-black text-green-400 mb-3 flex items-center gap-2">
            プロ輩出ボーナス
          </h2>
          <div className="space-y-2">
            {proBonus.map((bonus, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-bold text-base">{bonus.teamName}</span>
                  <span className="text-green-400 font-black text-base">+{bonus.reputationGain} 育成評判</span>
                </div>
                <div className="text-gray-400 text-sm flex gap-4 flex-wrap">
                  <span>プロ輩出 {bonus.draftCount}人</span>
                  <span>育成評判 {bonus.currentReputation}pt</span>
                  {bonus.boostedYoungPlayers > 0 && (
                    <span className="text-green-300 font-semibold">若手{bonus.boostedYoungPlayers}人が刺激を受けて成長!</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-sm mt-2">育成評判が高いリーグには、次のトライアウトでより優秀な候補者が集まります。</p>
        </div>
      )}

      {nearMissPlayers && nearMissPlayers.length > 0 && (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 mb-4">
          <h2 className="text-base font-black text-gray-300 mb-3 flex items-center gap-2">
            NPB候補に迫る選手
          </h2>
          <div className="space-y-1.5">
            {nearMissPlayers.slice(0, 10).map((entry, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold text-base">{entry.name}</span>
                  <span className="text-gray-400 text-sm">{entry.age}歳</span>
                  <span className="text-blue-400 font-semibold text-sm">{POSITION_NAMES[entry.position] || entry.position}</span>
                  <span className="text-gray-400 text-sm">({entry.teamName})</span>
                </div>
                <div className="text-sm text-orange-300/80">{entry.reasons.join(' / ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center pt-2">
        <button
          onClick={onContinue}
          className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-12 py-3.5 rounded-xl font-black text-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/30 hover:scale-105 active:scale-95"
        >
          次へ進む →
        </button>
      </div>
    </div>
  );
};

// メインコンポーネント: 会議 → 球団別一覧 → サマリーの3段階
const DraftResultScreen = ({ draftedPlayers, nearMissPlayers, proBonus, draftBySource, onContinue }) => {
  const [phase, setPhase] = useState('conference');

  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;

  if (phase === 'conference' && hasDrafted) {
    return (
      <DraftConferenceScreen
        draftedPlayers={draftedPlayers}
        onComplete={() => setPhase('teamSummary')}
      />
    );
  }

  if (phase === 'teamSummary' && hasDrafted) {
    return (
      <DraftTeamSummaryScreen
        draftedPlayers={draftedPlayers}
        onContinue={() => setPhase('summary')}
      />
    );
  }

  return (
    <DraftSummaryScreen
      draftedPlayers={draftedPlayers}
      nearMissPlayers={nearMissPlayers}
      proBonus={proBonus}
      draftBySource={draftBySource}
      onContinue={onContinue}
    />
  );
};

export default DraftResultScreen;
