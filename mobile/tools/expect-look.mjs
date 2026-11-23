// アプリの共通部（Kotlin の Look.kt・LookArt.kt・LookScene.kt・LookPlay.kt・TodayGame.kt・LookStory.kt）に写した「新しい見た目（試作）」の表と描く手順が
// Web 版（src/online/look/）と同じ答えを出すかの検査用に、期待値を書き出す。
//   node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json
// CI は `--check`（Web 版だけ直したときに気づく）。答え合わせは `LookTest`。
import fs from 'node:fs';
import { hash, rng } from '../../src/online/look/rng.js';
import { CITY_EN, NICK_EN, PALETTES, STYLES, buildTeamLooks, nameSource, NEUTRAL_LOOK } from '../../src/online/look/teamLook.js';
import { emblemArt, faceArt, conditionArt, shade } from '../../src/online/look/art.js';
import { generatePyramidTeams } from '../../src/online/pyramidLeague.js';
import { stadiumArt, fieldArt, crowdLevel, stadiumScene } from '../../src/online/look/sceneArt.js';
import { liveScenes, highlightIndexes, playPhrase, basesText, hasLivePlays, orderPosition } from '../../src/online/look/playByPlay.js';
import { playTone } from '../../src/online/gamePlays.js';
import { todayGameCard } from '../../src/online/look/todayGame.js';
import { reporterOf, reporterChat, eventScene } from '../../src/online/look/story.js';
import { leagueBaseline, statGrade } from '../../src/online/look/statGrade.js';

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


// ---- 段3: 球場の絵・打席速報の図と文・今日の一戦の札 -----------------------
const [lookA, lookB, lookC] = [...byKind.values()];
const crowds = [];
for (const rank of [null, 0, 1, 2, 6, 12])
  for (const n of [null, 0, 6, 12]) for (const streak of [-5, -3, 0, 2, 5, 9]) crowds.push({ rank, teams: n, streak, out: crowdLevel(rank, n, streak) });
const scenes = ['旭川', '札幌', '東大阪', '霧島', '那覇', '', null].map((city) => ({ city, scene: stadiumScene(city) }));
const stadiums = [
  { look: lookA, scene: 'sea', crowd: 0.35, seed: '' },
  { look: lookB, scene: 'mountain', crowd: 1, seed: 'game42' },
].map((args) => ({ ...args, art: stadiumArt(args) }));
const fields = [
  { bases: 0, batted: null, code: '振', runs: 0 },
  { bases: 7, batted: { pos: 8, dir: 3, dist: 131, la: 31 }, code: '本', runs: 4 },
  { bases: 1, batted: { pos: 6, dir: -14, dist: 35, la: -3 }, code: '併', runs: 0 },
  { bases: 6, batted: { pos: 9, dir: 38, dist: 72, la: 18 }, code: '安', runs: 2 },
  { bases: 2, batted: { pos: 7, dir: -44, dist: 140, la: 40 }, code: '二', runs: 1 },
  { bases: 5, batted: { pos: 1, dir: 0, dist: 3, la: 5 }, code: '凡', runs: 0 },
  { bases: 3, batted: { pos: 9, dir: 27, dist: 98, la: 26 }, code: '凡', runs: 1 },
].map((args) => ({ ...args, art: fieldArt({ fence: lookA, offense: lookC, ...args }) }));
const BATS = [null, { pos: 7, dir: -30, dist: 110, la: 30 }, { pos: 9, dir: 20, dist: 60, la: 12 }, { pos: 8, dir: 0, dist: 95, la: 22 },
  { pos: 6, dir: -15, dist: 30, la: 3 }, { pos: 4, dir: 9, dist: 28, la: -4 }, { pos: 1, dir: 30, dist: 20, la: 50 }, { pos: 3, dir: 44, dist: 100, la: 9 }];
const phrases = [];
for (const code of ['本', '三', '二', '安', '四', '死', '振', '犠', '併', '失', '走', '刺', '凡', '飛', ''])
  for (const runs of [0, 1, 2, 4]) for (const batted of BATS) phrases.push({ code, runs, batted, out: playPhrase({ code, runs, batted }) });
