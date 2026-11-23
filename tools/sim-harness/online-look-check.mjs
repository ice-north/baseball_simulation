// 新しい見た目（試作）の表と絵の検査。
//   node tools/sim-harness/online-look-check.mjs
//
// ⚠ 見るのは**壊れると気づきにくい性質**だけ（絵の出来は画面写真で見る）:
//    - 土地・愛称の表が `pyramidLeague.js` の一覧を全部覆っている（足したのに表を忘れると字が出ない）
//    - 12球団で色の組と字が重ならない（2000通りの種で）
//    - 同じ選手は年齢・調子が変わっても同じ顔（乱数を引く回数が条件で変わると別人になる）
//    - 描く手順の数字がすべて有限（NaN が混ざると SVG が黙って消える）
//    - 実在の球団（リーグの外の名前）にはマークを付けない
//    - 段3: 客の入りで球場の星や旗の並びが変わらない・打席速報の点とアウトと塁・実況の文・今日の一戦の札
//    - 段4: 番記者は球団名から決まる・背広の顔でも乱数の回数が同じ・ひとことと場面の文
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
import { stadiumArt, stadiumScene, crowdLevel, fieldArt } from '../../src/online/look/sceneArt.js';
import { liveScenes, playPhrase, basesText, highlightIndexes, hasLivePlays, orderPosition } from '../../src/online/look/playByPlay.js';
import { todayGameCard } from '../../src/online/look/todayGame.js';
import { reporterOf, reporterChat, eventScene } from '../../src/online/look/story.js';

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

// --- 段3: 球場の夜景・打席速報の図 -----------------------------------------
{
  const look = buildTeamLooks(Object.fromEntries(generatePyramidTeams(5).map((t) => [t.name, { label: t.name, city: t.city }])));
  const home = Object.values(look)[0];
  const full = stadiumArt({ look: home, scene: 'sea', crowd: 1 });
  const thin = stadiumArt({ look: home, scene: 'sea', crowd: 0.35 });
  finite(full, '球場');
  finite(stadiumArt({ look: home, scene: 'mountain', crowd: 0.5 }), '山の球場');
  // ⚠ 客の入りで描く客の数だけが変わる（星・旗・照明は同じ所）
  const notCrowd = (art) => art.items.filter((s) => !(s.t === 'circle' && s.r === 1.6));
  assert.deepEqual(notCrowd(thin), notCrowd(full), '客の入りで客のほかの絵まで変わった');
  assert.ok(full.items.length - thin.items.length > 200, '客の入りが絵に出ていない');
  assert.equal(stadiumScene('甲府'), 'mountain');
  assert.equal(stadiumScene('三陸'), 'sea');
  assert.equal(crowdLevel(1, 6, 5), 1);
  assert.equal(crowdLevel(6, 6, -3), 0.35);
  // 走者の丸は塁の数だけ。本塁打はフェンスの外に落ちる
  const offense = Object.values(look)[1];
  for (let bases = 0; bases < 8; bases++) {
    const art = fieldArt({ fence: home, offense, bases });
    finite(art, `打席速報の図 塁${bases}`);
    const runners = art.items.filter((s) => s.t === 'circle' && s.r === 5.2).length;
    assert.equal(runners, [0, 1, 1, 2, 1, 2, 2, 3][bases], `塁${bases}の走者の数`);
  }
  const hr = fieldArt({ fence: home, offense, batted: { pos: 8, dir: 0, dist: 90, la: 30 }, code: '本', runs: 1 });
  const ball = hr.items.find((s) => s.t === 'circle' && s.r === 3.2);
  assert.ok(ball.cy < 142 - 122 * 0.95, '本塁打の球がフェンスの内側に落ちた');
  assert.ok(ball.cy >= hr.box[1], '本塁打の球が図の外に出た');
}

