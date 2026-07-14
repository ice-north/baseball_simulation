import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TEAMS_DATA, releasedPlayersPool } from '../teams-data.js';
import { addToReleasedPool } from '../state/pools.js';
import { POSITION_NAMES, getAbilityColor, getAbilityRank, getRankColor, getPositionSortIndex } from '../utils/constants.js';
import { finalizePlayerSeason, getPitchTypeName } from '../season/yearProgressionSystem.js';
import { AbilityValue } from './AbilityValue.jsx';
import { AbilityLegend } from './GameUIComponents.jsx';

// AI自動解雇のロスター調整パラメータ
const AI_MIN_ROSTER = 17;   // この人数を下回らない範囲で解雇
const AI_MIN_RELEASES = 3;  // 各AIチームの最低解雇人数（ロスター余裕がある限り適用）

/**
 * AI自動解雇ロジック
 * - 年齢が高い選手(26歳以降ペナルティ増加)
 * - 能力値が低い選手
 * を優先的に解雇。最低でも AI_MIN_RELEASES 人は解雇する（ロスター下限の範囲内で）。
 *
 * スコアベースの候補（score >= 20）が AI_MIN_RELEASES より多い場合はそちらを優先。
 * 少ない場合でも上位 AI_MIN_RELEASES 人は強制解雇する。
 * これによりAIチームが選手を保持し続けてユーザーがトライアウトを独占するのを防ぐ。
 */
const getAIReleaseCandidates = (players) => {
  if (!players || players.length <= AI_MIN_ROSTER) return [];

  const scored = players.map(p => {
    let score = 0; // 高いほど解雇候補
    const age = p.age || 20;
    const isPitcher = p.position === 'pitcher';

    // 年齢（26歳以降ペナルティ、加齢で急増）
    if (age >= 38) score += 60;
    else if (age >= 36) score += 45;
    else if (age >= 34) score += 30;
    else if (age >= 32) score += 20;
    else if (age >= 30) score += 15;
    else if (age >= 28) score += 10;
    else if (age >= 26) score += 5;

    // 能力値が低い
    if (isPitcher) {
      const overall = ((p.pitching?.velocity || 130) - 115) * 2.5 + (p.pitching?.control || 50) + ((p.pitching?.stamina || 100) / 2);
      if (overall / 3 < 35) score += 25;
      else if (overall / 3 < 45) score += 15;
    } else {
      const overall = ((p.batting?.meet||0) + (p.batting?.power||0) + (p.physical?.speed||0) + (p.physical?.arm||0) + (p.fielding?.defense||0)) / 5;
      if (overall < 35) score += 25;
      else if (overall < 45) score += 15;
    }

    return { player: p, score };
  });

  // スコア降順でソート（解雇したい選手が先頭にくる）
  scored.sort((a, b) => b.score - a.score);

  // ロスター下限を守れる解雇可能数
  const maxRelease = Math.max(0, players.length - AI_MIN_ROSTER);
  // スコアベースの候補数と最低解雇数の大きい方を採用
  const scoreBasedCount = scored.filter(s => s.score >= 20).length;
  const desiredCount = Math.max(AI_MIN_RELEASES, scoreBasedCount);
  const releaseCount = Math.min(desiredCount, maxRelease);

  return scored.slice(0, releaseCount).map(s => s.player.id);
};

// 野手/投手の総合力（スカウト画面と同じ算出式）
const fielderOverall = (p) =>
  Math.round(((p.batting?.meet||0) + (p.batting?.power||0) + (p.physical?.speed||0) + (p.physical?.arm||0) + (p.fielding?.defense||0)) / 5);
const pitcherOverall = (p) =>
  Math.round((((p.pitching?.velocity||130) - 115) * 2.5 + (p.pitching?.control || 50) + ((p.pitching?.stamina || 100) / 2)) / 3);

