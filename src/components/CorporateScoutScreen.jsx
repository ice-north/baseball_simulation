import React, { useState, useEffect } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import { generateScoutCandidates, attemptRecruitment, processAIScoutRecruitment } from '../corporate/scoutingSystem.js';

const CorporateScoutScreen = ({ seasonData, allTeams, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const teamData = TEAMS_DATA[userTeamName];

  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [aiResults, setAiResults] = useState(null);
  // 'scout' → 'negotiating' → 'confirmed'
  const [phase, setPhase] = useState('scout');
  const [negotiationResults, setNegotiationResults] = useState([]);
  const [detailPlayer, setDetailPlayer] = useState(null);
  const maxRecruit = 3;

  useEffect(() => {
    if (candidates.length > 0) return;
    const year = seasonData?.year || 1;
    const generated = generateScoutCandidates(teamData, year);
    setCandidates(generated);
  }, []);

  const currentRosterSize = teamData?.players?.length || 0;

  const toggleSelect = (playerId) => {
    if (selectedIds.includes(playerId)) {
      setSelectedIds(selectedIds.filter(id => id !== playerId));
    } else if (selectedIds.length < maxRecruit) {
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

  const handleConfirm = () => {
    const year = seasonData?.year || 1;
    const results = [];

    selectedIds.forEach(id => {
      const player = candidates.find(c => c.id === id);
      if (player) {
        const result = attemptRecruitment(teamData, player, teamData);
        results.push({
          player,
          success: result.success,
          rate: result.rate,
        });
      }
    });

    setNegotiationResults(results);

    const aiRes = processAIScoutRecruitment(TEAMS_DATA, userTeamName, year);
    setAiResults(aiRes);
    setPhase('negotiating');
  };

  const handleSkip = () => {
    const year = seasonData?.year || 1;
    setNegotiationResults([]);
    setSelectedIds([]);
    const aiRes = processAIScoutRecruitment(TEAMS_DATA, userTeamName, year);
    setAiResults(aiRes);
    setPhase('confirmed');
  };

  const getAccuracyLabel = (accuracy) => {
    if (accuracy >= 85) return { text: 'A', color: 'text-green-400' };
    if (accuracy >= 70) return { text: 'B', color: 'text-blue-400' };
    if (accuracy >= 55) return { text: 'C', color: 'text-yellow-400' };
    if (accuracy >= 40) return { text: 'D', color: 'text-orange-400' };
    return { text: 'E', color: 'text-red-400' };
  };

  const totalAiRecruited = aiResults ? Object.values(aiResults).reduce((sum, arr) => sum + arr.length, 0) : 0;
  const reputation = teamData?.corporateData?.reputation || 0;
  const rank = teamData?.corporateData?.rank || 'C';

  // 交渉結果画面
  if (phase === 'negotiating') {
    const successes = negotiationResults.filter(r => r.success);
    const failures = negotiationResults.filter(r => !r.success);

    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-1">交渉結果</h1>
        <p className="text-xs text-gray-500 mb-4">
          {selectedIds.length}名に打診 → {successes.length}名が入団承諾
        </p>

        {negotiationResults.length > 0 && (
          <div className="space-y-2 mb-6">
            {negotiationResults.map(({ player: p, success, rate }) => (
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
                    成功率{rate}%
                  </span>
                </div>
                <div className="ml-10 mt-1 text-xs">
                  {success ? (
                    <span className="text-green-400">入団が決まりました!</span>
                  ) : (
                    <span className="text-gray-500">
                      {rate >= 40 ? '条件面で折り合いがつきませんでした'
                        : rate >= 20 ? 'より上位のチームへの入団を希望されました'
                        : '力不足と判断され、交渉のテーブルにもつけませんでした'}
                    </span>
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

  // スキップ確認画面
  if (phase === 'confirmed') {
    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-3">スカウト入団完了</h1>
        <p className="text-gray-400 text-sm mb-4">今シーズンは選手を獲得しませんでした。</p>
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
        <button
          onClick={onComplete}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
        >
          完了
        </button>
      </div>
    );
  }

  // メインのスカウト選択画面
  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <h1 className="text-xl font-bold text-white mb-1">スカウト入団 - {seasonData?.year || 1}年目</h1>
      <p className="text-gray-400 text-xs mb-1">
        スカウトが見つけた選手です。最大{maxRecruit}名まで交渉できます。
        交渉の成否はチームの注目度・ランク・交渉力に左右されます。
      </p>
      <div className="flex items-center gap-4 text-[10px] text-gray-500 mb-3">
        <span>注目度: <span className={reputation >= 50 ? 'text-yellow-400' : 'text-gray-400'}>{reputation}</span></span>
        <span>ランク: <span className="text-white">{rank}</span></span>
        <span>現ロスター: {currentRosterSize}名</span>
        <span>交渉予定: {selectedIds.length}名</span>
      </div>

      {/* 候補者一覧 */}
      <div className="space-y-1 mb-4">
        {candidates.map(player => {
          const selected = selectedIds.includes(player.id);
          const scouted = player.scoutedAbilities;
          const accuracy = getAccuracyLabel(player.scoutAccuracy);
          const isPitcher = player.position === 'pitcher';
          const rate = player.recruitRate || 50;

          return (
            <div
              key={player.id}
              onClick={() => toggleSelect(player.id)}
              className={`p-2 rounded border cursor-pointer transition ${
                selected
                  ? 'bg-green-900/30 border-green-600'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                  selected ? 'bg-green-600 border-green-500 text-white' : 'border-gray-600'
                }`}>
                  {selected ? '✓' : ''}
                </span>
                <span className="text-yellow-400 font-bold w-6">{POSITION_NAMES[player.position]}</span>
                <span className="text-white font-medium w-20">{player.name}</span>
                <span className="text-gray-500 w-10">{player.age}歳</span>
                {player._scoutSource && (
                  <span className="text-cyan-400 w-16 truncate">{player._scoutSource}</span>
                )}
                <span className={`text-[10px] ${accuracy.color} w-12`}>
                  精度{accuracy.text}
                </span>
                {/* 交渉成功率 */}
                <span className={`text-[10px] font-bold w-20 ${getRateColor(rate)}`}>
                  交渉{rate}% {getRateLabel(rate)}
                </span>
                {isPitcher ? (
                  <span className="text-gray-400">
                    <span className={getAbilityColor((scouted.pitching.velocity - 120) * 1.5)}>{scouted.pitching.velocity}</span>km
                    {' '}制球<span className={getAbilityColor(scouted.pitching.control)}>{scouted.pitching.control}</span>
                    {' '}ス{scouted.pitching.stamina}
                  </span>
                ) : (
                  <span className="text-gray-400">
                    ミ<span className={getAbilityColor(scouted.batting.meet)}>{scouted.batting.meet}</span>
                    {' '}パ<span className={getAbilityColor(scouted.batting.power)}>{scouted.batting.power}</span>
                    {' '}走<span className={getAbilityColor(scouted.physical.speed)}>{scouted.physical.speed}</span>
                    {' '}守<span className={getAbilityColor(scouted.fielding.defense)}>{scouted.fielding.defense}</span>
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setDetailPlayer(detailPlayer?.id === player.id ? null : player); }}
                  className="ml-auto text-gray-500 hover:text-white text-[10px] px-1"
                >
                  詳細
                </button>
              </div>

              {/* 詳細パネル */}
              {detailPlayer?.id === player.id && (
                <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-400">
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
                      <span className="text-gray-500">交渉成功率: </span>
                      <span className={`font-bold ${getRateColor(rate)}`}>{rate}%</span>
                    </div>
                    {isPitcher && player.pitching?.arsenal && (
                      <div className="col-span-3">
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
                  </div>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {isPitcher ? (
                      <>
                        <div>球速: <span className={getAbilityColor((scouted.pitching.velocity - 120) * 1.5)}>{scouted.pitching.velocity}</span></div>
                        <div>制球: <span className={getAbilityColor(scouted.pitching.control)}>{scouted.pitching.control}</span></div>
                        <div>スタミナ: {scouted.pitching.stamina}</div>
                        <div>肩力: <span className={getAbilityColor(scouted.physical.arm)}>{scouted.physical.arm}</span></div>
                      </>
                    ) : (
                      <>
                        <div>ミート: <span className={getAbilityColor(scouted.batting.meet)}>{scouted.batting.meet}</span></div>
                        <div>パワー: <span className={getAbilityColor(scouted.batting.power)}>{scouted.batting.power}</span></div>
                        <div>走力: <span className={getAbilityColor(scouted.physical.speed)}>{scouted.physical.speed}</span></div>
                        <div>守備: <span className={getAbilityColor(scouted.fielding.defense)}>{scouted.fielding.defense}</span></div>
                        <div>肩力: <span className={getAbilityColor(scouted.physical.arm)}>{scouted.physical.arm}</span></div>
                        <div>選球眼: <span className={getAbilityColor(scouted.batting.eye)}>{scouted.batting.eye}</span></div>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] text-gray-600">
                    ※ 精度{accuracy.text}: 表示値は実際の能力と{player.scoutAccuracy >= 80 ? 'ほぼ一致' : player.scoutAccuracy >= 60 ? 'やや異なる場合あり' : '大きく異なる場合あり'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {candidates.length === 0 && (
        <p className="text-gray-500 text-sm mb-4">スカウト候補者がいません。</p>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleConfirm}
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
