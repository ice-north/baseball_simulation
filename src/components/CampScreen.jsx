import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { TRAINING_MENUS, SUB_TRAINING_MENUS, executeTeamCampTraining, executeSubTraining, ALL_PITCH_TYPES, getPitchTypeName, FORM_PITCH_AFFINITY, DISPATCH_DESTINATIONS, DISPATCH_LIMITS, checkDispatchEligibility, executeDispatchTraining, resolveDispatchTraining, calcPlayerOverall } from '../season/yearProgressionSystem.js';
import { POSITION_NAMES } from '../utils/constants.js';

const MAX_CAMP_ROUNDS = 4;

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
    return { text: ['伸び悩みか…', '壁にぶつかっている'][Math.floor(Math.random() * 2)], color: 'text-gray-500' };
  }
  if (gp <= 0.85 && Math.random() < 0.3) {
    return { text: '現状維持が精一杯か', color: 'text-gray-500' };
  }
  return null;
}

// 練習プリセット定義（各選手のポジション・能力を見て個別にメニューを割り振る）
const CAMP_PRESETS = {
  weakness: {
    name: '弱点克服', icon: '📈',
    desc: '最も低い能力を集中的に強化',
    getMain: (p) => {
      if (p.position === 'pitcher') {
        const stats = { velocity: ((p.pitching?.velocity||130)-115)*2.5, control: p.pitching?.control||50, stamina: (p.pitching?.stamina||100)/2 };
        const lowest = Object.entries(stats).sort((a,b) => a[1]-b[1])[0][0];
        return lowest === 'velocity' ? 'velocity' : lowest === 'control' ? 'control' : 'stamina';
      }
      const stats = { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0, eye: p.batting?.eye||0 };
      const lowest = Object.entries(stats).sort((a,b) => a[1]-b[1])[0][0];
      if (lowest === 'meet' || lowest === 'power' || lowest === 'eye') return 'batting';
      if (lowest === 'speed') return 'baserunning';
      if (lowest === 'defense') return 'fielding';
      return 'batting';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') {
        const stats = { velocity: ((p.pitching?.velocity||130)-115)*2.5, control: p.pitching?.control||50, stamina: (p.pitching?.stamina||100)/2 };
        const sorted = Object.entries(stats).sort((a,b) => a[1]-b[1]);
        const second = sorted[1][0];
        if (second === 'velocity') return 'muscle';
        if (second === 'stamina') return 'running';
        return 'running';
      }
      const stats = { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0, eye: p.batting?.eye||0 };
      const sorted = Object.entries(stats).sort((a,b) => a[1]-b[1]);
      const second = sorted[1][0];
      if (second === 'eye') return 'eye';
      if (second === 'speed') return 'running';
      if (second === 'defense') return 'defense_sub';
      return 'muscle';
    },
  },
  strength: {
    name: '長所強化', icon: '💪',
    desc: '最も高い能力をさらに伸ばす',
    getMain: (p) => {
      if (p.position === 'pitcher') {
        const stats = { velocity: ((p.pitching?.velocity||130)-115)*2.5, control: p.pitching?.control||50, stamina: (p.pitching?.stamina||100)/2 };
        const highest = Object.entries(stats).sort((a,b) => b[1]-a[1])[0][0];
        return highest === 'velocity' ? 'velocity' : highest === 'control' ? 'control' : 'stamina';
      }
      const stats = { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0, eye: p.batting?.eye||0 };
      const highest = Object.entries(stats).sort((a,b) => b[1]-a[1])[0][0];
      if (highest === 'meet' || highest === 'power' || highest === 'eye') return 'batting';
      if (highest === 'speed') return 'baserunning';
      if (highest === 'defense') return 'fielding';
      return 'batting';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') {
        const stats = { velocity: ((p.pitching?.velocity||130)-115)*2.5, control: p.pitching?.control||50, stamina: (p.pitching?.stamina||100)/2 };
        const highest = Object.entries(stats).sort((a,b) => b[1]-a[1])[0][0];
        if (highest === 'velocity') return 'muscle';
        if (highest === 'stamina') return 'running';
        return 'stretch';
      }
      const stats = { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0, eye: p.batting?.eye||0 };
      const highest = Object.entries(stats).sort((a,b) => b[1]-a[1])[0][0];
      if (highest === 'eye') return 'eye';
      if (highest === 'speed') return 'running';
      if (highest === 'defense') return 'defense_sub';
      return 'muscle';
    },
  },
  balanced: {
    name: 'バランス育成', icon: '⚖️',
    desc: '投手は投手練習、野手は野手練習をバランスよく',
    getMain: (p) => {
      if (p.position === 'pitcher') {
        const v = ((p.pitching?.velocity||130)-115)*2.5;
        const c = p.pitching?.control||50;
        const s = (p.pitching?.stamina||100)/2;
        const lowest = Object.entries({velocity:v, control:c, stamina:s}).sort((a,b) => a[1]-b[1])[0][0];
        return lowest === 'velocity' ? 'velocity' : lowest === 'control' ? 'control' : 'stamina';
      }
      const meet = p.batting?.meet||0;
      const def = p.fielding?.defense||0;
      const spd = p.physical?.speed||0;
      if (meet <= def && meet <= spd) return 'batting';
      if (def <= spd) return 'fielding';
      return 'baserunning';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') return 'running';
      return 'running';
    },
  },
  physical: {
    name: 'フィジカル', icon: '🏃',
    desc: '投手は球速、野手は走力・パワーを重点強化',
    getMain: (p) => {
      if (p.position === 'pitcher') return 'velocity';
      const spd = p.physical?.speed||0;
      const pow = p.batting?.power||0;
      return spd <= pow ? 'baserunning' : 'batting';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') return 'running';
      return 'muscle';
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
    desc: '先発投手はスタミナ、リリーフは制球、野手は打撃/守備を強化',
    getMain: (p) => {
      if (p.position === 'pitcher') {
        const stamina = p.pitching?.stamina || 80;
        return stamina >= 90 ? 'control' : 'stamina';
      }
      const meet = p.batting?.meet||0;
      const def = p.fielding?.defense||0;
      return meet < 45 ? 'batting' : def < 45 ? 'fielding' : 'batting';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') {
        const control = p.pitching?.control || 50;
        return control >= 55 ? 'breaking' : 'running';
      }
      const def = p.fielding?.defense||0;
      return def < 40 ? 'defense_sub' : 'running';
    },
  },
  coach: {
    name: 'コーチおすすめ', icon: '📋',
    desc: '年齢と経験から最も成長が期待できるメニューを選択',
    getMain: (p) => {
      const age = p.age || 20;
      const exp = p.experience || 0;
      if (p.position === 'pitcher') {
        // 若手(≤23): フィジカル(球速)が伸びやすい
        // 中堅(24-28): 経験で技術(制球)が伸びる
        // ベテラン(29+): 制球+スタミナ維持
        if (age <= 21) return 'velocity';
        if (age <= 23) {
          const v = p.pitching?.velocity || 130;
          return v < 145 ? 'velocity' : 'stamina';
        }
        if (age <= 28) {
          const c = p.pitching?.control || 50;
          return c < 60 ? 'control' : 'stamina';
        }
        return 'control';
      }
      // 野手
      // 若手(≤23): フィジカル(走塁/パワー)が伸びやすい
      // 中堅(24-28): 技術(打撃/選球眼)が伸びる
      // ベテラン(29+): 守備・選球眼で安定感
      if (age <= 21) {
        const spd = p.physical?.speed || 0;
        return spd < 50 ? 'baserunning' : 'batting';
      }
      if (age <= 23) {
        const pow = p.batting?.power || 0;
        const spd = p.physical?.speed || 0;
        return pow < spd ? 'batting' : 'baserunning';
      }
      if (age <= 28) {
        if (exp >= 150) {
          const eye = p.batting?.eye || 0;
          return eye < 40 ? 'eye' : 'batting';
        }
        return 'batting';
      }
      const def = p.fielding?.defense || 0;
      return def < 45 ? 'fielding' : 'eye';
    },
    getSub: (p) => {
      const age = p.age || 20;
      if (p.position === 'pitcher') {
        if (age <= 23) return 'running';
        if (age <= 28) return 'breaking';
        return 'stretch';
      }
      if (age <= 23) return 'muscle';
      if (age <= 28) return 'eye';
      return 'stretch';
    },
  },
};