// --- 段3: 打席速報の文と数え方 -------------------------------------------
{
  assert.equal(basesText(0), '走者なし');
  assert.equal(basesText(3), '一・二塁');
  assert.equal(basesText(5), '一・三塁');
  assert.equal(basesText(7), '満塁');
  const say = (code, runs = 0, batted = null) => playPhrase({ code, runs, batted });
  assert.equal(say('本', 2, { pos: 7, dir: -30, dist: 110, la: 30 }), 'レフトスタンドへツーランホームラン！');
  assert.equal(say('本', 4, { pos: 9, dir: 20, dist: 115, la: 28 }), 'ライトスタンドへ満塁ホームラン！');
  assert.equal(say('安', 1, { pos: 7, dir: -20, dist: 60, la: 12 }), 'レフト前タイムリー！');
  assert.equal(say('安', 0, { pos: 6, dir: -15, dist: 30, la: 3 }), 'ショートへの内野安打');
  assert.equal(say('二', 0, { pos: 8, dir: -15, dist: 100, la: 20 }), '左中間への二塁打');
  assert.equal(say('凡', 0, { pos: 6, dir: -15, dist: 30, la: 3 }), 'ショートゴロ');
  assert.equal(say('凡', 1, { pos: 8, dir: 0, dist: 90, la: 35 }), 'センターへの犠牲フライ');
  assert.equal(say('併', 0, { pos: 4, dir: 10, dist: 30, la: 2 }), 'セカンドゴロ併殺打');
  assert.equal(say('四', 1), '押し出しの四球');
  // 作った試合: 1回表に2点（2ランで逆転…の前に、裏が無い1回）、2回裏に3点で逆転
  const game = {
    away: 'A',
    home: 'H',
    awayScore: 2,
    homeScore: 3,
    teams: { A: [{ id: 1, name: 'あ' }, { id: 2, name: 'い' }], H: [{ id: 9, name: 'き' }] },
    plays: {
      '1t': [[0, '安', 0, 0, 1, 7, -20, 60, 12], [1, '本', 2, 0, 0, 7, -30, 110, 30], [0, '振', 0, 1, 0], [1, '凡', 0, 2, 0, 6, -10, 30, 2]],
      '1b': [[0, '振', 0, 3, 0]],
      '2t': [[0, '振', 0, 3, 0]],
      '2b': [[0, '四', 0, 0, 1], [null, '走', 1, 0], [0, '本', 2, 0, 0, 8, 5, 120, 28], [0, '振', 0, 3, 0]],
    },
  };
  assert.ok(hasLivePlays(game));
  assert.ok(!hasLivePlays({ plays: { '1t': [[0, '安', 0, 0]] } }), '版20より前の試合で打席速報を出す');
  const scenes = liveScenes(game, (t) => (t === 'A' ? 'エー' : 'エイチ'));
  assert.equal(scenes.length, 10);
  assert.deepEqual(scenes.map((s) => s.outs), [0, 0, 1, 3, 3, 3, 0, 0, 0, 3]);
  // 塁はその行の5つ目（打席の後）。⚠ 次の行から作ると、次の打席の途中の盗塁・暴投が混ざる（2026-11-23 レビュー）
  assert.deepEqual(scenes.map((s) => s.basesAfter), [1, 0, 0, 0, 0, 0, 1, null, 0, 0]);
  assert.equal(scenes[1].situation, 'エーが2点、先制（2-0）', '0-0 からの点は先制');
  assert.equal(scenes[3].situation, 'チェンジ');
  assert.equal(scenes[6].situation, '0死一塁');
  assert.equal(scenes[7].situation, 'エイチが1点（1-2）');
  assert.equal(scenes[8].situation, 'エイチが2点、逆転（3-2）');
  assert.equal(scenes[9].situation, '試合終了');
  assert.deepEqual(scenes.at(-1).score, { away: 2, home: 3 });
  assert.deepEqual(highlightIndexes(scenes), [1, 7, 8]);
  // 見どころだけに切りかえたら、いまより前の見どころに留まる（先頭へ飛ばない）
  assert.equal(orderPosition([1, 7, 8], 0), 0);
  assert.equal(orderPosition([1, 7, 8], 5), 0);
  assert.equal(orderPosition([1, 7, 8], 7), 1);
  assert.equal(orderPosition([1, 7, 8], 9), 2);
  // 同点からの点は勝ち越し（先制ではない）
  const tied = liveScenes({ ...game, plays: { '1t': [[0, '本', 1, 0, 0]], '1b': [[0, '本', 1, 0, 0], [0, '振', 0, 3, 0]], '2t': [[0, '安', 1, 0, 1]] } });
  assert.deepEqual(tied.map((s) => s.situation.replace(/^.*、|（.*$/g, '')), ['先制', '同点', 'チェンジ', '勝ち越し']);
}

