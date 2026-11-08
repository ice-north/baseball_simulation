// ============================================================
// 能力の一言の説明が、Web 版（src/online/playerInfo.js の ABILITY_HELP）と
// アプリ（mobile/shared/.../AbilityHelp.kt）で同じ文かを照らし合わせる。
//
// ⚠ 片方だけ直すと、PC とアプリで同じ能力の説明が食い違う（いしだ指摘 2026-11-08 の
//    「何に効いているか分からない」を直すための説明なので、食い違うと元に戻る）。
// ⚠ 並べた能力（abilityRows）に説明の無い項目が増えていないかも見る。
// ============================================================
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ABILITY_HELP, abilityRows } from '../../src/online/playerInfo.js';

const kt = await readFile(
  new URL(
    '../../mobile/shared/src/commonMain/kotlin/jp/icenorth/baseball/shared/AbilityHelp.kt',
    import.meta.url,
  ),
  'utf8',
);
const unescape = (t) => t.replace(/\\(["\\$])/g, '$1');
const app = Object.fromEntries(
  [...kt.matchAll(/^\s*"((?:[^"\\]|\\.)*)" to "((?:[^"\\]|\\.)*)",?\s*$/gm)].map((m) => [
    unescape(m[1]),
    unescape(m[2]),
  ]),
);
assert.deepEqual(
  Object.keys(app),
  Object.keys(ABILITY_HELP),
  'アプリと Web で説明のある能力がちがう',
);
for (const [label, text] of Object.entries(ABILITY_HELP))
  assert.equal(app[label], text, `「${label}」の説明が Web とアプリでちがう`);

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

console.log(
  `■ 能力の説明: OK（${Object.keys(ABILITY_HELP).length}項目が Web とアプリで同じ文 / 並べた能力にはどれも説明がある）`,
);
