// ============================================================
// 派遣システム（大学野球留学・プロ研修）
// ============================================================

import { getNestedValue, setNestedValueMut } from './growthUtils.js';
import { getPitchTypeName } from './campTraining.js';


/** 派遣先の定義 */
export const DISPATCH_DESTINATIONS = {
  university: {
    name: '大学野球留学',
    icon: '🎓',
    desc: 'キャンプ期間に大学で集中特訓。フィジカルが大きく伸びる',
    maxAge: 22,         // 22歳以下
    maxOverall: 55,     // 総合力55以下
    growthProfile: 'physical', // フィジカル系メイン
  },
  proCamp: {
    name: 'プロ研修',
    icon: '🏟️',
    desc: 'キャンプ期間にプロ球団で特訓。技術系が大きく伸びる',
    maxAge: 24,         // 24歳以下
    maxOverall: 50,     // 総合力50以下
    growthProfile: 'technical', // 技術系メイン
  },
};

/**
 * 選手の総合力を計算（派遣適格判定用）
 * 投手: (velocity-115)*1.5 + control + stamina/3 を3で割った平均
 * 野手: (meet + power + speed + defense) / 4
 */
export function calcPlayerOverall(player) {
  if (player.position === 'pitcher') {
    const vel = ((player.pitching?.velocity || 130) - 115) * 1.5;
    const ctrl = player.pitching?.control || 40;
    const sta = (player.pitching?.stamina || 80) / 3;
    return Math.round((vel + ctrl + sta) / 3);
  } else {
    const meet = player.batting?.meet || 30;
    const power = player.batting?.power || 30;
    const speed = player.physical?.speed || 30;
    const defense = player.fielding?.defense || 30;
    return Math.round((meet + power + speed + defense) / 4);
  }
}

/** 派遣枠の上限 */
export const DISPATCH_LIMITS = {
  perTeamPerDest: 1,  // 各チーム、各派遣先に1人ずつ
  leagueTotal: 8,     // リーグ全体で合計8人
};

/**
 * 派遣可能かどうか判定
 * @param {Object} player - 選手データ
 * @param {string} destKey - 派遣先キー ('university' or 'proCamp')
 * @param {Object} options - { teamPlayers, allTeams }
 *   teamPlayers: 同じチームの選手配列（チーム枠判定用）
 *   allTeams: 全チームデータ（リーグ枠判定用）TEAMS_DATAオブジェクト
 * @returns {{ eligible: boolean, reason: string }}
 */
export function checkDispatchEligibility(player, destKey, options = {}) {
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return { eligible: false, reason: '不明な派遣先' };

  if (player.dispatchedThisCamp) return { eligible: false, reason: '今キャンプで派遣済み' };
  if ((player.age || 20) > dest.maxAge) return { eligible: false, reason: `${dest.maxAge}歳以下のみ` };

  const overall = calcPlayerOverall(player);
  if (overall > dest.maxOverall) return { eligible: false, reason: `総合力${dest.maxOverall}以下のみ (現在${overall})` };

  // チーム内の同派遣先の枠チェック
  const teamPlayers = options.teamPlayers || [];
  const teamDestCount = teamPlayers.filter(p => p.dispatchedThisCamp === destKey).length;
  if (teamDestCount >= DISPATCH_LIMITS.perTeamPerDest) {
    return { eligible: false, reason: `${dest.name}の枠は各チーム${DISPATCH_LIMITS.perTeamPerDest}人まで` };
  }

  // リーグ全体の派遣枠チェック
  if (options.allTeams) {
    let leagueTotal = 0;
    Object.values(options.allTeams).forEach(team => {
      (team.players || []).forEach(p => {
        if (p.dispatchedThisCamp) leagueTotal++;
      });
    });
    if (leagueTotal >= DISPATCH_LIMITS.leagueTotal) {
      return { eligible: false, reason: `リーグ全体の派遣枠(${DISPATCH_LIMITS.leagueTotal}人)が満員` };
    }
  }

  return { eligible: true, reason: '' };
}

/**
 * 選手をキャンプ中に派遣登録する（成長はキャンプ終了時に適用）
 * 派遣時点では結果（大成功/成功/失敗）を内部決定するが、表示しない
 * @param {Object} player - 選手データ（直接変更）
 * @param {string} destKey - 派遣先キー
 */
export function executeDispatchTraining(player, destKey) {
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return;

  // 結果判定: 飛躍25% / 成長60% / 微成長15%
  // "派遣は大きく成長するが、あまり成長しない可能性もあるリスク" を導入
  // 経験値が高いほど飛躍が出やすく、微成長リスクは下がる
  // - 飛躍: 25% + min(15%, exp/250) → 25〜40%
  // - 微成長: max(5%, 15% - exp/300) → 5〜15%
  // - 成長: 残り
  const experience = player.experience || 0;
  const leapChance = 0.25 + Math.min(0.15, experience / 250);
  const minorChance = Math.max(0.05, 0.15 - experience / 300);
  const roll = Math.random();
  let outcome;
  if (roll < leapChance) {
    outcome = 'great_success'; // 飛躍: 1.5倍
  } else if (roll < 1 - minorChance) {
    outcome = 'success';       // 成長: 1.0倍
  } else {
    outcome = 'minor';         // 微成長: 0.5倍
  }

  // 派遣済みフラグ＋結果を保存（成長はまだ適用しない）
  player.dispatchedThisCamp = destKey;
  player.dispatchOutcome = outcome;
}

