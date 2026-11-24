// アプリの共通部（Kotlin の Look.kt・LookArt.kt・LookScene.kt・LookPlay.kt・TodayGame.kt・LookStory.kt・LookGrade.kt・LookLogo.kt）に写した「新しい見た目（試作）」の表と描く手順が
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
import { logoArt, logoLayersFor, logoNeedsIcons } from '../../src/online/look/logoArt.js';
import { logoFromRecipe, LOGO_TEMPLATE_KEYS } from '../../src/online/look/logoBuild.js';
import { LOGO_BASES, LOGO_LATIN_FONTS, LOGO_SHAPES, charWidth } from '../../src/online/look/logoParts.js';
import { cleanLogo } from '../../src/online/look/logoData.js';
import { attachTeamLogos, logoTeamOf } from '../../src/online/look/teamLogo.js';

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

// ---- 球団ロゴ（描く側だけ。型・おまかせの候補・作る画面はアプリに写していない） -------------
// アプリが受け取るのは、サーバーがビューの `teamLabels[].logo` に載せる形（`attachTeamLogos`・`cleanLogo`）。
// ⚠ 図形と絵の `d` は長いので、期待値にはその `hash` を書く（アプリの検査も同じ `lookHash` に直して比べる。
//    図形の `d` そのものは `gen-tables.mjs` が Tables.kt に書き出して `--check` で比べている）。
// ⚠ 絵の形は本物（280KB）の代わりに、名前ごとに違う短い形を使う（描く手順は形の中身を読まない）。
const logoIcons = {};
const iconStub = (name) => (logoIcons[name] ??= `M${hash(name) % 400} 24h88v${40 + (hash(name) % 37)}h-88Z`);
const noteIcons = (layers) => {
  for (const L of layers || []) if (L.k !== 'text' && !Object.hasOwn(LOGO_SHAPES, L.k)) iconStub(L.k);
};
const hashD = (art) => ({ ...art, items: art.items.map((it) => ('d' in it ? { ...it, d: hash(it.d) } : it)) });
const logoArtOf = (layers, colors, icons) => hashD(logoArt(layers, colors, icons));
const logoCase = (note, colors, layers) => {
  noteIcons(layers);
  const needs = logoNeedsIcons(layers);
  // 絵の形がまだ届いていないとき（`bare`）は、絵の部品を飛ばして描く
  return { note, colors, layers, needs, art: logoArtOf(layers, colors, logoIcons), ...(needs ? { bare: logoArtOf(layers, colors, null) } : null) };
};
// 手で組んだ重ね（保存の確かめ `cleanLogo` を通した形。1枚も捨てられないこと）
const wire = (layers) => {
  const out = cleanLogo({ layers })?.layers;
  if (out?.length !== layers.length) throw new Error(`手で組んだロゴの部品が保存の確かめで捨てられた: ${JSON.stringify(layers)}`);
  return out;
};
const HAND = [
  // 図形: 反転・回転・ふち・線だけ・色の番号と '#rrggbb'・ボールの縫い目（2つ目の形）
  ['図形', ['#13294b', '#c8102e', '#ffffff'], [
    { k: 'shield', c: 0, o: 2, ow: 3 },
    { k: 'bat', x: 40, y: 52, s: 0.8, r: -35, c: 3, f: 1 },
    { k: 'bat', x: 60, y: 52, s: 0.8, r: 35, c: '#ff8800', o: 4, ow: 1.5 },
    { k: 'ball', y: 30, s: 0.3, c: 3 },
    { k: 'ball', y: 72.5, s: 0.25, c: 3, o: 1, ow: 1, f: 1 },
  ]],
  ['線だけ', ['#0b3d2e', '#f4c430', '#14161c'], [
    { k: 'circle', c: 1, line: 2.5 },
    { k: 'star', s: 0.5, r: 18, c: 2, line: 1 },
    { k: 'pennant', x: 30.5, y: 61.25, s: 0.45, r: 200, c: 4, f: 1, o: 3, ow: 0.8 },
    { k: 'ball', x: 70, y: 70, s: 0.33, c: 1, line: 0.6 },
    { k: 'seal', x: -30, y: 130, s: 3, r: 360, c: 0 },
    { k: 'swoosh', s: 0.03, r: -360, c: '#00ff7f' },
  ]],
  // 字: まっすぐ・上の弧・下の弧・ふち・反転・回転・和文・2単位の字
  ['字まっすぐ', ['#5b2a86', '#ffd166', '#ffffff'], [
    { k: 'text', t: 'TIGERS', font: 'alfa', c: 1 },
    { k: 'text', y: 30, s: 0.5, r: -8, t: 'Sapporo', font: 'yellowtail', c: 3, o: 4, ow: 2 },
    { k: 'text', y: 74, s: 0.45, t: '札幌 2026', font: 'jp', c: 2, o: 0, ow: 1.2, f: 1 },
    { k: 'text', x: 12, y: 88, s: 0.3, r: 90, t: 'Q~ {|}', c: 4 },
  ]],
  ['字の弧', ['#13294b', '#c8102e', '#ffffff'], [
    { k: 'circle', c: 0 },
    { k: 'text', s: 0.4, t: 'NORTH STARS', c: 3, o: 1, ow: 2, arc: 38 },
    { k: 'text', s: 0.3, t: 'BASEBALL CLUB', font: 'alfa', c: 2, arc: -38 },
    { k: 'text', y: 55, s: 0.45, r: 20, t: 'あ伊う', font: 'jp', c: 4, f: 1, arc: 30 },
  ]],
  ['字の弧（2単位の字・小さい半径・横向き）', ['#0b3d2e', '#f4c430', '#14161c'], [
    { k: 'text', s: 0.5, t: '𠮷a😀', font: 'jp', c: 0, o: 2, ow: 1, arc: -24 },
    { k: 'text', x: 60, s: 0.6, r: -90, t: 'Wi 1', font: 'yellowtail', c: 1, arc: 60 },
    { k: 'text', s: 0.2, t: 'A', font: 'alfa', c: 2, o: 3, ow: 0.5, f: 1, arc: 8 },
    { k: 'text', s: 0.35, t: 'HIGASHIOSAKA', c: 3, arc: -90 },
  ]],
  // 絵（別に読む形）: 塗る・ふち・線だけ・反転
  ['絵', ['#7a1f2b', '#e2ad84', '#ffffff'], [
    { k: 'hex', c: 0, o: 1, ow: 4 },
    { k: 'bear-head', y: 46, s: 0.62, c: 3 },
    { k: 'eagle-emblem', x: 24, y: 80, s: 0.2, r: 15, c: 1, f: 1, o: 4, ow: 1 },
    { k: 'baseball-bat', s: 0.4, r: -45, c: 2, line: 1.2 },
    { k: 'text', y: 88, s: 0.28, t: 'BEARS', font: 'alfa', c: 3 },
  ]],
];
const logoCases = HAND.map(([note, colors, layers]) => logoCase(note, colors, wire(layers)));

