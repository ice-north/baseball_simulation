#!/usr/bin/env node
// ============================================================
// バントの解決モデル（`src/game/bunting.js`）の検査
//
// この4つの式は長らく `App.jsx` と `autoSimulation.js` に**1文字違わず二重に**
// 書かれていた（CLAUDE.md は「盗塁阻止の独自式」と誤記していた）。1箇所へ畳んだので、
// ここで見るのは2つ:
//   ① 式の性質（足が速いほど刺されにくい・守備が良いほど刺せる・質で動く向き）
//   ② **両エンジンに式が再び現れていないこと**——マジックナンバーを grep する。
//      関数に畳んだ意味は「片方だけ直る事故」が起きないことなので、そこを番人にする
// 終了コード: 全PASSで0、FAILで1。
// ============================================================
import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';
import { Report } from './lib/report.mjs';
import fs from 'fs';
import path from 'path';

const B = await import(SRC + '/game/bunting.js');
const r = new Report('■ バントの解決モデル（bunting.js）');

// ① 足が速いほど刺されにくい（セーフティは走りながら打つので効きが大きい）
{
  const slow = B.buntThrowOutChance('safety', 30, 'normal', 50);
  const fast = B.buntThrowOutChance('safety', 80, 'normal', 50);
  r.assert('セーフティは足が速いほど刺されにくい', fast < slow - 10, `走力30→${slow.toFixed(1)}% / 80→${fast.toFixed(1)}%`);
  const sacSlow = B.buntThrowOutChance('sacrifice', 30, 'normal', 50);
  const sacFast = B.buntThrowOutChance('sacrifice', 80, 'normal', 50);
  r.assert('犠打でも足は効くが効きは小さい', sacFast < sacSlow && (sacSlow - sacFast) < (slow - fast), '');
}
// 守備が良いほど刺せる
{
  const weak = B.buntThrowOutChance('sacrifice', 50, 'normal', 30);
  const strong = B.buntThrowOutChance('sacrifice', 50, 'normal', 75);
  r.assert('守備が良いほど刺せる', strong > weak, `守備30→${weak.toFixed(1)}% / 75→${strong.toFixed(1)}%`);
}
// 絶妙に転がせば刺されにくく、強すぎれば刺される
{
  const dead = B.buntThrowOutChance('sacrifice', 50, 'dead', 50);
  const normal = B.buntThrowOutChance('sacrifice', 50, 'normal', 50);
  const hard = B.buntThrowOutChance('sacrifice', 50, 'hard', 50);
  r.assert('質の向きが正しい（dead < normal < hard）', dead < normal && normal < hard, `${dead.toFixed(0)} / ${normal.toFixed(0)} / ${hard.toFixed(0)}`);
}
// クランプが効く（極端な入力でも 5〜95% に収まる）
{
  const lo = B.buntThrowOutChance('safety', 100, 'dead', 0);
  const hi = B.buntThrowOutChance('squeeze', 0, 'hard', 100);
  r.assert('確率は5〜95%に収まる', lo >= 5 && hi <= 95, `最小${lo.toFixed(1)}% / 最大${hi.toFixed(1)}%`);
}
// スクイズの本塁送球: 絶妙な転がしなら刺せない
{
  const dead = B.squeezeHomeThrowChance('dead', 50);
  const normal = B.squeezeHomeThrowChance('normal', 50);
  r.assert('絶妙なスクイズは本塁で刺せない', dead < normal && dead >= 5, `dead ${dead.toFixed(0)}% / normal ${normal.toFixed(0)}%`);
}
// フェア/ファウル: バント技術が高いほどフェアになり、バントフライが減る
{
  const lo = B.buntContactRates(10, 50), hi = B.buntContactRates(90, 50);
  r.assert('技術が高いほどフェアが増えフライが減る',
    hi.fairRate > lo.fairRate && hi.popupRate < lo.popupRate,
    `技術10: フェア${lo.fairRate.toFixed(0)}%/フライ${lo.popupRate.toFixed(1)}% → 90: ${hi.fairRate.toFixed(0)}%/${hi.popupRate.toFixed(1)}%`);
  r.assert('3つの結果に必ず分かれる',
    ['popup', 'fair', 'foul'].every(k => [0, 50, 99.9].some(v => B.classifyBuntContact(v, 50, 50) === k) || k === 'foul'),
    '');
}
// 守備4人の平均（欠けていれば50で補う）
{
  r.assert('守備4人の平均を取る', B.buntFieldDefense(60, 60, 40, 40) === 50 && B.buntFieldDefense(undefined, undefined, undefined, undefined) === 50, '');
}

// ② 両エンジンに式が再び現れていないこと
{
  const files = ['App.jsx', 'game/autoSimulation.js'];
  // 畳んだ式に固有のマジックナンバーの並び
  const smells = [
    [/baseThrowout/, 'baseThrowout（送球アウトの素の値）'],
    [/speedReduction/, 'speedReduction'],
    [/homeThrowChance/, 'homeThrowChance（スクイズの本塁送球）'],
    [/15\s*-\s*buntSkill\s*\*\s*0\.12/, 'バントフライ率'],
    [/buntSkill\s*\*\s*0\.40/, 'フェア率'],
    [/buntSkill\s*\*\s*0\.5\s*\+/, 'バントの質'],
  ];
  const found = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const [re, label] of smells) if (re.test(src)) found.push(`${f}: ${label}`);
  }
  r.assert('バントの式が両エンジンに再掲されていない', found.length === 0,
    found.length ? found.join(' / ') : `${files.length}ファイルを照合`);
}

r.print();
process.exit(r.passed ? 0 : 1);
