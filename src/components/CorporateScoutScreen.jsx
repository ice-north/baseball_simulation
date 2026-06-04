import React, { useState, useEffect } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import {
  getScoutedCandidates,
  generateRivalInterest,
  negotiateWithCompetition,
  processAIScoutRecruitment,
  investigatePlayer,
  SCOUT_TARGETS,
} from '../corporate/scoutingSystem.js';

const CorporateScoutScreen = ({ seasonData, allTeams, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const teamData = TEAMS_DATA[userTeamName];

  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [aiResults, setAiResults] = useState(null);
  const [phase, setPhase] = useState('scout'); // 'scout' → 'results' → 'confirmed'
  const [negotiationResults, setNegotiationResults] = useState([]);
  const [allResults, setAllResults] = useState([]); // 全ラウンドの結果
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [, setRefreshTick] = useState(0);
  const [sortKey, setSortKey] = useState('rate'); // 'rate', 'ability', 'age', 'growth'

  useEffect(() => {
    if (candidates.length > 0) return;
    const scouted = getScoutedCandidates(teamData);
    const withRivals = generateRivalInterest(scouted);
    setCandidates(withRivals);
  }, []);

  const toggleSelect = (playerId) => {
    if (selectedIds.includes(playerId)) {
      setSelectedIds(selectedIds.filter(id => id !== playerId));
    } else {
      setSelectedIds([...selectedIds, playerId]);
    }
  };

  const getRateColor = (rate) => {
    if (rate >= 80) return 'text-green-400';
    if (rate >= 60) return 'text-blue-400';
    if (rate >= 40) return 'text-yellow-400';
    if (rate >= 20) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRateLabel = (rate) => {
    if (rate >= 80) return '確実';
    if (rate >= 60) return '有望';
    if (rate >= 40) return '五分';
    if (rate >= 20) return '困難';
    return '至難';
  };

  const renderAbility = (label, val) => {
    if (val === '?' || val === undefined) return <span className="text-gray-600">{label} <span className="font-bold">?</span></span>;
    const numVal = typeof val === 'number' ? val : parseInt(val);
    return <span className="text-gray-400">{label}<span className={`font-bold ml-0.5 ${getAbilityColor(numVal)}`}>{val}{label === '球速' ? 'km' : ''}</span></span>;
  };

  const getStrategyLabel = (strat) => {
    if (strat === 'ability') return '実力派';
    if (strat === 'negotiable') return '交渉◎';
    if (strat === 'growth') return '将来性';
    if (strat === 'hidden') return '掘り出し';
    return '';
  };

  const getStrategyColor = (strat) => {
    if (strat === 'ability') return 'bg-red-900/40 text-red-400';
    if (strat === 'negotiable') return 'bg-green-900/40 text-green-400';
    if (strat === 'growth') return 'bg-blue-900/40 text-blue-400';
    if (strat === 'hidden') return 'bg-purple-900/40 text-purple-400';
    return 'bg-gray-700 text-gray-400';
  };

  const handleNegotiate = () => {
    const results = [];
    selectedIds.forEach(id => {
      const player = candidates.find(c => c.id === id);
      if (player) {
        const result = negotiateWithCompetition(teamData, player, teamData);
        results.push({ player, ...result });
      }
    });
    setNegotiationResults(results);
    setAllResults(prev => [...prev, ...results]);
    // 交渉済み候補を一覧から除外
    const negotiatedIds = new Set(selectedIds);
    setCandidates(prev => prev.filter(c => !negotiatedIds.has(c.id)));
    setSelectedIds([]);
    setPhase('results');
  };

  const handleContinue = () => {
    // まだ候補が残っていれば追加交渉可能
    if (candidates.length > 0) {
      setPhase('scout');
      setNegotiationResults([]);
    } else {
      handleFinalize();
    }
  };

  const handleFinalize = () => {
    const year = seasonData?.year || 1;
    const aiRes = processAIScoutRecruitment(TEAMS_DATA, userTeamName, year);
    setAiResults(aiRes);
    setPhase('confirmed');
  };

  const handleSkip = () => {
    const year = seasonData?.year || 1;
    setNegotiationResults([]);
    setSelectedIds([]);
    const aiRes = processAIScoutRecruitment(TEAMS_DATA, userTeamName, year);
    setAiResults(aiRes);
    setPhase('confirmed');
  };

  const reputation = teamData?.corporateData?.reputation || 0;
  const rank = teamData?.corporateData?.rank || 'C';
  const totalAiRecruited = aiResults ? Object.values(aiResults).reduce((sum, arr) => sum + arr.length, 0) : 0;
  const totalAcquired = allResults.filter(r => r.success).length;

  const sortedCandidates = [...candidates].sort((a, b) => {
    if (sortKey === 'rate') return (b.recruitRate || 0) - (a.recruitRate || 0);
    if (sortKey === 'age') return (a.age || 99) - (b.age || 99);
    if (sortKey === 'growth') return (b.growthPotential || 1) - (a.growthPotential || 1);
    // ability (default)
    const sa = a.position === 'pitcher'
      ? (a.pitching?.velocity || 0) + (a.pitching?.control || 0)
      : (a.batting?.meet || 0) + (a.batting?.power || 0) + (a.physical?.speed || 0);
    const sb = b.position === 'pitcher'
      ? (b.pitching?.velocity || 0) + (b.pitching?.control || 0)
      : (b.batting?.meet || 0) + (b.batting?.power || 0) + (b.physical?.speed || 0);
    return sb - sa;
  });

  // 交渉結果画面
  if (phase === 'results') {
    const successes = negotiationResults.filter(r => r.success);
    const remaining = candidates.length;

    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-1">交渉結果</h1>
        <p className="text-xs text-gray-500 mb-4">
          {negotiationResults.length}名に打診 → {successes.length}名が入団承諾
          {totalAcquired > 0 && <span className="text-green-400 ml-2">(累計{totalAcquired}名獲得)</span>}
        </p>

        {negotiationResults.length > 0 && (
          <div className="space-y-2 mb-6">
            {negotiationResults.map(({ player: p, success, rate, rivalResult }) => (
              <div key={p.id} className={`p-3 rounded border ${
                success ? 'bg-green-900/20 border-green-700' : 'bg-red-900/10 border-red-900/30'
              }`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-bold text-lg w-8 text-center ${success ? 'text-green-400' : 'text-red-400'}`}>
                    {success ? 'O' : 'X'}
                  </span>
                  <span className="text-yellow-400 font-bold">{POSITION_NAMES[p.position]}</span>
                  <span className="text-white font-medium">{p.name}</span>
                  <span className="text-gray-500 text-xs">({p.age}歳)</span>
                  {p._scoutSource && <span className="text-cyan-400 text-xs">{p._scoutSource}</span>}
                  <span className={`ml-auto text-xs ${getRateColor(rate)}`}>
                    獲得率{rate}%
                  </span>
                </div>
                <div className="ml-10 mt-1 text-xs">
                  {success ? (
                    <span className="text-green-400">入団が決まりました! キャンプから合流します。</span>
                  ) : rivalResult === 'declined' ? (
                    <span className="text-gray-500">本人が入団を辞退しました</span>
                  ) : rivalResult ? (
                    <span className="text-gray-500">{rivalResult}ランクのチームへの入団が決まりました</span>
                  ) : (
                    <span className="text-gray-500">条件面で折り合いがつきませんでした</span>
                  )}
                </div>
                {success && (
                  <div className="ml-10 mt-1 text-xs text-gray-400">
                    {p.position === 'pitcher' ? (
                      <span>{p.pitching?.velocity}km/h 制球{p.pitching?.control}</span>
                    ) : (
                      <span>ミ{p.batting?.meet} パ{p.batting?.power} 走{p.physical?.speed}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4">
          {remaining > 0 && (
            <button
              onClick={handleContinue}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm"
            >
              追加交渉する (残り{remaining}名)
            </button>
          )}
          <button
            onClick={handleFinalize}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-sm"
          >
            交渉を終了する
          </button>
        </div>
      </div>
    );
  }

  // 最終確認画面
  if (phase === 'confirmed') {
    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-3">スカウト入団完了</h1>
        {totalAcquired > 0 ? (
          <div className="mb-4">
            <p className="text-green-400 text-sm mb-2">今シーズンは{totalAcquired}名を獲得しました</p>
            <div className="space-y-1">
              {allResults.filter(r => r.success).map(({ player: p }, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-green-900/20 border border-green-700/30 rounded p-2">
                  <span className="text-yellow-400 font-bold">{POSITION_NAMES[p.position]}</span>
                  <span className="text-white font-medium">{p.name}</span>
                  <span className="text-gray-500">({p.age}歳)</span>
                  <span className="text-cyan-400">{p._scoutSource}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-4">今シーズンは選手を獲得しませんでした。</p>
        )}

        {totalAiRecruited > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-blue-400 mb-2">他チームのスカウト獲得 ({totalAiRecruited}名)</h2>
            {Object.entries(aiResults).map(([team, players]) => (
              <div key={team} className="text-xs text-gray-400 mb-1">
                {team}: {players.map(p => `${p.name}(${POSITION_NAMES[p.position]})`).join('、')}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-500 mb-3">
          現在のロスター: {teamData?.players?.length || 0}名
          {totalAcquired > 0 && <span className="text-green-400 ml-2">（入団した選手はキャンプから合流します）</span>}
        </p>
        <button
          onClick={onComplete}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
        >
          完了
        </button>
      </div>
    );
  }

  // メインのスカウト交渉画面
  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <h1 className="text-xl font-bold text-white mb-1">スカウト交渉 - {seasonData?.year || 1}年目</h1>
      <p className="text-gray-400 text-xs mb-1">
        シーズン中にスカウトが発見した選手です。交渉したい選手を選んでください。
        {candidates.length === 0 && 'スカウトを派遣していなかったため、候補選手がいません。'}
      </p>
      <div className="flex items-center gap-4 text-[10px] text-gray-500 mb-2">
        <span>注目度: <span className={reputation >= 50 ? 'text-yellow-400' : 'text-gray-400'}>{reputation}</span></span>
        <span>ランク: <span className="text-white">{rank}</span></span>
        <span>現ロスター: {teamData?.players?.length || 0}名</span>
        <span>交渉予定: <span className="text-green-400 font-bold">{selectedIds.length}名</span></span>
        {totalAcquired > 0 && <span className="text-green-400">獲得済: {totalAcquired}名</span>}
      </div>

      {/* ソートボタン */}
      <div className="flex gap-1 mb-2">
        {[
          { key: 'rate', label: '成功率順' },
          { key: 'ability', label: '能力順' },
          { key: 'age', label: '若い順' },
          { key: 'growth', label: '成長力順' },
        ].map(s => (
          <button key={s.key}
            onClick={() => setSortKey(s.key)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
              sortKey === s.key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
            }`}
          >{s.label}</button>
        ))}
      </div>

      {/* 候補者一覧 */}
      <div className="space-y-1.5 mb-4">
        {sortedCandidates.map(player => {
          const selected = selectedIds.includes(player.id);
          const sa = player.scoutedAbilities || {};
          const revealLevel = player._revealLevel || 0;
          const isPitcher = player.position === 'pitcher';
          const rivals = player._rivals || [];
          const rate = player.recruitRate || 0;

          return (
            <div
              key={player.id}
              className={`rounded-lg border transition ${
                selected
                  ? 'bg-green-900/20 border-green-600'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-500'
              }`}
            >
              {/* メイン行 */}
              <div
                onClick={() => toggleSelect(player.id)}
                className="p-2.5 cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                    selected ? 'bg-green-600 border-green-500 text-white' : 'border-gray-600'
                  }`}>
                    {selected ? '✓' : ''}
                  </span>
                  <span className="text-yellow-400 font-bold">{POSITION_NAMES[player.position]}</span>
                  <span className="text-white font-medium">{player.name}</span>
                  <span className="text-gray-500">{player.age}歳</span>
                  <span className="text-cyan-400 text-[10px]">{player._scoutSource}</span>
                  {player._strategy && (
                    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${getStrategyColor(player._strategy)}`}>
                      {getStrategyLabel(player._strategy)}
                    </span>
                  )}
                  {(player.fame || 0) > 0 && (
                    <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                      player.fame >= 50 ? 'bg-yellow-600/30 text-yellow-300' : 'bg-gray-700 text-gray-400'
                    }`}>
                      知名度{player.fame}
                    </span>
                  )}

                  {/* 成功率 */}
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${getRateColor(rate)} bg-gray-700/50`}>
                    {getRateLabel(rate)} {rate}%
                  </span>
                </div>

                {/* 能力値 */}
                <div className="flex gap-3 mt-1.5 text-[10px] flex-wrap ml-6">
                  {isPitcher ? (<>
                    {renderAbility('球速', sa.pitching?.velocity)}
                    {renderAbility('制球', sa.pitching?.control)}
                    {renderAbility('スタ', sa.pitching?.stamina)}
                  </>) : (<>
                    {renderAbility('ミート', sa.batting?.meet)}
                    {renderAbility('パワー', sa.batting?.power)}
                    {renderAbility('選球眼', sa.batting?.eye)}
                    {renderAbility('走力', sa.physical?.speed)}
                    {renderAbility('守備', sa.fielding?.defense)}
                  </>)}
                  {/* ライバル */}
                  {rivals.length > 0 && (
                    <span className="text-[10px] text-red-400 font-bold">
                      競合{rivals.length}社 ({rivals.map(r => r.rank).join(',')})
                    </span>
                  )}
                </div>
              </div>

              {/* 調査ボタン + 詳細 */}
              <div className="px-2.5 pb-2 flex items-center gap-2">
                {revealLevel < 2 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      investigatePlayer(player);
                      setRefreshTick(t => t + 1);
                    }}
                    className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-bold rounded transition"
                  >
                    {revealLevel === 0 ? '詳細を調べる' : '全能力を調べる'}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setDetailPlayer(detailPlayer?.id === player.id ? null : player); }}
                  className="text-gray-500 hover:text-white text-[10px] px-1"
                >
                  {detailPlayer?.id === player.id ? '閉じる' : '詳細情報'}
                </button>
                <span className={`text-[10px] px-1 py-0.5 rounded font-bold ${
                  revealLevel === 2 ? 'bg-green-900/40 text-green-400' :
                  revealLevel === 1 ? 'bg-blue-900/40 text-blue-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {['概要', '詳細', '完全'][revealLevel]}
                </span>
              </div>

              {/* 詳細パネル */}
              {detailPlayer?.id === player.id && (
                <div className="mx-2.5 mb-2 p-2 bg-gray-900/50 rounded border border-gray-700/50 text-[10px] text-gray-400">
                  <div className="grid grid-cols-3 gap-x-4">
                    <div>
                      <span className="text-gray-500">出身: </span>
                      <span className="text-cyan-400">{player._scoutSource || '不明'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">投/打: </span>
                      {player.physical?.throws === 'left' ? '左' : '右'}投
                      {player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}打
                    </div>
                    <div>
                      <span className="text-gray-500">成長力: </span>
                      <span className={`font-bold ${(player.growthPotential || 1.0) >= 1.1 ? 'text-yellow-400' : 'text-gray-400'}`}>
                        {player.growthPotential ? player.growthPotential.toFixed(2) : '?'}
                      </span>
                    </div>
                  </div>
                  {isPitcher && player.pitching?.arsenal && (
                    <div className="mt-1">
                      <span className="text-gray-500">球種: </span>
                      {player.pitching.arsenal.filter(a => a.type !== 'straight').map(a => {
                        const names = {
                          slider: 'スライダー', curve: 'カーブ', fork: 'フォーク',
                          changeup: 'チェンジアップ', sinker: 'シンカー', shoot: 'シュート',
                          cutter: 'カッター', splitter: 'スプリット', twoSeam: 'ツーシーム',
                          palm: 'パーム', knuckle: 'ナックル'
                        };
                        return names[a.type] || a.type;
                      }).join(', ')}
                    </div>
                  )}
                  {rivals.length > 0 && (
                    <div className="mt-1">
                      <span className="text-gray-500">競合球団: </span>
                      <span className="text-red-400">
                        {rivals.map((r, i) => `${r.rank}ランク企業${i + 1}`).join('、')}
                      </span>
                      <span className="text-gray-600 ml-1">（ランクの高いチームほど有利）</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {candidates.length === 0 && (
        <div className="bg-gray-800/50 rounded-lg p-6 text-center mb-4">
          <p className="text-gray-400 text-sm mb-2">スカウト候補者がいません</p>
          <p className="text-gray-500 text-xs">シーズン中にチーム運営画面からスカウトを派遣してください</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleNegotiate}
          disabled={selectedIds.length === 0}
          className={`px-5 py-2 rounded font-bold text-sm ${
            selectedIds.length > 0
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          交渉開始 ({selectedIds.length}名)
        </button>
        <button
          onClick={handleSkip}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
        >
          獲得なしで進む
        </button>
      </div>
    </div>
  );
};

export default CorporateScoutScreen;
