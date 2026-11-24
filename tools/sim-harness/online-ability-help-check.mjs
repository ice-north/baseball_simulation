// ============================================================
// 能力の一言の説明（src/online/playerInfo.js の ABILITY_HELP）が、並べた能力（abilityRows）の
// どれにもあるかを見る（いしだ指摘 2026-11-08 の「何に効いているか分からない」を直すための説明）。
//
// ⚠ アプリの同じ文は gen-tables.mjs が Tables.kt に書き出す（以前は AbilityHelp.kt に手で写し、
//    ここで正規表現で読んで照らしていた）。食い違いは app-gen-tables（gen-tables.mjs --check）が見る。
// ============================================================
import assert from 'node:assert/strict';
import { ABILITY_HELP, abilityRows } from '../../src/online/playerInfo.js';

// 試合・疲れ・成長に効く能力には、どれも説明があること（守備適性の各位置・球種は欄の説明でまかなう）
const player = {
  batting: { meet: 50, power: 50, eye: 50, steal: 50, bunt: 50 },
  pitching: { velocity: 140, control: 50, stamina: 50, spinRate: 50, form: 'overhand', arsenal: [] },
  fielding: { defense: 50 },
  catching: { lead: 50 },
  physical: { speed: 50, arm: 50, bodyStamina: 50, recovery: 50, muscle: 50, dexterity: 50 },
  personality: { discipline: 50, mental: 50 },
  growthPotential: 1,
  growthModifier: 0,
};
for (const group of ['batting', 'pitching', 'fielding', 'body', 'growth'])
  for (const [label] of abilityRows(player, group))
    assert.ok(ABILITY_HELP[label], `「${label}」（${group}）に説明が無い`);

console.log(`■ 能力の説明: OK（${Object.keys(ABILITY_HELP).length}項目 / 並べた能力にはどれも説明がある）`);