// 型から作ったロゴ（11の型。台座・書体・配色は型ごとに回す）。英字の球団と、英字にできない球団
const logoLabels = structuredClone(leagues[9].labels);
const logoNames = Object.keys(logoLabels);
logoLabels[logoNames[3]] = { label: 'ほげ 球団', city: '', nickname: '' };
const logoLooks0 = buildTeamLooks(logoLabels);
const recipeOf = (ti, i, motif) => ({
  tpl: LOGO_TEMPLATE_KEYS[ti],
  base: LOGO_BASES[(ti * 3 + i * 5) % LOGO_BASES.length],
  font: LOGO_LATIN_FONTS[(ti + i) % LOGO_LATIN_FONTS.length],
  scheme: ti + i,
  ini: i % 2,
  word: (ti + i) % 2,
  motif,
});
[[logoNames[0], 'tiger-head'], [logoNames[3], 'mountains']].forEach(([name, motif], t) => {
  const team = logoTeamOf(name, logoLabels[name], logoLooks0[name]);
  LOGO_TEMPLATE_KEYS.forEach((tpl, ti) => {
    for (let i = 0; i < 2; i++) {
      const logo = cleanLogo(logoFromRecipe(team, recipeOf(ti, i + t, motif)));
      logoCases.push(logoCase(`型 ${tpl} ${name}`, team.colors, logo.layers));
      if (!i) logoCases.push(logoCase(`型 ${tpl} ${name}（小さい版）`, team.colors, logo.mini));
    }
  });
});