const bases = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => basesText(b));
// 試合。1つ目は少ない打席で数え方、2つ目は延長のサヨナラ・同点・打席の外の行、3つ目は版20より前の行
const games = [
  {
    away: 'A',
    home: 'H',
    teams: { A: [{ id: 1, name: 'あ' }, { id: 2, name: 'い' }], H: [{ id: 9, name: 'き' }] },
    plays: {
      '1t': [[0, '安', 0, 0, 1, 7, -20, 60, 12], [1, '本', 2, 0, 0, 7, -30, 110, 30], [0, '振', 0, 1, 0], [1, '凡', 0, 2, 0, 6, -10, 30, 2]],
      '1b': [[0, '振', 0, 3, 0]],
      '2t': [[0, '振', 0, 3, 0]],
      '2b': [[0, '四', 0, 0, 1], [null, '走', 1, 0], [0, '本', 2, 0, 0, 8, 5, 120, 28], [0, '振', 0, 3, 0]],
    },
  },
  {
    away: '三陸ドルフィンズ',
    home: '奈良ディアーズ',
    teams: {
      三陸ドルフィンズ: [{ id: 11, name: '岩手 一郎' }, { id: 12, name: '宮古 次郎' }, { id: 13, name: '大槌 三郎' }],
      奈良ディアーズ: [{ id: 21, name: '春日 四郎' }, { id: 22 }, { id: 23, name: '飛鳥 六郎' }],
    },
    plays: {
      '10b': [[0, '死', 0, 0, 0], [1, '犠', 0, 1, 1, 1, 2, 8, -10], [2, '二', 1, 0, 2, 7, -27, 104, 21]],
      '1t': [[0, '三', 1, 0, 4, 9, 30, 112, 17], [1, '失', 1, 0, 1, 5, -35, 26, 1], [2, '併', 0, 2, 0, 6, -12, 31, -2], [null, '刺', 0, 1, 0]],
      '1b': [[0, '安', 1, 0, 1, 4, 6, 29, 4], [null, '走', 1, 0, 0], [1, '凡', 1, 1, 0, 8, 2, 101, 33], [2, '四', 0, 0, 1], [0, '凡', 0, 1, 2, 3, 40, 22, 14], [1, '振', 0, 1, 2]],
      '9t': [[0, '振', 0, 1, 0], [1, '振', 0, 1, 0], [2, '振', 0, 1, 0]],
      '9b': [[0, '安', 0, 0, 0, 8, -2, 70, 15], [1, '本', 2, 0, 1, 9, 16, 118, 29]],
      x: [[0, '安', 0, 0, 0]],
      '10t': [[0, '振', 0, 1, 0], [1, 'x', 0, 2, 0]],
    },
  },
  { away: 'A', home: 'H', teams: {}, plays: { '1t': [[0, '安', 0, 0], [1, '振', 0, 1]], '1b': [[0, '本', 1, 0]] } },
];
const short = (t) => t.slice(0, 2);
const live = games.map((game) => {
  const list = liveScenes(game, short);
  return {
    game,
    ready: hasLivePlays(game),
    highlights: highlightIndexes(list),
    scenes: list.map((s) => ({
      ...s,
      batter: undefined,
      batterId: s.batter?.id ?? null,
      batterName: s.batter ? s.batter.name : null,
      scoreBefore: [s.scoreBefore.away, s.scoreBefore.home],
      score: [s.score.away, s.score.home],
    })),
  };
});
// 今日の一戦。作ったリーグのビューから、自球団・日付・成績を変えて
const pyramid = generatePyramidTeams(5);
const pyramidLabels = labelsOf(pyramid);
const [own, foe, third] = pyramid.map((t) => t.name);
const day = (d) => ({ year: 2026, month: 4, day: d });
const baseView = {
  teamName: own,
  currentDate: day(7),
  seasonTurns: 160,
  teamLabels: pyramidLabels,
  teamLeagues: Object.fromEntries(pyramid.map((t, i) => [t.name, i < 6 ? 'A' : 'B'])),
  standings: pyramid.map((t, i) => ({ team: t.name, wins: 10 - i, losses: i, draws: i === 2 ? 1 : 0, winRate: (10 - i) / 10 })),
  teamStreaks: { [own]: { kind: 'W', count: 3 }, [foe]: { kind: 'L', count: 4 } },
  nextGames: [
    {
      id: 7,
      date: day(7),
      home: foe,
      away: own,
      homeStarterInfo: { id: 3, name: '先発い', wins: 0, losses: 1, era: 23.625, age: 31, condition: 1 },
      awayStarterInfo: { id: 2, name: '先発あ', wins: 1, losses: 0, era: null },
      awayStarterMark: 'fixed',
    },
    { id: 8, date: day(9), home: third, away: foe, homeStarter: '名前だけ', awayStarterInfo: { id: 5, name: '先発え', wins: 3, losses: 2, era: 2.5, age: 22, condition: 4 } },
  ],
};
const tied = baseView.standings.map((s, i) => (i === 1 ? { ...s, wins: 10, losses: 0, winRate: 1 } : s));
const today = [
  {},
  { currentDate: day(6) },
  { currentDate: day(30), seasonTurns: 20 },
  { teamName: foe },
  { teamName: third },
  { teamName: pyramid[8].name },
  { teamName: foe, standings: tied },
  { standings: tied },
  { teamLeagues: {} },
  { teamLabels: {} },
  { teamStreaks: { [own]: { kind: 'L', count: 2 }, [foe]: { kind: 'W', count: 9 } } },
  { teamName: third, standings: baseView.standings.filter((s) => s.team !== third) },
  { nextGames: [] },
  // 10月のプレーオフ（ターンの外）の今日の試合
  { currentDate: { year: 2026, month: 10, day: 12 }, nextGames: [{ ...baseView.nextGames[0], date: { year: 2026, month: 10, day: 12 } }] },
  // 防御率がちょうど半端（3自責・40アウト＝2.025、7自責・120アウト＝1.575）
  { nextGames: [{ ...baseView.nextGames[0], homeStarterInfo: { id: 3, name: '先発い', wins: 2, losses: 1, era: 81 / 40 }, awayStarterInfo: { id: 2, name: '先発あ', wins: 1, losses: 0, era: 189 / 120 } }] },
].map((patch) => {
  const card = todayGameCard({ ...baseView, ...patch });
  if (!card) return { patch, card: null };
  const side = ({ team, record, standing, starter }) => ({ team, record, rank: standing.rank, teams: standing.teams, starter });
  return { patch, card: { ...card, own: side(card.own), foe: side(card.foe) } };
});
// 打席の色の種類（`gamePlays.js` の `playTone`）と、送りの並びでの位置
const tones = ['本', '三', '二', '安', '四', '死', '振', '犠', '併', '失', '走', '刺', '凡', '飛', ''].flatMap((code) => [0, 1].map((runs) => ({ code, runs, tone: playTone(code, runs) })));
const orders = [[[1, 7, 8], 0], [[1, 7, 8], 5], [[1, 7, 8], 7], [[1, 7, 8], 9], [[], 3], [[0, 1, 2, 3], 2]].map(([order, index]) => ({ order, index, at: orderPosition(order, index) }));
const stage3 = { crowds, scenes, stadiums, fieldLooks: { fence: lookA, offense: lookC }, fields, phrases, bases, live, todayView: baseView, today, tones, orders };

