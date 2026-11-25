// ============================================================
// 采配の試合の画面（スコア・打席・作戦の板・両球団の表）
//
// 2026-11-24 に App.jsx から切り出した（中身は動かさず、そのまま移した）。
// state と処理は src/game/useManagedGame.jsx が持ち、ここは受け取って描くだけ。
// ============================================================
import React from 'react';
import { decidePitchers } from '../game/pitcherDecisions.js';
import { POSITION_NAMES, POSITION_COLORS, sortBenchByPosition } from '../utils/constants.js';
import { getAbilityTextColor, getBestFitPosition, getHandednessEffect } from '../utils/physics.js';
import { TEAMS_DATA, getTeamAbbreviation } from '../teams-data.js';
import { calculateDefensiveFitness } from '../simulation-logic.js';
import { AIM_LABEL, GUESS_TYPE_LABEL, GUESS_ZONE_LABEL } from '../game/pitchCalling.js';
import { getBatterType, BATTER_TYPE_LABEL, BATTER_TYPE_NOTE } from '../game/batterType.js';
import { getZoneProfile, zoneHeatmap, describeZoneProfile } from '../game/batterZone.js';
import { decidePitchObjective, OBJECTIVE_LABEL, OBJECTIVE_NOTE } from '../game/pitchSituation.js';
import { pitchArsenalOf } from '../game/pitchEngine.js';
import PitchZonePlot, { HEAT_HOT, HEAT_COLD } from '../components/PitchZonePlot.jsx';
import TutorialHint from '../components/TutorialHint.jsx';
import { formatDate } from '../season/seasonManager.js';
import { TeamMemberPanel } from '../components/GameUIComponents.jsx';

const getPositionColor = (pos) => POSITION_COLORS[pos] || 'bg-gray-700';
const getPositionColorHighlighted = (pos, isCurrentBatter) => {
  if (!isCurrentBatter) return POSITION_COLORS[pos] || 'bg-gray-700';
  if (pos === 'pitcher') return 'bg-red-600 text-white';
  if (pos === 'catcher') return 'bg-blue-500 text-white';
  if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-400 text-black';
  if (['left', 'center', 'right'].includes(pos)) return 'bg-green-500 text-white';
  if (pos === 'dh') return 'bg-purple-500 text-white';
  return 'bg-gray-700';
};

