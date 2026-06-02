import React, { useState, useEffect, useCallback, useRef } from 'react';
import { POSITION_NAMES } from '../utils/constants.js';

const NPB_TEAMS_INFO = [
  { name: '楽天ゴールデンイーグルス', short: '楽天', color: '#8B0000', logo: '🦅' },
  { name: '阪神タイガース', short: '阪神', color: '#FFD700', logo: '🐯' },
  { name: '千葉ロッテマリーンズ', short: 'ロッテ', color: '#000080', logo: '🐟' },
  { name: '横浜DeNAベイスターズ', short: 'DeNA', color: '#003DA5', logo: '⭐' },
  { name: 'オリックス・バファローズ', short: 'オリックス', color: '#002D62', logo: '🐃' },
  { name: '中日ドラゴンズ', short: '中日', color: '#003DA5', logo: '🐉' },
  { name: '日本ハムファイターズ', short: '日本ハム', color: '#004080', logo: '🐻' },
  { name: '読売ジャイアンツ', short: '巨人', color: '#FF6600', logo: '🏟️' },
  { name: 'ソフトバンクホークス', short: 'ソフトバンク', color: '#DAA520', logo: '🦅' },
  { name: '広島東洋カープ', short: '広島', color: '#CC0000', logo: '🎏' },
  { name: '西武ライオンズ', short: '西武', color: '#003366', logo: '🦁' },
  { name: 'ヤクルトスワローズ', short: 'ヤクルト', color: '#006633', logo: '🐦' },
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

// ドラフト会議画面（3×4グリッド、1指名ずつ表示）
const DraftConferenceScreen = ({ draftedPlayers, onComplete }) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [revealedTeams, setRevealedTeams] = useState(new Set());
  const [isRevealing, setIsRevealing] = useState(false);
  const [roundComplete, setRoundComplete] = useState(false);
  const timerRef = useRef(null);

  // ラウンドごとにNPBチーム別に整理
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

  // 指名がある球団順にリストアップ
  const teamsWithPicks = React.useMemo(() => {
    if (!currentTeamMap) return [];
    return NPB_TEAMS_INFO.filter(t => currentTeamMap[t.name]?.length > 0);
  }, [currentTeamMap]);

  const allRevealed = teamsWithPicks.length > 0 && teamsWithPicks.every(t => revealedTeams.has(t.name));

  useEffect(() => {
    if (allRevealed && !roundComplete) setRoundComplete(true);
  }, [allRevealed, roundComplete]);

  const revealNext = useCallback(() => {
    if (!teamsWithPicks.length) return;
    const unrevealed = teamsWithPicks.filter(t => !revealedTeams.has(t.name));
    if (unrevealed.length === 0) return;
    setIsRevealing(true);
    const next = unrevealed[0];
    setTimeout(() => {
      setRevealedTeams(prev => new Set([...prev, next.name]));
      setIsRevealing(false);
    }, 400);
  }, [teamsWithPicks, revealedTeams]);

  const revealAll = useCallback(() => {
    const allNames = teamsWithPicks.map(t => t.name);
    setRevealedTeams(new Set(allNames));
    setRoundComplete(true);
  }, [teamsWithPicks]);

  const nextRound = useCallback(() => {
    if (currentRoundIdx < activeRounds.length - 1) {
      setCurrentRoundIdx(prev => prev + 1);
      setRevealedTeams(new Set());
      setRoundComplete(false);
    } else {
      onComplete();
    }
  }, [currentRoundIdx, activeRounds.length, onComplete]);

  const skipAll = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!currentRound || !currentTeamMap) {
    onComplete();
    return null;
  }

  const isIku = currentRound === '育成指名';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 p-3 sm:p-6">
      <style>{`
        @keyframes cardReveal {
          0% { opacity: 0; transform: scale(0.8) rotateY(90deg); }
          60% { opacity: 1; transform: scale(1.05) rotateY(0deg); }
          100% { opacity: 1; transform: scale(1) rotateY(0deg); }
        }
        @keyframes pickFlash {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 20px 4px rgba(239,68,68,0.4); }
        }
        .card-reveal { animation: cardReveal 0.5s cubic-bezier(.22,.68,0,1.2) forwards; }
        .pick-flash { animation: pickFlash 1s ease-in-out 1; }
      `}</style>

      {/* ヘッダー */}
      <div className="text-center mb-4">
        <div className="text-gray-500 text-xs tracking-[0.3em] uppercase mb-1">NPB Draft Conference</div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">プロ野球ドラフト会議</h1>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-red-500/60" />
          <span className={`text-sm font-black px-3 py-1 rounded-lg ${
            currentRound === 'ドラフト1位' ? 'bg-red-600 text-white' :
            isIku ? 'bg-gray-700 text-gray-300' :
            'bg-yellow-700 text-yellow-200'
          }`}>
            {currentRound}
          </span>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-red-500/60" />
        </div>
        <div className="text-gray-500 text-xs mt-1">
          {currentRoundIdx + 1} / {activeRounds.length} ラウンド
        </div>
      </div>

      {/* 3×4 球団グリッド */}
      <div className="max-w-5xl mx-auto grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {NPB_TEAMS_INFO.map((team, idx) => {
          const picks = currentTeamMap[team.name] || [];
          const hasPick = picks.length > 0;
          const isRevealed = revealedTeams.has(team.name);

          return (
            <div
              key={team.name}
              className={`relative rounded-lg overflow-hidden transition-all duration-300 ${
                hasPick && isRevealed ? 'pick-flash' : ''
              }`}
              style={{ minHeight: '120px' }}
            >
              {/* 球団ヘッダー */}
              <div
                className="px-2 py-1.5 flex items-center gap-1.5 border-b border-gray-700/50"
                style={{
                  background: `linear-gradient(135deg, ${team.color}33 0%, #1a1a2e 100%)`,
                  borderTop: `3px solid ${team.color}`,
                }}
              >
                <span className="text-base">{team.logo}</span>
                <span className="text-white font-bold text-xs sm:text-sm truncate">{team.short}</span>
              </div>

              {/* 選手表示エリア */}
              <div className="bg-gray-800/90 p-2 sm:p-3 flex-1" style={{ minHeight: '80px' }}>
                {!hasPick ? (
                  <div className="flex items-center justify-center h-full text-gray-600 text-xs min-h-[60px]">
                    指名なし
                  </div>
                ) : !isRevealed ? (
                  <div className="flex items-center justify-center h-full min-h-[60px]">
                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl mb-1 opacity-40">❓</div>
                      <div className="text-gray-500 text-[10px]">未発表</div>
                    </div>
                  </div>
                ) : (
                  <div className="card-reveal space-y-1.5">
                    {picks.map((entry, pi) => {
                      const srcInfo = SOURCE_LABELS[entry.source];
                      return (
                        <div key={pi}>
                          <div className="text-white font-black text-sm sm:text-base leading-tight">{entry.name}</div>
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            <span className="text-blue-400 text-[10px] sm:text-xs font-semibold">
                              {POSITION_NAMES[entry.position] || entry.position}
                            </span>
                            <span className="text-gray-500 text-[10px]">{entry.age}歳</span>
                            {entry.player?.physical && (
                              <span className="text-[10px]">
                                <span className={entry.player.physical.throws === 'left' ? 'text-green-400' : 'text-gray-500'}>
                                  {entry.player.physical.throws === 'left' ? '左' : '右'}
                                </span>
                                <span className={
                                  entry.player?.batting?.bats === 'left' ? 'text-green-400' :
                                  entry.player?.batting?.bats === 'switch' ? 'text-purple-400' : 'text-gray-500'
                                }>
                                  {entry.player?.batting?.bats === 'left' ? '左' :
                                   entry.player?.batting?.bats === 'switch' ? '両' : '右'}
                                </span>
                              </span>
                            )}
                            {srcInfo && (
                              <span className={`text-[9px] sm:text-[10px] font-bold px-1 py-0.5 rounded border ${srcInfo.color}`}>
                                {srcInfo.label}
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 text-[10px] mt-0.5 truncate">{entry.teamName}</div>
                        </div>
                      );
                    })}
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
              className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-red-500/20 active:scale-95"
            >
              次の指名を発表
            </button>
            <button
              onClick={revealAll}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2.5 rounded-lg font-bold text-sm transition active:scale-95"
            >
              全球団一斉発表
            </button>
            <button
              onClick={skipAll}
              className="text-gray-500 hover:text-gray-300 text-xs transition underline"
            >
              スキップ
            </button>
          </>
        ) : (
          <>
            <button
              onClick={nextRound}
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-blue-500/20 active:scale-95"
            >
              {currentRoundIdx < activeRounds.length - 1 ? `次のラウンドへ → ${activeRounds[currentRoundIdx + 1]}` : '結果一覧へ →'}
            </button>
            <button
              onClick={skipAll}
              className="text-gray-500 hover:text-gray-300 text-xs transition underline"
            >
              スキップ
            </button>
          </>
        )}
      </div>

      {/* 発表済みカウント */}
      <div className="text-center mt-3 text-gray-600 text-xs">
        {revealedTeams.size} / {teamsWithPicks.length} 球団発表済み
      </div>
    </div>
  );
};

// ドラフト結果サマリー画面（既存画面を継承）
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
            <span className="text-xl">🎖️</span> ドラフト指名選手
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
                        {title}{count > 1 ? `×${count}` : ''}
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
          <p className="text-2xl mb-1">😔</p>
          <p className="text-gray-200 font-bold text-lg mb-1">今シーズン、NPBからの指名はありませんでした</p>
          <p className="text-gray-500 text-sm">ドラフト指名条件に達した選手がいませんでした。</p>
        </div>
      )}

      {proBonus && proBonus.length > 0 && hasDrafted && (
        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-2xl p-4 mb-4 border border-green-600/30">
          <h2 className="text-base font-black text-green-400 mb-3 flex items-center gap-2">
            <span>📈</span> プロ輩出ボーナス
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
                    <span className="text-green-300 font-semibold">若手{bonus.boostedYoungPlayers}人が刺激を受けて成長！</span>
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
            <span>📊</span> NPB候補に迫る選手
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

// メインコンポーネント: 会議 → サマリーの2段階
const DraftResultScreen = ({ draftedPlayers, nearMissPlayers, proBonus, draftBySource, onContinue }) => {
  const [phase, setPhase] = useState('conference');

  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;

  if (phase === 'conference' && hasDrafted) {
    return (
      <DraftConferenceScreen
        draftedPlayers={draftedPlayers}
        onComplete={() => setPhase('summary')}
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