// ---- 段4: 番記者と球団の出来事 ------------------------------------------
const reporters = [...pyramid.map((t) => t.name), '名前の無い球団'].map((team) => ({ team, reporter: reporterOf(team, pyramidLabels) }));
reporters.push({ team: own, labels: null, reporter: reporterOf(own) });
const reporterFaces = reporters.slice(0, 8).map(({ team, reporter }, i) => {
  const look = [...byKind.values()][i % byKind.size];
  const args = { seed: reporter.seed, look, age: reporter.age, level: [null, 3, 4, 1][i % 4], suit: true };
  return { ...args, art: faceArt(args) };
});
const race = (kind, extra = {}) => ({ league: kind === 'promotion' ? 'B' : 'A', leagueName: kind === 'promotion' ? '2部' : '1部', kind, team: own, magic: 0, clinched: true, rival: null, left: 0, ...extra });
const storyRoster = [
  { id: 101, name: '小塩 紀洋', age: 22, position: 'center', condition: 4, seasonStats: { batting: { rbis: 40, homeruns: 12 } } },
  { id: 102, name: '中里 亘輝', age: 29, position: 'pitcher', condition: 2, seasonStats: { pitching: { wins: 12, saves: 0 } } },
  { id: 103, name: '控え', age: 31, position: 'first' },
];
const manager = { role: 'manager', roleLabel: '監督', coach: { id: 'c25', name: '川口 誠一', age: 52 } };
const storyBase = { ...baseView, year: 3, races: [], roster: [], staff: null };
const stories = [
  {},
  { races: [race('first', { clinched: false, magic: 5, rival: foe })] },
  { races: [race('survive', { clinched: false, magic: 3, rival: third })] },
  { races: [race('survive', { clinched: false, magic: 2 })] },
  { races: [race('first')], roster: storyRoster, staff: { seats: [manager] } },
  { races: [race('promotion')], roster: storyRoster.slice(1), staff: { seats: [manager] } },
  { races: [race('survive')], roster: storyRoster },
  { races: [race('relegated')], roster: [], staff: { seats: [manager] } },
  { races: [race('relegated')], roster: [] },
  { races: [race('promotion', { team: foe })] },
  { teamStreaks: { [own]: { kind: 'L', count: 5 } }, nextGames: [] },
  { teamStreaks: { [own]: { kind: 'W', count: 2 } }, currentDate: day(6) },
  { teamName: third, teamStreaks: {} },
  { currentDate: { year: 2026, month: 9, day: 20 }, races: [race('promotion')], staff: { seats: [{ role: 'manager', coach: { name: '名無し' } }] }, roster: storyRoster },
  // 種類 × 話す人 × 主役の残り
  { races: [race('first')], roster: storyRoster },
  { races: [race('promotion')], roster: storyRoster },
  { races: [race('survive')], roster: storyRoster, staff: { seats: [manager] } },
  { races: [race('survive')], staff: { seats: [manager] } },
  { races: [race('relegated')], roster: storyRoster },
  { races: [race('first')], staff: { seats: [manager] } },
  // 知らない部・年の無いビュー
  { races: [race('promotion', { league: 'Z' })] },
  { races: [race('relegated', { league: 'Z' })] },
  { year: null, races: [race('first')] },
].map((patch) => ({ patch, chat: reporterChat({ ...storyBase, ...patch }), scene: eventScene({ ...storyBase, ...patch }) }));
const stage4 = { reporters, reporterFaces, storyView: storyBase, stories };