// サーバーが載せる形から球団の見た目へ（`buildTeamLooks`）。作っていない球団は自動のロゴ、
// 1球団は色も選んだロゴ、1球団は色を選んでいないロゴ、1球団は小さい版を持たないロゴ
const logoLeagues = [
  ['pyramid', structuredClone(leagues[4].labels)],
  ['renamed', structuredClone(renamed)],
  ['kana', structuredClone(kana)],
].map(([seed, labels]) => {
  const names = Object.keys(labels);
  const looks0 = buildTeamLooks(labels);
  const picked = ['#0b3d2e', '#f4c430', '#ffffff'];
  const made = (name, recipe, colors, miniKind) => {
    const logo = cleanLogo(logoFromRecipe(logoTeamOf(name, labels[name], looks0[name], colors), recipe, miniKind));
    return colors ? { ...logo, colors } : logo;
  };
  const saved = {
    [names[0]]: made(names[0], recipeOf(2, 1, 'wolf-head'), picked),
    [names[1]]: made(names[1], recipeOf(7, 0, 'anchor'), null),
    [names[2]]: made(names[2], recipeOf(4, 2, 'fox-head'), null, 'same'),
  };
  attachTeamLogos(labels, (name) => saved[name]);
  const looks = buildTeamLooks(labels);
  const teamsOut = {};
  for (const name of names) {
    const { logo, ...look } = looks[name];
    const colors = [look.c1, look.c2, look.c3];
    noteIcons(logo.layers);
    noteIcons(logo.mini);
    const full = logoLayersFor(logo, 68);
    const small = logoLayersFor(logo, 22);
    teamsOut[name] = {
      look,
      // 大きく出すとき（68）と、表の中（22）
      full: logoArtOf(full, colors, logoIcons),
      small: logoArtOf(small, colors, logoIcons),
      smallIsMini: small !== full,
      needs: [logoNeedsIcons(full), logoNeedsIcons(small)],
    };
  }
  return { seed, labels, teams: teamsOut };
});
// 小さい版に替わる境目
const pickLogo = { layers: [{ k: 'circle', c: 0 }], mini: [{ k: 'star', c: 1 }] };
const logoPicks = [12, 22, 32, 32.5, 33, 68].flatMap((size) => [
  { size, mini: true, usesMini: logoLayersFor(pickLogo, size) === pickLogo.mini },
  { size, mini: false, usesMini: logoLayersFor({ layers: pickLogo.layers }, size) === pickLogo.mini },
]);
// 字の幅（表の数。測らない）
const logoWidths = [' ', '!', 'A', 'W', 'i', 'm', '0', '~', 'あ', '札', '𠮷', '😀', 'é'].flatMap((ch) =>
  ['graduate', 'alfa', 'yellowtail', 'jp', 'nope'].map((font) => ({ ch, font, w: charWidth(ch, font) })),
);
const logo = { icons: logoIcons, cases: logoCases, leagues: logoLeagues, picks: logoPicks, widths: logoWidths };

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
  logo,
});
if (process.argv.includes('--check')) {
  const file = new URL('../shared/src/jvmTest/resources/look-expected.json', import.meta.url);
  if (fs.readFileSync(file, 'utf8').trim() !== text) {
    console.error(
      'look-expected.json が古い。node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json で書き出し直し、アプリの Look.kt・LookArt.kt・LookScene.kt・LookPlay.kt・TodayGame.kt・LookStory.kt・LookGrade.kt・LookLogo.kt も揃えること',
    );
    process.exit(1);
  }
  console.log('look-expected.json は Web 版の答えと一致しています');
} else {
  process.stdout.write(text + '\n');
}