const FIELD_POSITIONS = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];

function generateTrainingSuggestions(team) {
  if (!team?.players) return [];
  const suggestions = [];
  const players = team.players;
  const pitchers = players.filter(p => p.position === 'pitcher');
  const fielders = players.filter(p => p.position !== 'pitcher');

  // 1. ポジション過不足分析 → コンバート提案
  const posCount = {};
  FIELD_POSITIONS.forEach(pos => { posCount[pos] = 0; });
  fielders.forEach(p => { if (posCount[p.position] !== undefined) posCount[p.position]++; });

  const scarcePositions = FIELD_POSITIONS.filter(pos => posCount[pos] <= 1);
  const surplusPositions = FIELD_POSITIONS.filter(pos => posCount[pos] >= 3);

  if (scarcePositions.length > 0 && surplusPositions.length > 0) {
    for (const scarce of scarcePositions) {
      const candidates = fielders
        .filter(p => surplusPositions.includes(p.position))
        .filter(p => (p.positionFitness?.[scarce] || 0) >= 35)
        .sort((a, b) => (b.positionFitness?.[scarce] || 0) - (a.positionFitness?.[scarce] || 0));
      if (candidates.length > 0) {
        const c = candidates[0];
        const fitness = c.positionFitness?.[scarce] || 0;
        suggestions.push({
          playerId: c.id, type: 'convert',
          text: `${POSITION_NAMES[c.position]}が${posCount[c.position]}人、${POSITION_NAMES[scarce]}が${posCount[scarce]}人。${c.name}（適性${fitness}）を${POSITION_NAMES[scarce]}にコンバートしませんか？`,
          mainMenu: 'fielding', subMenu: 'subposition',
          extra: { targetPosition: scarce },
        });
      }
    }
  }

  // 2. 高ポテンシャル選手の集中育成提案
  for (const p of players) {
    const gp = (p.growthPotential ?? 1.0) + (p.growthModifier || 0);
    if (gp < 1.2) continue;
    if (p.position === 'pitcher') {
      const v = p.pitching?.velocity || 130;
      const c = p.pitching?.control || 50;
      if (v < 145) {
        suggestions.push({
          playerId: p.id, type: 'potential',
          text: `${p.name}は吸収力が高い。今のうちに球速を集中的に伸ばせば大きな武器になる。`,
          mainMenu: 'intensive_velocity', subMenu: 'running',
          extra: {},
        });
      } else if (c < 55) {
        suggestions.push({
          playerId: p.id, type: 'potential',
          text: `${p.name}は練習の吸収が早い。制球を重点的に鍛えれば一気にエース級になれる。`,
          mainMenu: 'intensive_control', subMenu: 'stretch',
          extra: {},
        });
      }
    } else {
      const meet = p.batting?.meet || 0;
      const power = p.batting?.power || 0;
      if (power < 45) {
        suggestions.push({
          playerId: p.id, type: 'potential',
          text: `${p.name}は伸びしろが大きい。パワーを集中的に鍛えれば長距離砲に化ける。`,
          mainMenu: 'intensive_power', subMenu: 'muscle',
          extra: {},
        });
      } else if (meet < 40) {
        suggestions.push({
          playerId: p.id, type: 'potential',
          text: `${p.name}は成長力が高い。ミートを集中強化すれば打線の柱に育つ。`,
          mainMenu: 'intensive_meet', subMenu: 'stretch',
          extra: {},
        });
      }
    }
  }

  // 3. 疲労酷使からの回復提案
  for (const p of players) {
    const gm = p.growthModifier || 0;
    if (gm <= -0.10) {
      suggestions.push({
        playerId: p.id, type: 'fatigue_recovery',
        text: `${p.name}は昨季の酷使で身体に負担が残っている。ストレッチで回復を最優先にすべきだ。`,
        mainMenu: p.position === 'pitcher' ? 'control' : 'batting', subMenu: 'stretch',
        extra: {},
      });
    } else if (gm <= -0.05) {
      suggestions.push({
        playerId: p.id, type: 'fatigue_recovery',
        text: `${p.name}は昨季の疲れが抜けきっていない。身体のケアも意識した練習を。`,
        mainMenu: p.position === 'pitcher' ? 'stamina' : 'batting', subMenu: 'running',
        extra: {},
      });
    }
  }

  // 4. 打席変更提案（ミートが低い野手）
  for (const p of fielders) {
    const meet = p.batting?.meet || 0;
    const bats = p.batting?.bats;
    if (meet < 30 && bats !== 'switch') {
      suggestions.push({
        playerId: p.id, type: 'switch_hit',
        text: `${p.name}はミート${meet}と打撃に苦しんでいる。思い切って打席変更で活路を見出しませんか？`,
        mainMenu: p.position === 'pitcher' ? 'stamina' : 'batting', subMenu: 'switch_hit',
        extra: {},
      });
    }
  }

  // 5. キャッチャーリード提案
  const catchers = players.filter(p => p.position === 'catcher');
  for (const p of catchers) {
    const lead = p.catching?.lead || 0;
    if (lead < 40) {
      suggestions.push({
        playerId: p.id, type: 'clead',
        text: `${p.name}のキャッチャーリードは${lead}。リードを磨けば投手陣の能力を引き出せる。`,
        mainMenu: 'fielding', subMenu: 'clead_study',
        extra: {},
      });
    }
  }

  // 6. 投手のフォーム改造提案（若手で制球が低い）
  for (const p of pitchers) {
    const control = p.pitching?.control || 50;
    const age = p.age || 20;
    if (control < 40 && age <= 24) {
      suggestions.push({
        playerId: p.id, type: 'form_change',
        text: `${p.name}は制球${control}と荒れ球。若いうちにフォーム改造に挑戦する価値はある。`,
        mainMenu: 'control', subMenu: 'form_change',
        extra: {},
      });
    }
  }

  // 7. 若手投手の球速強化（25歳以下で球速低め）
  for (const p of pitchers) {
    const v = p.pitching?.velocity || 130;
    const age = p.age || 20;
    if (v < 140 && age <= 25) {
      suggestions.push({
        playerId: p.id, type: 'velocity',
        text: `${p.name}は${v}km/hとまだ球速が伸びる余地がある。若いうちに鍛えたい。`,
        mainMenu: 'velocity', subMenu: 'muscle',
        extra: {},
      });
    }
  }

  // 8. スタミナ不足の投手（先発候補なのにスタミナが低い）
  for (const p of pitchers) {
    const stamina = p.pitching?.stamina || 80;
    if (stamina < 70) {
      suggestions.push({
        playerId: p.id, type: 'stamina',
        text: `${p.name}はスタミナ${stamina}で長いイニングが持たない。体力を付ければ先発ローテも見えてくる。`,
        mainMenu: 'stamina', subMenu: 'running',
        extra: {},
      });
    }
  }

  // 9. 守備が低い野手（レギュラー候補なのに守備力不足）
  for (const p of fielders) {
    const def = p.fielding?.defense || 0;
    if (def < 35) {
      suggestions.push({
        playerId: p.id, type: 'defense',
        text: `${p.name}は守備${def}と不安定。失策が多くては試合に使いづらい。`,
        mainMenu: 'fielding', subMenu: 'defense_sub',
        extra: {},
      });
    }
  }

  // 10. 変化球レベルが低い投手（球種は持っているがレベルが低い）
  for (const p of pitchers) {
    const arsenal = p.pitching?.arsenal || [];
    const lowLevel = arsenal.filter(a => a.type !== 'straight' && a.level < 25);
    if (lowLevel.length >= 2) {
      const names = lowLevel.slice(0, 2).map(a => getPitchTypeName(a.type)).join('・');
      suggestions.push({
        playerId: p.id, type: 'breaking_lv',
        text: `${p.name}の${names}はレベルが低い。変化球の精度を上げれば実戦で使える武器になる。`,
        mainMenu: 'control', subMenu: 'breaking',
        extra: {},
      });
    }
  }

  // 11. 俊足なのに盗塁技術が低い
  for (const p of fielders) {
    const speed = p.physical?.speed || 0;
    const steal = p.batting?.steal || 0;
    if (speed >= 55 && steal < 40) {
      suggestions.push({
        playerId: p.id, type: 'baserun',
        text: `${p.name}は走力${speed}の俊足だが盗塁${steal}と技術が追いついていない。走塁練習で武器にしたい。`,
        mainMenu: 'baserunning', subMenu: 'running',
        extra: {},
      });
    }
  }

  // 12. 選球眼が低い野手（出塁率に影響）
  for (const p of fielders) {
    const eye = p.batting?.eye || 0;
    const meet = p.batting?.meet || 0;
    if (eye < 30 && meet >= 35) {
      suggestions.push({
        playerId: p.id, type: 'eye',
        text: `${p.name}は打撃センスがあるが選球眼${eye}と低い。見極めを覚えれば出塁率が上がる。`,
        mainMenu: 'batting', subMenu: 'eye',
        extra: {},
      });
    }
  }

  // 13. 外野手の肩が弱い
  const outfielders = fielders.filter(p => ['left', 'center', 'right'].includes(p.position));
  for (const p of outfielders) {
    const arm = p.physical?.arm || 0;
    if (arm < 35) {
      suggestions.push({
        playerId: p.id, type: 'arm',
        text: `${p.name}は肩力${arm}と外野手としては弱い。肩を鍛えれば送球で走者を刺せるようになる。`,
        mainMenu: 'fielding', subMenu: 'muscle',
        extra: {},
      });
    }
  }

  // 14. ベテランのコンディション維持
  for (const p of players) {
    const age = p.age || 20;
    const recovery = p.physical?.recovery || 50;
    if (age >= 30 && recovery < 45) {
      suggestions.push({
        playerId: p.id, type: 'veteran',
        text: `${p.name}は${age}歳で回復力${recovery}。ストレッチで身体のケアを優先すべきだ。`,
        mainMenu: p.position === 'pitcher' ? 'control' : 'batting', subMenu: 'stretch',
        extra: {},
      });
    }
  }

  // 15. 二刀流選手の育成提案
  const twoWayPlayers = players.filter(p => p.isTwoWay);
  for (const p of twoWayPlayers) {
    if (p.position === 'pitcher') {
      const meet = p.batting?.meet || 0;
      if (meet < 35) {
        suggestions.push({
          playerId: p.id, type: 'twoway',
          text: `${p.name}は二刀流だがミート${meet}と打撃が課題。打撃練習で投打両面の戦力に育てたい。`,
          mainMenu: 'batting', subMenu: 'muscle',
          extra: {},
        });
      }
    } else {
      const v = p.pitching?.velocity || 130;
      const control = p.pitching?.control || 50;
      if (v < 138 || control < 40) {
        const weak = v < 138 ? `球速${v}km` : `制球${control}`;
        suggestions.push({
          playerId: p.id, type: 'twoway',
          text: `${p.name}は二刀流だが${weak}と投手能力が不足。鍛えれば登板機会が増える。`,
          mainMenu: v < 138 ? 'velocity' : 'control', subMenu: 'running',
          extra: {},
        });
      }
    }
  }

  // 16. パワーが低い長距離砲候補（高いパワーだが中途半端な選手を強化）
  for (const p of fielders) {
    const power = p.batting?.power || 0;
    const meet = p.batting?.meet || 0;
    if (power >= 40 && power < 55 && meet >= 35) {
      suggestions.push({
        playerId: p.id, type: 'power',
        text: `${p.name}はパワー${power}と素質がある。筋力強化でもう一段上の打球を飛ばせる。`,
        mainMenu: 'batting', subMenu: 'muscle',
        extra: {},
      });
    }
  }

  // 17. 制球はあるが球速が低い投手（技巧派への提案）
  for (const p of pitchers) {
    const v = p.pitching?.velocity || 130;
    const c = p.pitching?.control || 50;
    if (c >= 55 && v < 135) {
      suggestions.push({
        playerId: p.id, type: 'craft',
        text: `${p.name}は制球${c}で丁寧に投げられる。変化球の精度を上げて技巧派として磨き上げたい。`,
        mainMenu: 'control', subMenu: 'breaking',
        extra: {},
      });
    }
  }

  // 18. 走力が高い内野手 → 盗塁強化
  const infielders = fielders.filter(p => ['second', 'shortstop', 'third'].includes(p.position));
  for (const p of infielders) {
    const speed = p.physical?.speed || 0;
    const steal = p.batting?.steal || 0;
    if (speed >= 50 && steal >= 30 && steal < 55) {
      suggestions.push({
        playerId: p.id, type: 'steal_upgrade',
        text: `${p.name}は走力${speed}に加え盗塁センスもある。走塁を極めればリーグ屈指の脚になる。`,
        mainMenu: 'baserunning', subMenu: 'running',
        extra: {},
      });
    }
  }

  // 19. 守備は良いが打撃が物足りない野手
  for (const p of fielders) {
    const def = p.fielding?.defense || 0;
    const meet = p.batting?.meet || 0;
    const power = p.batting?.power || 0;
    if (def >= 50 && meet < 35 && power < 35) {
      suggestions.push({
        playerId: p.id, type: 'bat_improve',
        text: `${p.name}は守備${def}で堅実だが打撃が弱い。打撃練習でレギュラー争いに名乗りを上げたい。`,
        mainMenu: 'batting', subMenu: 'muscle',
        extra: {},
      });
    }
  }

  // 20. 若手投手のスタミナ＋球速の総合育成
  for (const p of pitchers) {
    const v = p.pitching?.velocity || 130;
    const stamina = p.pitching?.stamina || 80;
    const age = p.age || 20;
    if (age <= 22 && v >= 140 && stamina < 80) {
      suggestions.push({
        playerId: p.id, type: 'young_pitcher',
        text: `${p.name}は${v}km/hの速球が武器だが体力${stamina}が不安。スタミナを付ければ先発として計算できる。`,
        mainMenu: 'stamina', subMenu: 'running',
        extra: {},
      });
    }
  }

  // 21. ミートもパワーも高い野手 → 選球眼で完成形に
  for (const p of fielders) {
    const meet = p.batting?.meet || 0;
    const power = p.batting?.power || 0;
    const eye = p.batting?.eye || 0;
    if (meet >= 50 && power >= 45 && eye < 40) {
      suggestions.push({
        playerId: p.id, type: 'eye_upgrade',
        text: `${p.name}はミート${meet}・パワー${power}と打撃は一級品。選球眼を磨けば手がつけられなくなる。`,
        mainMenu: 'eye', subMenu: 'eye',
        extra: {},
      });
    }
  }

  // 同一選手の重複を除く（最初の提案のみ残す）
  const seen = new Set();
  const deduped = suggestions.filter(s => {
    if (seen.has(s.playerId)) return false;
    seen.add(s.playerId);
    return true;
  });

  // 優先度順にソート
  const priority = { convert: 0, fatigue_recovery: 1, twoway: 2, potential: 3, breaking_lv: 4, switch_hit: 5, clead: 6, form_change: 7, velocity: 8, stamina: 9, defense: 10, baserun: 11, eye: 12, arm: 13, power: 14, craft: 15, steal_upgrade: 16, bat_improve: 17, young_pitcher: 18, eye_upgrade: 19, veteran: 20 };
  deduped.sort((a, b) => (priority[a.type] ?? 99) - (priority[b.type] ?? 99));
  return deduped.slice(0, 12);
}

