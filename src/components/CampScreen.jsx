import React, { useState, useEffect } from 'react';
import TutorialHint from './TutorialHint.jsx';
import { TEAMS_DATA } from '../teams-data.js';
import { DIRECTIONS, PHASES, resolveTraining, moodMultiplier, describeMood, playerWish } from '../season/trainingPolicy.js';
import { TRAINING_MENUS, SUB_TRAINING_MENUS, executeTeamCampTraining, executeSubTraining, ALL_PITCH_TYPES, getPitchTypeName, FORM_PITCH_AFFINITY, calcSecondAffinity, DISPATCH_DESTINATIONS, DISPATCH_LIMITS, checkDispatchEligibility, executeDispatchTraining, resolveDispatchTraining, calcPlayerOverall, applyMotivationEffect, applyBatteryMentalEffect, getUniversityDispatchOptions, getAvailableDispatchKeys } from '../season/yearProgressionSystem.js';
import { POSITION_NAMES, POSITION_ORDER, getAbilityColor, POSITION_GROUP_COLORS, FORM_SHORT } from '../utils/constants.js';
import { AbilityValue } from './AbilityValue.jsx';
import { getTeamStaffBonus } from '../corporate/staffData.js';
import { SPECIALTY_LABELS, SPECIALTY_ICONS } from '../university/universityTeamsData.js';

// MAX_CAMP_ROUNDS is now a prop (maxRounds)

function getCampCoachComment(player, round) {
  if (round < 2) return null;
  const gp = (player.growthPotential ?? 1.0) + (player.growthModifier || 0);
  const gm = player.growthModifier || 0;

  // 疲労酷使による低下を優先表示
  if (gm <= -0.10 && Math.random() < 0.7) {
    return { text: ['昨季の疲れが残っている', '身体が重そうだ'][Math.floor(Math.random() * 2)], color: 'text-red-400' };
  }
  if (gm <= -0.05 && Math.random() < 0.5) {
    return { text: '少し疲労の影響が見える', color: 'text-orange-400' };
  }
  // 優勝経験による上昇
  if (gm >= 0.05 && Math.random() < 0.5) {
    return { text: ['優勝の自信が練習に出ている', '一皮むけた印象だ'][Math.floor(Math.random() * 2)], color: 'text-cyan-400' };
  }

  if (gp >= 1.3 && Math.random() < 0.6) {
    return { text: ['吸収が早い', '伸びが凄い', '手応え十分'][Math.floor(Math.random() * 3)], color: 'text-yellow-400' };
  }
  if (gp >= 1.15 && Math.random() < 0.4) {
    return { text: ['順調に伸びている', '良い成長を見せている'][Math.floor(Math.random() * 2)], color: 'text-green-400' };
  }
  if (gp <= 0.7 && Math.random() < 0.5) {
    return { text: ['伸び悩みか…', '壁にぶつかっている'][Math.floor(Math.random() * 2)], color: 'text-gray-400' };
  }
  if (gp <= 0.85 && Math.random() < 0.3) {
    return { text: '現状維持が精一杯か', color: 'text-gray-400' };
  }
  return null;
}

// 投手/野手のステータスを正規化して比較可能にするヘルパー
function getPitcherStats(p) {
  return { velocity: ((p.pitching?.velocity||130)-115)*2.5, control: p.pitching?.control||50, stamina: (p.pitching?.stamina||100)/2 };
}
function getFielderStats(p) {
  return { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0, eye: p.batting?.eye||0 };
}
function sortedStatKeys(stats, ascending = true) {
  return Object.entries(stats).sort((a,b) => ascending ? a[1]-b[1] : b[1]-a[1]).map(e => e[0]);
}
function pitcherStatToMain(statKey) {
  return statKey === 'velocity' ? 'velocity' : 'control';
}
function fielderStatToMain(statKey) {
  if (statKey === 'meet' || statKey === 'power' || statKey === 'eye') return 'batting';
  if (statKey === 'speed') return 'baserunning';
  if (statKey === 'defense') return 'fielding';
  return 'batting';
}
function pitcherStatToSub(statKey) {
  return 'physique';
}
function fielderStatToSub(statKey) {
  if (statKey === 'eye') return 'eye';
  if (statKey === 'defense') return 'defense_sub';
  return 'physique';
}

const CAMP_PRESETS = {
  weakness: {
    name: '弱点克服', icon: '📈',
    desc: '最も低い能力を集中的に強化',
    getMain: (p) => {
      if (p.position === 'pitcher') return pitcherStatToMain(sortedStatKeys(getPitcherStats(p))[0]);
      return fielderStatToMain(sortedStatKeys(getFielderStats(p))[0]);
    },
    getSub: (p) => {
      if (p.position === 'pitcher') return pitcherStatToSub(sortedStatKeys(getPitcherStats(p))[1]);
      return fielderStatToSub(sortedStatKeys(getFielderStats(p))[1]);
    },
  },
  strength: {
    name: '長所強化', icon: '💪',
    desc: '最も高い能力をさらに伸ばす',
    getMain: (p) => {
      if (p.position === 'pitcher') return pitcherStatToMain(sortedStatKeys(getPitcherStats(p), false)[0]);
      return fielderStatToMain(sortedStatKeys(getFielderStats(p), false)[0]);
    },
    getSub: (p) => {
      if (p.position === 'pitcher') {
        return 'stretch';
      }
      const top = sortedStatKeys(getFielderStats(p), false)[0];
      if (top === 'eye') return 'eye';
      if (top === 'defense') return 'defense_sub';
      return 'physique';
    },
  },
  balanced: {
    name: 'バランス育成', icon: '⚖️',
    desc: '投手は投手練習、野手は野手練習をバランスよく',
    getMain: (p) => {
      if (p.position === 'pitcher') return pitcherStatToMain(sortedStatKeys(getPitcherStats(p))[0]);
      const meet = p.batting?.meet||0;
      const def = p.fielding?.defense||0;
      const spd = p.physical?.speed||0;
      if (meet <= def && meet <= spd) return 'batting';
      if (def <= spd) return 'fielding';
      return 'baserunning';
    },
    getSub: (p) => {
      return 'physique';
    },
  },
  physical: {
    name: 'フィジカル', icon: '🏃',
    desc: '投手は球速強化、野手は走力・パワーを重点強化',
    getMain: (p) => {
      if (p.position === 'pitcher') return 'velocity';
      const spd = p.physical?.speed||0;
      const pow = p.batting?.power||0;
      return spd <= pow ? 'baserunning' : 'batting';
    },
    getSub: (p) => {
      return 'physique';
    },
  },
  technical: {
    name: '技術磨き', icon: '🎯',
    desc: '投手は制球・変化球、野手はミート・選球眼を強化',
    getMain: (p) => {
      if (p.position === 'pitcher') return 'control';
      return 'batting';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') return 'breaking';
      return 'eye';
    },
  },
  role_focused: {
    name: '実戦重視', icon: '🏟️',
    desc: '投手は制球・投げ込み、野手は打撃/守備を強化',
    getMain: (p) => {
      if (p.position === 'pitcher') {
        return 'control';
      }
      const meet = p.batting?.meet||0;
      const def = p.fielding?.defense||0;
      return meet < 45 ? 'batting' : def < 45 ? 'fielding' : 'batting';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') {
        const control = p.pitching?.control || 50;
        return control >= 55 ? 'breaking' : 'physique';
      }
      const def = p.fielding?.defense||0;
      return def < 40 ? 'defense_sub' : 'physique';
    },
  },
  coach: {
    name: 'コーチおすすめ', icon: '📋',
    desc: '各選手の能力・年齢・疲労から最適な練習を提案',
    getMain: (p) => {
      const age = p.age || 20;
      const gm = p.growthModifier || 0;
      if (p.position === 'pitcher') {
        const v = p.pitching?.velocity || 130;
        const c = p.pitching?.control || 50;
        const s = p.pitching?.stamina || 80;
        const arsenal = p.pitching?.arsenal || [];
        const breakingCount = arsenal.filter(a => a.name !== 'ストレート').length;
        const avgBreaking = breakingCount > 0
          ? arsenal.filter(a => a.name !== 'ストレート').reduce((sum, a) => sum + (a.level || 0), 0) / breakingCount
          : 0;
        if (s < 65) return 'control';
        if (c < 35) return 'control';
        if (breakingCount <= 1) return 'newpitch';
        if (age <= 23 && v < 148) return 'velocity';
        if (age <= 23 && v >= 148 && c < 50) return 'control';
        if (c < 50) return 'control';
        if (avgBreaking < 40 && breakingCount >= 2) return 'control';
        if (age >= 29) return 'control';
        return v < 145 ? 'velocity' : 'control';
      }
      const meet = p.batting?.meet || 0;
      const power = p.batting?.power || 0;
      const eye = p.batting?.eye || 0;
      const speed = p.physical?.speed || 0;
      const def = p.fielding?.defense || 0;
      const steal = p.batting?.steal || 0;
      if (def < 30) return 'fielding';
      if (meet < 25 && power < 25) return 'batting';
      if (age <= 23 && speed >= 55 && steal < 40) return 'baserunning';
      if (age <= 23 && speed < 40) return 'baserunning';
      const weakest = [
        { key: 'batting', val: (meet + power * 0.7) / 1.7 },
        { key: 'baserunning', val: (speed + steal * 0.5) / 1.5 },
        { key: 'fielding', val: def },
        { key: 'eye', val: eye },
      ].sort((a, b) => a.val - b.val);
      if (age >= 29) {
        if (eye < 40) return 'eye';
        if (def < 45) return 'fielding';
        return meet <= power ? 'batting' : 'eye';
      }
      if (weakest[0].val < 35) return weakest[0].key;
      if (age <= 23) {
        if (power < 40) return 'batting';
        if (speed < 45) return 'baserunning';
      }
      return weakest[0].key;
    },
    getSub: (p) => {
      const age = p.age || 20;
      const gm = p.growthModifier || 0;
      if (gm <= -0.08 || (age >= 32 && (p.physical?.recovery || 50) < 40)) return 'stretch';
      if (p.position === 'pitcher') {
        const c = p.pitching?.control || 50;
        const s = p.pitching?.stamina || 80;
        const arsenal = p.pitching?.arsenal || [];
        const breakingCount = arsenal.filter(a => a.name !== 'ストレート').length;
        const avgBreaking = breakingCount > 0
          ? arsenal.filter(a => a.name !== 'ストレート').reduce((sum, a) => sum + (a.level || 0), 0) / breakingCount
          : 0;
        if (avgBreaking < 35 && breakingCount >= 2) return 'breaking';
        if (s < 80) return 'physique';
        if (breakingCount >= 2 && avgBreaking < 55) return 'breaking';
        if (age >= 29) return 'stretch';
        return 'physique';
      }
      const def = p.fielding?.defense || 0;
      const eye = p.batting?.eye || 0;
      const speed = p.physical?.speed || 0;
      const lead = p.catching?.lead || 0;
      if (p.position === 'catcher' && lead < 40) return 'clead_study';
      if (def < 35) return 'defense_sub';
      if (eye < 30) return 'eye';
      if (age >= 29) return 'stretch';
      return 'physique';
    },
  },
};

