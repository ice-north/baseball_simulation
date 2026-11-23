// PC のスポーツ新聞（src/online/paper/。アプリの FrontPage*.kt の写し）が、アプリと同じ紙面を作るかの検査用に、
// 期待値を書き出す。
//   node mobile/tools/expect-paper.mjs > mobile/shared/src/jvmTest/resources/front/paper-expected.json
// 材料は紙面の検査と同じ窓口の答え（resources/front/。view-fixture.mjs が作る）。
// CI は `--check`（PC 版だけ直したときに気づく）。答え合わせは `FrontPageWebTest`（同じ書き方で1行ずつ比べる）。
// ⚠ 行の書き方（paperLines）は FrontPageWebTest.kt の paperLines と同じにすること
import { emitExpected } from './expected.mjs';
import fs from 'node:fs';
import { paperView, player, gameResult } from '../../src/online/paper/paperView.js';
import { buildFrontPage, loadOwnHistory } from '../../src/online/paper/frontPage.js';
import { buildNationalPage } from '../../src/online/paper/national.js';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../shared/src/jvmTest/resources/front/${name}`, import.meta.url)));
const raw = read('view.json');
const view = paperView(raw);
const game = read('game.json');
const opponent = (read('team.json').roster || []).map(player);
const history = await loadOwnHistory(view.teamName, async () => read('games.json'), gameResult);

const j = (...xs) => xs.map((x) => (x == null ? 'null' : String(x))).join('|');

/** 紙面を1行ずつの文に（アプリの FrontPageWebTest.paperLines と同じ） */
function paperLines(p) {
  const out = [];
  const add = (...xs) => out.push(j(...xs));
  const art = (tag, a) => add(tag, a.kicker, a.title, a.body, a.link);
  add('head', p.title, p.badge, p.extra, p.issue, p.team, p.standing, p.status);
  add('top', p.kicker, p.headline, p.subhead, p.lead, p.tone);
  if (p.score) add('score', p.score.away, p.score.awayScore, p.score.home, p.score.homeScore);
  if (p.lineScore) add('line', p.lineScore.away, p.lineScore.home, p.lineScore.awayRuns.join(','), p.lineScore.homeRuns.join(','), p.lineScore.walkOff);
  p.box.forEach(([k, v]) => add('box', k, v));
  p.articles.forEach((a) => art('article', a));
  p.shorts.forEach((s) => add('short', s));
  add('date', p.dateLine, p.issueNo);
  add('big', p.bigHead, p.bigSub, p.leadHead, p.caption);
  if (p.hero) add('hero', p.hero.title, p.hero.name, p.hero.position, p.hero.lines.map(([t, b]) => `${t}:${b}`).join(','), p.hero.season, p.hero.summary);
  p.index.forEach((x) => add('index', x));
  p.results.forEach((r) => add('result', r.away, r.awayScore, r.home, r.homeScore));
  if (p.frontArticles == null) add('front', null);
  else p.frontArticles.forEach((a) => add('front', a.kicker));
  const t = p.teamPage;
  if (t) {
    add('team', t.section, t.form.join(','), t.nowNote, t.rotation);
    if (t.interview) {
      add('interview', t.interview.title, t.interview.intro, t.interview.speaker);
      t.interview.qa.forEach(([q, a]) => add('qa', q, a));
    }
    t.now.forEach(([k, v]) => add('now', k, v));
    t.conditions.forEach((c) => add('cond', c.arrow, c.name, c.position, c.note));
    t.pitchers.forEach(([n, note, rest]) => add('pitcher', n, note, rest));
    t.articles.forEach((a) => art('tarticle', a));
  }
  const r = p.recordPage;
  if (r) {
    add('record', r.game, r.reviewHead, r.review, r.leagueName, r.probablesTitle);
    r.boxes.forEach((b) => {
      add('boxteam', b.name, b.totals.join(','));
      b.batters.forEach((x) => add('batter', x.pos, x.name, x.ab, x.h, x.rbi, x.hr, x.sub));
      b.pitchers.forEach((x) => add('bpitcher', x.name, x.ip, x.h, x.so, x.r, x.pitches));
    });
    r.notes.forEach((x) => add('note', x));
    r.relays.forEach((x) => add('relay', x));
    r.standings.forEach((s) => add('stand', s.rank, s.team, s.w, s.l, s.gb, s.note, s.mine));
    r.probables.forEach(([x, mine]) => add('prob', x, mine));
    r.leaders.forEach((b) => {
      add('leader', b.title);
      b.rows.forEach((x) => add('lrow', x.name, x.team, x.value, x.mine));
    });
    r.shorts.forEach((a) => art('rshort', a));
  }
  return out;
}

// 場面: 詳細・今季の試合・次の相手の名簿がそろった日 / 詳細が読めなかった日 / 今季の試合が読めなかった日 /
//   キャンプ（手続きの時期の1面・指導者の人事。resources/front/scenes.json の camp でビューの上の段を差し替える）/
//   勝った日（同じく win。最後の試合の得点を入れ替える）
// ⚠ 差し替えはビューの**いちばん上の段の項目ごと**（FrontPageWebTest も同じく `raw + patch`）
const patches = read('scenes.json');
const scenes = {
  full: { game, history: history[0], historyComplete: history[1], opponent },
  noDetail: { game: null, history: history[0], historyComplete: history[1], opponent: null },
  noHistory: { game, history: null, historyComplete: false, opponent },
  camp: { patch: patches.camp, game: null, history: history[0], historyComplete: history[1], opponent },
  win: { patch: patches.win, game: null, history: null, historyComplete: false, opponent },
  // ドラフトの気配（`proWatch`。自球団の2人と他球団の1人）
  watch: { patch: patches.watch, game, history: history[0], historyComplete: history[1], opponent },
};
const result = {};
for (const [name, s] of Object.entries(scenes)) {
  const r = s.patch ? { ...raw, ...s.patch } : raw;
  const v = s.patch ? paperView(r) : view;
  const local = buildFrontPage(v, r, s.game, { history: s.history, historyComplete: s.historyComplete, opponent: s.opponent });
  result[name] = { local: paperLines(local), national: paperLines(buildNationalPage(v, r, local)) };
}

const text = JSON.stringify(result);
emitExpected(text, { script: 'expect-paper.mjs', file: 'front/paper-expected.json', also: 'アプリの FrontPage*.kt も揃えること' });
