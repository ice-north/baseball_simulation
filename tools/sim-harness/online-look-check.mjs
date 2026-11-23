// 新しい見た目（試作）の表と絵の検査。
//   node tools/sim-harness/online-look-check.mjs
//
// ⚠ 見るのは**壊れると気づきにくい性質**だけ（絵の出来は画面写真で見る）:
//    - 土地・愛称の表が `pyramidLeague.js` の一覧を全部覆っている（足したのに表を忘れると字が出ない）
//    - 12球団で色の組と字が重ならない（2000通りの種で）
//    - 同じ選手は年齢・調子が変わっても同じ顔（乱数を引く回数が条件で変わると別人になる）
//    - 描く手順の数字がすべて有限（NaN が混ざると SVG が黙って消える）
//    - 実在の球団（リーグの外の名前）にはマークを付けない
import assert from 'node:assert/strict';
import { CITIES, NICKNAMES, generatePyramidTeams } from '../../src/online/pyramidLeague.js';
import {
  CITY_EN,
  NICK_EN,
  PALETTES,
  buildTeamLooks,
  nameSource,
  setTeamLooks,
  teamLook,
  NEUTRAL_LOOK,
} from '../../src/online/look/teamLook.js';
import { emblemArt, faceArt, conditionArt, CONDITION_FACE_COLORS } from '../../src/online/look/art.js';

// --- 表 ---------------------------------------------------------------
for (const city of CITIES) assert.ok(CITY_EN[city], `土地のローマ字が無い: ${city}`);
for (const nick of NICKNAMES) assert.ok(NICK_EN[nick], `愛称の英語が無い: ${nick}`);
assert.equal(Object.keys(CITY_EN).length, CITIES.length, '表に一覧に無い土地がある');
assert.equal(Object.keys(NICK_EN).length, NICKNAMES.length, '表に一覧に無い愛称がある');
for (const v of Object.values(CITY_EN)) assert.match(v, /^[A-Z][a-z]+$/, `ローマ字の形: ${v}`);
assert.equal(new Set(PALETTES.map((p) => p.join())).size, PALETTES.length, '色の組が重複している');

const labelsOf = (teams) =>
  Object.fromEntries(
    teams.map((t) => [t.name, { label: t.name, city: t.city, nickname: t.name.slice(t.city.length) }]),
  );

// --- 12球団で重ならない ---------------------------------------------------
let twoLetters = 0;
for (let seed = 1; seed <= 2000; seed++) {
  const looks = buildTeamLooks(labelsOf(generatePyramidTeams(seed)));
  const list = Object.values(looks);
  assert.equal(list.length, 12);
  assert.equal(new Set(list.map((l) => l.c1 + l.c2)).size, 12, `種${seed}: 色の組が重なった`);
  assert.equal(new Set(list.map((l) => l.mono)).size, 12, `種${seed}: 字が重なった ${list.map((l) => l.mono)}`);
  for (const l of list) {
    assert.ok(l.latin, `種${seed}: ${l.name} が英字にならない`);
    assert.match(l.mono, /^[A-Z]{1,2}$/, `種${seed}: ${l.name} の字 ${l.mono}`);
    if (l.style === 'script') assert.equal(l.mono.length, 1, '筆記体は1字だけ');
    if (l.mono.length > 1) twoLetters++;
  }
}
// 2字は「同じ頭文字が居るときだけ」。いまは約57%（S・K・T・H で始まる土地が多い）。
// 7割を超えたら決め方が壊れている（全部が2字になる、など）
assert.ok(twoLetters < 2000 * 12 * 0.7, `2字の球団が多すぎる: ${twoLetters}`);

// 同じ顔ぶれなら何度作っても同じ（並び順にもよらない）
const teams = generatePyramidTeams(20261029);
const a = buildTeamLooks(labelsOf(teams));
const b = buildTeamLooks(labelsOf([...teams].reverse()));
assert.deepEqual(a, b, '並び順で見た目が変わった');

// 名前を付け替えた球団: 表にある土地なら英字、無い土地なら漢字の1字。色は内部名で決まるので変わらない
const renamed = { ...labelsOf(teams) };
const first = teams[0].name;
renamed[first] = { label: '美瑛ブルーレイクス', city: '美瑛', nickname: 'ブルーレイクス' };
const r = buildTeamLooks(renamed);
assert.equal(r[first].latin, false);
assert.equal(r[first].mono, '美');
assert.equal(r[first].c1, a[first].c1, '名前を変えると色が変わった');
assert.notEqual(r[first].style, 'script');
// 分けずに付け替えた古い球団（`city` が空）でも、表示名の頭が表の土地なら英字
assert.deepEqual(nameSource('x', { label: '新潟ブルーレイクス', city: '', nickname: '' }), {
  latin: true,
  city: 'NIIGATA',
  nick: '',
});

// リーグの外の名前（NPB・独立リーグ）にはマークを付けない
setTeamLooks(labelsOf(teams));
assert.ok(teamLook(first));
assert.equal(teamLook('読売ジャイアンツ'), null);
assert.equal(teamLook('徳島インディゴソックス'), null);
assert.equal(teamLook(null), null);

// --- 絵 -----------------------------------------------------------------
const finite = (art, where) => {
  for (const s of art.items) {
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${where}: ${s.t}.${k} が ${v}`);
      if (k === 'd') assert.doesNotMatch(v, /NaN|undefined|Infinity/, `${where}: path に ${v}`);
    }
    if (s.t === 'text') assert.ok(s.text, `${where}: 字が空`);
  }
};
for (const l of Object.values(a)) finite(emblemArt(l), `マーク ${l.name}`);
for (const l of Object.values(r)) finite(emblemArt(l), `マーク ${l.name}`);
for (let level = 0; level <= 4; level++) {
  finite(conditionArt(level), `調子 ${level}`);
  assert.equal(conditionArt(level).items.find((s) => s.t === 'circle' && s.r === 10).fill, CONDITION_FACE_COLORS[level]);
}

// 同じ選手は年齢・調子が変わっても同じ顔（肌・顎・目の形）。
// 頭の形（肌の色・顎の幅）は「頭」の path で見る
const head = (art) => art.items.find((s) => s.t === 'path' && /^M[\d.]+ 46 Q/.test(s.d));
const look = Object.values(a)[0];
for (let id = 0; id < 300; id++) {
  const base = faceArt({ seed: `p${id}`, look, age: 18, level: 2 });
  finite(base, `顔 p${id}`);
  for (const age of [24, 27, 30, 33, 36, 45, 55, 70])
    for (const level of [null, 0, 1, 2, 3, 4]) {
      const other = faceArt({ seed: `p${id}`, look, age, level });
      assert.deepEqual(head(other), head(base), `p${id}: ${age}歳・調子${level}で顔の形が変わった`);
    }
}
// 違う選手はだいたい違う顔（頭の形と肌が同じ組は少ない）
const heads = new Set();
for (let id = 0; id < 200; id++) heads.add(JSON.stringify(head(faceArt({ seed: `p${id}`, look }))));
assert.ok(heads.size > 150, `顔の形が似すぎている: 200人で${heads.size}通り`);
// 所属の無い人（候補・浪人中の指導者）の帽子に字を入れない
assert.ok(!faceArt({ seed: 'c1', look: NEUTRAL_LOOK, age: 60, level: 3 }).items.some((s) => s.t === 'text'));

console.log('online-look-check: ok');