const CampScreen = ({ onComplete, allTeams, seasonData, gameMode, maxRounds = 4, campTitle = '春季キャンプ', completeLabel = 'シーズン開始' }) => {
  const MAX_CAMP_ROUNDS = maxRounds;
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const userTeam = TEAMS_DATA[userTeamName];
  const currentYear = seasonData?.year || 1;

  const [currentRound, setCurrentRound] = useState(1);
  const [policyDir, setPolicyDir] = useState('balanced');
  const [policyPhase, setPolicyPhase] = useState('skill');
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => {
      init[p.id] = p.position === 'pitcher' ? 'control' : 'batting';
    });
    return init;
  });
  const [subAssignments, setSubAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => { init[p.id] = 'physique'; });
    return init;
  });
  const [newPitchSelections, setNewPitchSelections] = useState({});
  const [subPositionSelections, setSubPositionSelections] = useState({});
  // 変化球練習で1球種を指定して集中練習する（未指定なら従来どおり全球種に分配）
  const [subPitchSelections, setSubPitchSelections] = useState({});
  const [formSelections, setFormSelections] = useState({});
  const [batsSelections, setBatsSelections] = useState({});
  const [roundResults, setRoundResults] = useState(null);
  const [viewMode, setViewMode] = useState('select');
  const [dispatchConfirm, setDispatchConfirm] = useState(null); // { playerId, destKey }
  const [dispatchResults, setDispatchResults] = useState([]); // キャンプ終了時の派遣結果表示
  const [updateKey, setUpdateKey] = useState(0); // 再レンダリング用
  const [sortKey, setSortKey] = useState('position');
  const [sortAsc, setSortAsc] = useState(true);
  const [showCampReview, setShowCampReview] = useState(false);
  const [campTab, setCampTab] = useState('pitcher');
  // 「投手だが打撃練習をさせたい」等のために、選手を反対側のタブへ移せるようにする。
  // 表示する列が投手系／野手系で違うので、練習を変えたら見たい数字も変わるため。
  // ⚠ キャンプ中だけの表示上の割り当て。選手データ(position)は変えない
  const [trainingSide, setTrainingSide] = useState({});   // { [playerId]: 'pitcher' | 'fielder' }

  // 旧セーブデータ対応: 第2適性が未設定の投手にキャンプ開始時に初期値を付与
  useEffect(() => {
    const team = TEAMS_DATA[userTeamName];
    if (!team?.players) return;
    team.players.forEach(p => {
      if (p.position === 'pitcher' && p.pitching && p.pitching.secondAffinity === undefined) {
        p.pitching.secondAffinity = calcSecondAffinity(p.pitching.arsenal || []);
      }
    });
  }, [userTeamName]);

  // キャンプ開始時のステータスを保存（成長合計計算用）
  const [preCampStats] = useState(() => {
    const stats = {};
    userTeam?.players?.forEach(p => {
      stats[p.id] = {
        name: p.name,
        position: p.position,
        batting: { ...(p.batting || {}) },
        pitching: { ...(p.pitching || {}), arsenal: (p.pitching?.arsenal || []).map(a => ({ ...a })) },
        physical: { ...(p.physical || {}) },
        fielding: { ...(p.fielding || {}) },
        catching: { ...(p.catching || {}) },
        positionFitness: { ...(p.positionFitness || {}) },
      };
    });
    return stats;
  });

  const handleDispatch = (playerId, destKey, universityId) => {
    const player = userTeam?.players?.find(p => p.id === playerId);
    if (!player) return;
    executeDispatchTraining(player, destKey, universityId ? { universityId } : {});
    setDispatchConfirm(null);
    setUpdateKey(prev => prev + 1);
  };

  const toggleSort = (key) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(key === 'position'); }
  };
  const sortedPlayers = [...(userTeam?.players || [])].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    const getVal = (p) => {
      switch (sortKey) {
        case 'position': return POSITION_ORDER.indexOf(p.position);
        case 'age': return p.age || 20;
        case 'build': return p.physical?.build === 'large' ? 2 : p.physical?.build === 'small' ? 0 : 1;
        case 'growth': return (p.growthPotential ?? 1.0) + (p.growthModifier || 0);
        case 'discipline': return p.personality?.discipline || 0;
        case 'mental': return p.personality?.mental || 0;
        case 'meet': return p.batting?.meet || 0;
        case 'power': return p.batting?.power || 0;
        case 'speed': return p.physical?.speed || 0;
        case 'arm': return p.physical?.arm || 0;
        case 'dexterity': return p.physical?.dexterity || 0;
        case 'defense': return p.fielding?.defense || 0;
        case 'clead': return p.catching?.lead || 0;
        case 'eye': return p.batting?.eye || 0;
        case 'bunt': return p.batting?.bunt || 0;
        case 'velocity': return p.pitching?.velocity || 0;
        case 'control': return p.pitching?.control || 0;
        case 'stamina': return p.pitching?.stamina || 0;
        case 'bodyStamina': return p.physical?.bodyStamina || 0;
        case 'recovery': return p.physical?.recovery || 0;
        case 'muscle': return p.physical?.muscle ?? 50;
        default: return 0;
      }
    };
    const diff = (getVal(a) - getVal(b)) * dir;
    if (diff !== 0) return diff;
    const posA = POSITION_ORDER.indexOf(a.position);
    const posB = POSITION_ORDER.indexOf(b.position);
    return posA - posB;
  });

  const isPitcher = (player) => player.position === 'pitcher';

  // 能力表示は共通の AbilityValue に集約（配色の単一の真実の源）
  const StatValue = ({ value, label, isVelocity = false, isStamina = false }) => (
    <span title={`${label}: ${value}`}><AbilityValue value={value} isVel={isVelocity} isSta={isStamina} /></span>
  );

  const FitnessValue = ({ value }) => {
    if (value === undefined || value === null) return <span className="text-gray-700">-</span>;
    const color = value >= 80 ? 'text-green-400' : value >= 60 ? 'text-yellow-400' : value >= 40 ? 'text-orange-400' : 'text-red-400';
    return <span className={`${color} text-xs`}>{value}</span>;
  };

  const getAvailableNewPitches = (player) => {
    const existing = (player.pitching?.arsenal || []).map(p => p.type);
    return ALL_PITCH_TYPES.filter(t => !existing.includes(t));
  };

  // 育成方針（方向性 × フェーズ）。既定値を作るだけで、個別の上書きは残る。
  const applyPolicy = (dir, phase) => {
    setPolicyDir(dir); setPolicyPhase(phase);
    const newAssign = {}; const newSubAssign = {};
    userTeam?.players?.forEach(p => {
      const r = resolveTraining(p, dir, phase);
      newAssign[p.id] = r.main; newSubAssign[p.id] = r.sub;
    });
    setAssignments(newAssign); setSubAssignments(newSubAssign);
  };

  const applyPreset = (presetKey) => {
    const preset = CAMP_PRESETS[presetKey];
    if (!preset) return;
    const newAssign = {};
    const newSubAssign = {};
    userTeam?.players?.forEach(p => {
      newAssign[p.id] = preset.getMain(p);
      newSubAssign[p.id] = preset.getSub(p);
    });
    setAssignments(newAssign);
    setSubAssignments(newSubAssign);
  };

  const handleExecuteTraining = () => {
    if (!userTeam || !userTeam.players) return;

    const finalAssignments = {};
    userTeam.players.forEach(p => {
      if (p.dispatchedThisCamp) return; // 派遣済みの選手はスキップ
      finalAssignments[p.id] = assignments[p.id] || (isPitcher(p) ? 'control' : 'batting');
    });

    const userStaffBonus = userTeam.corporateData?.staff ? getTeamStaffBonus(userTeam.corporateData.staff) : null;
    const awakeningMult = gameMode === 'university' ? 0.5 : gameMode === 'independent' ? 1.5 : 1.0;
    // 選手の希望と指示の噛み合い＝やる気。
    // ⚠ **希望どおりが正解ではない**。指示が正しいかは選手の水準と目的が決めるもので、
    //    ここは効率（身が入るか）にだけ効く。指導者が当たりということもある。
    const moodMults = {};
    userTeam.players.forEach(p => { moodMults[p.id] = moodMultiplier(p, policyDir, policyPhase); });
    const { updatedTeam, allReports } = executeTeamCampTraining(
      userTeam, finalAssignments, newPitchSelections, userStaffBonus, awakeningMult, moodMults
    );
    TEAMS_DATA[userTeamName] = updatedTeam;

    updatedTeam.players.forEach(p => {
      const subType = subAssignments[p.id] || 'physique';
      const subOptions = {
        targetPosition: subPositionSelections[p.id],
        targetPitch: subPitchSelections[p.id],
        targetForm: formSelections[p.id],
        targetBats: batsSelections[p.id],
      };
      const { growthReport: subGrowth } = executeSubTraining(p, subType, subOptions, userStaffBonus);
      const mainReport = allReports.find(r => r.player.id === p.id);
      if (mainReport && subGrowth.length > 0) {
        mainReport.subGrowthReport = subGrowth;
        mainReport.subTrainingType = subType;
      }
    });

    // モチベーション管理 → プロ意識向上、バッテリー指導 → 精神力向上
    if (userStaffBonus) {
      applyMotivationEffect(updatedTeam.players, userStaffBonus);
      applyBatteryMentalEffect(updatedTeam.players, userStaffBonus);
    }

    teamNames.forEach(tn => {
      if (tn === userTeamName) return;
      const aiTeam = TEAMS_DATA[tn];
      if (!aiTeam?.players) return;

      // AIチーム: 第1クールで適格な若手を30%の確率で派遣
      if (currentRound === 1 && currentYear > 1) {
        const aiDispatchKeys = getAvailableDispatchKeys(gameMode, seasonData?.settings?.clubMode);
        aiTeam.players.forEach(p => {
          if (p.dispatchedThisCamp) return;
          if (Math.random() > 0.3) return;

          if (aiDispatchKeys.includes('university')) {
            if (gameMode === 'corporate') {
              // 社会人: パイプのある大学からランダム選択
              const uniOpts = getUniversityDispatchOptions(aiTeam);
              const availableUnis = uniOpts.filter(u => u.remaining > 0);
              if (availableUnis.length > 0) {
                const { eligible } = checkDispatchEligibility(p, 'university', { teamData: aiTeam, gameMode });
                if (eligible) {
                  const pick = availableUnis[Math.floor(Math.random() * availableUnis.length)];
                  executeDispatchTraining(p, 'university', { universityId: pick.universityId });
                  return;
                }
              }
            } else {
              // 独立リーグ: 固定1枠
              const { eligible } = checkDispatchEligibility(p, 'university', { teamPlayers: aiTeam.players, gameMode });
              if (eligible) {
                executeDispatchTraining(p, 'university');
                return;
              }
            }
          }

          if (aiDispatchKeys.includes('proCamp')) {
            const { eligible } = checkDispatchEligibility(p, 'proCamp', { teamPlayers: aiTeam.players, allTeams: TEAMS_DATA, gameMode });
            if (eligible) {
              executeDispatchTraining(p, 'proCamp');
            }
          }
        });
      }

      const aiAssign = {};
      const pitcherMenus = ['control', 'velocity', 'newpitch'];
      const batterMenus = ['batting', 'baserunning', 'fielding'];
      aiTeam.players.forEach(p => {
        if (p.dispatchedThisCamp) return; // 派遣済みはスキップ
        if (p.position === 'pitcher') {
          aiAssign[p.id] = pitcherMenus[Math.floor(Math.random() * pitcherMenus.length)];
        } else {
          aiAssign[p.id] = batterMenus[Math.floor(Math.random() * batterMenus.length)];
        }
      });
      const aiStaffBonus = aiTeam.corporateData?.staff ? getTeamStaffBonus(aiTeam.corporateData.staff) : null;
      const aiResult = executeTeamCampTraining(aiTeam, aiAssign, {}, aiStaffBonus, awakeningMult);
      TEAMS_DATA[tn] = aiResult.updatedTeam;
      if (aiStaffBonus) {
        applyMotivationEffect(aiResult.updatedTeam.players, aiStaffBonus);
        applyBatteryMentalEffect(aiResult.updatedTeam.players, aiStaffBonus);
      }
      const subMenuKeys = Object.keys(SUB_TRAINING_MENUS);
      aiResult.updatedTeam.players.forEach(p => {
        const aiSubType = subMenuKeys[Math.floor(Math.random() * subMenuKeys.length)];
        executeSubTraining(p, aiSubType, {}, aiStaffBonus);
      });
    });

    setRoundResults(allReports);
    setViewMode('results');
  };

  const handleNextRound = () => {
    if (currentRound >= MAX_CAMP_ROUNDS) return;
    setCurrentRound(currentRound + 1);
    setRoundResults(null);
    setViewMode('select');
    // 新球種選択のステイル状態をクリア（前クールで習得した球種が残り続けるのを防ぐ）
    setNewPitchSelections({});
  };

  const getArsenalDisplay = (player) => {
    const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
    if (arsenal.length === 0) return <span className="text-gray-400">-</span>;
    // 変化球はレベルで色付け（0-100スケールなのでgetAbilityColorをそのまま使用）
    return arsenal.map((a, i) => (
      <span key={i} className={getAbilityColor(a.level || 0)}>
        {i > 0 ? ' ' : ''}{getPitchTypeName(a.type)}{a.level}
      </span>
    ));
  };

  const subPosHeaders = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const subPosShort = { catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右' };

  // 派遣中でない選手のみ表示
  const allActivePlayers = sortedPlayers.filter(p => !p.dispatchedThisCamp);

  // どちら側の練習をするか（既定はポジションどおり。移動ボタンで上書きできる）
  const sideOf = (pl) => trainingSide[pl.id] || (isPitcher(pl) ? 'pitcher' : 'fielder');
  // 野手側のどのタブに出すか。移動してきた投手は最も適性の高い守備位置のタブへ入れる
  const INFIELD = ['first', 'second', 'third', 'short'];
  const fielderTabOf = (pl) => {
    const pos = isPitcher(pl)
      ? (['catcher', ...INFIELD, 'left', 'center', 'right']
          .reduce((best, k) => ((pl.positionFitness?.[k] ?? 0) > (pl.positionFitness?.[best] ?? 0) ? k : best), 'left'))
      : pl.position;
    return pos === 'catcher' ? 'catcher' : INFIELD.includes(pos) ? 'infield' : 'outfield';
  };
  const tabOf = (pl) => (sideOf(pl) === 'pitcher' ? 'pitcher' : fielderTabOf(pl));
  const CAMP_TABS = [
    { key: 'pitcher',  label: '投手' },
    { key: 'catcher',  label: '捕手' },
    { key: 'infield',  label: '内野手' },
    { key: 'outfield', label: '外野手' },
  ];
  const activePlayers = allActivePlayers.filter(pl => tabOf(pl) === campTab);
  // 列の出し分け。37列すべてを常に出すと1536pxで幅が尽きる（実測1512/1512）
  const isPitchTab = campTab === 'pitcher';
  const showCLead = campTab === 'catcher';
  const dispatchedPlayers = sortedPlayers.filter(p => p.dispatchedThisCamp);

  return (
    <div className="p-4">
      <div className="max-w-full mx-auto">
        {/* 派遣確認モーダル */}
        {dispatchConfirm && (() => {
          const player = userTeam?.players?.find(p => p.id === dispatchConfirm.playerId);
          const dest = DISPATCH_DESTINATIONS[dispatchConfirm.destKey];
          if (!player || !dest) return null;

          {/* 社会人モード: 大学派遣はパイプのある大学を選択 */}
          if (gameMode === 'corporate' && dispatchConfirm.destKey === 'university' && !dispatchConfirm.universityId) {
            const uniOptions = getUniversityDispatchOptions(userTeam);
            return (
              <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                <div className="bg-surface-2 rounded-xl max-w-lg w-full p-5">
                  <h2 className="text-base font-bold text-white mb-3 text-center">🎓 派遣先大学を選択</h2>
                  <div className="bg-gray-700/60 rounded-lg p-3 mb-3 text-center">
                    <div className="text-white font-bold text-lg mb-1">{player.name}</div>
                    <div className="text-gray-300 text-xs">{POSITION_NAMES[player.position]} / {player.age}歳 / 総合力: {calcPlayerOverall(player)}</div>
                    {(() => {
                      const dispatched = (userTeam?.players || []).filter(p => p.dispatchedThisCamp === 'university').length;
                      const max = DISPATCH_LIMITS.perTeamUniversity;
                      return <div className={`text-xs mt-1 font-bold ${dispatched >= max ? 'text-red-400' : 'text-orange-400'}`}>チーム派遣枠: {dispatched}/{max}人</div>;
                    })()}
                  </div>
                  {uniOptions.length === 0 ? (
                    <div className="text-gray-300 text-sm text-center mb-3">OBのいる大学がありません</div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto mb-3">
                      {uniOptions.map(uni => {
                        const canDispatch = uni.remaining > 0;
                        const rankColors = { S: 'text-yellow-400', A: 'text-orange-400', B: 'text-green-400', C: 'text-blue-400', D: 'text-gray-300' };
                        return (
                          <button
                            key={uni.universityId}
                            disabled={!canDispatch}
                            onClick={() => setDispatchConfirm({ ...dispatchConfirm, universityId: uni.universityId, universityName: uni.universityName })}
                            className={`w-full text-left p-2.5 rounded-lg border transition ${
                              canDispatch
                                ? 'border-orange-500/40 bg-gray-700/60 hover:bg-gray-600/60 cursor-pointer'
                                : 'border-gray-600/40 bg-gray-800/60 cursor-not-allowed opacity-50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${rankColors[uni.rank] || 'text-gray-300'}`}>{uni.rank}</span>
                                <span className="text-white font-bold text-sm">{uni.universityName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300 text-xs">OB {uni.obCount}人</span>
                                <span className={`text-xs font-bold ${canDispatch ? 'text-orange-400' : 'text-gray-400'}`}>
                                  残{uni.remaining}/{uni.slots}枠
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {uni.specialties.map(s => (
                                <span key={s} className="px-1.5 py-0 rounded text-xs bg-gray-600/80 text-gray-300">
                                  {SPECIALTY_ICONS?.[s] || ''}{SPECIALTY_LABELS?.[s] || s}
                                </span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => setDispatchConfirm(null)} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition">
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          const selectedUniName = dispatchConfirm.universityName;
          return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
              <div className="bg-surface-2 rounded-xl max-w-md w-full p-5">
                <h2 className="text-base font-bold text-white mb-3 text-center">{dest.icon} {dest.name}に派遣</h2>
                <div className="bg-gray-700/60 rounded-lg p-3 mb-3 text-center">
                  <div className="text-white font-bold text-lg mb-1">{player.name}</div>
                  <div className="text-gray-300 text-xs">{POSITION_NAMES[player.position]} / {player.age}歳 / 総合力: {calcPlayerOverall(player)}</div>
                </div>
                {selectedUniName && (
                  <div className="bg-orange-900/30 border border-orange-500/30 rounded-lg p-2 mb-3 text-center">
                    <span className="text-orange-300 text-sm font-bold">🎓 {selectedUniName}</span>
                  </div>
                )}
                <div className="text-yellow-400 text-xs mb-3 text-center space-y-0.5">
                  <p>キャンプ期間中に集中特訓を受けます</p>
                  <p>通常練習の代わりに大幅な能力アップが期待できます</p>
                  <p>派遣後もシーズンには通常通り出場できます</p>
                </div>
                <div className="flex gap-2 justify-center">
                  <button onClick={() => setDispatchConfirm(null)} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition">
                    キャンセル
                  </button>
                  <button onClick={() => handleDispatch(dispatchConfirm.playerId, dispatchConfirm.destKey, dispatchConfirm.universityId)} className="btn-warn px-6 py-2 rounded-lg text-sm transition">
                    派遣する
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">{campTitle} - {userTeamName}</h1>
            {dispatchedPlayers.length > 0 && (
              <span className="text-orange-400 text-xs font-bold">派遣中: {dispatchedPlayers.length}人</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: MAX_CAMP_ROUNDS }, (_, i) => i + 1).map(r => (
              <div key={r} className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                r < currentRound ? 'bg-green-600 text-white'
                  : r === currentRound ? 'seg-on ring-2' : 'seg'
              }`}>{r}</div>
            ))}
            <span className="text-gray-400 text-xs ml-1">{currentRound}/{MAX_CAMP_ROUNDS}</span>
          </div>
        </div>

        <TutorialHint id="camp-intro" title="キャンプで選手を育てる">
          各クールごとに選手へ<b className="text-cyan-200">メイン練習＋サブ練習</b>を割り当てて能力を伸ばします。<b className="text-cyan-200">若い選手ほど伸びやすく</b>（19歳の伸びは25歳の2倍以上）、<b className="text-cyan-200">精神</b>グレードが高いほど練習が身につきます。
          <br />選手が伸びるのは練習だけではありません。<b className="text-cyan-200">シーズン中に試合へ出た量も同じくらい効きます</b>——1年フル出場した若手は、出番の無かった選手の2倍以上成長します。体力を鍛えると疲労に強く選手寿命が延びます。Year2以降は有望株を<b className="text-cyan-200">派遣</b>に出して大きく伸ばすこともできます。
        </TutorialHint>

        {/* ランク変動通知 */}
        {currentRound === 1 && seasonData?.rankChanges?.length > 0 && (() => {
          const userChange = seasonData.rankChanges.find(c => c.team === userTeamName);
          if (!userChange) return null;
          const isUp = 'DCBAS'.indexOf(userChange.to) > 'DCBAS'.indexOf(userChange.from);
          return (
            <div className={`mb-2 p-3 rounded-xl border text-center ${isUp ? 'bg-green-900/30 border-green-500/40' : 'bg-red-900/30 border-red-500/40'}`}>
              <span className={`font-black text-lg ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                {isUp ? '↑' : '↓'} ランク{isUp ? '昇格' : '降格'}: {userChange.from} → {userChange.to}
              </span>
              <span className="text-gray-300 text-xs ml-2">(注目度: {Math.round(userChange.reputation)})</span>
            </div>
          );
        })()}

        {/* 大学リーグ入替通知 */}
        {currentRound === 1 && seasonData?.universityPromotions?.length > 0 && (() => {
          const userPromo = seasonData.universityPromotions.find(c =>
            c.promoted.team === userTeamName || c.relegated.team === userTeamName
          );
          if (!userPromo) return null;
          const isPromoted = userPromo.promoted.team === userTeamName;
          return (
            <div className={`mb-2 p-3 rounded-xl border text-center ${isPromoted ? 'bg-green-900/30 border-green-500/40' : 'bg-red-900/30 border-red-500/40'}`}>
              <span className={`font-black text-lg ${isPromoted ? 'text-green-400' : 'text-red-400'}`}>
                {isPromoted ? '↑' : '↓'} {isPromoted ? '昇格' : '降格'}: {isPromoted ? userPromo.promoted.from : userPromo.relegated.from} → {isPromoted ? userPromo.promoted.to : userPromo.relegated.to}
              </span>
              <span className="text-gray-300 text-xs ml-2">({userPromo.league})</span>
            </div>
          );
        })()}

        {/* スタッフ退職通知 */}
        {currentRound === 1 && seasonData?.staffRetirements?.length > 0 && (
          <div className="mb-2 p-3 rounded-xl border bg-gray-800/80 border-gray-600/40">
            <div className="text-sm font-bold text-gray-300 mb-1">スタッフ退職のお知らせ</div>
            <div className="space-y-0.5">
              {seasonData.staffRetirements.map((s, idx) => {
                const roleNames = { coach: 'コーチ', manager: 'マネージャー', trainer: 'トレーナー' };
                return (
                  <div key={idx} className="text-xs text-gray-300">
                    <span className="text-white font-bold">{s.name}</span>
                    <span className="ml-1">({roleNames[s.role] || s.role} / {s.age}歳 / {s.grade}級)</span>
                    <span className="ml-1 text-orange-400">{s.reason === '定年退職' ? '定年退職' : '退職'}しました</span>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 mt-1">チーム運営画面からスタッフを補充できます</div>
          </div>
        )}

        {/* 赤字ペナルティ通知 */}
        {currentRound === 1 && seasonData?.deficitPenalties?.length > 0 && (
          <div className="mb-2 p-3 rounded-xl border bg-red-900/30 border-red-500/40">
            <div className="text-sm font-bold text-red-400 mb-1">⚠️ 予算超過ペナルティ</div>
            <div className="space-y-0.5">
              {seasonData.deficitPenalties.map((p, idx) => (
                <div key={idx} className="text-xs text-gray-300">
                  {p.type === 'reputation' && `注目度が ${Math.abs(p.value)} 低下しました`}
                  {p.type === 'sponsor_loss' && `スポンサー「${p.names.join('」「')}」が撤退しました`}
                  {p.type === 'scout' && `スカウト活動が制限されました（候補数 ${Math.abs(p.value)} 人減少）`}
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-1">来季は予算内での運営を心がけましょう</div>
          </div>
        )}

        {viewMode === 'select' && (
          <>
            {/* スタッフ指導効果 */}
            {(() => {
              const sb = userTeam?.corporateData?.staff ? getTeamStaffBonus(userTeam.corporateData.staff) : null;
              if (!sb) return null;
              const items = [
                { label: '打撃指導', val: sb.battingCoach, target: '打撃系' },
                { label: '守走指導', val: sb.fieldRunCoach, target: '守備系' },
                { label: '投手指導', val: sb.pitchingCoach, target: '投手系' },
                { label: 'バッテリー', val: sb.batteryCoach, target: 'Cリード/制球/変化球' },
                { label: 'フィットネス', val: sb.fitness, target: 'フィジカル系' },
                { label: 'モチベ管理', val: sb.motivation, target: 'プロ意識' },
              ];
              const multLabel = (v, base, range) => {
                const m = base + (v / 100) * range;
                return m >= 1.0 ? `×${m.toFixed(2)}` : `×${m.toFixed(2)}`;
              };
              return (
                <div className="mb-2 flex items-center gap-3 bg-gray-800/60 rounded px-3 py-1.5 text-xs flex-wrap">
                  <span className="text-gray-300 font-bold">コーチ効果:</span>
                  {items.map(it => (
                    <span key={it.label} className="text-gray-300">
                      {it.label}
                      <span className={`font-bold ml-0.5 ${it.val >= 70 ? 'text-yellow-400' : it.val >= 40 ? 'text-green-400' : 'text-gray-300'}`}>
                        {it.val}
                      </span>
                      <span className="text-gray-400 ml-0.5">
                        ({it.label === 'モチベ管理'
                          ? (it.val >= 20 ? `+プロ意識` : '効果なし')
                          : it.label === 'フィットネス'
                            ? multLabel(it.val, 0.8, 0.4)
                            : it.label === 'バッテリー'
                              ? multLabel(it.val, 0.9, 0.2)
                              : multLabel(it.val, 0.7, 0.6)
                        })
                      </span>
                    </span>
                  ))}
                </div>
              );
            })()}
            {/* 育成方針（方向性 × フェーズ）。選んだ時点で全選手のメニューが埋まり、
                個別に上書きもできる。⚠ 旧プリセット5種はこの2軸を平らに潰した
                部分集合だった（弱点克服=短所 / 長所強化=長所 / フィジカル・技術=フェーズ）
                ので、二重にせずこちらへ集約してある。 */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className="text-gray-300 text-xs font-bold" title="選手の希望と噛み合うとやる気が上がります">育成方針:</span>
              {Object.values(DIRECTIONS).map(d => (
                <button
                  key={d.key}
                  onClick={() => applyPolicy(d.key, policyPhase)}
                  title={d.description}
                  className={`rounded px-2 py-0.5 text-xs transition ${policyDir === d.key ? 'seg seg-on' : 'seg'}`}
                >
                  {d.icon} {d.name}
                </button>
              ))}
              <span className="text-gray-300 mx-0.5">×</span>
              {Object.values(PHASES).map(ph => (
                <button
                  key={ph.key}
                  onClick={() => applyPolicy(policyDir, ph.key)}
                  title={ph.description}
                  className={`rounded px-2 py-0.5 text-xs transition ${policyPhase === ph.key ? 'seg seg-on' : 'seg'}`}
                >
                  {ph.icon} {ph.name}
                </button>
              ))}
              <span className="text-gray-300 mx-1">|</span>
              <span className="text-gray-300 text-xs font-bold" title="タブに関係なく全選手に適用します">全員に一括:</span>
              {Object.entries(TRAINING_MENUS).filter(([k, m]) => !['newpitch'].includes(k) && !m.intensive).map(([key, menu]) => (
                <button
                  key={key}
                  onClick={() => {
                    const updated = {};
                    userTeam?.players?.forEach(p => {
                      updated[p.id] = TRAINING_MENUS[key] ? key : (assignments[p.id] || (isPitcher(p) ? 'control' : 'batting'));
                    });
                    setAssignments(updated);
                  }}
                  className="btn-secondary px-2 py-0.5 text-xs rounded transition"
                >
                  {menu.icon} {menu.name}
                </button>
              ))}
            </div>


            {/* 派遣中の選手 */}
            {dispatchedPlayers.length > 0 && (
              <div className="bg-surface-2 rounded-lg p-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-orange-400 text-xs font-bold">派遣中:</span>
                  {dispatchedPlayers.map((p, idx) => {
                    const dest = DISPATCH_DESTINATIONS[p.dispatchedThisCamp];
                    const uniName = p.dispatchUniversityName;
                    return (
                      <div key={idx} className="flex items-center gap-1 bg-gray-700/50 rounded px-2 py-0.5">
                        <span className={`font-bold text-xs ${p.position === 'pitcher' ? 'text-red-400' : 'text-blue-300'}`}>{p.name}</span>
                        <span className="text-gray-400 text-xs">{dest?.icon} {uniName || dest?.name}</span>
                        <span className="text-orange-400 text-xs">（結果はキャンプ終了時）</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ポジション別タブ。列を投手系／野手系で出し分けて表を1画面に収める */}
            <div className="flex items-center gap-1.5 mb-2">
              {CAMP_TABS.map(t => {
                const n = allActivePlayers.filter(pl => tabOf(pl) === t.key).length;
                return (
                  <button key={t.key} onClick={() => setCampTab(t.key)}
                    className={`px-3 py-1 rounded border text-xs font-semibold transition ${
                      POSITION_GROUP_COLORS[t.key][campTab === t.key ? 'on' : 'off']}`}>
                    {t.label} <span className="opacity-60 tabular-nums">{n}</span>
                  </button>
                );
              })}
              <span className="text-gray-400 text-xs ml-2">
                {isPitchTab ? '投球系の能力を表示中。打撃練習をさせたい投手は「野手へ」で移せます'
                            : '打撃・守備系の能力を表示中。投球練習をさせたい選手は「投手へ」で移せます'}
              </span>
            </div>

            {/* 選手テーブル */}
            <div className="bg-surface-2 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700/80 text-gray-300 text-xs">
                    {(() => {
                      // ⚠ 見出しは **nowrap を付けないと折り返す**。`w-*` を広げても
                      //    列幅の「目安」でしかないので、「プロ意識」が「プロ意/識」に割れた
                      const S = ({ k, w, children, title, align = 'center' }) => (
                        <th className={`py-1.5 px-1 whitespace-nowrap ${align === 'left' ? 'text-left px-2' : 'text-center'} ${w || ''}`} title={title}>
                          <button onClick={() => toggleSort(k)} className={`hover:text-white transition ${sortKey === k ? 'text-yellow-400' : ''}`}>
                            {children}{sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
                          </button>
                        </th>
                      );
                      return (<>
                        <th className="py-1.5 px-2 text-left w-28 whitespace-nowrap">氏名</th>
                        <S k="position" w="w-9">ポジ</S>
                        <S k="age" w="w-9">年齢</S>
                        <S k="build" w="w-9" title="体格">体格</S>
                        <S k="growth" w="w-10" title="成長率 (基礎+変動)">成長</S>
                        <S k="discipline" title="練習成長への乗算。高いほど練習が身につき、覚醒も起きやすい">プロ意識</S>
                        <S k="mental" w="w-8" title="チャンス・ピンチでの強さ">精神</S>
                        <th className="py-1.5 px-1 text-center w-14 whitespace-nowrap" title="この選手が今の方針をどう受け止めているか。希望と噛み合うと効率が上がる（正しい指示かどうかとは別）">意欲</th>
                        <th className="py-1.5 px-1 text-center w-8 whitespace-nowrap">投/打</th>
                        {isPitchTab && <th className="py-1.5 px-1 text-center whitespace-nowrap">フォーム</th>}
                        {!isPitchTab && <S k="meet" w="w-12">ミート</S>}
                        {!isPitchTab && <S k="power" w="w-12">パワー</S>}
                        {!isPitchTab && <S k="speed" w="w-9">走力</S>}
                        {/* 肩は球速の上限を決めるので投手タブにも出す */}
                        <S k="arm" w="w-8">肩</S>
                        {!isPitchTab && <S k="dexterity" w="w-9" title="器用さ">器用</S>}
                        {!isPitchTab && <S k="defense" w="w-9">守備</S>}
                        {showCLead && <S k="clead" w="w-8">Cリ</S>}
                        {!isPitchTab && <S k="eye" w="w-9">選球</S>}
                        {!isPitchTab && <S k="bunt" w="w-12">バント</S>}
                        {isPitchTab && <S k="velocity" w="w-9">球速</S>}
                        {isPitchTab && <S k="control" w="w-9">制球</S>}
                        {isPitchTab && <th className="py-1.5 px-1 text-center whitespace-nowrap" title="球の回転数">スピン</th>}
                        {isPitchTab && <S k="stamina" w="w-9">ス</S>}
                        <S k="bodyStamina" w="w-9">体力</S>
                        <S k="recovery" w="w-9">回復</S>
                        <S k="muscle" w="w-9" title="体幹（成長倍率に影響）">体幹</S>
                        {isPitchTab && <th className="py-1.5 px-2 text-left whitespace-nowrap">変化球</th>}
                        <th className="py-1.5 px-2 text-left whitespace-nowrap">前年成績</th>
                      </>);
                    })()}
                    {/* サブポジション適性（投手タブでは不要） */}
                    {!isPitchTab && subPosHeaders.map(pos => (
                      <th key={pos} className="py-1.5 px-0.5 text-center w-6" title={POSITION_NAMES[pos]}>{subPosShort[pos]}</th>
                    ))}
                    <th className="py-1.5 px-2 text-left w-28">メイン</th>
                    <th className="py-1.5 px-2 text-left w-28">サブ</th>
                    <th className="py-1.5 px-1 text-center w-16">練習側</th>
                    {currentYear > 1 && getAvailableDispatchKeys(gameMode, seasonData?.settings?.clubMode).length > 0 && <th className="py-1.5 px-1 text-center w-16">派遣</th>}
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map(player => {
                    const b = player.batting || {};
                    const p = player.pitching || {};
                    const ph = player.physical || {};
                    const f = player.fielding || {};
                    const pf = player.positionFitness || {};
                    const currentTraining = assignments[player.id] || (isPitcher(player) ? 'control' : 'batting');
                    const showNewPitchSelect = currentTraining === 'newpitch';
                    const availableNewPitches = getAvailableNewPitches(player);

                    return (
                      <tr key={player.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-1 px-2 whitespace-nowrap">
                          <span className={`font-bold text-xs ${isPitcher(player) ? 'text-red-400' : 'text-blue-300'}`}>
                            {player.name}
                          </span>
                        </td>
                        <td className="py-1 px-1 text-center whitespace-nowrap">
                          <span className="text-xs text-gray-300">{POSITION_NAMES[player.position] || player.position}</span>
                        </td>
                        <td className="py-1 px-1 text-center text-gray-300 text-xs whitespace-nowrap">{player.age || 20}</td>
                        <td className="py-1 px-1 text-center text-xs whitespace-nowrap">
                          <span className={ph.build === 'large' ? 'text-orange-400' : ph.build === 'small' ? 'text-cyan-400' : 'text-gray-300'}>
                            {ph.build === 'large' ? '大柄' : ph.build === 'small' ? '小柄' : '中肉'}
                          </span>
                        </td>
                        <td className="py-1 px-1 text-center text-xs whitespace-nowrap">
                          {(() => {
                            const base = player.growthPotential ?? 1.0;
                            const mod = player.growthModifier || 0;
                            const effective = Math.max(0.3, Math.min(1.8, base + mod));
                            const color = effective >= 1.3 ? 'text-pink-400' : effective >= 1.2 ? 'text-red-400' : effective >= 1.1 ? 'text-orange-400' : effective >= 1.0 ? 'text-yellow-400' : effective >= 0.9 ? 'text-green-400' : effective >= 0.8 ? 'text-blue-400' : 'text-gray-300';
                            return (
                              <span className={color} title={`基礎:${base.toFixed(2)} 変動:${mod >= 0 ? '+' : ''}${mod.toFixed(2)}`}>
                                {effective.toFixed(2)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-1 px-1 text-center text-xs whitespace-nowrap">
                          {(() => {
                            const d = player.personality?.discipline ?? 50;
                            const c = d >= 80 ? 'text-red-400' : d >= 60 ? 'text-orange-400' : d >= 40 ? 'text-yellow-400' : d >= 20 ? 'text-blue-400' : 'text-gray-300';
                            return <span className={c}>{d}</span>;
                          })()}
                        </td>
                        <td className="py-1 px-1 text-center text-xs whitespace-nowrap">
                          {(() => {
                            const m = player.personality?.mental ?? 50;
                            const c = m >= 80 ? 'text-red-400' : m >= 60 ? 'text-orange-400' : m >= 40 ? 'text-yellow-400' : m >= 20 ? 'text-blue-400' : 'text-gray-300';
                            return <span className={c}>{m}</span>;
                          })()}
                        </td>
                        <td className="py-1 px-1 text-center text-xs whitespace-nowrap">
                          {(() => {
                            const mood = describeMood(player, policyDir, policyPhase);
                            const w = playerWish(player);
                            const c = mood.tone === 'good' ? 'text-green-400' : mood.tone === 'bad' ? 'text-orange-400' : 'text-gray-300';
                            return <span className={c}
                              title={`本人の希望: ${DIRECTIONS[w.direction].name} × ${PHASES[w.phase].name}`}>{mood.label}</span>;
                          })()}
                        </td>
                        <td className="py-1 px-1 text-center text-xs whitespace-nowrap">
                          <span className={ph.throws === 'left' ? 'text-green-400' : 'text-gray-300'}>{ph.throws === 'left' ? '左' : '右'}</span>
                          <span className="text-gray-400">/</span>
                          <span className={b.bats === 'left' ? 'text-green-400' : b.bats === 'switch' ? 'text-purple-400' : 'text-gray-300'}>{b.bats === 'left' ? '左' : b.bats === 'switch' ? '両' : '右'}</span>
                        </td>
                        {isPitchTab && <td className="py-1 px-1 text-center text-xs text-gray-300 whitespace-nowrap">
                          {FORM_SHORT[p.form] || '-'}
                        </td>}
                        {!isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={b.meet||0} label="ミート" /></td>}
                        {!isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={b.power||0} label="パワー" /></td>}
                        {!isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.speed||0} label="走力" /></td>}
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.arm||0} label="肩力" /></td>
                        {!isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.dexterity||50} label="器用さ" /></td>}
                        {!isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={f.defense||0} label="守備" /></td>}
                        {showCLead && <td className="py-1 px-1 text-center font-mono"><StatValue value={player.catching?.lead||0} label="Cリード" /></td>}
                        {!isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={b.eye||0} label="選球眼" /></td>}
                        {!isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={b.bunt||0} label="バント" /></td>}
                        {isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={p.velocity||0} label="球速" isVelocity={true} /></td>}
                        {isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={p.control||0} label="制球" /></td>}
                        {isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={p.spinRate||0} label="伸び" /></td>}
                        {isPitchTab && <td className="py-1 px-1 text-center font-mono"><StatValue value={p.stamina||0} label="スタミナ" isStamina={true} /></td>}
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.bodyStamina||50} label="体力" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.recovery||50} label="回復力" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.muscle??50} label="体幹" /></td>
                        {isPitchTab && <td className="py-1 px-2 text-xs font-mono whitespace-nowrap">{getArsenalDisplay(player)}</td>}
                        <td className="py-1 px-2 text-xs font-mono text-gray-300 whitespace-nowrap">
                          {(() => {
                            const prev = player.previousSeasonStats;
                            if (!prev) return <span className="text-gray-400">-</span>;
                            if (isPitcher(player)) {
                              const ip = prev.pitching?.inningsPitched || 0;
                              const era = ip > 0 ? ((prev.pitching?.earnedRuns || 0) / ip * 9).toFixed(2) : '-';
                              return <>{era !== '-' ? era : '-'} {prev.pitching?.wins || 0}勝{prev.pitching?.saves || 0}S {prev.pitching?.strikeouts || 0}K</>;
                            } else {
                              const ab = prev.batting?.atBats || 0;
                              const avg = ab > 0 ? (prev.batting.hits / ab).toFixed(3) : '-';
                              return <>{avg} {prev.batting?.homeruns || 0}HR {prev.batting?.hits || 0}安 {prev.batting?.rbis || 0}点</>;
                            }
                          })()}
                        </td>
                        {/* サブポジション適性（投手タブでは不要） */}
                        {!isPitchTab && subPosHeaders.map(pos => (
                          <td key={pos} className="py-1 px-0.5 text-center font-mono">
                            {pos === player.position
                              ? <span className="text-white text-xs font-bold">主</span>
                              : <FitnessValue value={pf[pos]} />
                            }
                          </td>
                        ))}
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={currentTraining}
                              onChange={(e) => setAssignments(prev => ({ ...prev, [player.id]: e.target.value }))}
                              className="bg-gray-700 text-white text-xs px-1 py-1 rounded w-32"
                            >
                              {Object.entries(TRAINING_MENUS).filter(([, m]) => !m.intensive)
                                .map(([key, menu]) => (
                                <option key={key} value={key}>
                                  {menu.name}
                                </option>
                              ))}
                              <option disabled>── 集中コース ──</option>
                              {Object.entries(TRAINING_MENUS).filter(([, m]) => m.intensive)
                                .map(([key, menu]) => (
                                <option key={key} value={key}>{menu.name}</option>
                              ))}
                            </select>
                            {showNewPitchSelect && availableNewPitches.length > 0 && (
                              <select
                                value={newPitchSelections[player.id] || availableNewPitches[0]}
                                onChange={(e) => setNewPitchSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded w-28"
                              >
                                {availableNewPitches.map(pt => {
                                  const hasForm = !!FORM_PITCH_AFFINITY[p.form]?.[pt];
                                  const hasSecond = p.secondAffinity === pt;
                                  const tag = (hasForm && hasSecond) ? ' ★◆適性'
                                    : hasForm ? ' ★フォーム適性'
                                    : hasSecond ? ' ◆緩急適性'
                                    : '';
                                  return <option key={pt} value={pt}>{getPitchTypeName(pt)}{tag}</option>;
                                })}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={subAssignments[player.id] || 'physique'}
                              onChange={(e) => setSubAssignments(prev => ({ ...prev, [player.id]: e.target.value }))}
                              className="bg-gray-700 text-white text-xs px-1 py-1 rounded w-28"
                            >
                              {Object.entries(SUB_TRAINING_MENUS)
                                .map(([key, menu]) => (
                                <option key={key} value={key}>{menu.name}</option>
                              ))}
                            </select>
                            {(subAssignments[player.id] || 'physique') === 'subposition' && (
                              <select
                                value={subPositionSelections[player.id] || ''}
                                onChange={(e) => setSubPositionSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded w-16"
                              >
                                <option value="">自動</option>
                                {['catcher','first','second','third','short','left','center','right']
                                  .filter(pos => pos !== player.position)
                                  .map(pos => <option key={pos} value={pos}>{POSITION_NAMES[pos]}</option>)}
                              </select>
                            )}
                            {(subAssignments[player.id] || 'physique') === 'breaking' && player.position === 'pitcher' && (
                              <select
                                value={subPitchSelections[player.id] || ''}
                                onChange={(e) => setSubPitchSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                title="1球種を選ぶと分散させず集中して磨く（伸びが速い）"
                                className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded w-24"
                              >
                                <option value="">全部（分配）</option>
                                {(player.pitching?.arsenal || [])
                                  .filter(a => a.type !== 'straight' && (a.level ?? 0) < 100)
                                  .map(a => (
                                    <option key={a.type} value={a.type}>
                                      {getPitchTypeName(a.type)} {a.level}
                                    </option>
                                  ))}
                              </select>
                            )}
                            {(subAssignments[player.id] || 'physique') === 'form_change' && player.position === 'pitcher' && (
                              <select
                                value={formSelections[player.id] || ''}
                                onChange={(e) => setFormSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded w-20"
                              >
                                <option value="">自動</option>
                                {Object.entries(FORM_SHORT)
                                  .filter(([k]) => k !== player.pitching?.form)
                                  .map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            )}
                            {(subAssignments[player.id] || 'physique') === 'switch_hit' && (
                              <select
                                value={batsSelections[player.id] || ''}
                                onChange={(e) => setBatsSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded w-16"
                              >
                                <option value="">自動</option>
                                {[['right','右打'],['left','左打'],['switch','両打']]
                                  .filter(([k]) => k !== (player.batting?.bats || player.physical?.bats))
                                  .map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        {/* 練習側の移動。position は変えず、表示するタブ＝見える列だけを切り替える */}
                        <td className="py-1 px-1 text-center">
                          {(() => {
                            const side = sideOf(player);
                            const toFielder = side === 'pitcher';
                            return (
                              <button
                                onClick={() => setTrainingSide(prev => ({ ...prev, [player.id]: toFielder ? 'fielder' : 'pitcher' }))}
                                title={toFielder
                                  ? '打撃・守備の数字を見ながら組めるよう、野手側のタブへ移す（ポジションは変わりません）'
                                  : '投球の数字を見ながら組めるよう、投手タブへ移す（ポジションは変わりません）'}
                                className="btn-secondary px-1.5 py-0.5 rounded text-xs whitespace-nowrap">
                                {toFielder ? '野手へ' : '投手へ'}
                              </button>
                            );
                          })()}
                        </td>
                        {currentYear > 1 && getAvailableDispatchKeys(gameMode, seasonData?.settings?.clubMode).length > 0 && (
                          <td className="py-1 px-1 text-center">
                            <div className="flex gap-0.5 justify-center">
                              {getAvailableDispatchKeys(gameMode, seasonData?.settings?.clubMode).map(destKey => {
                                const dest = DISPATCH_DESTINATIONS[destKey];
                                const { eligible, reason } = checkDispatchEligibility(player, destKey, {
                                  teamPlayers: userTeam?.players || [],
                                  allTeams: TEAMS_DATA,
                                  teamData: userTeam,
                                  gameMode,
                                });
                                return (
                                  <button
                                    key={destKey}
                                    onClick={() => eligible && setDispatchConfirm({ playerId: player.id, destKey })}
                                    disabled={!eligible}
                                    title={eligible ? `${dest.name}に派遣\n${dest.desc}` : reason}
                                    className={`px-1 py-0.5 rounded text-xs font-bold transition ${
                                      'btn-primary cursor-pointer'
                                    }`}
                                  >
                                    {dest.icon}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 進行ボタンは画面下に貼り付ける。
                大学の56人ロスターだと内野手タブが23行になり、表の下に置くと
                ボタンが1200px地点＝画面外に出て、全部スクロールしないと押せなかった。
                ⚠ sticky は祖先に overflow:hidden があると効かない。ここは表の
                コンテナ（overflow-hidden）の**外**なので成立している。
                表が短いときは自然位置に収まる（sticky の性質） */}
            <div className="sticky bottom-0 z-10 text-center mt-3 py-2 -mx-3 px-3
                            bg-surface-1/95 backdrop-blur border-t border-gray-700/60">
              <button
                onClick={handleExecuteTraining}
                className="btn-primary px-10 py-2.5 rounded-lg text-base transition shadow"
              >
                第{currentRound}クール練習を実行
              </button>
            </div>
          </>
        )}

        {viewMode === 'results' && (
          <>
            {/* 練習結果 */}
            <div className="bg-surface-2 rounded-lg overflow-hidden mb-3">
              <div className="px-3 py-2 bg-gray-700/80 border-b border-gray-600">
                <h2 className="text-sm font-bold text-white">第{currentRound}クール 練習結果</h2>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700/50 text-gray-300 text-xs">
                    <th className="py-1 px-2 text-left whitespace-nowrap">氏名</th>
                    {/* ⚠ メニュー名は折り返さない。w-20(80px) では「🎯 投げ込み」
                        「🏃 基礎体力」が2行になっていた */}
                    <th className="py-1 px-2 text-left whitespace-nowrap">メイン</th>
                    {/* ⚠ 余白は**最後の列に吸わせる**（`w-full`）。`table w-full` は
                        余った横幅を各列へ配分するので、途中の列に w-px を付けても縮まない。
                        これが無いとメイン結果が伸びきってサブ列が右端へ飛び、行が読めなかった */}
                    <th className="py-1 px-2 text-left whitespace-nowrap">メイン結果</th>
                    <th className="py-1 px-2 text-left whitespace-nowrap">サブ</th>
                    <th className="py-1 px-2 text-left w-full">サブ結果</th>
                  </tr>
                </thead>
                <tbody>
                  {roundResults?.slice().sort((a, b) => {
                    const posA = POSITION_ORDER.indexOf(a.player.position);
                    const posB = POSITION_ORDER.indexOf(b.player.position);
                    if (posA !== posB) return posA - posB;
                    return (b.player.age || 20) - (a.player.age || 20);
                  }).map((result, idx) => {
                    const coachComment = getCampCoachComment(result.player, currentRound);
                    return (
                    <tr key={idx} className="border-b border-gray-700/50">
                      {/* ⚠ 氏名も折り返さない。最後の列に w-full を付けると他の列が
                          最小幅まで押し込まれ、`w-20` では名前が1文字ずつ縦に割れる */}
                      <td className="py-1 px-2 align-top whitespace-nowrap">
                        <span className={`font-bold ${isPitcher(result.player) ? 'text-red-400' : 'text-blue-300'}`}>
                          {result.player.name}
                        </span>
                        {coachComment && (
                          <div className={`text-xs ${coachComment.color}`}>📋{coachComment.text}</div>
                        )}
                      </td>
                      <td className="py-1 px-2 text-gray-300 text-xs whitespace-nowrap align-top">
                        {TRAINING_MENUS[result.trainingType]?.icon} {TRAINING_MENUS[result.trainingType]?.name}
                      </td>
                      <td className="py-1 px-2 align-top">
                        <div className="flex gap-0.5 whitespace-nowrap">
                          {result.growthReport.map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-1.5 py-0 rounded text-xs leading-relaxed ${
                                growth.isPenalty
                                  ? 'bg-red-700/80 text-red-100'
                                  : growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'seg-on' : 'seg'
                              }`}
                            >
                              {growth.statName}: {growth.before}→{growth.after}
                              {growth.growth > 0 && ` +${growth.growth}`}
                              {growth.growth < 0 && ` ${growth.growth}`}
                              {growth.isAwakening && ' 覚醒!'}
                              {growth.isPenalty && ' 代償'}
                            </span>
                          ))}
                          {result.growthReport.length === 0 && (
                            <span className="text-gray-400 text-xs">変化なし</span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-gray-300 text-xs whitespace-nowrap align-top">
                        {result.subTrainingType && SUB_TRAINING_MENUS[result.subTrainingType] && (
                          <>{SUB_TRAINING_MENUS[result.subTrainingType].icon} {SUB_TRAINING_MENUS[result.subTrainingType].name}</>
                        )}
                      </td>
                      <td className="py-1 px-2 align-top">
                        <div className="flex gap-0.5 whitespace-nowrap">
                          {(result.subGrowthReport || []).map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-1.5 py-0 rounded text-xs leading-relaxed ${
                                growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'bg-teal-700/80 text-teal-100'
                                    : growth.growth < 0
                                      ? 'seg-on' : 'seg'
                              }`}
                            >
                              {growth.statName}: {growth.before}→{growth.after}
                              {growth.growth > 0 && ` +${growth.growth}`}
                              {growth.growth < 0 && ` ${growth.growth}`}
                              {growth.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                          {(!result.subGrowthReport || result.subGrowthReport.length === 0) && (
                            <span className="text-gray-400 text-xs">変化なし</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-center">
              {currentRound < MAX_CAMP_ROUNDS ? (
                <button
                  onClick={handleNextRound}
                  className="btn-primary px-10 py-2.5 rounded-lg text-base transition shadow"
                >
                  次のクールへ（第{currentRound + 1}クール）
                </button>
              ) : (
                <>
                <button
                  onClick={() => setShowCampReview(true)}
                  className="btn-primary px-10 py-2.5 rounded-lg text-base transition shadow"
                >
                  キャンプ終了 → 成長確認
                </button>

                {showCampReview && (() => {
                  const dispatched = (userTeam?.players || []).filter(p => p.dispatchedThisCamp);
                  const pitchers = (userTeam?.players || []).filter(p => p.position === 'pitcher');
                  const fielders = (userTeam?.players || []).filter(p => p.position !== 'pitcher');
                  const finalizeCamp = () => {
                    setShowCampReview(false);
                    const results = [];
                    Object.values(TEAMS_DATA).forEach(team => {
                      team.players?.forEach(p => {
                        if (p.dispatchedThisCamp) {
                          const { growthReport, outcome, universityName } = resolveDispatchTraining(p);
                          if (team === userTeam) {
                            const dest = DISPATCH_DESTINATIONS[p.dispatchedThisCamp];
                            const uniName = universityName || dest?.name || '不明';
                            results.push({ player: p, destination: uniName, growthReport, outcome });
                          }
                          delete p.dispatchOutcome;
                          delete p.dispatchedThisCamp;
                        }
                      });
                    });
                    if (results.length > 0) {
                      setDispatchResults(results);
                      setViewMode('dispatchResults');
                    } else {
                      setViewMode('summary');
                    }
                  };
                  return (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowCampReview(false)}>
                      <div className="bg-surface-2 rounded-xl border border-gray-600 max-w-md w-full p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-lg mb-3">キャンプ終了確認</h3>
                        <div className="bg-gray-900/60 rounded-lg p-3 mb-3 space-y-2 text-sm">
                          <div className="flex justify-between text-gray-300">
                            <span>完了クール</span>
                            <span className="text-white font-bold">{currentRound} / {MAX_CAMP_ROUNDS}</span>
                          </div>
                          <div className="flex justify-between text-gray-300">
                            <span>投手 / 野手</span>
                            <span className="text-white font-bold">{pitchers.length}人 / {fielders.length}人</span>
                          </div>
                          {dispatched.length > 0 && (
                            <div className="flex justify-between text-gray-300">
                              <span>派遣中</span>
                              <span className="text-orange-400 font-bold">{dispatched.length}人（結果確定）</span>
                            </div>
                          )}
                        </div>
                        <p className="text-gray-300 text-xs mb-4">キャンプを終了して成長結果を確認します。この操作は取り消せません。</p>
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => setShowCampReview(false)} className="px-4 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition">
                            戻る
                          </button>
                          <button onClick={finalizeCamp} className="btn-primary px-5 py-1.5 rounded text-sm transition">
                            キャンプ終了
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                </>
              )}
            </div>
          </>
        )}

        {viewMode === 'dispatchResults' && (
          <>
            <div className="bg-surface-2 rounded-lg overflow-hidden mb-3">
              <div className="px-3 py-2 bg-orange-700/80 border-b border-orange-600">
                <h2 className="text-sm font-bold text-white">派遣結果報告</h2>
              </div>
              <div className="p-3 space-y-3">
                {dispatchResults.map((result, idx) => {
                  const outcomeLabel = result.outcome === 'great_success' ? '飛躍'
                    : result.outcome === 'minor' ? '微成長'
                    : '成長';
                  const outcomeColor = result.outcome === 'great_success' ? 'bg-yellow-500 text-black'
                    : result.outcome === 'minor' ? 'bg-gray-500 text-white'
                    : 'bg-green-600 text-white';
                  return (
                    <div key={idx} className="bg-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`font-bold text-sm ${result.player.position === 'pitcher' ? 'text-red-400' : 'text-blue-300'}`}>{result.player.name}</span>
                        <span className="text-gray-300 text-xs">{result.destination}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${outcomeColor}`}>{outcomeLabel}</span>
                      </div>
                      {result.growthReport.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {result.growthReport.map((g, gIdx) => (
                            <span key={gIdx} className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              g.isAwakening ? 'bg-yellow-500 text-black' : 'bg-green-700 text-green-100'
                            }`}>
                              {g.statName}: {g.before}→{g.after} +{g.growth}{g.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">成長なし... 派遣の成果は得られませんでした</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-center">
              <button
                onClick={() => setViewMode('summary')}
                className="btn-primary px-10 py-2.5 rounded-lg text-base transition shadow"
              >
                成長確認へ
              </button>
            </div>
          </>
        )}

        {viewMode === 'summary' && (() => {
          const currentPlayers = [...(userTeam?.players || [])].sort((a, b) => {
            const posA = POSITION_ORDER.indexOf(a.position);
            const posB = POSITION_ORDER.indexOf(b.position);
            if (posA !== posB) return posA - posB;
            return (b.age || 20) - (a.age || 20);
          });
          const STAT_DEFS = [
            { key: 'batting.meet', stat: 'meet', name: 'ミ', get: (s) => s.batting?.meet || 0 },
            { key: 'batting.power', stat: 'power', name: 'パ', get: (s) => s.batting?.power || 0 },
            { key: 'batting.eye', stat: 'eye', name: '眼', get: (s) => s.batting?.eye || 0 },
            { key: 'physical.speed', stat: 'speed', name: '走', get: (s) => s.physical?.speed || 0 },
            { key: 'physical.arm', stat: 'arm', name: '肩', get: (s) => s.physical?.arm || 0 },
            { key: 'fielding.defense', stat: 'defense', name: '守', get: (s) => s.fielding?.defense || 0 },
            { key: 'catching.lead', stat: 'lead', name: 'Cリ', get: (s) => s.catching?.lead || 0 },
            { key: 'pitching.velocity', stat: 'velocity', name: '速', get: (s) => s.pitching?.velocity || 0, isVelocity: true },
            { key: 'pitching.control', stat: 'control', name: '制', get: (s) => s.pitching?.control || 0 },
            { key: 'pitching.spinRate', stat: 'spinRate', name: '伸', get: (s) => s.pitching?.spinRate || 0 },
            { key: 'pitching.stamina', stat: 'stamina', name: 'ス', get: (s) => s.pitching?.stamina || 0, isStamina: true },
            { key: 'physical.bodyStamina', stat: 'bodyStamina', name: '体', get: (s) => s.physical?.bodyStamina || 50 },
            { key: 'physical.recovery', stat: 'recovery', name: '回', get: (s) => s.physical?.recovery || 50 },
            { key: 'physical.muscle', stat: 'muscle', name: '幹', get: (s) => s.physical?.muscle ?? 50 },
          ];
          const ageReports = seasonData?.ageReports || [];
          const ageReportMap = {};
          ageReports.filter(r => r.team === userTeamName).forEach(r => {
            const changeMap = {};
            r.changes.forEach(c => { changeMap[c.stat] = c.change; });
            ageReportMap[r.name] = changeMap;
          });
          return (
            <>
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-xl font-bold text-white">{campTitle}成長レポート - {userTeamName}</h1>
              </div>
              <div className="flex gap-4 text-xs mb-1 ml-1">
                <span className="text-green-400">■ キャンプ成長</span>
                <span className="text-cyan-400">■ 自然成長()</span>
                <span className="text-red-400">■ 衰退</span>
              </div>
              <div className="bg-surface-2 rounded-lg overflow-hidden overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-700/80 text-gray-300 text-xs">
                      <th className="py-1.5 px-2 text-left w-20">氏名</th>
                      <th className="py-1.5 px-1 text-center w-9">ポジ</th>
                      {STAT_DEFS.map(sd => (
                        <th key={sd.key} className="py-1.5 px-1 text-center w-16">{sd.name}</th>
                      ))}
                      <th className="py-1.5 px-2 text-left">新球種</th>
                      <th className="py-1.5 px-1 text-center w-12">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPlayers.map(player => {
                      const pre = preCampStats[player.id];
                      if (!pre) return null;
                      let totalGrowth = 0;
                      const playerAgeReport = ageReportMap[player.name] || {};
                      const diffs = STAT_DEFS.map(sd => {
                        const before = sd.get(pre);
                        const after = sd.get(player);
                        const totalDiff = after - before;
                        const naturalDiff = playerAgeReport[sd.stat] || 0;
                        const campDiff = totalDiff - naturalDiff;
                        if (totalDiff > 0) totalGrowth += totalDiff;
                        return { ...sd, before, after, diff: totalDiff, campDiff, naturalDiff };
                      });
                      // 新球種チェック
                      const preArsenal = (pre.pitching?.arsenal || []).map(a => a.type);
                      const curArsenal = (player.pitching?.arsenal || []).map(a => a.type);
                      const newPitches = curArsenal.filter(t => !preArsenal.includes(t));

                      return (
                        <tr key={player.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="py-1 px-2">
                            <span className={`font-bold text-xs ${isPitcher(player) ? 'text-red-400' : 'text-blue-300'}`}>
                              {player.name}
                            </span>
                          </td>
                          <td className="py-1 px-1 text-center">
                            <span className="text-xs text-gray-400">{POSITION_NAMES[player.position] || player.position}</span>
                          </td>
                          {diffs.map(d => {
                            const bgClass = d.diff >= 5 ? 'bg-yellow-400/15' : d.diff >= 3 ? 'bg-green-400/10' : d.diff < -2 ? 'bg-red-400/10' : '';
                            return (
                              <td key={d.key} className={`py-1 px-1 text-center font-mono text-xs ${bgClass}`}>
                                {d.diff !== 0 ? (
                                  <span>
                                    <span className={`font-bold text-xs ${d.diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {d.diff > 0 ? `+${d.diff}` : d.diff}
                                    </span>
                                    <span className="text-gray-400 ml-0.5 text-xs">{d.after}</span>
                                    {d.naturalDiff !== 0 && (
                                      <span className={`ml-0.5 text-xs ${d.naturalDiff > 0 ? 'text-cyan-400' : 'text-red-300'}`}>
                                        ({d.naturalDiff > 0 ? `+${d.naturalDiff}` : d.naturalDiff})
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-1 px-2 text-xs">
                            {newPitches.length > 0 ? (
                              <span className="text-yellow-400 font-bold">
                                {newPitches.map(t => getPitchTypeName(t)).join(', ')}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-1 px-1 text-center">
                            <span className={`font-bold text-xs ${totalGrowth >= 10 ? 'text-yellow-400' : totalGrowth >= 5 ? 'text-green-400' : totalGrowth > 0 ? 'text-blue-300' : 'text-gray-400'}`}>
                              {totalGrowth > 0 ? `+${totalGrowth}` : '-'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-center">
                <button
                  onClick={onComplete}
                  className="btn-primary px-10 py-2.5 rounded-lg text-base transition shadow"
                >
                  {completeLabel}
                </button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default CampScreen;
