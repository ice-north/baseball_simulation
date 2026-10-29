import { ensureCompleteLineup } from '../src/game/lineup.js';
import { requireOnline } from '../src/online/shared.js';
// 短い予約ローテでも疲労投手を固定登板させない。当日の代役だけ差し込み、予約は残す。
export function prepareDailyLineup(team, name) {
  const rotation = team.pitchingRotation;
  const starters = rotation?.starters || [];
  requireOnline(
    starters.length > 0,
    `${name}の先発投手が未登録です`,
    409,
    'roster',
  );
  const index = (rotation.currentStarterIndex || 0) % starters.length;
  rotation.currentStarterIndex = index;
  const pitchers = team.players.filter(
    (p) => p.position === 'pitcher' && p.isActive !== false,
  );
  const current = pitchers.find((p) => p.id === starters[index]);
  let restore = () => {};
  if (!current || (current.fatigue || 0) >= 40) {
    const rested = starters.findIndex((id) =>
      pitchers.some((p) => p.id === id && (p.fatigue || 0) < 40),
    );
    if (rested >= 0) rotation.currentStarterIndex = rested;
    else {
      const substitute = [...pitchers].sort(
        (a, b) => (a.fatigue || 0) - (b.fatigue || 0),
      )[0];
      requireOnline(substitute, `${name}の投手が不足しています`, 409, 'roster');
      const original = [...starters];
      rotation.starters[index] = substitute.id;
      restore = () => {
        rotation.starters = original;
      };
    }
  }
  requireOnline(
    ensureCompleteLineup(team, false),
    `${name}の編成を補完できません`,
    409,
    'roster',
  );
  return restore;
}