const ContractScreen = ({ seasonData, allTeams, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const [releasedPlayers, setReleasedPlayers] = useState({});
  const [aiProcessed, setAiProcessed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // AI チームの自動解雇処理
  useEffect(() => {
    if (aiProcessed) return;
    const aiReleases = {};
    teamNames.forEach(teamName => {
      if (teamName === userTeamName) return; // ユーザーチームはスキップ
      const team = TEAMS_DATA[teamName];
      if (!team?.players) return;
      const candidates = getAIReleaseCandidates(team.players);
      if (candidates.length > 0) {
        aiReleases[teamName] = candidates;
      }
    });
    setReleasedPlayers(prev => ({ ...prev, ...aiReleases }));
    setAiProcessed(true);
  }, []);

  const teamData = TEAMS_DATA[userTeamName];
  const players = teamData?.players || [];
  const userReleased = releasedPlayers[userTeamName] || [];

  // ソート用の値を取得
  const getSortValue = (player, key) => {
    const isPitcher = player.position === 'pitcher';
    switch (key) {
      case 'name': return player.name;
      case 'age': return player.age || 0;
      case 'growth': return Math.max(0.3, Math.min(1.8, (player.growthPotential ?? 1.0) + (player.growthModifier || 0)));
      case 'position': return getPositionSortIndex(player.position);
      case 'meet': return player.batting?.meet || 0;
      case 'power': return player.batting?.power || 0;
      case 'speed': return player.physical?.speed || 0;
      case 'arm': return player.physical?.arm || 0;
      case 'defense': return player.fielding?.defense || 0;
      case 'eye': return player.batting?.eye || 0;
      case 'steal': return player.batting?.steal || 0;
      case 'velocity': return player.pitching?.velocity || 0;
      case 'control': return player.pitching?.control || 0;
      case 'stamina': return player.pitching?.stamina || 0;
      case 'spinRate': return player.pitching?.spinRate ?? 0;
      case 'fielderOverall': return fielderOverall(player);
      case 'pitcherOverall': return pitcherOverall(player);
      case 'games': return isPitcher ? (player.seasonStats?.pitching?.games || 0) : (player.seasonStats?.batting?.games || 0);
      case 'overall':
        if (isPitcher) {
          return ((player.pitching?.velocity || 130) - 115) * 2.5 + (player.pitching?.control || 50) + ((player.pitching?.stamina || 100) / 2);
        }
        return ((player.batting?.meet||0) + (player.batting?.power||0) + (player.physical?.speed||0) + (player.physical?.arm||0) + (player.fielding?.defense||0)) / 5;
      default: return 0;
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedPlayers = useMemo(() => {
    if (!sortKey) return players;
    return [...players].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [players, sortKey, sortAsc]);

  const SORT_TOOLTIPS = {
    'ミ': 'ミート', 'パ': 'パワー', '走': '走力', '肩': '肩力', '守': '守備力',
    '眼': '選球眼', '盗': '盗塁', '速': '球速', '制': '制球', 'ス': 'スタミナ',
    '回': '球の回転数', '野': '野手総合力', '投': '投手総合力',
    '試': '試合数', '成績': '今季成績', '齢': '年齢', '成長': '成長率',
  };
  // ツールチップは native title で（Tooltipで<th>をラップすると列がズレるため）
  const SortHeader = ({ label, sortKeyVal, className = '' }) => (
    <th
      title={SORT_TOOLTIPS[label]}
      className={`py-1 px-1 cursor-pointer hover:text-white hover:bg-gray-600 transition select-none ${sortKey === sortKeyVal ? 'bg-gray-600 text-white' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); handleSort(sortKeyVal); }}
    >
      {label}{sortKey === sortKeyVal ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  const toggleRelease = (playerId) => {
    const current = releasedPlayers[userTeamName] || [];
    if (current.includes(playerId)) {
      setReleasedPlayers({ ...releasedPlayers, [userTeamName]: current.filter(id => id !== playerId) });
    } else {
      setReleasedPlayers({ ...releasedPlayers, [userTeamName]: [...current, playerId] });
    }
  };

  const handleConfirm = () => {
    const currentYear = seasonData?.year || 1;
    // 全チームの解雇を実行
    Object.entries(releasedPlayers).forEach(([teamName, playerIds]) => {
      const td = TEAMS_DATA[teamName];
      if (td && playerIds.length > 0) {
        // 解雇される選手を解雇プールに追加（若年〜中堅のみ再トライアウト可能）
        const releasedPlayerObjs = td.players.filter(p => playerIds.includes(p.id));
        releasedPlayerObjs.forEach(p => {
          const age = p.age || 20;
          // 33歳以上は引退扱い（プールに入れない）
          if (age >= 33) return;
          // シーズン成績を通算に加算してからディープコピー保存
          // （この段階ではまだ resetSeasonStats 未実行のため、自前で終了処理する）
          const finalized = finalizePlayerSeason(p, currentYear);
          const snapshot = JSON.parse(JSON.stringify(finalized));
          snapshot.isStarter = false;
          snapshot.battingOrder = 0;
          snapshot.releasedYear = currentYear;
          snapshot.previousTeam = teamName;
          snapshot.attemptsInPool = 0;
          // 解雇後は試合出場しないため、シーズン終了処理を再適用されないようにマーク
          snapshot.seasonFinalizedYear = currentYear;
          addToReleasedPool(snapshot);
        });
        td.players = td.players.filter(p => !playerIds.includes(p.id));
      }
    });
    setConfirmed(true);
  };


  const totalReleased = Object.values(releasedPlayers).reduce((sum, arr) => sum + arr.length, 0);
  const aiReleasedCount = Object.entries(releasedPlayers)
    .filter(([name]) => name !== userTeamName)
    .reduce((sum, [, arr]) => sum + arr.length, 0);

  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <h1 className="text-xl font-bold text-white mb-1">契約更改 - {seasonData?.year || 1}年目</h1>
      <p className="text-gray-400 text-xs mb-1">自チームの選手を解雇できます。クリックで解雇/契約を切り替え。</p>
      <AbilityLegend className="mb-2" />
      {aiReleasedCount > 0 && (
        <p className="text-yellow-400 text-xs mb-2">AIチームは{aiReleasedCount}人の選手を自動解雇します。</p>
      )}

      {!confirmed ? (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-white font-bold">{userTeamName}</span>
            <span className="text-gray-300 text-sm">
              現在 {players.length}人 / 解雇予定 {userReleased.length}人 → 残り {players.length - userReleased.length}人
            </span>
          </div>

          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-800">
                <tr className="border-b border-gray-600 text-xs text-gray-400">
                  <th className="py-1 px-1">状態</th>
                  <SortHeader label="名前" sortKeyVal="name" />
                  <SortHeader label="齢" sortKeyVal="age" />
                  <SortHeader label="成長" sortKeyVal="growth" className="text-center" />
                  <SortHeader label="位" sortKeyVal="position" />
                  <th className="py-1 px-1 text-center" title="投球/打席の左右">投打</th>
                  <SortHeader label="ミ" sortKeyVal="meet" className="text-center" />
                  <SortHeader label="パ" sortKeyVal="power" className="text-center" />
                  <SortHeader label="走" sortKeyVal="speed" className="text-center" />
                  <SortHeader label="肩" sortKeyVal="arm" className="text-center" />
                  <SortHeader label="守" sortKeyVal="defense" className="text-center" />
                  <SortHeader label="眼" sortKeyVal="eye" className="text-center" />
                  <SortHeader label="盗" sortKeyVal="steal" className="text-center" />
                  <SortHeader label="速" sortKeyVal="velocity" className="text-center" />
                  <SortHeader label="制" sortKeyVal="control" className="text-center" />
                  <SortHeader label="ス" sortKeyVal="stamina" className="text-center" />
                  <SortHeader label="回" sortKeyVal="spinRate" className="text-center" />
                  <th className="py-1 px-1 text-center" title="習得変化球">変化球</th>
                  <SortHeader label="野" sortKeyVal="fielderOverall" className="text-center" />
                  <SortHeader label="投" sortKeyVal="pitcherOverall" className="text-center" />
                  <SortHeader label="試" sortKeyVal="games" className="text-center" />
                  <SortHeader label="成績" sortKeyVal="overall" className="text-center" />
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map(player => {
                  const isPitcher = player.position === 'pitcher';
                  const isReleased = userReleased.includes(player.id);
                  const batting = player.seasonStats?.batting || {};
                  const pitching = player.seasonStats?.pitching || {};
                  const games = isPitcher ? (pitching.games || 0) : (batting.games || 0);
                  const avg = batting.atBats > 0 ? (batting.hits / batting.atBats).toFixed(3) : '-';
                  const era = pitching.inningsPitched > 0
                    ? ((pitching.earnedRuns || 0) / (pitching.inningsPitched / 3) * 9).toFixed(2)
                    : '-';
                  const statsStr = isPitcher
                    ? `${pitching.wins || 0}勝${pitching.losses || 0}敗 ERA${era}`
                    : `${avg} ${batting.homeruns || 0}HR ${batting.rbis || 0}打点`;

                  return (
                    <tr
                      key={player.id}
                      className={`border-b border-gray-700/50 cursor-pointer transition ${isReleased ? 'bg-red-900/30 opacity-60' : 'hover:bg-gray-700/50'}`}
                      onClick={() => toggleRelease(player.id)}
                    >
                      <td className="py-1 px-1">
                        {isReleased
                          ? <span className="text-red-400 font-bold text-xs">解雇</span>
                          : <span className="text-green-400 text-xs">契約</span>
                        }
                      </td>
                      <td className="py-1 px-1 text-sm text-white font-bold">{player.name}</td>
                      <td className="py-1 px-1 text-xs text-gray-300 text-center">{player.age || '?'}</td>
                      <td className="py-1 px-1 text-xs text-center">
                        {(() => {
                          const base = player.growthPotential ?? 1.0;
                          const mod = player.growthModifier || 0;
                          const effective = Math.max(0.3, Math.min(1.8, base + mod));
                          const color = effective >= 1.3 ? 'text-pink-400' : effective >= 1.2 ? 'text-red-400' : effective >= 1.1 ? 'text-orange-400' : effective >= 1.0 ? 'text-yellow-400' : effective >= 0.9 ? 'text-green-400' : effective >= 0.8 ? 'text-blue-400' : 'text-gray-400';
                          return (
                            <span className={color} title={`基礎:${base.toFixed(2)} 変動:${mod >= 0 ? '+' : ''}${mod.toFixed(2)}`}>
                              {effective.toFixed(2)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-1 px-1 text-xs text-gray-300 text-center">{POSITION_NAMES[player.position] || player.position}</td>
                      <td className="py-1 px-1 text-xs text-center text-gray-400 whitespace-nowrap">
                        {player.physical?.throws === 'left' ? '左投' : '右投'}{player.batting?.bats === 'left' ? '左打' : player.batting?.bats === 'switch' ? '両打' : '右打'}
                      </td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.batting?.meet || 0)}`}>{player.batting?.meet || 0}</td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.batting?.power || 0)}`}>{player.batting?.power || 0}</td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.physical?.speed || 0)}`}>{player.physical?.speed || 0}</td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.physical?.arm || 0)}`}>{player.physical?.arm || 0}</td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.fielding?.defense || 0)}`}>{player.fielding?.defense || 0}</td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.batting?.eye || 0)}`}>{player.batting?.eye || 0}</td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.batting?.steal || 0)}`}>{player.batting?.steal || 0}</td>
                      <td className="py-1 px-1 text-xs text-center"><AbilityValue value={player.pitching?.velocity || 0} isVel /></td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.pitching?.control || 0)}`}>{player.pitching?.control || 0}</td>
                      <td className="py-1 px-1 text-xs text-center"><AbilityValue value={player.pitching?.stamina || 0} isSta /></td>
                      <td className={`py-1 px-1 text-xs text-center ${getAbilityColor(player.pitching?.spinRate ?? 0)}`}>{isPitcher ? (player.pitching?.spinRate ?? '-') : '-'}</td>
                      <td className="py-1 px-1 text-xs text-center whitespace-nowrap">
                        {(() => {
                          if (!isPitcher) return <span className="text-gray-600">-</span>;
                          const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
                          if (arsenal.length === 0) return <span className="text-gray-600">-</span>;
                          return arsenal.map((a, i) => (
                            <span key={i} className={getAbilityColor(a.level || 0)}>{i > 0 ? '/' : ''}{getPitchTypeName(a.type)}{a.level || 0}</span>
                          ));
                        })()}
                      </td>
                      <td className={`py-1 px-1 text-xs text-center font-bold ${getRankColor(getAbilityRank(fielderOverall(player)))}`}>{isPitcher ? '-' : fielderOverall(player)}</td>
                      <td className={`py-1 px-1 text-xs text-center font-bold ${getRankColor(getAbilityRank(pitcherOverall(player)))}`}>{isPitcher ? pitcherOverall(player) : '-'}</td>
                      <td className="py-1 px-1 text-xs text-center text-gray-300">{games}</td>
                      <td className="py-1 px-1 text-xs text-gray-300 whitespace-nowrap">{statsStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => userReleased.length > 0 ? setShowReview(true) : handleConfirm()}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-1.5 rounded font-bold text-sm"
            >
              契約更改を確定する
            </button>
            <button
              onClick={() => {
                setReleasedPlayers(prev => ({ ...prev, [userTeamName]: [] }));
                handleConfirm();
              }}
              className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-1.5 rounded text-sm"
            >
              解雇せずに確定
            </button>
          </div>

          {showReview && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowReview(false)}>
              <div className="bg-gray-800 rounded-xl border border-gray-600 max-w-lg w-full p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-white font-bold text-lg mb-3">契約更改の確認</h3>
                <div className="bg-gray-900/60 rounded-lg p-3 mb-3 max-h-48 overflow-y-auto">
                  <div className="text-gray-400 text-xs mb-2">解雇予定選手 ({userReleased.length}人)</div>
                  {players.filter(p => userReleased.includes(p.id)).map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-700/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">{POSITION_NAMES[p.position]}</span>
                        <span className="text-white font-bold">{p.name}</span>
                        <span className="text-gray-500 text-xs">{p.age}歳</span>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${(p.age || 20) >= 33 ? 'bg-gray-700 text-gray-400' : 'bg-blue-900/50 text-blue-300'}`}>
                        {(p.age || 20) >= 33 ? '引退' : 'リリースプール'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-gray-400 text-xs mb-4 space-y-1">
                  <div>残りロスター: <span className="text-white font-bold">{players.length - userReleased.length}人</span></div>
                  <div className="text-yellow-400/80">この操作は取り消せません。33歳以上の選手は引退、33歳未満はリリースプールに移動します。</div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowReview(false)} className="px-4 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition">
                    戻る
                  </button>
                  <button onClick={() => { setShowReview(false); handleConfirm(); }} className="bg-red-600 hover:bg-red-500 text-white px-5 py-1.5 rounded font-bold text-sm transition">
                    解雇を確定する
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-10">
          <p className="text-xl text-green-400 font-bold mb-4">契約更改が完了しました</p>
          {totalReleased > 0 && (
            <p className="text-gray-300 mb-4">{totalReleased}人の選手を解雇しました。(AI: {aiReleasedCount}人, 自チーム: {userReleased.length}人)</p>
          )}
          <p className="text-gray-400 mb-6">次はトライアウトで新選手を獲得できます。</p>
          <button
            onClick={() => { if (onComplete) onComplete(); }}
            className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold text-lg"
          >
            トライアウトへ進む
          </button>
        </div>
      )}
    </div>
  );
};

export default ContractScreen;