// --- 段3: 今日の一戦の札 --------------------------------------------------
{
  const teams = generatePyramidTeams(5);
  const labels = Object.fromEntries(teams.map((t) => [t.name, { label: t.name, city: t.city, nickname: t.name.slice(t.city.length) }]));
  setTeamLooks(labels);
  const [own, foe] = teams.map((t) => t.name);
  const date = (day) => ({ year: 2026, month: 4, day });
  const view = {
    teamName: own,
    currentDate: date(7),
    seasonTurns: 160,
    teamLabels: labels,
    teamLeagues: Object.fromEntries(teams.map((t, i) => [t.name, i < 6 ? 'A' : 'B'])),
    standings: teams.map((t, i) => ({ team: t.name, wins: 10 - i, losses: i, winRate: (10 - i) / 10 })),
    teamStreaks: { [own]: { kind: 'W', count: 3 } },
    nextGames: [
      {
        id: 7,
        date: date(7),
        home: foe,
        away: own,
        homeStarterInfo: { id: 3, name: '先発い', wins: 0, losses: 1, era: 23.625, age: 31, condition: 1 },
        awayStarterInfo: { id: 2, name: '先発あ', wins: 1, losses: 0, era: null },
        awayStarterMark: 'fixed',
      },
    ],
  };
  const card = todayGameCard(view);
  assert.equal(card.title, '今日の一戦');
  assert.equal(card.when, '4月7日（火）　第7ターン');
  assert.equal(card.place, `ビジター（${labels[foe].city}）`);
  assert.equal(card.own.record, '1部1位　10勝0敗');
  assert.equal(card.note, '首位・2位と1.0差　3連勝中');
  assert.equal(card.own.starter.mark, '予告先発');
  assert.equal(card.own.starter.line, '1勝0敗 防—');
  assert.equal(card.foe.starter.mark, '先発予定');
  assert.equal(card.foe.starter.line, '0勝1敗 防23.63');
  // 今日が休養日なら次の試合を「次の一戦」として出す。自球団の試合が無ければ出さない
  assert.equal(todayGameCard({ ...view, currentDate: date(6) }).title, '次の一戦');
  assert.equal(todayGameCard({ ...view, nextGames: [] }), null);
  // 10月のプレーオフ（ターンの外）でも、今日の試合なら「今日の一戦」（2026-11-23 レビュー）
  const playoff = { ...view.nextGames[0], date: { year: 2026, month: 10, day: 12 } };
  assert.equal(todayGameCard({ ...view, currentDate: playoff.date, nextGames: [playoff] }).title, '今日の一戦');
  // 防御率は百分の一に四捨五入（3自責・40アウト＝2.025。toFixed だけだと 2.02 でアプリとずれる）
  const era = (value) => todayGameCard({ ...view, nextGames: [{ ...view.nextGames[0], homeStarterInfo: { id: 3, name: 'い', era: value } }] }).foe.starter.line;
  assert.equal(era((3 * 27) / 40), '0勝0敗 防2.03');
  assert.equal(era((7 * 27) / 120), '0勝0敗 防1.58');
}