export default function ManagedGameScreen(props) {
  const {
    autoManagerMode,
    awayTeam,
    ballEffects,
    bases,
    batGuessType,
    batGuessZone,
    battingApproach,
    count,
    currentBatterOrder,
    currentStamina,
    decisionLogRef,
    extraInningScores,
    gameEndPanelRef,
    gameLog,
    gameOver,
    gameStarted,
    getCurrentBatter,
    getCurrentCatcher,
    getCurrentPitcher,
    handleBatterClick,
    handleBunt,
    handleManagedGameEnd,
    handlePositionClick,
    handleSubstituteClick,
    homeTeam,
    inning,
    inningScores,
    isAutoSimulating,
    isTopInning,
    lastResult,
    managedGameInfo,
    outs,
    pitchAim,
    pitchSeqRef,
    pitchTypeIndex,
    resetGame,
    score,
    seasonData,
    selectedBatterAway,
    selectedBatterHome,
    selectedPositionAway,
    selectedPositionHome,
    selectedSubstituteAway,
    selectedSubstituteHome,
    setAutoManagerMode,
    setAwayTeam,
    setBatGuessType,
    setBatGuessZone,
    setBattingApproach,
    setCurrentStamina,
    setGameLog,
    setGameStarted,
    setHomeTeam,
    setIsAutoSimulating,
    setPitchAim,
    setPitchTypeIndex,
    setRemainingPitches,
    setScreenMode,
    setSelectedBatterAway,
    setSelectedBatterHome,
    setSelectedPositionAway,
    setSelectedPositionHome,
    setShowBenchAway,
    setShowBenchHome,
    setShowSubModal,
    setSimMode,
    setSubModalSelected,
    showBenchAway,
    showBenchHome,
    showSubModal,
    startSimMode,
    subModalSelected,
    teamErrors,
    teamHits,
    throwPitch,
    triggerHitAndRun,
    triggerIntentionalWalk,
    triggerSteal,
    userTeamName,
  } = props;
  return (
      /* data-fit-height: 縦も1画面に収める対象。自動フィットが高さを見る印
         （縦に読み進める管理画面には付けないこと）
         ⚠ 試合終了のあとは外す。結果の欄が下に足されて縦が伸び、倍率が下限の0.7まで
         下がってスコアも表も小さくなっていた。外して等倍に戻し、結果の欄まで送る */
      <div className="p-1" data-fit-height={gameOver ? undefined : true}>
  {/* 管理画面へボタン（采配モード中は非表示） */}
  <div className="max-w-[1800px] mx-auto flex justify-between items-center">
    {/* ⚠ この行は地色（明るい灰色）の上に直に載る見出し。文字色は index.css の「文字色の決まり」の
        地色の列（見出し text-ink・強調 text-ink-accent）。黄色の字のままだと地に溶けていた。
        上下に少し余白を取る（行の高さが字ぎりぎりで上の端に詰まって見えた） */}
    {managedGameInfo && (
      <span className="inline-block py-0.5 mb-1 text-ink text-sm font-bold">
        {formatDate(seasonData?.currentDate)} - 采配モード
        {(() => {
          const fmt = seasonData?.settings?.leagueFormat;
          if (fmt !== 'two') return null;
          const allTeamNames = seasonData?.settings?.teamNames || [];
          const half = Math.floor(allTeamNames.length / 2);
          const l1 = new Set(allTeamNames.slice(0, half));
          const h = homeTeam?.name, a = awayTeam?.name;
          if (!h || !a) return null;
          const isInter = l1.has(h) !== l1.has(a);
          if (isInter) return <span className="ml-2 text-ink-accent">[ 交流戦 ]</span>;
          const leagueNames = seasonData?.settings?.leagueNames;
          const lName = l1.has(h) ? (leagueNames?.[0] || 'リーグ1') : (leagueNames?.[1] || 'リーグ2');
          return <span className="ml-2 text-ink-accent">[ {lName} ]</span>;
        })()}
      </span>
    )}
    <div className="ml-auto">
      {!managedGameInfo && (
        <button
          onClick={() => setScreenMode('management')}
          className="btn-secondary px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 active:scale-95"
        >
          <span>⚙️</span>
          <span className="font-medium">管理画面へ</span>
        </button>
      )}
    </div>
  </div>

  {/* 3カラムレイアウト。試合前は選手を並べ替えるので選手欄重視(5-3-5)、
      試合中は中央（掲示板・対戦カード・コース図・ログ・采配）が主役なので
      中央を広げる(3-5-3)。左右のメンバー表は試合中は参照用 */}
  <div className="grid gap-2 max-w-[1800px] mx-auto" style={{gridTemplateColumns: gameStarted ? '3fr 5fr 3fr' : '5fr 3fr 5fr'}}>

    {/* ===== 左カラム: アウェイチーム ===== */}
    <TeamMemberPanel
      side="away"
      team={awayTeam}
      score={score?.away}
      isBatting={isTopInning}
      gameStarted={gameStarted}
      gameOver={gameOver}
      selectedBatter={selectedBatterAway}
      selectedPosition={selectedPositionAway}
      selectedSubstitute={selectedSubstituteAway}
      showBench={showBenchAway}
      setShowBench={setShowBenchAway}
      handleBatterClick={handleBatterClick}
      handlePositionClick={handlePositionClick}
      handleSubstituteClick={handleSubstituteClick}
      getPositionColor={getPositionColor}
      getPositionColorHighlighted={getPositionColorHighlighted}
    />
    
    {/* ===== 中央カラム: メイン試合画面 ===== */}
    <div className="space-y-2 min-w-0">

      {/* 試合開始前の画面 */}
      {!gameStarted && (
        <div className="bg-surface-1 rounded-lg p-4 text-white text-center">
          <h2 className="text-2xl font-bold mb-3">⚾ 野球シミュレーター</h2>
          <p className="text-sm text-blue-400 mb-1">👆 選手パネルクリック → スタメン⇔ベンチ交代</p>
          <p className="text-sm text-purple-400 mb-4">🔄 守備位置クリック → 守備交換</p>

          {/* おまかせ采配の設定（⚠ 「AI」は作る側の言葉なので画面に出さない） */}
          <div className="mb-6 p-3 bg-surface-2 rounded-lg">
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm font-semibold">🤖 おまかせ采配</span>
              <button
                onClick={() => setAutoManagerMode(!autoManagerMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoManagerMode ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoManagerMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-xs ${autoManagerMode ? 'text-green-400' : 'text-gray-300'}`}>
                {autoManagerMode ? 'ON（ベンチに任せる）' : 'OFF（自分で采配）'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {autoManagerMode
                ? '代打・継投・守備固めを、相手の球団と同じ決まりでベンチが決めます'
                : '自分の球団の選手交代は手動で行います（相手の球団はベンチが決めます）'}
            </p>
          </div>

          <button
            onClick={() => {
              setGameStarted(true);
              setSelectedBatterAway(null);
              setSelectedBatterHome(null);
              setSelectedPositionAway(null);
              setSelectedPositionHome(null);
              // 各選手のgameStatsを初期化
              setAwayTeam(prev => ({
                ...prev,
                players: prev.players.map(p => ({
                  ...p,
                  gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [],
                    fieldingChances: 0, fieldErrors: 0, assists: 0 }
                }))
              }));
              setHomeTeam(prev => ({
                ...prev,
                players: prev.players.map(p => ({
                  ...p,
                  gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [],
                    fieldingChances: 0, fieldErrors: 0, assists: 0 }
                }))
              }));
            }}
            className="btn-primary py-4 px-12 rounded-lg text-xl transition shadow-lg"
          >
            ⚾ 試合開始
          </button>
        </div>
      )}

      {/* 電光掲示板風スコアボード */}
      {gameStarted && (
      <div className="bg-black rounded-lg p-0.5 font-mono border-2 border-gray-800 shadow-2xl overflow-hidden">
        {/* 上段: イニングスコア（電光掲示板風） */}
        <div className="bg-black rounded-t overflow-x-auto p-0.5">
          <table className="w-full text-center text-xs table-fixed">
            {/* ヘッダー行 */}
            <thead>
              <tr className="border-b border-gray-700">
                {/* ⚠ ここは長らく `TEAM` という**情報を持たない固定ラベル**だった。
                    一方で「いま何回の表裏か」は投球ログの文中にしか無く、画面のどこにも
                    大きく出ていない。テレビ中継のテロップが「9回ウラ」を最大級の見出しに
                    するのはこれが1球ごとに要る情報だからで、掲示板でも同じ扱いにする。 */}
                <th className="py-0.5 px-1 text-left text-orange-300 font-bold" style={{width: '20%', textShadow: '0 0 8px #fb923c'}}>
                  <span className="tabular-nums">{inning}</span>回{isTopInning ? '表' : '裏'}
                </th>
                {inning <= 9 ? (
                  // 9回まで: 1-9回を表示
                  [1,2,3,4,5,6,7,8,9].map(i => (
                    <th key={i} className={`py-0.5 px-0 font-normal ${inning === i ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: inning === i ? '0 0 8px #fb923c' : 'none'}}>{i}</th>
                  ))
                ) : (
                  // 延長: 10回以降を表示（最大3イニング分）
                  [0,1,2].map(i => {
                    const extraInn = 10 + i;
                    return (
                      <th key={i} className={`py-0.5 px-0 font-normal ${inning === extraInn ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: inning === extraInn ? '0 0 8px #fb923c' : 'none'}}>{extraInn}</th>
                    );
                  })
                )}
                <th className="py-0.5 px-1 text-orange-400 font-bold border-l border-gray-700" style={{width: '8%'}}>計</th>
                <th className="py-0.5 px-1 text-orange-400" style={{width: '7%'}}>安</th>
                <th className="py-0.5 px-1 text-orange-400" style={{width: '7%'}}>失</th>
              </tr>
            </thead>
            <tbody>
              {/* アウェイチーム。球団名は略称（欄は2割しか無く、正式名は「高知ファイティン…」と切れていた。
                  正式名は左右の打順の見出しに出ている） */}
              <tr className="border-b border-gray-800">
                <td className={`py-0.5 px-1 text-left font-bold truncate ${isTopInning ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: isTopInning ? '0 0 8px #fb923c' : 'none'}} title={awayTeam.name}>{getTeamAbbreviation(awayTeam.name)}</td>
                {inning <= 9 ? (
                  // 9回まで
                  [0,1,2,3,4,5,6,7,8].map(i => (
                    <td key={i} className="py-0.5 px-0 text-orange-400 font-bold" style={{textShadow: inningScores?.away?.[i] !== null && inningScores?.away?.[i] !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                      {inningScores?.away?.[i] !== null && inningScores?.away?.[i] !== undefined ? inningScores.away[i] : ''}
                    </td>
                  ))
                ) : (
                  // 延長（アウェイ）
                  [0,1,2].map(i => (
                    <td key={i} className="py-0.5 px-0 text-orange-400 font-bold" style={{textShadow: extraInningScores?.away?.[i] !== null && extraInningScores?.away?.[i] !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                      {extraInningScores?.away?.[i] !== null && extraInningScores?.away?.[i] !== undefined ? extraInningScores.away[i] : ''}
                    </td>
                  ))
                )}
                <td className="py-0.5 px-1 font-black text-2xl leading-none tabular-nums text-orange-300 border-l border-gray-700" style={{textShadow: '0 0 10px #fb923c'}}>{score?.away || 0}</td>
                <td className="py-0.5 px-1 text-orange-400">{teamHits?.away || 0}</td>
                <td className="py-0.5 px-1 text-orange-400">{teamErrors?.away || 0}</td>
              </tr>
              {/* ホームチーム */}
              <tr>
                <td className={`py-0.5 px-1 text-left font-bold truncate ${!isTopInning ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: !isTopInning ? '0 0 8px #fb923c' : 'none'}} title={homeTeam.name}>{getTeamAbbreviation(homeTeam.name)}</td>
                {inning <= 9 ? (
                  // 9回まで
                  [0,1,2,3,4,5,6,7,8].map(i => {
                    const homeScore = inningScores?.home?.[i];
                    // 9回裏、ホームチームがリードしている場合に「X」を表示する判定
                    const showX = i === 8 && inning === 9 && !isTopInning && (score?.home || 0) > (score?.away || 0) && homeScore === null;
                    return (
                      <td key={i} className="py-0.5 px-0 text-orange-400 font-bold" style={{textShadow: homeScore !== null && homeScore !== undefined || showX ? '0 0 6px #fb923c' : 'none'}}>
                        {showX ? 'X' : (homeScore !== null && homeScore !== undefined ? homeScore : '')}
                      </td>
                    );
                  })
                ) : (
                  // 延長（ホーム）
                  [0,1,2].map(i => {
                    const homeScore = extraInningScores?.home?.[i];
                    return (
                      <td key={i} className="py-0.5 px-0 text-orange-400 font-bold" style={{textShadow: homeScore !== null && homeScore !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                        {homeScore !== null && homeScore !== undefined ? homeScore : ''}
                      </td>
                    );
                  })
                )}
                <td className="py-0.5 px-1 font-black text-2xl leading-none tabular-nums text-orange-300 border-l border-gray-700" style={{textShadow: '0 0 10px #fb923c'}}>{score?.home || 0}</td>
                <td className="py-0.5 px-1 text-orange-400">{teamHits?.home || 0}</td>
                <td className="py-0.5 px-1 text-orange-400">{teamErrors?.home || 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        {/* 下段: BSO + 塁状況 + 投球数 + 球速（固定幅） */}
        <div className="bg-black p-1 rounded-b flex items-center justify-between border-t border-gray-800">
          {/* BSO (3-2-2) 緑・黄・赤 - 固定幅 */}
          <div className="flex flex-col gap-0.5 w-24 flex-shrink-0">
            <div className="flex items-center gap-1">
              <span className="w-4 text-xs text-green-500 font-bold">B</span>
              {[0,1,2].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border ${i < (count?.balls || 0) ? 'bg-green-500 border-green-400' : 'bg-surface-1 border-gray-700'}`} 
                     style={{boxShadow: i < (count?.balls || 0) ? '0 0 6px #22c55e' : 'none'}} />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 text-xs text-yellow-400 font-bold">S</span>
              {[0,1].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border ${i < (count?.strikes || 0) ? 'bg-yellow-400 border-yellow-300' : 'bg-surface-1 border-gray-700'}`}
                     style={{boxShadow: i < (count?.strikes || 0) ? '0 0 6px #facc15' : 'none'}} />
              ))}
              <div className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-4 text-xs text-red-500 font-bold">O</span>
              {[0,1].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border ${i < outs ? 'bg-red-500 border-red-400' : 'bg-surface-1 border-gray-700'}`}
                     style={{boxShadow: i < outs ? '0 0 6px #ef4444' : 'none'}} />
              ))}
              <div className="w-4 h-4" />
            </div>
          </div>
          
          {/* 区切り線 */}
          <div className="w-px h-14 bg-gray-700 flex-shrink-0" />
          
          {/* 塁状況（固定幅） */}
          <div className="relative w-16 h-14 flex items-center justify-center flex-shrink-0">
            {/* 二塁 */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 rotate-45 border ${bases[1] ? 'bg-yellow-400 border-yellow-300' : 'bg-surface-1 border-gray-700'}`}
                 style={{boxShadow: bases[1] ? '0 0 8px #facc15' : 'none'}} />
            {/* 三塁 */}
            <div className={`absolute top-1/2 left-1 -translate-y-1/2 w-5 h-5 rotate-45 border ${bases[2] ? 'bg-yellow-400 border-yellow-300' : 'bg-surface-1 border-gray-700'}`}
                 style={{boxShadow: bases[2] ? '0 0 8px #facc15' : 'none'}} />
            {/* 一塁 */}
            <div className={`absolute top-1/2 right-1 -translate-y-1/2 w-5 h-5 rotate-45 border ${bases[0] ? 'bg-yellow-400 border-yellow-300' : 'bg-surface-1 border-gray-700'}`}
                 style={{boxShadow: bases[0] ? '0 0 8px #facc15' : 'none'}} />
          </div>
          
          {/* 区切り線 */}
          <div className="w-px h-14 bg-gray-700 flex-shrink-0" />
          
          {/* 投手名・投球数（固定幅） */}
          <div className="text-center w-24 flex-shrink-0">
            <div className="text-orange-500 text-xs">P</div>
            <div className="text-orange-300 text-xs truncate" style={{textShadow: '0 0 6px #f97316'}}>{getCurrentPitcher().name}</div>
            <div className="text-orange-400 text-xl font-bold font-mono leading-tight" style={{textShadow: '0 0 6px #f97316'}}>
              {String(getCurrentPitcher().stats?.pitching?.pitches || 0).padStart(3, ' ')}
            </div>
            <div className="text-orange-500 text-xs leading-none">球</div>
          </div>

          {/* 区切り線 */}
          <div className="w-px h-14 bg-gray-700 flex-shrink-0" />

          {/* 打者（球場の電光掲示板は打順・名前・打率を出す） */}
          <div className="text-center w-24 flex-shrink-0">
            <div className="text-orange-500 text-xs">B {currentBatterOrder}</div>
            <div className="text-orange-300 text-xs truncate" style={{textShadow: '0 0 6px #f97316'}}>{getCurrentBatter().name}</div>
            <div className="text-orange-400 text-xl font-bold font-mono leading-tight" style={{textShadow: '0 0 6px #f97316'}}>
              {(() => {
                const b = getCurrentBatter();
                const ab = (b.seasonStats?.batting?.atBats || 0) + (b.gameStats?.atBats || 0);
                const h = (b.seasonStats?.batting?.hits || 0) + (b.gameStats?.hits || 0);
                return ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '.---';
              })()}
            </div>
            <div className="text-orange-500 text-xs leading-none">打率</div>
          </div>

          {/* 区切り線 */}
          <div className="w-px h-14 bg-gray-700 flex-shrink-0" />
          
          {/* 球種・球速表示（固定幅） */}
          <div className="text-center w-20 flex-shrink-0">
            <div className="text-orange-300 text-xs truncate">
              {(() => {
                const lastPitch = [...gameLog].reverse().find(log => log.velocity !== undefined);
                return lastPitch ? lastPitch.pitchType : '---';
              })()}
            </div>
            <div className="text-orange-400 text-2xl font-bold font-mono" style={{textShadow: '0 0 8px #f97316'}}>
              {(() => {
                const lastPitch = [...gameLog].reverse().find(log => log.velocity !== undefined);
                return lastPitch ? String(lastPitch.velocity).padStart(3, ' ') : '---';
              })()}
            </div>
            <div className="text-orange-500 text-xs">km/h</div>
          </div>
        </div>
      </div>
      )}

      {/* 対戦カード & 操作ボタン */}
      {gameStarted && (
      <div className="bg-surface-2 rounded-lg p-2 shadow-lg border border-gray-700/50">
        {/* 対戦カード。**チーム色分けは使わない**（表裏で意味が反転するため）。
            守備側=amber / 攻撃側=cyan で采配パネルと語彙を揃える。
            名前は白、数字は tabular-nums で「目に入りやすさ」を優先する */}
        <div className="flex items-stretch gap-2 mb-2">
          {/* ===== 守備側 ===== */}
          <div className="flex-1 min-w-0 bg-gray-900/50 rounded px-2 py-1.5 border-l-2 border-amber-600/70">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-amber-300 shrink-0">守備</span>
              <span className="text-xs text-gray-300 truncate">{isTopInning ? homeTeam.name : awayTeam.name}</span>
            </div>
            <div className="font-bold text-xl text-gray-100 truncate leading-tight">{getCurrentPitcher().name}</div>
            <div className="text-xs text-gray-300 tabular-nums">
              {getCurrentPitcher().physical.throws === 'right' ? '右投' : '左投'}
              <span className="mx-1 text-gray-400">|</span>{getCurrentPitcher().pitching.velocity}km
              <span className="mx-1 text-gray-400">|</span>回転{getCurrentPitcher().pitching.spinRate ?? 50}
              <span className="mx-1 text-gray-400">|</span>防{(() => {
                const p = getCurrentPitcher();
                const totalOuts = (p.seasonStats?.pitching?.inningsPitched || 0) + (p.stats?.pitching?.outs || 0);
                if (totalOuts === 0) return '-.--';
                const er = (p.seasonStats?.pitching?.earnedRuns || 0)
                  + (p.stats?.pitching?.earnedRuns ?? p.stats?.pitching?.runsAllowed ?? 0);
                return (er * 27 / totalOuts).toFixed(2);
              })()}
            </div>
            {/* スタミナ */}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-gray-300 shrink-0">体力</span>
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 min-w-0">
                <div className="bg-amber-500 h-1.5 rounded-full transition-all"
                  style={{width: `${(currentStamina / getCurrentPitcher().pitching.stamina) * 100}%`}} />
              </div>
              <span className="text-xs text-gray-200 tabular-nums shrink-0">
                {currentStamina}/{getCurrentPitcher().pitching.stamina}
              </span>
            </div>
            {/* 捕手。このゲームで配球を決めているのは捕手なので試合画面に出す */}
            {(() => {
              const c = getCurrentCatcher();
              if (!c) return null;
              const lead = c.catching?.lead ?? 50;
              const def = c.fielding?.defense ?? 50;
              return (
                <div className="text-xs text-gray-300 mt-1 truncate"
                  title="リード=配球の巧さ（弱点を突く・読ませない） / 守備=フレーミング・暴投抑止">
                  捕 <span className="text-gray-100">{c.name}</span>
                  <span className="ml-1 tabular-nums">リード<span className={`font-bold ${getAbilityTextColor(lead)}`}>{lead}</span></span>
                  <span className="ml-1 tabular-nums">守<span className={`font-bold ${getAbilityTextColor(def)}`}>{def}</span></span>
                </div>
              );
            })()}
          </div>

          <div className="self-center text-lg font-bold text-gray-400 px-1 shrink-0">VS</div>

          {/* ===== 攻撃側 ===== */}
          <div className="flex-1 min-w-0 bg-gray-900/50 rounded px-2 py-1.5 border-r-2 border-cyan-600/70">
            <div className="flex items-baseline gap-2 justify-end">
              <span className="text-xs text-gray-300 truncate">{isTopInning ? awayTeam.name : homeTeam.name}</span>
              <span className="text-xs font-bold text-cyan-300 shrink-0">攻撃 {currentBatterOrder}番</span>
            </div>
            <div className="text-right">
              <div className="font-bold text-xl text-gray-100 truncate leading-tight">{getCurrentBatter().name}</div>
                <div className="text-xs text-gray-300 tabular-nums">
                  {getCurrentBatter().batting.bats === 'switch' ? '両打' : getCurrentBatter().batting.bats === 'right' ? '右打' : '左打'}
                  {(() => {
                    const b = getCurrentBatter();
                    const ab = (b.seasonStats?.batting?.atBats || 0) + (b.gameStats?.atBats || 0);
                    const h = (b.seasonStats?.batting?.hits || 0) + (b.gameStats?.hits || 0);
                    const hr = (b.seasonStats?.batting?.homeruns || 0) + (b.gameStats?.homeruns || 0);
                    const rbi = (b.seasonStats?.batting?.rbis || 0) + (b.gameStats?.rbis || 0);
                    return <>
                      <span className="mx-1 text-gray-400">|</span>{ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '.---'}
                      <span className="mx-1 text-gray-400">|</span>{hr}本
                      <span className="mx-1 text-gray-400">|</span>{rbi}点
                    </>;
                  })()}
                </div>
                {/* 打者の型（野村の4分類）。狙い方が型で変わるので配球の材料になる */}
                {(() => {
                  const t = getBatterType(getCurrentBatter());
                  const prof = getZoneProfile(getCurrentBatter());
                  const desc = describeZoneProfile(prof);
                  return (
                    <div className="flex items-center gap-1 justify-end flex-wrap mt-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-900/70 text-cyan-200 font-bold"
                        title={BATTER_TYPE_NOTE[t]}>{BATTER_TYPE_LABEL[t]}</span>
                      {desc.length > 0 && (
                        <span className="text-xs text-gray-300">{desc.join('・')}</span>
                      )}
                    </div>
                  );
                })()}
                <div className="text-xs mt-1">
                  <span className={`px-2 py-0.5 rounded ${
                    getHandednessEffect(getCurrentPitcher().physical.throws, getCurrentBatter().batting.bats).meetBonus
                      ? 'bg-blue-900/50 text-blue-200'
                      : 'bg-red-900/50 text-red-200'
                  }`}>
                    {getHandednessEffect(getCurrentPitcher().physical.throws, getCurrentBatter().batting.bats).label}
                  </span>
              </div>
            </div>
          </div>
        </div>

        {/* 投球コース（投手視点）と投球ログ。図と文字を同じ行に並べて
            「どこに来て何が起きたか」を目線を動かさずに追えるようにする */}
        <div className="flex items-start gap-3 mb-2">
          <div className="shrink-0">
            {/* カウントは図のすぐ上に置く。配球を決める時に電光掲示板まで
                目線を戻さずに済ませるため（掲示板側にも残してある） */}
            <div className="flex items-center gap-2 mb-0.5 h-4">
              {[['B', count?.balls || 0, 3, 'bg-green-500'],
                ['S', count?.strikes || 0, 2, 'bg-yellow-400'],
                ['O', outs, 2, 'bg-red-500']].map(([label, n, max, on]) => (
                <span key={label} className="flex items-center gap-0.5">
                  <span className="text-xs font-bold text-gray-300 mr-0.5">{label}</span>
                  {Array.from({ length: max }, (_, i) => (
                    <span key={i} className={`w-2 h-2 rounded-full ${i < n ? on : 'bg-gray-700'}`} />
                  ))}
                </span>
              ))}
            </div>
            {/* 打者の得手不得手（heat）は図に重ねる。別の小さいヒートマップを
                対戦カードに置くと2枚を見比べることになって読みにくい */}
            <PitchZonePlot size={168}
              bats={getCurrentBatter().batting?.bats}
              pitcherThrows={getCurrentPitcher().physical?.throws}
              heat={zoneHeatmap(getZoneProfile(getCurrentBatter()))}
              pitches={(() => {
                const key = pitchSeqRef.current.key;
                return gameLog.filter(l => l.pitchLoc && l.paKey === key);
              })()} />
          </div>
          {/* 投球ログ。コースの右いっぱいに広げる
              （flex内のスクロール領域なので高さを明示すること） */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 h-4">
              <span className="text-xs font-bold text-gray-300">投球ログ</span>
              <span className="text-xs text-gray-300 tabular-nums">
                この打席 {gameLog.filter(l => l.pitchLoc && l.paKey === pitchSeqRef.current.key).length}球
              </span>
              {/* コース図の凡例。図の下に1行取ると縦を20px食うので、
                  空いているこの見出し行の右端へ寄せる（情報は減らさない） */}
              <span className="ml-auto flex items-center gap-2 text-xs text-gray-300">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEAT_HOT, opacity: 0.55 }} />得意
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEAT_COLD, opacity: 0.55 }} />苦手
                </span>
              </span>
            </div>
            <div className="h-[168px] overflow-y-auto text-xs space-y-0.5 pr-1">
              {gameLog.slice().reverse().slice(0, 30).map((log, i) => (
                <div key={i} className={`px-1.5 py-1 rounded leading-tight ${
                  i === 0 ? 'bg-blue-900/40' : 'bg-gray-700/40'}`}>
                  {log.isSpecial ? (
                    <span className="font-bold text-purple-300">{log.description}</span>
                  ) : (
                    <>
                      <span className="text-gray-300">{log.inning}回{log.isTop ? '表' : '裏'}</span>
                      <span className="mx-1 text-gray-400">|</span>
                      <span className="font-mono tabular-nums text-gray-300">
                        {log.count?.balls || 0}-{log.count?.strikes || 0}
                      </span>
                      <span className="mx-1 text-gray-400">|</span>
                      <span className="text-blue-300">{log.pitchType}</span>
                      <span className="text-gray-300 ml-1 tabular-nums">{log.velocity}km</span>
                      <span className="mx-1 text-gray-400">→</span>
                      <span className="font-bold text-gray-100">{log.result}</span>
                      {/* 振り方（得意コース・打者有利カウントならフルスイング） */}
                      {log.pitchLoc?.swing && (
                        <span className={`ml-1 ${log.pitchLoc.swing === 'フルスイング'
                          ? 'text-orange-300' : 'text-sky-300'}`}>[{log.pitchLoc.swing}]</span>
                      )}
                      {log.exitVelocity && (
                        <span className="text-gray-300 ml-1 tabular-nums">
                          {/* 打出し角は整数で出す。物理側は回転数・球速・コースの補正を
                              足した生の小数（16.15000000000002 のような値）を持っている。
                              ⚠ 丸めるのは表示だけ。judgeFielderReach が
                              「20〜45度なら本塁打」「10度未満はゴロ」と閾値で見ているので、
                              物理側の値を丸めると境目の打球の判定が変わってしまう */}
                          （EV{log.exitVelocity} {Math.round(log.launchAngle ?? 0)}° {log.distance}m 芯{log.meetQuality}%）
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}
              {gameLog.length === 0 && (
                <div className="text-gray-300 text-center py-2">まだ投球がありません</div>
              )}
            </div>
          </div>
        </div>

        {/* 最新結果 */}
        {gameStarted && lastResult && (() => {
          // 結果種別で色分け（安打=緑/長打=金/三振=赤/四死球=青/アウト=灰）
          const d = lastResult.description || '';
          const cat = /本塁打|ホームラン|三塁打|３塁打|二塁打|２塁打/.test(d) ? 'xbh'
            : /ヒット|安打|出塁/.test(d) ? 'hit'
            : /三振/.test(d) ? 'k'
            : /四球|死球|フォアボール|敬遠/.test(d) ? 'bb'
            : /アウト|ゴロ|フライ|併殺|邪飛|ライナー|失敗/.test(d) ? 'out'
            : 'neutral';
          const S = {
            xbh: { box: 'border-amber-400 bg-amber-900/30', text: 'text-amber-200', icon: '💥' },
            hit: { box: 'border-green-500 bg-green-900/25', text: 'text-green-200', icon: '🟢' },
            k: { box: 'border-red-500 bg-red-900/25', text: 'text-red-200', icon: '❌' },
            bb: { box: 'border-blue-500 bg-blue-900/25', text: 'text-blue-200', icon: '🎫' },
            out: { box: 'border-gray-600 bg-surface-2', text: 'text-gray-200', icon: '' },
            neutral: { box: 'border-yellow-500/60 bg-surface-2', text: 'text-yellow-100', icon: '' },
          }[cat];
          // 打球の飛距離バー（0-140m目安）
          const distPct = lastResult.distance ? Math.max(4, Math.min(100, (lastResult.distance / 140) * 100)) : 0;
          // 1行に畳む。球種・球速は電光掲示板とログに出ているので繰り返さない
          return (
            <div className={`rounded-lg px-3 py-1 border mb-1 flex items-center gap-3 ${S.box}`}>
              <div className="shrink-0">
                {S.icon && <span className="mr-1">{S.icon}</span>}
                <span className={`font-bold text-lg ${S.text}`}>{d}</span>
              </div>
              {lastResult.exitVelocity ? (
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 tabular-nums text-right">
                    EV {lastResult.exitVelocity} / {Math.round(lastResult.launchAngle ?? 0)}° / {lastResult.distance}m / 芯 {lastResult.meetQuality}%
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-0.5">
                    <div className={`h-full rounded-full ${cat === 'xbh' ? 'bg-amber-400' : cat === 'hit' ? 'bg-green-500' : 'bg-gray-500'}`} style={{ width: `${distPct}%` }} />
                  </div>
                </div>
              ) : lastResult.timingWindow ? (
                <div className="flex-1 text-xs text-gray-300 tabular-nums text-right">
                  タイミング窓 {lastResult.timingWindow}ms / 誤差 {lastResult.timingError}ms
                </div>
              ) : <div className="flex-1" />}
            </div>
          );
        })()}

        {/* 采配コントロール。攻撃中は攻撃の指示だけ、守備中は配球だけを出す
            （従来は両方を常に並べて、使えない側を薄く表示していた） */}
        <TutorialHint id="ingame-tactics" title="試合の采配">
          <b className="text-cyan-200">攻撃中</b>は打撃方針・狙い球（球種／コース）・盗塁・エンドラン・バント、
          <b className="text-amber-200">守備中</b>は配球（球種／狙い）・敬遠を指示できます。
          いま操作できる側だけが表示されます。「おまかせ」にすれば、打者と捕手がその場で判断します。
        </TutorialHint>
        {(() => {
          const isUserBatting = (isTopInning ? awayTeam.name : homeTeam.name) === userTeamName;
          const busy = isAutoSimulating || gameOver;
          const pick = (active, color) => `px-2.5 py-0.5 rounded text-xs font-bold transition ${
            active ? `${color} text-white` : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`;
          const act = 'px-2.5 py-0.5 rounded text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed';
          const row = 'flex items-center justify-center gap-1.5 flex-wrap';
          const tag = (color) => `text-xs w-14 text-right ${color}`;

          // ===== 攻撃中 =====
          if (isUserBatting) {
            const aiming = batGuessType !== 'auto' || batGuessZone !== 'auto';
            return (
              <div className="bg-cyan-950/30 border border-cyan-800/40 rounded px-2 py-1 mb-1 space-y-1">
                <div className={row}>
                  <span className={tag('text-cyan-300')}>打撃</span>
                  {[['take', '待て'], ['normal', 'おまかせ'], ['aggressive', '積極']].map(([v, label]) => (
                    <button key={v} onClick={() => setBattingApproach(v)} disabled={gameOver}
                      title={v === 'take' ? '見送りを増やして球数を稼ぐ。振るときも当てにいく'
                        : v === 'aggressive' ? '早いカウントから積極的に打ちにいく。フルスイングが増える'
                        : '打者に任せる（得意コースはフルスイング／追い込まれたら当てにいく）'}
                      className={pick(battingApproach === v, 'bg-cyan-600')}>{label}</button>
                  ))}
                  <span className="text-xs text-gray-400">｜</span>
                  <button onClick={() => triggerSteal(throwPitch)} disabled={!bases[0] || busy}
                    title="一塁走者が次球で盗塁"
                    className={`${act} bg-cyan-700 text-white hover:bg-cyan-600`}>🏃 盗塁</button>
                  <button onClick={() => triggerHitAndRun(throwPitch)} disabled={!bases[0] || outs >= 2 || busy}
                    title="走者を走らせ打者は必ず打ちにいく"
                    className={`${act} bg-cyan-800 text-cyan-50 hover:bg-cyan-700`}>エンドラン</button>
                  <button onClick={() => handleBunt()} disabled={busy}
                    title="送りバント"
                    className={`${act} bg-cyan-900 text-cyan-100 hover:bg-cyan-800`}>バント</button>
                  <button onClick={() => handleBunt()} disabled={!bases[2] || outs > 1 || busy}
                    title="三塁走者を還すスクイズバント"
                    className={`${act} bg-cyan-950 text-cyan-100 hover:bg-cyan-900`}>スクイズ</button>
                </div>
                <div className={row}>
                  <span className={tag('text-cyan-300')}>狙い球</span>
                  <button onClick={() => setBatGuessType('auto')} disabled={gameOver}
                    title="球種は張らない（読み合いは打者に任せる）"
                    className={pick(batGuessType === 'auto', 'bg-cyan-700')}>おまかせ</button>
                  {['straight', 'breaking'].map(v => (
                    <button key={v} onClick={() => setBatGuessType(v)} disabled={gameOver}
                      title={`${GUESS_TYPE_LABEL[v]}に張る。来れば強く振れるが、違えば対応が遅れる`}
                      className={pick(batGuessType === v, 'bg-cyan-700')}>{GUESS_TYPE_LABEL[v]}</button>
                  ))}
                  <span className="text-xs text-gray-400">｜</span>
                  <span className={tag('text-cyan-300')}>コース</span>
                  <button onClick={() => setBatGuessZone('auto')} disabled={gameOver}
                    title="コースは張らない"
                    className={pick(batGuessZone === 'auto', 'bg-cyan-700')}>おまかせ</button>
                  {['in', 'out', 'high', 'low'].map(v => (
                    <button key={v} onClick={() => setBatGuessZone(v)} disabled={gameOver}
                      title={`${GUESS_ZONE_LABEL[v]}に張る。その半面に来れば読み切れる`}
                      className={pick(batGuessZone === v, 'bg-cyan-700')}>{GUESS_ZONE_LABEL[v]}</button>
                  ))}
                  {aiming && (
                    <span className="text-xs px-2 py-1 rounded bg-amber-900 text-amber-200"
                      title="張った次元が当たれば読み、外せば対応が遅れる。両方当てるとタイミング窓が1.5倍">
                      ヤマ張り中
                    </span>
                  )}
                </div>
              </div>
            );
          }

          // ===== 守備中 =====
          // 1球の計算（useManagedGame の control.pitchIndex）が引くのと同じ球種の並び（封印した球種を除き、回転数で補正した値）。
          // ⚠ 以前は選手に無い `pitches` を読んでいて、球種のボタンが1つも出なかった
          const mound = getCurrentPitcher();
          const arsenal = mound?.pitching ? pitchArsenalOf(mound).arsenal : [];
          const obj = decidePitchObjective(bases, outs);
          return (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded px-2 py-1 mb-1 space-y-1">
              <div className={row}>
                <span className={tag('text-amber-300')}>配球</span>
                <button onClick={() => setPitchTypeIndex('auto')} disabled={gameOver}
                  title="球種は捕手のリードに任せる"
                  className={pick(pitchTypeIndex === 'auto', 'bg-amber-700')}>おまかせ</button>
                {arsenal.map((b, i) => (
                  <button key={i} onClick={() => setPitchTypeIndex(i)} disabled={gameOver}
                    title={`${ballEffects[b.type]?.name || b.type} Lv${b.level}`}
                    className={pick(pitchTypeIndex === i, 'bg-amber-700')}>
                    {ballEffects[b.type]?.name || b.type}
                  </button>
                ))}
              </div>
              <div className={row}>
                <span className={tag('text-amber-300')}>狙い</span>
                <button onClick={() => setPitchAim('auto')} disabled={gameOver}
                  title="狙いも捕手のリードに任せる"
                  className={pick(pitchAim === 'auto', 'bg-amber-700')}>おまかせ</button>
                {['zone', 'edge', 'chase'].map(v => (
                  <button key={v} onClick={() => setPitchAim(v)} disabled={gameOver}
                    title={v === 'zone' ? 'ゾーンで勝負。ストライクは取れるが打たれやすい'
                      : v === 'edge' ? '際どいコース。打ち損じを誘うが四球のリスク'
                      : '誘い球（ボール球）。振らせれば凡打、見逃されれば四球に近づく'}
                    className={pick(pitchAim === v, 'bg-amber-700')}>{AIM_LABEL[v]}</button>
                ))}
                <span className="text-xs text-gray-400">｜</span>
                <button onClick={() => triggerIntentionalWalk(throwPitch)} disabled={busy}
                  title="現在の打者を敬遠"
                  className={`${act} bg-amber-800 text-amber-50 hover:bg-amber-700`}>敬遠</button>
                {/* 場面から捕手が求める結果。プレイヤーは操作しないが何を狙っているかは見せる */}
                {obj.goal !== 'normal' && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    obj.goal === 'groundball' ? 'bg-amber-900 text-amber-100' : 'bg-amber-950 text-amber-200 ring-1 ring-amber-700'}`}
                    title={OBJECTIVE_NOTE[obj.goal] + (obj.avoidWalk ? '（満塁なので押し出しを避ける）' : '')}>
                    {OBJECTIVE_LABEL[obj.goal]}{obj.avoidWalk ? '・押し出し回避' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })()}
        {/* 試合進行。采配（上）と進行（下）を分ける */}
        <div className="flex justify-center items-center gap-2 flex-wrap border-t border-gray-700/60 pt-1">
          <button onClick={throwPitch} disabled={isAutoSimulating || gameOver}
            className="btn-primary px-5 py-1.5 rounded disabled:opacity-50">
            ⚾ 1球
          </button>
          <button onClick={() => startSimMode('out')} disabled={isAutoSimulating || gameOver}
            className="btn-secondary px-3 py-1.5 rounded text-sm disabled:opacity-50">
            1アウトまで
          </button>
          <button onClick={() => startSimMode('end')} disabled={isAutoSimulating || gameOver}
            className="btn-secondary px-3 py-1.5 rounded text-sm disabled:opacity-50">
            試合終了まで
          </button>
          <span className="w-px h-7 bg-gray-700 mx-1" />
          <button onClick={() => setAutoManagerMode(!autoManagerMode)}
            title="采配をベンチに任せる（代打・継投・守備固めを相手の球団と同じ決まりで決める）"
            className={`px-3 py-1.5 rounded text-sm font-semibold transition ${
              autoManagerMode ? 'seg-on' : 'seg'
            }`}>
            🤖 {autoManagerMode ? 'おまかせ ON' : 'おまかせ OFF'}
          </button>
          {managedGameInfo && !gameOver && (
            <button
              onClick={() => {
                if (isAutoSimulating) {
                  setSimMode(null);
                  setRemainingPitches(0);
                  setIsAutoSimulating(false);
                }
                setSubModalSelected(null);
                setShowSubModal(true);
              }}
              className="btn-secondary px-3 py-1.5 rounded text-sm font-semibold transition"
            >
              選手交代
            </button>
          )}
        </div>
      </div>
      )}

      {/* 選手交代モーダル */}
      {showSubModal && gameStarted && managedGameInfo && (() => {
        const isUserHome = homeTeam.name === userTeamName;
        const userTeam = isUserHome ? homeTeam : awayTeam;
        const teamType = isUserHome ? 'home' : 'away';
        const fieldPlayers = userTeam.players
          .filter(p => p.isStarter && !p.hasSubbedOut && (p.battingOrder > 0 || p.position === 'pitcher'))
          .sort((a, b) => (a.battingOrder || 10) - (b.battingOrder || 10));
        // 交代モーダルも同じ並び（捕→一→…→右→投）
        const benchPlayers = sortBenchByPosition(userTeam.players.filter(p => !p.isStarter && !p.hasSubbedOut));
        const posNames = POSITION_NAMES;
        const selectedPlayer = subModalSelected ? userTeam.players.find(p => p.id === subModalSelected) : null;
        const selectedIsField = selectedPlayer?.isStarter && !selectedPlayer?.hasSubbedOut && (selectedPlayer?.battingOrder > 0 || selectedPlayer?.position === 'pitcher');

        const setUserTeam = isUserHome ? setHomeTeam : setAwayTeam;
        const handleModalClick = (playerId) => {
          const clicked = userTeam.players.find(p => p.id === playerId);
          if (!clicked) return;
          const clickedIsField = clicked.isStarter && !clicked.hasSubbedOut && (clicked.battingOrder > 0 || clicked.position === 'pitcher');

          if (!subModalSelected) {
            setSubModalSelected(playerId);
          } else if (subModalSelected === playerId) {
            setSubModalSelected(null);
          } else {
            const fieldId = selectedIsField ? subModalSelected : (clickedIsField ? playerId : null);
            const benchId = !selectedIsField ? subModalSelected : (!clickedIsField ? playerId : null);
            if (!fieldId || !benchId) {
              setSubModalSelected(playerId);
              return;
            }
            const fieldPlayer = userTeam.players.find(p => p.id === fieldId);
            const benchPlayer = userTeam.players.find(p => p.id === benchId);
            const posLabel = { pitcher: '投手', catcher: '捕手', first: '一塁', second: '二塁', short: '遊撃', third: '三塁', left: '左翼', center: '中堅', right: '右翼', dh: 'DH' };
            setGameLog(prev => [...prev, {
              description: `[選手交代] ${fieldPlayer?.name} → ${benchPlayer?.name} (${posLabel[fieldPlayer?.position] || ''})`,
              isSpecial: true
            }]);
            setUserTeam(prev => {
              const players = prev.players.map(p => ({...p}));
              const fieldP = players.find(p => p.id === fieldId);
              const benchP = players.find(p => p.id === benchId);
              if (!fieldP || !benchP) return prev;

              const oldOrder = fieldP.battingOrder;
              const oldPos = fieldP.position;

              fieldP.isStarter = false;
              fieldP.hasSubbedOut = true;
              fieldP.battingOrder = 0;
              fieldP.position = getBestFitPosition(fieldP);

              benchP.isStarter = true;
              benchP.battingOrder = oldOrder;
              benchP.position = oldPos;

              if (oldPos === 'pitcher') {
                const isDefense = (isUserHome && isTopInning) || (!isUserHome && !isTopInning);
                if (isDefense) {
                  setTimeout(() => {
                    const maxSt = benchP.pitching?.stamina || 100;
                    const fat = benchP.fatigue || 0;
                    setCurrentStamina(Math.max(Math.floor(maxSt * 0.5), maxSt - fat));
                  }, 0);
                }
              }
              return { ...prev, players };
            });
            setSubModalSelected(null);
            setShowSubModal(false);
          }
        };

        // ⚠ 親が `space-y-2` なので、そのままだと幕にも上の余白（8px）が付き、画面の上端に
        //   暗くならない帯が残っていた。`!mt-0` で打ち消す（`.space-y-2 > * ~ *` は詳細度が高い）
        return (
          <div className="fixed inset-0 !mt-0 bg-black/70 flex items-center justify-center z-50" onClick={() => { setShowSubModal(false); setSubModalSelected(null); }}>
            <div className="bg-surface-1 rounded-xl p-4 max-w-lg w-full mx-4 border border-gray-600 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-white font-bold text-lg">選手交代</h3>
                <button onClick={() => { setShowSubModal(false); setSubModalSelected(null); }} aria-label="閉じる" className="text-gray-300 hover:text-white text-xl">✕</button>
              </div>
              <p className="text-xs text-gray-300 mb-3">フィールド選手を選んでからベンチ選手を選ぶと交代します</p>

              <div className="mb-3">
                <div className="text-xs text-gray-400 font-bold mb-1">フィールド</div>
                <div className="space-y-1">
                  {fieldPlayers.map(p => {
                    const isPitcher = p.position === 'pitcher';
                    const throwH = p.physical.throws === 'right' ? '右' : '左';
                    const batH = p.batting.bats === 'right' ? '右' : p.batting.bats === 'left' ? '左' : '両';
                    const isSelected = subModalSelected === p.id;
                    const fitness = calculateDefensiveFitness(p, p.position);
                    return (
                      <div key={p.id} onClick={() => handleModalClick(p.id)}
                        className={`p-1.5 rounded cursor-pointer transition ${isSelected ? 'bg-orange-600 ring-2 ring-orange-400' : 'bg-surface-2 hover:bg-gray-700'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-300 w-4 text-center text-xs">{p.battingOrder}</span>
                          <span className={`w-6 text-center text-xs font-bold rounded ${getPositionColor(p.position)}`}>{posNames[p.position]}</span>
                          <span className="text-white text-sm font-medium truncate flex-1">{p.name}</span>
                          <span className="text-gray-300 text-xs">{throwH}{batH}</span>
                          <span className="text-gray-400 text-xs">M{p.batting.meet} P{p.batting.power}</span>
                          {isPitcher && <span className="text-blue-400 text-xs">{p.pitching.velocity}km</span>}
                          <span className={`text-xs ${fitness.grade === 'S' ? 'text-yellow-400' : fitness.grade === 'A' ? 'text-green-400' : fitness.grade === 'B' ? 'text-blue-400' : fitness.grade === 'D' ? 'text-red-400' : 'text-gray-400'}`}>{fitness.grade}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 font-bold mb-1">ベンチ</div>
                {benchPlayers.length === 0 ? (
                  <div className="text-xs text-gray-400 p-2">交代可能な選手がいません</div>
                ) : (
                  <div className="space-y-1">
                    {benchPlayers.map(p => {
                      const isPitcher = p.position === 'pitcher';
                      const throwH = p.physical.throws === 'right' ? '右' : '左';
                      const batH = p.batting.bats === 'right' ? '右' : p.batting.bats === 'left' ? '左' : '両';
                      const isSelected = subModalSelected === p.id;
                      return (
                        <div key={p.id} onClick={() => handleModalClick(p.id)}
                          className={`p-1.5 rounded cursor-pointer transition ${isSelected ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-surface-2 hover:bg-gray-700'}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-6 text-center text-xs font-bold rounded ${getPositionColor(p.position)}`}>{posNames[p.position]}</span>
                            <span className="text-white text-sm font-medium truncate flex-1">{p.name}</span>
                            <span className="text-gray-300 text-xs">{throwH}{batH}</span>
                            <span className="text-gray-400 text-xs">M{p.batting.meet} P{p.batting.power}</span>
                            {isPitcher && <span className="text-blue-400 text-xs">{p.pitching.velocity}km</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 試合結果（下段に配置） */}
      {gameOver && (() => {
        // 勝利/敗戦/セーブ投手と本塁打の判定
        const isHomeWin = score.home > score.away;
        const isDraw = score.home === score.away;
        const winTeam = isHomeWin ? homeTeam : awayTeam;
        const loseTeam = isHomeWin ? awayTeam : homeTeam;

        // 勝利・敗戦・セーブは記録（gameSetup）と同じ判定を使う（pitcherDecisions.js）。
        // ⚠ 以前はここにも独自の推定があり、画面と記録で別の投手が出うる形だった
        const decLog = decisionLogRef.current;
        const sideOfTeam = { home: homeTeam, away: awayTeam };
        const dec = !isDraw ? decidePitchers({
          finalScore: score, appearances: decLog.appearances, lastLead: decLog.lastLead,
          outsOf: (side, id) => sideOfTeam[side]?.players?.find(p => p.id === id)?.stats?.pitching?.outs || 0,
        }) : { win: null, loss: null, save: null };
        const findIn = (team, id) => (id == null ? null : team.players.find(p => p.id === id) || null);
        const winPitcher = findIn(winTeam, dec.win);
        const losePitcher = findIn(loseTeam, dec.loss);
        const savePitcher = findIn(winTeam, dec.save);

        // 本塁打を打った選手
        const hrHitters = [
          ...awayTeam.players.filter(p => (p.gameStats?.homeruns || 0) > 0).map(p => ({ ...p, team: awayTeam.name })),
          ...homeTeam.players.filter(p => (p.gameStats?.homeruns || 0) > 0).map(p => ({ ...p, team: homeTeam.name }))
        ];

        // 投手の成績を取得（今の試合結果を含む）
        const getPitcherRecord = (pitcher, teamState, decisionType) => {
          if (!pitcher) return '';
          const teamName = teamState === winTeam ? (isHomeWin ? homeTeam.name : awayTeam.name) : (isHomeWin ? awayTeam.name : homeTeam.name);
          const teamData = TEAMS_DATA[teamName];
          const playerData = teamData?.players?.find(p => p.id === pitcher.id);
          const sp = playerData?.seasonStats?.pitching || {};
          // 今の試合の結果を加算（handleManagedGameEnd前に表示されるため）
          const wins = (sp.wins || 0) + (decisionType === 'win' ? 1 : 0);
          const losses = (sp.losses || 0) + (decisionType === 'lose' ? 1 : 0);
          const saves = (sp.saves || 0) + (decisionType === 'save' ? 1 : 0);
          if (decisionType === 'save') return `${saves}S`;
          return `${wins}勝${losses}敗`;
        };

        // スクロール用テキスト組み立て
        const scrollParts = [];
        if (!isDraw) {
          scrollParts.push(`🏆 ${isHomeWin ? homeTeam.name : awayTeam.name} の勝利！`);
        } else {
          scrollParts.push('引き分け');
        }
        if (winPitcher) scrollParts.push(`勝利投手：${winPitcher.name}（${getPitcherRecord(winPitcher, winTeam, 'win')}）`);
        if (losePitcher) scrollParts.push(`敗戦投手：${losePitcher.name}（${getPitcherRecord(losePitcher, loseTeam, 'lose')}）`);
        if (savePitcher) scrollParts.push(`セーブ：${savePitcher.name}（${getPitcherRecord(savePitcher, winTeam, 'save')}）`);

        // 完封勝利 / 完投勝利
        if (!isDraw && winPitcher) {
          const winTeamPitchers = winTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0);
          if (winTeamPitchers.length === 1) {
            const loseScore = isHomeWin ? score.away : score.home;
            if (loseScore === 0) {
              scrollParts.push(`✨${winPitcher.name}が完封勝利！`);
            } else {
              scrollParts.push(`💪${winPitcher.name}が完投勝利！`);
            }
          }
        }

        // 本塁打ハイライト
        hrHitters.forEach(p => {
          const seasonHR = (p.seasonStats?.batting?.homeruns || 0) + (p.gameStats?.homeruns || 0);
          const count = p.gameStats?.homeruns || 0;
          for (let i = 0; i < count; i++) {
            scrollParts.push(`⚾${p.name}（${p.team}）${seasonHR - count + i + 1}号`);
          }
        });

        // 猛打賞（3打数3安打以上）
        const allGamePlayers = [
          ...awayTeam.players.map(p => ({ ...p, teamLabel: awayTeam.name })),
          ...homeTeam.players.map(p => ({ ...p, teamLabel: homeTeam.name }))
        ];
        allGamePlayers.forEach(p => {
          const gs = p.gameStats || {};
          const ab = gs.atBats || 0;
          const hits = gs.hits || 0;
          if (ab >= 3 && hits >= 3) {
            scrollParts.push(`🔥${p.name}（${p.teamLabel}）${ab}打数${hits}安打の猛打賞！`);
          }
        });

        // 多打点（3打点以上）
        allGamePlayers.forEach(p => {
          const rbis = p.gameStats?.rbis || 0;
          if (rbis >= 3) {
            scrollParts.push(`💥${p.name}（${p.teamLabel}）${rbis}打点の大活躍！`);
          }
        });

        // 二桁奪三振
        const allPitchers = [
          ...awayTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0).map(p => ({ ...p, teamLabel: awayTeam.name })),
          ...homeTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0).map(p => ({ ...p, teamLabel: homeTeam.name }))
        ];
        allPitchers.forEach(p => {
          const so = p.stats?.pitching?.strikeouts || 0;
          if (so >= 10) {
            scrollParts.push(`🌟${p.name}（${p.teamLabel}）${so}奪三振の力投！`);
          }
        });

        const scrollText = scrollParts.join('　　');

        return (
        <div ref={gameEndPanelRef} className="bg-surface-1 rounded-lg p-4 text-white">
          <h3 className="text-2xl font-bold mb-3 text-center text-yellow-400">🏆 試合終了</h3>
          <div className="flex justify-center items-center gap-8 text-xl font-bold mb-4">
            <div className="text-red-400">
              <div>{awayTeam.name}</div>
              <div className="text-4xl mt-1">{score.away}</div>
            </div>
            <div className="text-3xl text-gray-400">-</div>
            <div className="text-blue-400">
              <div>{homeTeam.name}</div>
              <div className="text-4xl mt-1">{score.home}</div>
            </div>
          </div>

          {/* スクロールテロップ */}
          <div className="overflow-hidden bg-surface-2 rounded-lg mb-3 py-2">
            <div className="whitespace-nowrap text-lg font-bold text-yellow-300" style={{
              display: 'inline-block',
              animation: 'marquee 12s linear infinite',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
            }}>
              <span>{scrollText}　　　　</span><span>{scrollText}　　　　</span>
            </div>
            <style>{`
              @keyframes marquee {
                0% { transform: translate3d(0, 0, 0); }
                100% { transform: translate3d(-50%, 0, 0); }
              }
            `}</style>
          </div>

          {/* 投手・本塁打情報 */}
          <div className="flex justify-center gap-6 text-sm mb-3">
            {winPitcher && (
              <div className="flex items-center gap-1">
                <span className="text-red-400 font-bold">○</span>
                <span>{winPitcher.name}</span>
                <span className="text-gray-300 text-xs">{getPitcherRecord(winPitcher, winTeam, 'win')}</span>
              </div>
            )}
            {losePitcher && (
              <div className="flex items-center gap-1">
                <span className="text-blue-400 font-bold">●</span>
                <span>{losePitcher.name}</span>
                <span className="text-gray-300 text-xs">{getPitcherRecord(losePitcher, loseTeam, 'lose')}</span>
              </div>
            )}
            {savePitcher && (
              <div className="flex items-center gap-1">
                <span className="text-green-400 font-bold">S</span>
                <span>{savePitcher.name}</span>
                <span className="text-gray-300 text-xs">{getPitcherRecord(savePitcher, winTeam, 'save')}</span>
              </div>
            )}
          </div>
          {hrHitters.length > 0 && (
            <div className="text-center text-sm mb-3">
              <span className="text-gray-300 mr-2">本塁打</span>
              {hrHitters.map((p, i) => {
                const seasonHR = (p.seasonStats?.batting?.homeruns || 0) + (p.gameStats?.homeruns || 0);
                const count = p.gameStats?.homeruns || 0;
                return (
                  <span key={i} className="text-yellow-300 mr-3">
                    {p.name}（{p.team}）{Array.from({length: count}, (_, j) => `${seasonHR - count + j + 1}号`).join('・')}
                  </span>
                );
              })}
            </div>
          )}

          {/* 打撃成績サマリー。**列を固定した表**にする。
              以前は「名前: N打数 N安打 NHR N打点」という自由文で、
              名前の長さで数字の位置が毎行ずれて縦に読めなかった。
              ⚠ players.sort() は state配列を破壊するので必ずコピーしてから並べる */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[[awayTeam, '✈️'], [homeTeam, '🏠']].map(([team, icon]) => (
              <div key={team.name} className="min-w-0">
                <h4 className="font-bold text-gray-100 mb-2 truncate" title={team.name}>
                  {icon} {team.name} 打撃成績
                </h4>
                <div className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem] gap-x-1 text-xs tabular-nums">
                  <span className="text-gray-300">選手</span>
                  <span className="text-gray-300 text-right">打数</span>
                  <span className="text-gray-300 text-right">安打</span>
                  <span className="text-gray-300 text-right">本</span>
                  <span className="text-gray-300 text-right">打点</span>
                  {[...team.players]
                    .filter(p => (p.gameStats?.atBats || 0) > 0 || (p.gameStats?.hits || 0) > 0)
                    .sort((a, b) => (a.battingOrder || 99) - (b.battingOrder || 99))
                    .map(player => {
                      const st = player.gameStats || {};
                      return (
                        <React.Fragment key={player.id}>
                          <span className="text-gray-200 truncate" title={player.name}>{player.name}</span>
                          <span className="text-gray-200 text-right">{st.atBats || 0}</span>
                          <span className="text-gray-200 text-right">{st.hits || 0}</span>
                          <span className={`text-right ${st.homeruns ? 'text-amber-300 font-bold' : 'text-gray-200'}`}>{st.homeruns || 0}</span>
                          <span className="text-gray-200 text-right">{st.rbis || 0}</span>
                        </React.Fragment>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-4 flex justify-center gap-3">
            {managedGameInfo ? (
              <button
                onClick={handleManagedGameEnd}
                className="btn-warn py-3 px-8 rounded-lg transition text-lg"
              >
                結果確定・翌日へ
              </button>
            ) : (
              <button
                onClick={() => {
                  resetGame();
                  setGameStarted(false);
                  setSelectedBatterAway(null);
                  setSelectedBatterHome(null);
                }}
                className="btn-primary py-2 px-6 rounded-lg transition"
              >
                新しい試合
              </button>
            )}
          </div>
        </div>
        );
      })()}
    </div>

    {/* ===== 右カラム: ホームチーム ===== */}
    <TeamMemberPanel
      side="home"
      team={homeTeam}
      score={score?.home}
      isBatting={!isTopInning}
      gameStarted={gameStarted}
      gameOver={gameOver}
      selectedBatter={selectedBatterHome}
      selectedPosition={selectedPositionHome}
      selectedSubstitute={selectedSubstituteHome}
      showBench={showBenchHome}
      setShowBench={setShowBenchHome}
      handleBatterClick={handleBatterClick}
      handlePositionClick={handlePositionClick}
      handleSubstituteClick={handleSubstituteClick}
      getPositionColor={getPositionColor}
      getPositionColorHighlighted={getPositionColorHighlighted}
    />
  </div>
  
      </div>
  );
}