// 成績の札（リーグ平均比）。部の分け方・開幕前・出場の少ない人・自責0
const gradeViews = [
  {
    teamName: '甲',
    teamLeagues: { 甲: 'A', 乙: 'A', 丙: 'B', 丁: 'B' },
    teamStats: {
      甲: { average: 0.25, era: 3.1, obp: 0.32, slg: 0.38 },
      乙: { average: 0.23, era: 2.7, obp: 0.3, slg: 0.33 },
      丙: { average: 0.3, era: 5, obp: 0.4, slg: 0.5 },
      丁: { average: null, era: null, obp: null, slg: null },
    },
    standings: [{ team: '甲', gamesPlayed: 20 }, { team: '乙', gamesPlayed: 20 }],
  },
  // 部の分けが無い古いビュー（全球団の平均）・出塁率と長打率が無い古いサーバー
  {
    teamName: '丙',
    teamStats: { 甲: { average: 0.2, era: 2 }, 丙: { average: 0.26, era: 3.5 } },
    standings: [{ team: '丙', gamesPlayed: 8 }],
  },
  // 開幕前
  { teamName: '甲', teamStats: { 甲: { average: null, era: null, obp: null, slg: null } }, standings: [{ team: '甲', gamesPlayed: 0 }] },
  // チーム成績の無いビュー
  { teamName: '甲', standings: [] },
];
const gradePlayers = [
  { seasonStats: { batting: { atBats: 60, walks: 6, hitByPitch: 1, sacrificeFlies: 1, sacrificeBunts: 2 }, pitching: { inningsPitched: 60 } } },
  { seasonStats: { batting: { atBats: 5, walks: 1 }, pitching: { inningsPitched: 7 } } },
  { seasonStats: { batting: { atBats: 18, walks: 2 }, pitching: { inningsPitched: 20 } } },
  {},
];
const gradeValues = {
  avg: [0, 0.1, 0.18, 0.2, 0.22, 0.24, 0.27, 0.3, 0.35, 0.5, null],
  obp: [0.2, 0.26, 0.3, 0.33, 0.37, 0.42, 0.5],
  slg: [0.2, 0.3, 0.36, 0.4, 0.45, 0.6],
  ops: [0.4, 0.55, 0.62, 0.7, 0.8, 1.1],
  era: [0, 0.5, 1.2, 1.8, 2.4, 2.9, 3.6, 4.5, 6, 12, null],
  hr: [10],
};
const grades = gradeViews.map((view) => {
  const baseline = leagueBaseline(view);
  return {
    view,
    baseline,
    cells: gradePlayers.flatMap((player, pi) =>
      Object.entries(gradeValues).flatMap(([id, values]) =>
        values.map((value) => ({ player: pi, id, value, grade: statGrade({ id }, value, player, baseline) })),
      ),
    ),
  };
});

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
  stage3,
  stage4,
  grades: { players: gradePlayers, views: grades },
});
if (process.argv.includes('--check')) {
  const file = new URL('../shared/src/jvmTest/resources/look-expected.json', import.meta.url);
  if (fs.readFileSync(file, 'utf8').trim() !== text) {
    console.error(
      'look-expected.json が古い。node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json で書き出し直し、アプリの Look.kt・LookArt.kt・LookScene.kt・LookPlay.kt・TodayGame.kt・LookStory.kt も揃えること',
    );
    process.exit(1);
  }
  console.log('look-expected.json は Web 版の答えと一致しています');
} else {
  process.stdout.write(text + '\n');
}
