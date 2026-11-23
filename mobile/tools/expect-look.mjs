// アプリの共通部（Kotlin の Look.kt・LookArt.kt）に写した「新しい見た目（試作）」の表と描く手順が
// Web 版（src/online/look/）と同じ答えを出すかの検査用に、期待値を書き出す。
//   node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json
// CI は `--check`（Web 版だけ直したときに気づく）。答え合わせは `LookTest`。
import fs from 'node:fs';
import { hash, rng } from '../../src/online/look/rng.js';
import { CITY_EN, NICK_EN, PALETTES, STYLES, buildTeamLooks, nameSource, NEUTRAL_LOOK } from '../../src/online/look/teamLook.js';
import { emblemArt, faceArt, conditionArt, shade } from '../../src/online/look/art.js';
import { generatePyramidTeams } from '../../src/online/pyramidLeague.js';

const labelsOf = (teams) =>
  Object.fromEntries(
    teams.map((t) => [t.name, { label: t.name, city: t.city, nickname: t.name.slice(t.city.length) }]),
  );

// 乱数と色の明暗
const hashes = ['', 'a', 'p1', 'p123456', 'c42', '札幌レッドスターズ:palette', '𠮷野家', '😀x'].map((s) => ({ s, h: hash(s) }));
const rngs = [0, 1, 2166136261, 4294967295].map((seed) => {
  const r = rng(seed);
  return { seed, out: Array.from({ length: 6 }, () => r()) };
});
const shades = [];
for (const hex of ['#13294b', '#ffffff', '#000000', '#e2ad84', '#7a1f2b'])
  for (const k of [-0.4, -0.35, -0.3, -0.25, -0.14, 0.82]) shades.push({ hex, k, out: shade(hex, k) });

// 球団の見た目。種を変えた12球団の組・名前を付け替えた球団・表に無い土地
const leagues = [];
for (const seed of [1, 2, 3, 7, 11, 42, 99, 123, 2024, 20261029]) {
  leagues.push({ seed, labels: labelsOf(generatePyramidTeams(seed)) });
}
const renamed = { ...leagues[9].labels };
const names = Object.keys(renamed);
renamed[names[0]] = { label: '美瑛ブルーレイクス', city: '美瑛', nickname: 'ブルーレイクス' };
renamed[names[1]] = { label: '新潟ブルーレイクス', city: '', nickname: '' }; // 分けずに付け替えた古い球団
renamed[names[2]] = { label: 'Tokyo Stars', city: 'Tokyo', nickname: 'Stars' };
renamed[names[3]] = { label: 'ほげ 球団', city: '', nickname: '' };
renamed[names[4]] = { label: '美唄ファイターズ', city: '美唄', nickname: 'ファイターズ' };
renamed[names[5]] = { label: '美作ホークス', city: '美作', nickname: 'ホークス' };
renamed[names[6]] = { label: '能登ドルフィンズ', city: '能登', nickname: 'ドルフィンズ' };
renamed[names[7]] = { label: 'Sapporo Bears', city: '', nickname: '' }; // 英字に付け替えた古い球団
renamed[names[8]] = { label: 'Kobe\u3000Whales Club', city: '', nickname: '' }; // 全角の空白で区切った英字
renamed[names[9]] = { label: '札幌constructor', city: '札幌', nickname: 'constructor' }; // Object の持ち物の名前
renamed[names[10]] = { label: 'toString球団', city: 'toString', nickname: '' };
renamed[names[11]] = { label: 'ほげ\u00a0球団\tB', city: '', nickname: '' }; // 消さない空白（NBSP）と消すタブ
leagues.push({ seed: 'renamed', labels: renamed });
// 全部を表に無い漢字・かなに付け替えたリーグ（筆記体・縫い字の形が丸・盾・菱に替わるところ）
const kana = { ...leagues[3].labels };
Object.keys(kana).forEach((name, i) => {
  kana[name] = { label: `${'あ伊う江お河き区け湖さ志'[i]}${'すせそ'[i % 3]}団`, city: '', nickname: '' };
});
leagues.push({ seed: 'kana', labels: kana });
const teams = leagues.map(({ seed, labels }) => ({ seed, labels, looks: buildTeamLooks(labels) }));
const sources = [renamed, kana].flatMap((labels) =>
  Object.entries(labels).map(([name, l]) => ({ name, labels: l, source: nameSource(name, l) })),
);

// 絵: マーク（全部の形と漢字）・顔（年齢・調子・帽子の違い）・調子の顔
const allLooks = teams.flatMap((t) => Object.values(t.looks));
const byKind = new Map();
for (const l of allLooks) {
  // 縁の色が白かどうかでも分ける（縫い字・角字は白いと縁を差し色にする）
  const key = `${l.style}:${l.font}:${[...l.mono].length}:${l.c3 === '#ffffff'}`;
  if (!byKind.has(key)) byKind.set(key, l);
}
const emblems = [...byKind.values()].map((look) => ({ look, art: emblemArt(look) }));
const faceLooks = [...byKind.values(), NEUTRAL_LOOK];
const AGES = [18, 22, 24, 27, 30, 33, 36, 45, 55, 70];
const LEVELS = [null, 0, 1, 2, 3, 4];
const faces = [];
for (let i = 0; i < 60; i++) {
  const args = {
    seed: i % 2 ? `p${1000 + i * 37}` : `c${i}`,
    look: faceLooks[i % faceLooks.length],
    age: AGES[i % AGES.length],
    level: LEVELS[i % LEVELS.length],
  };
  faces.push({ ...args, art: faceArt(args) });
}
const conditions = [null, 0, 1, 2, 3, 4].map((level) => ({ level, art: conditionArt(level) }));

const text = JSON.stringify({
  tables: { cityEn: CITY_EN, nickEn: NICK_EN, palettes: PALETTES, styles: STYLES, neutral: NEUTRAL_LOOK },
  hashes,
  rngs,
  shades,
  teams,
  sources,
  emblems,
  faces,
  conditions,
});
if (process.argv.includes('--check')) {
  const file = new URL('../shared/src/jvmTest/resources/look-expected.json', import.meta.url);
  if (fs.readFileSync(file, 'utf8').trim() !== text) {
    console.error(
      'look-expected.json が古い。node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json で書き出し直し、アプリの Look.kt・LookArt.kt も揃えること',
    );
    process.exit(1);
  }
  console.log('look-expected.json は Web 版の答えと一致しています');
} else {
  process.stdout.write(text + '\n');
}