/**
 * キャンプ終了時に派遣結果を適用し、成長レポートを返す
 * @param {Object} player - 派遣済みの選手データ（直接変更）
 * @returns {{ growthReport: Array, outcome: string }} 成長レポートと結果
 */
export function resolveDispatchTraining(player) {
  const destKey = player.dispatchedThisCamp;
  const outcome = player.dispatchOutcome || 'success';
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return { growthReport: [], outcome };

  const growthReport = [];

  // 球速成長キャップ用に派遣前の球速を記録（投手のみ）
  const initialVelocity = player.position === 'pitcher' ? (player.pitching?.velocity || 0) : null;

  // 飛躍: 1.5倍、成長: 1.0倍、微成長: 0.5倍（失敗なし）
  const multiplier = outcome === 'great_success' ? 1.5
                   : outcome === 'minor' ? 0.5
                   : 1.0;

  const applyGrowth = (base) => Math.floor(base * multiplier);

  if (player.position === 'pitcher') {
    if (dest.growthProfile === 'technical') {
      // プロ研修(technical): 制球と変化球がUP、球速も少し
      const ctrlGrowth = applyGrowth(Math.floor(Math.random() * 6) + 4);
      const before = player.pitching.control;
      player.pitching.control = Math.min(99, before + ctrlGrowth);
      growthReport.push({ statName: '制球', before, after: player.pitching.control, growth: player.pitching.control - before });

      const velGrowth = applyGrowth(Math.floor(Math.random() * 2) + 1);
      const vBefore = player.pitching.velocity;
      player.pitching.velocity = Math.max(vBefore, Math.min(155, vBefore + velGrowth));
      growthReport.push({ statName: '球速', before: vBefore, after: player.pitching.velocity, growth: player.pitching.velocity - vBefore });

      // 変化球レベルUP
      const arsenal = player.pitching?.arsenal || [];
      arsenal.filter(p => p.type !== 'straight').forEach(pitch => {
        const pGrowth = applyGrowth(Math.floor(Math.random() * 5) + 3);
        const pBefore = pitch.level;
        pitch.level = pBefore + pGrowth;
        growthReport.push({ statName: `${getPitchTypeName(pitch.type)}`, before: pBefore, after: pitch.level, growth: pitch.level - pBefore });
      });

      // スタミナも少し
      const staBefore = player.pitching.stamina;
      const staGrowth = applyGrowth(Math.floor(Math.random() * 6) + 3);
      player.pitching.stamina = Math.min(200, staBefore + staGrowth);
      growthReport.push({ statName: 'スタミナ', before: staBefore, after: player.pitching.stamina, growth: player.pitching.stamina - staBefore });
    } else {
      // 大学野球留学(physical): 球速UP、スタミナも
      const velGrowth = applyGrowth(Math.floor(Math.random() * 3) + 1);
      const vBefore = player.pitching.velocity;
      player.pitching.velocity = Math.max(vBefore, Math.min(158, vBefore + velGrowth));
      growthReport.push({ statName: '球速', before: vBefore, after: player.pitching.velocity, growth: player.pitching.velocity - vBefore });

      const staGrowth = applyGrowth(Math.floor(Math.random() * 8) + 5);
      const staBefore = player.pitching.stamina;
      player.pitching.stamina = Math.min(200, staBefore + staGrowth);
      growthReport.push({ statName: 'スタミナ', before: staBefore, after: player.pitching.stamina, growth: player.pitching.stamina - staBefore });

      const ctrlGrowth = applyGrowth(Math.floor(Math.random() * 3) + 1);
      const cBefore = player.pitching.control;
      player.pitching.control = Math.min(99, cBefore + ctrlGrowth);
      growthReport.push({ statName: '制球', before: cBefore, after: player.pitching.control, growth: player.pitching.control - cBefore });
    }
  } else {
    // 野手
    if (dest.growthProfile === 'technical') {
      // プロ研修(technical): ミート・選球眼・守備がUP
      const meetGrowth = applyGrowth(Math.floor(Math.random() * 6) + 4);
      const mBefore = player.batting.meet;
      player.batting.meet = Math.min(99, mBefore + meetGrowth);
      growthReport.push({ statName: 'ミート', before: mBefore, after: player.batting.meet, growth: player.batting.meet - mBefore });

      const eyeGrowth = applyGrowth(Math.floor(Math.random() * 5) + 3);
      const eBefore = player.batting.eye;
      player.batting.eye = Math.min(99, eBefore + eyeGrowth);
      growthReport.push({ statName: '選球眼', before: eBefore, after: player.batting.eye, growth: player.batting.eye - eBefore });

      const defGrowth = applyGrowth(Math.floor(Math.random() * 4) + 3);
      const dBefore = player.fielding.defense;
      player.fielding.defense = Math.min(99, dBefore + defGrowth);
      growthReport.push({ statName: '守備', before: dBefore, after: player.fielding.defense, growth: player.fielding.defense - dBefore });

      // パワーも少し
      const powGrowth = applyGrowth(Math.floor(Math.random() * 2) + 1);
      const pBefore = player.batting.power;
      player.batting.power = Math.min(99, pBefore + powGrowth);
      growthReport.push({ statName: 'パワー', before: pBefore, after: player.batting.power, growth: player.batting.power - pBefore });
    } else {
      // 大学野球留学(physical): パワー・走力・肩がUP
      const powGrowth = applyGrowth(Math.floor(Math.random() * 6) + 4);
      const pBefore = player.batting.power;
      player.batting.power = Math.min(99, pBefore + powGrowth);
      growthReport.push({ statName: 'パワー', before: pBefore, after: player.batting.power, growth: player.batting.power - pBefore });

      const spdGrowth = applyGrowth(Math.floor(Math.random() * 5) + 3);
      const sBefore = player.physical.speed;
      player.physical.speed = Math.min(99, sBefore + spdGrowth);
      growthReport.push({ statName: '走力', before: sBefore, after: player.physical.speed, growth: player.physical.speed - sBefore });

      const armGrowth = applyGrowth(Math.floor(Math.random() * 4) + 2);
      const aBefore = player.physical.arm;
      player.physical.arm = Math.min(99, aBefore + armGrowth);
      growthReport.push({ statName: '肩力', before: aBefore, after: player.physical.arm, growth: player.physical.arm - aBefore });

      // ミートも少し
      const meetGrowth = applyGrowth(Math.floor(Math.random() * 2) + 1);
      const mBefore = player.batting.meet;
      player.batting.meet = Math.min(99, mBefore + meetGrowth);
      growthReport.push({ statName: 'ミート', before: mBefore, after: player.batting.meet, growth: player.batting.meet - mBefore });
    }
  }

  // 覚醒チャンス: 飛躍時30%、成長時20%、微成長時10%でランダムな能力が大幅UP
  const awakeChance = outcome === 'great_success' ? 0.3
                    : outcome === 'minor' ? 0.1
                    : 0.2;
  if (Math.random() < awakeChance) {
    if (player.position === 'pitcher') {
      const awakeStats = [
        { path: 'pitching.velocity', name: '球速', max: 160 },
        { path: 'pitching.control', name: '制球', max: 99 },
      ];
      const pick = awakeStats[Math.floor(Math.random() * awakeStats.length)];
      const current = getNestedValue(player, pick.path) || 50;
      const baseBonus = pick.path === 'pitching.velocity'
        ? Math.floor(Math.random() * 2) + 1  // 1〜2 → ×1.5で最大3km
        : Math.floor(Math.random() * 4) + 3; // 3〜6
      const bonus = applyGrowth(baseBonus);
      const newVal = Math.min(pick.max, current + bonus);
      setNestedValueMut(player, pick.path, newVal);
      growthReport.push({ statName: `${pick.name}(覚醒!)`, before: current, after: newVal, growth: newVal - current, isAwakening: true });
    } else {
      const awakeStats = [
        { path: 'batting.meet', name: 'ミート', max: 99 },
        { path: 'batting.power', name: 'パワー', max: 99 },
        { path: 'physical.speed', name: '走力', max: 99 },
      ];
      const pick = awakeStats[Math.floor(Math.random() * awakeStats.length)];
      const current = getNestedValue(player, pick.path) || 30;
      const bonus = applyGrowth(Math.floor(Math.random() * 4) + 3);
      const newVal = Math.min(pick.max, current + bonus);
      setNestedValueMut(player, pick.path, newVal);
      growthReport.push({ statName: `${pick.name}(覚醒!)`, before: current, after: newVal, growth: newVal - current, isAwakening: true });
    }
  }

  // 球速総成長量の上限: 1回の派遣で最大13kmまで（リアリズム維持のための安全策）
  const MAX_VELOCITY_GROWTH = 13;
  if (initialVelocity != null && player.pitching && player.pitching.velocity > initialVelocity + MAX_VELOCITY_GROWTH) {
    const cappedVelocity = initialVelocity + MAX_VELOCITY_GROWTH;
    let overflow = player.pitching.velocity - cappedVelocity;
    player.pitching.velocity = cappedVelocity;
    // growthReportの球速エントリを後ろから減らして整合性を保つ
    for (let i = growthReport.length - 1; i >= 0 && overflow > 0; i--) {
      if (growthReport[i].statName.includes('球速')) {
        const reduction = Math.min(overflow, growthReport[i].growth);
        growthReport[i].after -= reduction;
        growthReport[i].growth -= reduction;
        overflow -= reduction;
      }
    }
  }

  return { growthReport, outcome };
}