const CampScreen = ({ onComplete, allTeams, seasonData }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const userTeam = TEAMS_DATA[userTeamName];
  const currentYear = seasonData?.year || 1;

  const [currentRound, setCurrentRound] = useState(1);
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => {
      init[p.id] = p.position === 'pitcher' ? 'stamina' : 'batting';
    });
    return init;
  });
  const [subAssignments, setSubAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => { init[p.id] = 'running'; });
    return init;
  });
  const [newPitchSelections, setNewPitchSelections] = useState({});
  const [subPositionSelections, setSubPositionSelections] = useState({});
  const [formSelections, setFormSelections] = useState({});
  const [batsSelections, setBatsSelections] = useState({});
  const [roundResults, setRoundResults] = useState(null);
  const [viewMode, setViewMode] = useState('select');
  const [dispatchConfirm, setDispatchConfirm] = useState(null); // { playerId, destKey }
  const [dispatchResults, setDispatchResults] = useState([]); // キャンプ終了時の派遣結果表示
  const [updateKey, setUpdateKey] = useState(0); // 再レンダリング用
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());

  const suggestions = userTeam ? generateTrainingSuggestions(userTeam).filter(s => !dismissedSuggestions.has(s.playerId + s.type)) : [];

  const applySuggestion = (suggestion) => {
    const { playerId, mainMenu, subMenu, extra } = suggestion;
    if (mainMenu) setAssignments(prev => ({ ...prev, [playerId]: mainMenu }));
    if (subMenu) setSubAssignments(prev => ({ ...prev, [playerId]: subMenu }));
    if (extra?.targetPosition) setSubPositionSelections(prev => ({ ...prev, [playerId]: extra.targetPosition }));
    if (extra?.pitchType) setNewPitchSelections(prev => ({ ...prev, [playerId]: extra.pitchType }));
    setDismissedSuggestions(prev => new Set([...prev, playerId + suggestion.type]));
  };

  const dismissSuggestion = (suggestion) => {
    setDismissedSuggestions(prev => new Set([...prev, suggestion.playerId + suggestion.type]));
  };
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

  const handleDispatch = (playerId, destKey) => {
    const player = userTeam?.players?.find(p => p.id === playerId);
    if (!player) return;
    executeDispatchTraining(player, destKey);
    setDispatchConfirm(null);
    setUpdateKey(prev => prev + 1); // 再レンダリング
  };

  const POSITION_ORDER = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const sortedPlayers = [...(userTeam?.players || [])].sort((a, b) => {
    const posA = POSITION_ORDER.indexOf(a.position);
    const posB = POSITION_ORDER.indexOf(b.position);
    if (posA !== posB) return posA - posB;
    return (b.age || 20) - (a.age || 20);
  });

  const isPitcher = (player) => player.position === 'pitcher';

  const getAbilityRank = (value, isVelocity = false, isStamina = false) => {
    let v = value;
    if (isVelocity) v = (value - 115) * 2.5;
    else if (isStamina) v = value / 2;
    if (v >= 90) return { rank: 'S', color: 'text-pink-400' };
    if (v >= 80) return { rank: 'A', color: 'text-red-400' };
    if (v >= 70) return { rank: 'B', color: 'text-orange-400' };
    if (v >= 60) return { rank: 'C', color: 'text-yellow-400' };
    if (v >= 50) return { rank: 'D', color: 'text-green-400' };
    if (v >= 40) return { rank: 'E', color: 'text-blue-400' };
    return { rank: 'F', color: 'text-gray-400' };
  };

  const StatValue = ({ value, label, isVelocity = false, isStamina = false }) => {
    const { color } = getAbilityRank(value, isVelocity, isStamina);
    return <span className={`${color} font-bold`} title={`${label}: ${value}`}>{value}</span>;
  };

  const FitnessValue = ({ value }) => {
    if (value === undefined || value === null) return <span className="text-gray-700">-</span>;
    const color = value >= 80 ? 'text-green-400' : value >= 60 ? 'text-yellow-400' : value >= 40 ? 'text-orange-400' : 'text-red-400';
    return <span className={`${color} text-[10px]`}>{value}</span>;
  };

  const getAvailableNewPitches = (player) => {
    const existing = (player.pitching?.arsenal || []).map(p => p.type);
    return ALL_PITCH_TYPES.filter(t => !existing.includes(t));
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
      finalAssignments[p.id] = assignments[p.id] || (isPitcher(p) ? 'stamina' : 'batting');
    });

    const { updatedTeam, allReports } = executeTeamCampTraining(
      userTeam, finalAssignments, newPitchSelections
    );
    TEAMS_DATA[userTeamName] = updatedTeam;

    updatedTeam.players.forEach(p => {
      const subType = subAssignments[p.id] || 'running';
      const subOptions = {
        targetPosition: subPositionSelections[p.id],
        targetForm: formSelections[p.id],
        targetBats: batsSelections[p.id],
      };
      const { growthReport: subGrowth } = executeSubTraining(p, subType, subOptions);
      const mainReport = allReports.find(r => r.player.id === p.id);
      if (mainReport && subGrowth.length > 0) {
        mainReport.subGrowthReport = subGrowth;
        mainReport.subTrainingType = subType;
      }
    });

    teamNames.forEach(tn => {
      if (tn === userTeamName) return;
      const aiTeam = TEAMS_DATA[tn];
      if (!aiTeam?.players) return;

      // AIチーム: 第1クールで適格な若手を30%の確率で派遣
      if (currentRound === 1 && currentYear > 1) {
        aiTeam.players.forEach(p => {
          if (p.dispatchedThisCamp) return;
          if (Math.random() > 0.3) return;
          const destKeys = Object.keys(DISPATCH_DESTINATIONS);
          for (const dk of destKeys) {
            const { eligible } = checkDispatchEligibility(p, dk, { teamPlayers: aiTeam.players, allTeams: TEAMS_DATA });
            if (eligible) {
              executeDispatchTraining(p, dk);
              break;
            }
          }
        });
      }

      const aiAssign = {};
      const pitcherMenus = ['stamina', 'control', 'velocity', 'newpitch'];
      const batterMenus = ['batting', 'baserunning', 'fielding'];
      aiTeam.players.forEach(p => {
        if (p.dispatchedThisCamp) return; // 派遣済みはスキップ
        if (p.position === 'pitcher') {
          aiAssign[p.id] = pitcherMenus[Math.floor(Math.random() * pitcherMenus.length)];
        } else {
          aiAssign[p.id] = batterMenus[Math.floor(Math.random() * batterMenus.length)];
        }
      });
      const aiResult = executeTeamCampTraining(aiTeam, aiAssign);
      TEAMS_DATA[tn] = aiResult.updatedTeam;
      const subMenuKeys = Object.keys(SUB_TRAINING_MENUS);
      aiResult.updatedTeam.players.forEach(p => {
        const aiSubType = subMenuKeys[Math.floor(Math.random() * subMenuKeys.length)];
        executeSubTraining(p, aiSubType);
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
  };

  const getArsenalDisplay = (player) => {
    const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
    if (arsenal.length === 0) return '-';
    return arsenal.map(a => `${getPitchTypeName(a.type)}${a.level}`).join(' ');
  };

  const subPosHeaders = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const subPosShort = { catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右' };

  // 派遣中でない選手のみ表示
  const activePlayers = sortedPlayers.filter(p => !p.dispatchedThisCamp);
  const dispatchedPlayers = sortedPlayers.filter(p => p.dispatchedThisCamp);

  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <div className="max-w-full mx-auto">
        {/* 派遣確認モーダル */}
        {dispatchConfirm && (() => {
          const player = userTeam?.players?.find(p => p.id === dispatchConfirm.playerId);
          const dest = DISPATCH_DESTINATIONS[dispatchConfirm.destKey];
          if (!player || !dest) return null;
          return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-800 rounded-xl max-w-md w-full p-5">
                <h2 className="text-base font-bold text-white mb-3 text-center">{dest.icon} {dest.name}に派遣</h2>
                <div className="bg-gray-700/60 rounded-lg p-3 mb-3 text-center">
                  <div className="text-white font-bold text-lg mb-1">{player.name}</div>
                  <div className="text-gray-400 text-xs">{POSITION_NAMES[player.position]} / {player.age}歳 / 総合力: {calcPlayerOverall(player)}</div>
                </div>
                <div className="text-yellow-400 text-xs mb-3 text-center space-y-0.5">
                  <p>キャンプ期間中に集中特訓を受けます</p>
                  <p>通常練習の代わりに大幅な能力アップが期待できます</p>
                  <p>派遣後もシーズンには通常通り出場できます</p>
                </div>
                <div className="flex gap-2 justify-center">
                  <button onClick={() => setDispatchConfirm(null)} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition">
                    キャンセル
                  </button>
                  <button onClick={() => handleDispatch(dispatchConfirm.playerId, dispatchConfirm.destKey)} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition">
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
            <h1 className="text-xl font-bold text-white">春季キャンプ - {userTeamName}</h1>
            {dispatchedPlayers.length > 0 && (
              <span className="text-orange-400 text-xs font-bold">派遣中: {dispatchedPlayers.length}人</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map(r => (
              <div key={r} className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                r < currentRound ? 'bg-green-600 text-white'
                  : r === currentRound ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-gray-700 text-gray-500'
              }`}>{r}</div>
            ))}
            <span className="text-gray-500 text-xs ml-1">{currentRound}/{MAX_CAMP_ROUNDS}</span>
          </div>
        </div>

        {viewMode === 'select' && (
          <>
            {/* プリセット一括設定 */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className="text-gray-500 text-xs font-bold">プリセット:</span>
              {Object.entries(CAMP_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  title={preset.desc}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded px-2 py-0.5 text-[11px] text-gray-300 hover:text-blue-300 transition"
                >
                  {preset.icon} {preset.name}
                </button>
              ))}
              <span className="text-gray-600 mx-1">|</span>
              <span className="text-gray-500 text-xs font-bold">一括:</span>
              {Object.entries(TRAINING_MENUS).filter(([k, m]) => !['newpitch'].includes(k) && !m.intensive).map(([key, menu]) => (
                <button
                  key={key}
                  onClick={() => {
                    const updated = {};
                    userTeam?.players?.forEach(p => {
                      updated[p.id] = TRAINING_MENUS[key] ? key : (assignments[p.id] || (isPitcher(p) ? 'stamina' : 'batting'));
                    });
                    setAssignments(updated);
                  }}
                  className="px-2 py-0.5 text-[11px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
                >
                  {menu.icon} {menu.name}
                </button>
              ))}
            </div>

            {/* コーチからの提案 */}
            {suggestions.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="flex items-center gap-1 text-xs font-bold text-yellow-400 hover:text-yellow-300 mb-1 transition"
                >
                  <span>{showSuggestions ? '▼' : '▶'}</span>
                  <span>コーチからの提案（{suggestions.length}件）</span>
                </button>
                {showSuggestions && (
                  <div className="space-y-1">
                    {suggestions.map((s, idx) => {
                      const typeColors = {
                        convert: 'border-green-700/60 bg-green-950/40',
                        fatigue_recovery: 'border-red-700/60 bg-red-950/40',
                        twoway: 'border-amber-700/60 bg-amber-950/40',
                        potential: 'border-yellow-700/60 bg-yellow-950/40',
                        breaking_lv: 'border-blue-700/60 bg-blue-950/40',
                        switch_hit: 'border-orange-700/60 bg-orange-950/40',
                        clead: 'border-cyan-700/60 bg-cyan-950/40',
                        form_change: 'border-purple-700/60 bg-purple-950/40',
                        velocity: 'border-red-700/60 bg-red-950/40',
                        stamina: 'border-teal-700/60 bg-teal-950/40',
                        defense: 'border-yellow-700/60 bg-yellow-950/40',
                        baserun: 'border-emerald-700/60 bg-emerald-950/40',
                        eye: 'border-indigo-700/60 bg-indigo-950/40',
                        arm: 'border-rose-700/60 bg-rose-950/40',
                        power: 'border-orange-700/60 bg-orange-950/40',
                        craft: 'border-violet-700/60 bg-violet-950/40',
                        steal_upgrade: 'border-emerald-700/60 bg-emerald-950/40',
                        bat_improve: 'border-sky-700/60 bg-sky-950/40',
                        young_pitcher: 'border-teal-700/60 bg-teal-950/40',
                        eye_upgrade: 'border-indigo-700/60 bg-indigo-950/40',
                        veteran: 'border-gray-600/60 bg-gray-800/40',
                      };
                      const typeIcons = {
                        convert: '🔄', fatigue_recovery: '🏥', twoway: '⚾', potential: '🌟',
                        breaking_lv: '🌀', switch_hit: '↔️', clead: '🧠', form_change: '⚡',
                        velocity: '🔥', stamina: '💪', defense: '🧤', baserun: '🏃', eye: '👁️',
                        arm: '💪', power: '💥', craft: '🎯', steal_upgrade: '💨',
                        bat_improve: '🏏', young_pitcher: '🌱', eye_upgrade: '👁️', veteran: '🧘',
                      };
                      const typeLabels = {
                        convert: 'コンバート', fatigue_recovery: '疲労回復', twoway: '二刀流', potential: '素材育成',
                        breaking_lv: '変化球強化', switch_hit: '打席変更', clead: 'Cリード', form_change: 'フォーム改造',
                        velocity: '球速強化', stamina: 'スタミナ', defense: '守備強化', baserun: '走塁', eye: '選球眼',
                        arm: '肩力強化', power: 'パワー', craft: '技巧派', steal_upgrade: '盗塁強化',
                        bat_improve: '打撃改善', young_pitcher: '若手育成', eye_upgrade: '選球眼', veteran: '身体ケア',
                      };
                      return (
                        <div key={idx} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${typeColors[s.type] || 'border-gray-700 bg-gray-800'}`}>
                          <span className="text-sm">{typeIcons[s.type]}</span>
                          <span className="text-[10px] font-bold text-gray-400 w-16 shrink-0">{typeLabels[s.type]}</span>
                          <span className="text-xs text-gray-200 flex-1">{s.text}</span>
                          <button
                            onClick={() => applySuggestion(s)}
                            className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-600 hover:bg-yellow-500 text-white transition"
                          >適用</button>
                          <button
                            onClick={() => dismissSuggestion(s)}
                            className="shrink-0 text-gray-600 hover:text-gray-400 text-xs transition"
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 派遣中の選手 */}
            {dispatchedPlayers.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-orange-400 text-xs font-bold">派遣中:</span>
                  {dispatchedPlayers.map((p, idx) => {
                    const dest = DISPATCH_DESTINATIONS[p.dispatchedThisCamp];
                    return (
                      <div key={idx} className="flex items-center gap-1 bg-gray-700/50 rounded px-2 py-0.5">
                        <span className={`font-bold text-[10px] ${p.position === 'pitcher' ? 'text-red-400' : 'text-blue-300'}`}>{p.name}</span>
                        <span className="text-gray-500 text-[10px]">{dest?.icon} {dest?.name}</span>
                        <span className="text-orange-400 text-[10px]">（結果はキャンプ終了時）</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 選手テーブル */}
            <div className="bg-gray-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700/80 text-gray-400 text-[10px]">
                    <th className="py-1.5 px-2 text-left w-20">選手</th>
                    <th className="py-1.5 px-1 text-center w-7">位</th>
                    <th className="py-1.5 px-1 text-center w-6">齢</th>
                    <th className="py-1.5 px-1 text-center w-10" title="成長率 (基礎+変動)">成長</th>
                    <th className="py-1.5 px-1 text-center w-8">投/打</th>
                    <th className="py-1.5 px-1 text-center w-12">フォーム</th>
                    <th className="py-1.5 px-1 text-center w-7">ミ</th>
                    <th className="py-1.5 px-1 text-center w-7">パ</th>
                    <th className="py-1.5 px-1 text-center w-7">走</th>
                    <th className="py-1.5 px-1 text-center w-7">肩</th>
                    <th className="py-1.5 px-1 text-center w-7">守</th>
                    <th className="py-1.5 px-1 text-center w-7">Cリ</th>
                    <th className="py-1.5 px-1 text-center w-7">眼</th>
                    <th className="py-1.5 px-1 text-center w-9">速</th>
                    <th className="py-1.5 px-1 text-center w-7">制</th>
                    <th className="py-1.5 px-1 text-center w-9">ス</th>
                    <th className="py-1.5 px-2 text-left">変化球</th>
                    <th className="py-1.5 px-2 text-left">前年成績</th>
                    {/* サブポジション適性 */}
                    {subPosHeaders.map(pos => (
                      <th key={pos} className="py-1.5 px-0.5 text-center w-6" title={POSITION_NAMES[pos]}>{subPosShort[pos]}</th>
                    ))}
                    <th className="py-1.5 px-2 text-left w-28">メイン</th>
                    <th className="py-1.5 px-2 text-left w-28">サブ</th>
                    {currentYear > 1 && <th className="py-1.5 px-1 text-center w-16">派遣</th>}
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map(player => {
                    const b = player.batting || {};
                    const p = player.pitching || {};
                    const ph = player.physical || {};
                    const f = player.fielding || {};
                    const pf = player.positionFitness || {};
                    const currentTraining = assignments[player.id] || (isPitcher(player) ? 'stamina' : 'batting');
                    const showNewPitchSelect = currentTraining === 'newpitch';
                    const availableNewPitches = getAvailableNewPitches(player);

                    return (
                      <tr key={player.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-1 px-2">
                          <span className={`font-bold text-xs ${isPitcher(player) ? 'text-red-400' : 'text-blue-300'}`}>
                            {player.name}
                          </span>
                        </td>
                        <td className="py-1 px-1 text-center">
                          <span className="text-[10px] text-gray-500">{POSITION_NAMES[player.position] || player.position}</span>
                        </td>
                        <td className="py-1 px-1 text-center text-gray-500 text-[10px]">{player.age || 20}</td>
                        <td className="py-1 px-1 text-center text-[10px]">
                          {(() => {
                            const base = player.growthPotential ?? 1.0;
                            const mod = player.growthModifier || 0;
                            const effective = Math.max(0.3, Math.min(1.8, base + mod));
                            const color = effective >= 1.3 ? 'text-yellow-400' : effective >= 1.1 ? 'text-green-400' : effective <= 0.7 ? 'text-red-400' : effective <= 0.9 ? 'text-orange-400' : 'text-gray-400';
                            return (
                              <span className={color} title={`基礎:${base.toFixed(2)} 変動:${mod >= 0 ? '+' : ''}${mod.toFixed(2)}`}>
                                {effective.toFixed(2)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-1 px-1 text-center text-[10px]">
                          <span className={ph.throws === 'left' ? 'text-green-400' : 'text-gray-500'}>{ph.throws === 'left' ? '左' : '右'}</span>
                          <span className="text-gray-600">/</span>
                          <span className={b.bats === 'left' ? 'text-green-400' : b.bats === 'switch' ? 'text-purple-400' : 'text-gray-500'}>{b.bats === 'left' ? '左' : b.bats === 'switch' ? '両' : '右'}</span>
                        </td>
                        <td className="py-1 px-1 text-center text-[10px] text-gray-400">
                          {isPitcher(player) ? ({ overhand: 'オーバー', threeQuarter: 'スリー', sidearm: 'サイド', submarine: 'アンダー' }[p.form] || '-') : '-'}
                        </td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.meet||0} label="ミート" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.power||0} label="パワー" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.speed||0} label="走力" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.arm||0} label="肩力" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={f.defense||0} label="守備" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={player.catching?.lead||0} label="Cリード" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.eye||0} label="選球眼" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.velocity||0} label="球速" isVelocity={true} /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.control||0} label="制球" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.stamina||0} label="スタミナ" isStamina={true} /></td>
                        <td className="py-1 px-2 text-yellow-400 text-[10px] font-mono truncate max-w-[100px]">{getArsenalDisplay(player)}</td>
                        <td className="py-1 px-2 text-[10px] font-mono text-gray-400 whitespace-nowrap">
                          {(() => {
                            const prev = player.previousSeasonStats;
                            if (!prev) return <span className="text-gray-600">-</span>;
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
                        {/* サブポジション適性 */}
                        {subPosHeaders.map(pos => (
                          <td key={pos} className="py-1 px-0.5 text-center font-mono">
                            {pos === player.position
                              ? <span className="text-white text-[10px] font-bold">主</span>
                              : <FitnessValue value={pf[pos]} />
                            }
                          </td>
                        ))}
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={currentTraining}
                              onChange={(e) => setAssignments(prev => ({ ...prev, [player.id]: e.target.value }))}
                              className="bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-32"
                            >
                              {Object.entries(TRAINING_MENUS).filter(([, m]) => !m.intensive)
                                .map(([key, menu]) => (
                                <option key={key} value={key}>{menu.icon} {menu.name}</option>
                              ))}
                              <option disabled>── 集中コース ──</option>
                              {Object.entries(TRAINING_MENUS).filter(([, m]) => m.intensive)
                                .map(([key, menu]) => (
                                <option key={key} value={key}>{menu.icon} {menu.name}</option>
                              ))}
                            </select>
                            {showNewPitchSelect && availableNewPitches.length > 0 && (
                              <select
                                value={newPitchSelections[player.id] || availableNewPitches[0]}
                                onChange={(e) => setNewPitchSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded w-28"
                              >
                                {availableNewPitches.map(pt => {
                                  const hasAffinity = FORM_PITCH_AFFINITY[p.form]?.[pt];
                                  return <option key={pt} value={pt}>{getPitchTypeName(pt)}{hasAffinity ? ' ★適性' : ''}</option>;
                                })}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={subAssignments[player.id] || 'running'}
                              onChange={(e) => setSubAssignments(prev => ({ ...prev, [player.id]: e.target.value }))}
                              className="bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-28"
                            >
                              {Object.entries(SUB_TRAINING_MENUS)
                                .map(([key, menu]) => (
                                <option key={key} value={key}>{menu.icon} {menu.name}</option>
                              ))}
                            </select>
                            {(subAssignments[player.id] || 'running') === 'subposition' && (
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
                            {(subAssignments[player.id] || 'running') === 'form_change' && player.position === 'pitcher' && (
                              <select
                                value={formSelections[player.id] || ''}
                                onChange={(e) => setFormSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded w-20"
                              >
                                <option value="">自動</option>
                                {[['overhand','オーバー'],['threeQuarter','スリクォ'],['sidearm','サイド'],['submarine','アンダー']]
                                  .filter(([k]) => k !== player.pitching?.form)
                                  .map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            )}
                            {(subAssignments[player.id] || 'running') === 'switch_hit' && (
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
                        {currentYear > 1 && (
                          <td className="py-1 px-1 text-center">
                            <div className="flex gap-0.5 justify-center">
                              {Object.entries(DISPATCH_DESTINATIONS).map(([destKey, dest]) => {
                                const { eligible, reason } = checkDispatchEligibility(player, destKey, { teamPlayers: userTeam?.players || [], allTeams: TEAMS_DATA });
                                return (
                                  <button
                                    key={destKey}
                                    onClick={() => eligible && setDispatchConfirm({ playerId: player.id, destKey })}
                                    disabled={!eligible}
                                    title={eligible ? `${dest.name}に派遣\n${dest.desc}` : reason}
                                    className={`px-1 py-0.5 rounded text-[10px] font-bold transition ${
                                      eligible
                                        ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
                                        : 'bg-gray-700 text-gray-600 cursor-not-allowed'
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

            <div className="text-center mt-3">
              <button
                onClick={handleExecuteTraining}
                className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
              >
                第{currentRound}クール練習を実行
              </button>
            </div>
          </>
        )}

        {viewMode === 'results' && (
          <>
            {/* 練習結果 */}
            <div className="bg-gray-800 rounded-lg overflow-hidden mb-3">
              <div className="px-3 py-2 bg-gray-700/80 border-b border-gray-600">
                <h2 className="text-sm font-bold text-white">第{currentRound}クール 練習結果</h2>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700/50 text-gray-400 text-[10px]">
                    <th className="py-1 px-2 text-left w-20">選手</th>
                    <th className="py-1 px-2 text-left w-20">メイン</th>
                    <th className="py-1 px-2 text-left">メイン結果</th>
                    <th className="py-1 px-2 text-left w-20">サブ</th>
                    <th className="py-1 px-2 text-left">サブ結果</th>
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
                      <td className="py-1 px-2">
                        <span className={`font-bold ${isPitcher(result.player) ? 'text-red-400' : 'text-blue-300'}`}>
                          {result.player.name}
                        </span>
                        {coachComment && (
                          <div className={`text-[9px] ${coachComment.color}`}>📋{coachComment.text}</div>
                        )}
                      </td>
                      <td className="py-1 px-2 text-gray-500 text-[10px]">
                        {TRAINING_MENUS[result.trainingType]?.icon} {TRAINING_MENUS[result.trainingType]?.name}
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex flex-wrap gap-0.5">
                          {result.growthReport.map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-1.5 py-0 rounded text-[10px] leading-relaxed ${
                                growth.isPenalty
                                  ? 'bg-red-700/80 text-red-100'
                                  : growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'bg-green-700/80 text-green-100'
                                    : 'bg-gray-600/50 text-gray-400'
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
                            <span className="text-gray-600 text-[10px]">変化なし</span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-gray-500 text-[10px]">
                        {result.subTrainingType && SUB_TRAINING_MENUS[result.subTrainingType] && (
                          <>{SUB_TRAINING_MENUS[result.subTrainingType].icon} {SUB_TRAINING_MENUS[result.subTrainingType].name}</>
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex flex-wrap gap-0.5">
                          {(result.subGrowthReport || []).map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-1.5 py-0 rounded text-[10px] leading-relaxed ${
                                growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'bg-teal-700/80 text-teal-100'
                                    : growth.growth < 0
                                      ? 'bg-red-700/80 text-red-100'
                                      : 'bg-gray-600/50 text-gray-400'
                              }`}
                            >
                              {growth.statName}: {growth.before}→{growth.after}
                              {growth.growth > 0 && ` +${growth.growth}`}
                              {growth.growth < 0 && ` ${growth.growth}`}
                              {growth.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                          {(!result.subGrowthReport || result.subGrowthReport.length === 0) && (
                            <span className="text-gray-600 text-[10px]">変化なし</span>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
                >
                  次のクールへ（第{currentRound + 1}クール）
                </button>
              ) : (
                <button
                  onClick={() => {
                    // キャンプ終了時に派遣結果を確定・適用
                    const results = [];
                    Object.values(TEAMS_DATA).forEach(team => {
                      team.players?.forEach(p => {
                        if (p.dispatchedThisCamp) {
                          const { growthReport, outcome } = resolveDispatchTraining(p);
                          if (team === userTeam) {
                            const dest = DISPATCH_DESTINATIONS[p.dispatchedThisCamp];
                            results.push({ player: p, destination: dest?.name || '不明', growthReport, outcome });
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
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
                >
                  キャンプ終了 → 成長確認
                </button>
              )}
            </div>
          </>
        )}

        {viewMode === 'dispatchResults' && (
          <>
            <div className="bg-gray-800 rounded-lg overflow-hidden mb-3">
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
                        <span className="text-gray-400 text-xs">{result.destination}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${outcomeColor}`}>{outcomeLabel}</span>
                      </div>
                      {result.growthReport.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {result.growthReport.map((g, gIdx) => (
                            <span key={gIdx} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              g.isAwakening ? 'bg-yellow-500 text-black' : 'bg-green-700 text-green-100'
                            }`}>
                              {g.statName}: {g.before}→{g.after} +{g.growth}{g.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">成長なし... 派遣の成果は得られませんでした</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-center">
              <button
                onClick={() => setViewMode('summary')}
                className="bg-green-600 hover:bg-green-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
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
            { key: 'batting.meet', stat: 'meet', name: 'ミート', get: (s) => s.batting?.meet || 0 },
            { key: 'batting.power', stat: 'power', name: 'パワー', get: (s) => s.batting?.power || 0 },
            { key: 'batting.eye', stat: 'eye', name: '選球眼', get: (s) => s.batting?.eye || 0 },
            { key: 'physical.speed', stat: 'speed', name: '走力', get: (s) => s.physical?.speed || 0 },
            { key: 'physical.arm', stat: 'arm', name: '肩力', get: (s) => s.physical?.arm || 0 },
            { key: 'fielding.defense', stat: 'defense', name: '守備', get: (s) => s.fielding?.defense || 0 },
            { key: 'catching.lead', stat: 'lead', name: 'Cリード', get: (s) => s.catching?.lead || 0 },
            { key: 'pitching.velocity', stat: 'velocity', name: '球速', get: (s) => s.pitching?.velocity || 0, isVelocity: true },
            { key: 'pitching.control', stat: 'control', name: '制球', get: (s) => s.pitching?.control || 0 },
            { key: 'pitching.stamina', stat: 'stamina', name: 'スタミナ', get: (s) => s.pitching?.stamina || 0, isStamina: true },
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
                <h1 className="text-xl font-bold text-white">春季キャンプ成長レポート - {userTeamName}</h1>
              </div>
              <div className="flex gap-4 text-[10px] mb-1 ml-1">
                <span className="text-green-400">■ キャンプ成長</span>
                <span className="text-cyan-400">■ 自然成長()</span>
                <span className="text-red-400">■ 衰退</span>
              </div>
              <div className="bg-gray-800 rounded-lg overflow-hidden overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-700/80 text-gray-400 text-[10px]">
                      <th className="py-1.5 px-2 text-left w-20">選手</th>
                      <th className="py-1.5 px-1 text-center w-7">位</th>
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
                            <span className="text-[10px] text-gray-500">{POSITION_NAMES[player.position] || player.position}</span>
                          </td>
                          {diffs.map(d => (
                            <td key={d.key} className="py-1 px-1 text-center font-mono text-[10px]">
                              {d.diff !== 0 ? (
                                <span>
                                  <span className="text-gray-500">{d.before - d.naturalDiff}</span>
                                  <span className="text-gray-600 mx-0.5">{'\u2192'}</span>
                                  <span className={d.diff > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{d.after}</span>
                                  {d.campDiff !== 0 && (
                                    <span className={`ml-0.5 ${d.campDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                      {d.campDiff > 0 ? `+${d.campDiff}` : d.campDiff}
                                    </span>
                                  )}
                                  {d.naturalDiff !== 0 && (
                                    <span className={`ml-0.5 ${d.naturalDiff > 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                                      ({d.naturalDiff > 0 ? `+${d.naturalDiff}` : d.naturalDiff})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-gray-600">-</span>
                              )}
                            </td>
                          ))}
                          <td className="py-1 px-2 text-[10px]">
                            {newPitches.length > 0 ? (
                              <span className="text-yellow-400 font-bold">
                                {newPitches.map(t => getPitchTypeName(t)).join(', ')}
                              </span>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="py-1 px-1 text-center">
                            <span className={`font-bold text-xs ${totalGrowth >= 10 ? 'text-yellow-400' : totalGrowth >= 5 ? 'text-green-400' : totalGrowth > 0 ? 'text-blue-300' : 'text-gray-600'}`}>
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
                  className="bg-green-600 hover:bg-green-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
                >
                  シーズン開始
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