// --- 段4: 番記者と球団の出来事 ----------------------------------------------
{
  const teams = generatePyramidTeams(5);
  const labels = Object.fromEntries(teams.map((t) => [t.name, { label: t.name, city: t.city, nickname: t.name.slice(t.city.length) }]));
  const [own, foe] = teams.map((t) => t.name);
  // 番記者は球団名から決まる（同じ球団ならいつも同じ人）。肩書きは愛称
  const rep = reporterOf(own, labels);
  assert.deepEqual(reporterOf(own, labels), rep);
  assert.equal(rep.title, `${labels[own].nickname}番`);
  assert.ok(rep.age >= 24 && rep.age < 42);
  // 背広の顔: 帽子の字も帽子も無く、白いシャツとネクタイ。乱数を引く回数は同じ（目・眉は選手の顔と同じ）
  const look = Object.values(buildTeamLooks(labels))[0];
  const suit = faceArt({ seed: rep.seed, look, age: rep.age, level: 3, suit: true });
  const plain = faceArt({ seed: rep.seed, look, age: rep.age, level: 3 });
  assert.equal(suit.items.filter((s) => s.t === 'text').length, 0, '番記者の顔に帽子の字');
  assert.ok(suit.items.some((s) => s.fill === look.c1 && s.d?.startsWith('M48.4 79')), 'ネクタイが無い');
  const eyes = (art) => art.items.filter((s) => (s.t === 'ellipse' || s.t === 'circle') && s.cy > 50 && s.r !== 38).map((s) => JSON.stringify(s));
  assert.deepEqual(eyes(suit), eyes(plain), '背広にすると目が変わった（乱数の引く回数がずれた）');
  // ひとこと・場面
  const view = {
    teamName: own,
    year: 2,
    currentDate: { year: 2026, month: 9, day: 20 },
    teamLabels: labels,
    teamStreaks: { [own]: { kind: 'W', count: 4 } },
    races: [],
    roster: [
      { id: 1, name: '主役 太郎', age: 25, seasonStats: { batting: { rbis: 30, homeruns: 10 } } },
      { id: 2, name: '投手 次郎', age: 28, seasonStats: { pitching: { wins: 9 } } },
    ],
    staff: { seats: [{ role: 'manager', coach: { id: 'c9', name: '監督 三郎', age: 55 } }] },
  };
  assert.deepEqual(reporterChat(view), ['4連勝中です。ベンチの雰囲気もいいですよ。']);
  assert.equal(eventScene(view), null, '決まっていないのに場面が出た');
  const race = { league: 'B', leagueName: '2部', kind: 'promotion', team: own, magic: 0, clinched: true, rival: null };
  const scene = eventScene({ ...view, races: [race] });
  assert.equal(scene.heading, '2部優勝！　来季は1部へ');
  assert.equal(scene.title, '球団の出来事　2年目・9月');
  assert.equal(scene.speaker.label, '監督監督');
  assert.equal(scene.star.name, '主役 太郎', '主役は打点＋本塁打×2（50）が勝利×5（45）より上');
  assert.match(scene.line, /^「ついに上がれるぞ。主役の活躍/);
  assert.equal(eventScene({ ...view, races: [{ ...race, team: foe }] }), null, '他球団の昇格で場面が出た');
  assert.equal(eventScene({ ...view, staff: null, races: [race] }).speaker.kind, 'reporter', '監督が居なければ番記者が話す');
  // 知らない部は「上の部」と書く（先頭の部の名前にしない）。年の無いビューは「年目」を書かない
  assert.equal(eventScene({ ...view, races: [{ ...race, league: 'Z' }] }).heading, '2部優勝！　来季は上の部へ');
  assert.equal(eventScene({ ...view, year: undefined, races: [race] }).title, '球団の出来事　9月');
  assert.equal(scene.star.seed, 'p1', '主役の顔の種が選手の顔と違う');
}

console.log('online-look-check: ok');
