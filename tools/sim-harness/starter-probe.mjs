#!/usr/bin/env node
// ============================================================
// 先発の投球回をスタミナ別に分解する
//
// 1先発ごとに「スタミナ能力・投球回・球数・降板理由」を集め、スタミナ帯ごとに出す。
// 使い方: node tools/sim-harness/starter-probe.mjs [チーム数=8] [試合数=60] [シード=2]
// ============================================================
import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';
import { buildLeague, TEAMS_DATA } from './lib/league.mjs';

const { autoSimulateGame, recoverAllPitcherFatigue } = await import(SRC + '/game/autoSimulation.js');
const N = +process.argv[2] || 8, G = +process.argv[3] || 60, SEEDS = +process.argv[4] || 2;
const o = console.log; console.log = () => {}; console.warn = () => {};

const rows = [];
for (let s = 0; s < SEEDS; s++) {
  const names = buildLeague(N, 28, 1);
  for (let d = 0; d < G; d++) {
    const order = [...names].sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < order.length; i += 2) {
      const r = autoSimulateGame(order[i], order[i + 1]);
      for (const side of ['homeTeam', 'awayTeam']) {
        const team = r?.[side]; if (!team) continue;
        const starterId = r.decisionLog?.appearances?.[side === 'homeTeam' ? 'home' : 'away']?.[0]?.id;
        const st = team.players.find(p => p.id === starterId); if (!st) continue;
        const ch = (r.pitcherChanges || []).find(c => c.out === st.name);
        const reason = !ch ? '完投' : /球数制限/.test(ch.reason) ? '球数' : /スタミナ限界/.test(ch.reason) ? 'スタミナ25%'
          : /ダメージ/.test(ch.reason) ? 'ダメージ' : /代打/.test(ch.reason) ? '代打' : /守護神|セットアッパー/.test(ch.reason) ? '勝ちパターン'
          : /ピンチ/.test(ch.reason) ? 'ピンチ' : 'その他';
        const role = TEAMS_DATA[team.name]?.pitchingRotation?.pitcherRoles?.[st.id] || 'auto_s';
        rows.push({ role, sta: st.pitching?.stamina || 0, outs: st.gameStats.pitching.outs, pitches: st.gameStats.pitching.pitches, reason,
          start: Math.max(Math.floor((st.pitching?.stamina || 100) * 0.5), (st.pitching?.stamina || 100) - (TEAMS_DATA[team.name]?.players.find(p => p.id === st.id)?.fatigue ?? 0)) });
      }
    }
    recoverAllPitcherFatigue();
  }
}
console.log = o;
const bands = [[0, 100], [100, 110], [110, 120], [120, 130], [130, 150], [150, 999]];
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
o(`先発 ${rows.length}件 平均 ${(mean(rows.map(r => r.outs)) / 3).toFixed(2)}回 / ${mean(rows.map(r => r.pitches)).toFixed(0)}球`);
o('スタミナ帯  件数  投球回  球数  | 降板理由');
for (const [lo, hi] of bands) {
  const g = rows.filter(r => r.sta >= lo && r.sta < hi); if (!g.length) continue;
  const rs = {}; g.forEach(r => rs[r.reason] = (rs[r.reason] || 0) + 1);
  o(`${String(lo).padStart(3)}-${String(hi).padEnd(4)} ${String(g.length).padStart(5)}  ${(mean(g.map(r => r.outs)) / 3).toFixed(2)}  ${mean(g.map(r => r.pitches)).toFixed(0).padStart(4)}  | ` +
    Object.entries(rs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / g.length * 100).toFixed(0)}%`).join(' / '));
}

o('\nロール       件数  スタミナ  投球回  球数 | 降板理由');
const roles = [...new Set(rows.map(r => r.role))];
for (const ro of roles) {
  const g = rows.filter(r => r.role === ro);
  const rs = {}; g.forEach(r => rs[r.reason] = (rs[r.reason] || 0) + 1);
  o(`${ro.padEnd(10)} ${String(g.length).padStart(5)}  ${mean(g.map(r => r.sta)).toFixed(0).padStart(5)}  ${(mean(g.map(r => r.outs)) / 3).toFixed(2)}  ${mean(g.map(r => r.pitches)).toFixed(0).padStart(4)} | ` +
    Object.entries(rs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v / g.length * 100).toFixed(0)}%`).join(' / '));
}
