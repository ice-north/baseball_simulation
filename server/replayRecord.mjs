// 完了済み試合を再計算せず、実行時の状態を読み取りだけで保存する。
const player = (p) => ({
  id: p.id,
  name: p.name,
  age: p.age,
  number: p.number,
  position: p.position,
  battingOrder: p.battingOrder,
  batting: structuredClone(p.batting),
  pitching: structuredClone(p.pitching),
  physical: {
    speed: p.physical?.speed,
    arm: p.physical?.arm,
    throws: p.physical?.throws,
  },
});
export function createReplay() {
  const replay = { version: 1, teams: {}, frames: [], appliedPlans: {} };
  let pitch = null,
    previousLineups = '';
  return {
    value: replay,
    start({ homeTeam, awayTeam }) {
      for (const team of [homeTeam, awayTeam]) {
        replay.teams[team.name] = team.players.map(player);
        replay.appliedPlans[team.name] = structuredClone({
          strategy: team.strategy || {},
          tactics: team.onlineTactics || {},
          pitcherRoles: team.pitchingRotation?.pitcherRoles || {},
        });
      }
    },
    pitchDetail(value) {
      pitch = structuredClone(value);
    },
    frame(frame) {
      const data = structuredClone(frame);
      if (data.kind === 'pitch') data.pitch = pitch;
      if (data.lineups) {
        const key = JSON.stringify(data.lineups);
        if (key === previousLineups) delete data.lineups;
        previousLineups = key;
      }
      replay.frames.push(data);
    },
  };
}
