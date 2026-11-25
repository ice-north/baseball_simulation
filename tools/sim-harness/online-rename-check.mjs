// 球団名を変えたあとに、変える前の名前が残らないかの検査（オンライン）。
//   node tools/sim-harness/online-rename-check.mjs
//
// ⚠ いしだ 2026-11-24「チーム名を変えた後も、旧チーム名が残ってしまい、選手の経歴などに
//    残ってしまうところがあります」。球団には変わらない内部名（`teamName`。記録の選手キーまで
//    貫いている）と見せる名前（`displayName`）があり、保存は内部名で持って、画面に出すときに
//    いまの名前へ引き直す（`teamLabelIn`・Web の `teamLabel`・アプリの `teamLabel`）のが正しい形。
//    引き直し忘れると、名前を付ける前の内部名（既定の名前）や、前に付けた名前が出る。
//
// やること:
//   1. 参加者の球団に名前（旧名）を付けて1年を通して進め、翌年の開幕まで行く
//      （入退団・トライアウト・ドラフト・表彰・節目・指導者の入れ替え・その年のまとめが積まれる）
//   2. 名前を新名に変える
//   3. 保存とビュー（リーグ・12球団・取引・試合・選手）に旧名が残っていないか。
//      ⚠ **お知らせ（`inbox`）の本文だけは残してよい**（そのとき届いた知らせの文。当時の名前が正しい）
//   4. ビューの文（内部名を埋め込んだ文）が無いか。内部名は照合の鍵として来るのはよく、
//      文に混ぜるのは画面で引き直せないのでだめ
//   5. Web の画面（PC・スマホの各ページ、リーグ史・チーム分析の各切り替え、球団史）を描いて、
//      見える文字と title に内部名も旧名も出ないか
//   6. 滅多に起きない道（指導者の出身の球団・日本一決定戦の優勝・その年のまとめの相手・
//      トライアウトの前所属・選手の経歴）を作って確かめる
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
import { touchPresence } from '../../server/social.mjs';
import { recordRetirements } from '../../server/chronicle.mjs';
import {
  projectLeague,
  projectTeamInfo,
  projectTransactions,
  projectGames,
  projectPlayerInfo,
} from '../../server/projection.mjs';
import { applyProfile, teamLabelIn } from '../../src/online/membership.js';
import { originText } from '../../src/online/coaches.js';
import { worldText } from '../../src/online/chronicleText.js';

const here = dirname(fileURLToPath(import.meta.url));
const OLD = { cityName: '旧名', nickname: 'ゴースツ' };
const NEW = { cityName: '新名', nickname: 'フェニックス' };
const OLD_NAME = '旧名ゴースツ';
const NEW_NAME = '新名フェニックス';
// 旧名の一部（地域名だけ・チーム名だけで出ても見つける）
const OLD_PARTS = [OLD_NAME, OLD.cityName, OLD.nickname];

// --- 1. 名前を付けて1年を通して進める ---
const log = console.log;
console.log = () => {};
let now = new Date('2026-10-28T00:00:00Z');
const league = createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now: now.toISOString() });
const INT = league.members[0].teamName;
applyProfile(league, { userId: 'a', ...OLD });
assert.equal(teamLabelIn(league, INT), OLD_NAME, '前提: 名前が付かない');
const startYear = league.season.year;
let days = 0;
while (days < 600) {
  if (league.status === 'waiting') {
    for (const m of league.members)
      submitPhase(
        league,
        m.userId,
        { phaseId: league.phase.id, plan: defaultPhasePlan(league, m.teamName), ready: true },
        now.toISOString(),
      );
    continue;
  }
  if (league.season.year > startYear && league.season.results.length >= 20) break;
  now = new Date(now.getTime() + 4 * 3600000);
  for (const m of league.members) touchPresence(league, m.userId, now.toISOString());
  advanceLeagueDay(league, `rename:${days}`, now.toISOString());
  days++;
}
console.log = log;
assert.ok(league.season.year > startYear, '翌年まで進まなかった');

// --- 6（前半）. 滅多に起きない道を保存に作る（名前を変える前に。保存は旧名のときに書かれた形）---
// 指導者になった元選手の出身の球団（`origin.teamLabel` は指導者になった時点の名前で保存される）
const coach = Object.values(league.coaches?.people || {}).find((c) => c.job);
assert.ok(coach, '前提: 席に就いている指導者がいる');
coach.origin = { ...(coach.origin || {}), kind: 'player', team: INT, teamLabel: OLD_NAME, seasons: 3, position: 'pitcher' };
// 日本一決定戦をこのリーグの球団が制した（優勝は内部名で残る）
league.chronicle.world.unshift({
  kind: 'grand',
  year: league.season.year - 1,
  month: 11,
  day: 3,
  champion: INT,
  championLeague: 'このリーグ',
  runnerUp: '他所ワイルドキャッツ',
  finalScore: '3-2',
  teams: 8,
  ours: INT,
  oursResult: '優勝',
  oursLostTo: null,
});

// 引退してスカウトになった選手（「〇〇のスカウト」。肩書きの球団は内部名で保存される。
// 監督・コーチは年度更新で「指導者」に書き換わるが、スカウトは残る）
recordRetirements(
  league,
  [{ team: INT, name: '引退した人', age: 36, position: 'pitcher', secondCareer: { role: 'scout', title: 'スカウト', team: INT } }],
  { year: startYear - 5, teamNames: [INT], keys: new Map() },
);

// --- 2. 名前を変える ---
applyProfile(league, { userId: 'a', ...NEW });
assert.equal(teamLabelIn(league, INT), NEW_NAME);

// --- 3・4. 保存とビュー ---
const bundle = { league, sessions: {} };
const views = {};
for (const who of ['a', 'b']) {
  views[`league:${who}`] = projectLeague(bundle, who, null, null);
  views[`transactions:${who}`] = projectTransactions(bundle, who, {});
  views[`games:${who}`] = projectGames(bundle, who, { scope: 'league', size: 200 });
}
for (const t of league.season.settings.teamNames) views[`team:${t}`] = projectTeamInfo(bundle, 'b', t);
for (const p of league.game.teams[INT].players.slice(0, 5)) views[`player:${p.id}`] = projectPlayerInfo(bundle, 'a', p.id);

/** 文字列を全部なめる。`visit(文字列, 道筋)` */
function walk(value, path, visit) {
  if (typeof value === 'string') visit(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      visit(k, `${path}.{鍵}`);
      walk(v, `${path}.${k}`, visit);
    }
}
// お知らせの本文（そのとき届いた文）だけは旧名が残ってよい
const isInboxText = (path) => /\.inbox\[\d+\]\.text$/.test(path);
// 保存のうち、指導者になった時点の名前の控え（`origin.teamLabel`）は残ってよい。
// ⚠ 保存の形は変えず、出すときに内部名 `origin.team` から引き直す（`coaches.js` の `originText`）
const isKeptInSave = (path) => /^league\.coaches\.people\.[^.]+\.origin\.teamLabel$/.test(path);
const oldHits = [];
const findOld = (value, path) =>
  walk(value, path, (s, p) => {
    if (!isInboxText(p) && !isKeptInSave(p) && OLD_PARTS.some((part) => s.includes(part))) oldHits.push(`${p} = ${s.slice(0, 80)}`);
  });
findOld(league, 'league');
for (const [k, v] of Object.entries(views)) findOld(v, k);
assert.deepEqual(oldHits.slice(0, 10), [], `名前を変えたのに変える前の名前が残っている（${oldHits.length}か所）`);

// 内部名を埋め込んだ文（鍵そのもの・記録の選手キー「内部名:id:名前」は照合用なのでよい）
const sentenceHits = [];
for (const [k, v] of Object.entries(views))
  walk(v, k, (s, p) => {
    if (s === INT || s.startsWith(`${INT}:`) || isInboxText(p)) return;
    if (s.includes(INT)) sentenceHits.push(`${p} = ${s.slice(0, 80)}`);
  });
assert.deepEqual(sentenceHits.slice(0, 10), [], `ビューの文に内部名が入っている（画面で引き直せない。${sentenceHits.length}か所）`);
// 指導者の出身（保存は旧名の `teamLabel`。ビューはいまの名前で引き直す）
const card = JSON.stringify(views['league:a'].staff) + JSON.stringify(views[`team:${coach.job.team}`]?.staff || {});
assert.ok(card.includes(`元投手（${NEW_NAME}で3年）`), '指導者の出身の球団がいまの名前で出ない');

// 引退後の肩書きの球団（保存は内部名。ビューはいまの名前で引き直す）
const scout = views[`team:${INT}`]?.chronicle?.retired?.find((r) => r.name === '引退した人');
assert.equal(scout?.secondCareer, `${NEW_NAME}のスカウト`, '引退後の肩書きの球団がいまの名前で出ない');

// --- 5・6（後半）. Web の画面 ---
const FOLDS = ['face', 'milestones', 'moves', 'owners', 'proDrafted', 'records', 'retired', 'seasons', 'titles', 'topics'];
globalThis.localStorage = {
  getItem: (k) => (k === 'online.chronicle.open' ? JSON.stringify(FOLDS) : null),
  setItem() {},
  removeItem() {},
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const entry = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import DesktopView from '../../src/online/DesktopView.jsx';
import MobileView from '../../src/online/MobileView.jsx';
import LeagueHistory from '../../src/online/LeagueHistory.jsx';
import TeamAnalysis from '../../src/online/TeamAnalysis.jsx';
import Chronicle, { LeagueTopics } from '../../src/online/Chronicle.jsx';
import YearSummary from '../../src/online/YearSummary.jsx';
import { CareerLine } from '../../src/online/PlayerDetailBody.jsx';
import { abilityRows } from '../../src/online/playerInfo.js';
import { originOf } from '../../src/online/TryoutPlanner.jsx';
import { setTeamLabels } from '../../src/online/gameText.js';
import { Drafts } from '../../src/online/Drafts.jsx';
import { ReadContext } from '../../src/online/useRead.js';
export { React, renderToString, DesktopView, MobileView, LeagueHistory, TeamAnalysis, Chronicle, LeagueTopics, YearSummary, CareerLine, abilityRows, originOf, setTeamLabels, Drafts, ReadContext };
`;
const result = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'jsx' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.css': 'empty' },
  logLevel: 'error',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const dir = await mkdtemp(join(tmpdir(), 'pennant-rename-'));
const shown = [];
try {
  const file = join(dir, 'rename.mjs');
  await writeFile(file, result.outputFiles[0].text);
  const M = await import(pathToFileURL(file).href);
  const h = M.React.createElement;
  const noop = () => {};
  // 見える文字と、押す前に読める説明（title・aria-label）
  const texts = (html) => {
    html = html.replaceAll('<!-- -->', '');
    const attrs = [...html.matchAll(/(?:title|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]);
    return [...html.replace(/<[^>]+>/g, '\n').split('\n'), ...attrs].map((s) => s.trim()).filter(Boolean);
  };
  const bad = (label, html) => {
    const hits = texts(html).filter((s) => s.includes(INT) || OLD_PARTS.some((part) => s.includes(part)));
    if (hits.length) shown.push(`${label}: ${[...new Set(hits)].slice(0, 3).join(' / ')}`);
    return html;
  };
  // 画面は Strict Mode の警告（useLayoutEffect をサーバーで描いた）を出すので黙らせる
  const error = console.error;
  console.error = () => {};
  let pages = 0;
  try {
    for (const who of ['a', 'b']) {
      const view = views[`league:${who}`];
      M.setTeamLabels(view.teamLabels);
      // 読むだけの窓口（球団・取引・試合・選手）は、覚えている答え（peek）としてその場で返す
      const read = () => Promise.reject(new Error('検査では読まない'));
      read.peek = (action, q) => {
        try {
          if (action === 'team') return projectTeamInfo(bundle, who, q.team);
          if (action === 'transactions') return projectTransactions(bundle, who, q);
          if (action === 'games') return projectGames(bundle, who, q);
          if (action === 'player') return projectPlayerInfo(bundle, who, q.id);
        } catch {
          return undefined;
        }
        return undefined;
      };
      const render = (label, el) => {
        pages++;
        return bad(
          `${who} ${label}`,
          M.renderToString(h(M.ReadContext.Provider, { value: read }, h(M.Drafts, { scope: `rename:${label}` }, el))),
        );
      };
      const props = (tab) => ({
        view, tab, setTab: noop, reload: noop, reloadView: noop, showTimes: noop, auth: {}, busy: false,
        run: noop, command: noop, away: null, dismissAway: noop, invitesApi: {}, logout: noop,
      });
      for (const tab of ['today', 'analysis', 'chronicle', 'league', 'games', 'lineup', 'rotation', 'tactics', 'starters', 'staff', 'decisions', 'transfer', 'exhibition', 'admin'])
        render(`PC ${tab}`, h(M.DesktopView, props(tab)));
      for (const tab of ['today', 'games', 'players', 'staff', 'transfer', 'exhibition', 'news', 'lineup', 'decisions'])
        render(`スマホ ${tab}`, h(M.MobileView, props(tab)));
      for (const t of ['standings', 'pro', 'moves', 'careers', 'ability', 'honors'])
        render(`リーグ史 ${t}`, h(M.LeagueHistory, { view, initial: t }));
      for (const t of ['overview', 'lineup', 'defense', 'age', 'players', 'careers'])
        render(`チーム分析 ${t}`, h(M.TeamAnalysis, { view, initial: t, open: noop }));
      render('球団史', h(M.Chronicle, { view }));
      // 日本一決定戦（このリーグの球団が優勝した。上で作った）
      const topics = render('リーグの話題', h(M.LeagueTopics, { view, full: true }));
      assert.ok(topics.includes(`独立リーグ日本一は${NEW_NAME}`), '日本一決定戦の優勝がいまの名前で出ない');
      // その年のまとめ（相手の球団は内部名で来る）
      const summary = render(
        'その年のまとめ',
        h(M.YearSummary, {
          view: {
            ...view,
            yearSummary: {
              ...(view.yearSummary || {}),
              year: view.year - 1,
              standings: view.yearSummary?.standings || [],
              joined: [{ side: 'in', how: 'トレード', name: '来た人', position: 'pitcher', other: INT }],
              left: [{ side: 'out', how: 'トレード', name: '出た人', position: 'catcher', other: INT }],
              topics: [],
            },
          },
        }),
      );
      assert.ok(summary.includes(NEW_NAME), 'その年のまとめの相手がいまの名前で出ない');
      // 選手の経歴（内部名で記録している）と前所属
      const player = { ...view.roster[0], careerHistory: [{ type: 'independent', year: 1, label: INT }, { type: 'trade', year: 2, label: INT }], origin: { previousTeam: INT } };
      const detail = render('選手の経歴', h(M.CareerLine, { player }));
      assert.ok(detail.includes(NEW_NAME), '選手の経歴がいまの名前で出ない');
      const before = M.abilityRows(player, 'profile').find(([label]) => label === '前所属');
      assert.equal(before?.[1], NEW_NAME, '選手の詳細の前所属がいまの名前で出ない');
      assert.equal(M.originOf({ origin: { previousTeam: INT } }), `元${NEW_NAME}`, 'トライアウトの前所属がいまの名前で出ない');
    }
  } finally {
    console.error = error;
  }
  assert.deepEqual(shown, [], `画面に内部名か変える前の名前が出ている（${shown.length}画面）`);
  // 文の部品（アプリの写し元）
  assert.equal(originText(coach, (n) => teamLabelIn(league, n)), `元投手（${NEW_NAME}で3年）`);
  assert.equal(originText(coach), `元投手（${OLD_NAME}で3年）`, '引き直す手段が無いときは保存した名前');
  assert.equal(worldText(league.chronicle.world[0], (n) => n, (n) => teamLabelIn(league, n)).head, `独立リーグ日本一は${NEW_NAME}（このリーグ）`);
  console.log(`■ 球団名の変更のあとに旧名が残らない: OK（${days}日進めて名前を変え、保存とビュー${Object.keys(views).length}件・画面${pages}枚に旧名も内部名も出ない。お知らせの本文だけは当時の名前で残す）`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
