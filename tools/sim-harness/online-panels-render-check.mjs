// リーグ便り・順位表を、サーバー描画（renderToString）で実際に描いてみる検査。
//
// ⚠ **画面の部品は node から直接読めない**（JSX）。そのため、ここでは esbuild
//    （vite が使っているもの）で部品を1本にまとめてから読み込む。
// ⚠ 主目的は「**1年目の年度更新を越えても画面が落ちないこと**」。
//    年度更新で昇降格のお知らせ（`{ type: 'promotion', moves }`）が積まれるが、
//    リーグ便りが全件に `n.picks.length` を読んでいて TypeError で落ち、
//    PC・スマホとも「画面を表示できませんでした」だけになっていた。
//    ブラウザの検査は1年目の終わりまで進めないので、ここで部品を直接描く。
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  Notices,
  Standings,
  Results,
  formatDeadline,
} from '../../src/online/LeaguePanels.jsx';
import { formatTurn, turnLabel, turnOfDate } from '../../src/online/shared.js';
import { nextAdvanceText } from '../../src/online/api.js';
import DesktopTactics from '../../src/online/DesktopTactics.jsx';
import PackSelect from '../../src/online/PackSelect.jsx';
import { CompletedCamp } from '../../src/online/CampPlanner.jsx';
import { setTeamLabels } from '../../src/online/gameText.js';
import TryoutPlanner from '../../src/online/TryoutPlanner.jsx';
export {
  TryoutPlanner,
  React,
  renderToString,
  Notices,
  Standings,
  Results,
  DesktopTactics,
  formatDeadline,
  formatTurn,
  turnLabel,
  turnOfDate,
  nextAdvanceText,
  setTeamLabels,
  PackSelect,
  CompletedCamp,
};
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
  // react-dom/server が node の組み込み（stream など）を require するので通す
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
const dir = await mkdtemp(join(tmpdir(), 'pennant-panels-'));
try {
  const file = join(dir, 'panels.mjs');
  await writeFile(file, result.outputFiles[0].text);
  const {
    React,
    renderToString,
    Notices,
    Standings,
    formatDeadline,
    setTeamLabels,
    PackSelect,
    CompletedCamp,
    DesktopTactics,
    Results,
    formatTurn,
    turnLabel,
    turnOfDate,
    nextAdvanceText,
    TryoutPlanner,
  } = await import(pathToFileURL(file).href);
  const h = React.createElement;
  // React が文字の継ぎ目に入れる印（<!-- -->）を外して、見える文面で比べる
  const render = (element) => renderToString(element).replaceAll('<!-- -->', '');

  const completed = render(h(CompletedCamp, { view: {
    phase: null,
    roster: [{ id: 1, name: '練習した選手', position: 'short' }],
    lastCamp: {
      year: 2,
      rounds: 4,
      gains: { 1: { 'positionFitness.short': 8, 'personality.mental': 1 } },
      events: { 1: ['新球種を習得'] },
      last: { round: 4, gains: { 1: { 'personality.mental': 1 } }, events: {} },
    },
  } }));
  assert.match(completed, /2年目のキャンプ結果/, '手続き終了後の成果を表示できない');
  assert.match(completed, /遊撃適性\+8/, '通算の守備適性が成果に出ない');
  assert.match(completed, /精神\+1/, '通算の精神が成果に出ない');
  assert.match(completed, /新球種を習得/, '通算の出来事が成果に出ない');
  assert.equal(render(h(CompletedCamp, { view: { roster: [] } })), '', '記録の無い過去キャンプを表示した');

  // --- トライアウトの注意は文を句点で区切る（u1 低20） ----------------------
  // ⚠ 以前は行頭の全角空白で区切っていて、JSX がそれを落とすので
  //    「…4人未満ですこの位置は…」と文がつながって出ていた
  {
    const person = (id, position) => ({
      id,
      name: `選手${id}`,
      age: 20,
      position,
      batting: {},
      fielding: {},
      pitching: {},
    });
    const tryout = (roster, candidates, rankedIds) =>
      render(
        h(TryoutPlanner, {
          plan: { count: rankedIds.length, rankedIds },
          candidates,
          roster,
          maxCount: 5,
          busy: false,
          onChange: () => {},
          onReset: () => {},
        }),
      );
    // 野手9・投手1・捕手は候補から1人 → 決定はできるが、投・内・外が少ない（注意）
    const roster = [
      person(1, 'pitcher'),
      ...['first', 'second', 'third', 'short', 'left', 'center', 'right', 'first'].map(
        (pos, i) => person(10 + i, pos),
      ),
    ];
    const warned = tryout(roster, [person(100, 'catcher')], [100]);
    assert.match(
      warned,
      /投手が5人未満です。内野手が4人未満です。外野手が3人未満です。人数が足りない位置は自動で埋められます。/,
      'トライアウトの注意の文が句点で区切られていない',
    );
    // ⚠ 見出しの内訳は**獲得したあとの名簿**の人数で、目標（名簿全体）と比べる。
    //    以前は分子が獲得予定だけで「投0/11」と出て、あと11人取れるように読めた
    assert.match(
      warned,
      /獲得後の名簿 投1\/11 捕1\/2 内5\/6 外3\/7/,
      'トライアウトの内訳が獲得後の名簿の人数で出ていない',
    );
    // 名簿が空 → 決定できない（理由と、どうすればよいか）
    const blocked = tryout([], [person(100, 'catcher')], [100]);
    assert.match(
      blocked,
      /このままでは決定できません: [^<]*（8人以上必要）[^<]*。獲得希望人数を増やすか/,
      '決定できない理由と次の文が句点で区切られていない',
    );
  }

  setTeamLabels({
    宮崎アトラス: { label: '湘南サンズ', short: '湘南サ' },
    新潟ブルズ: { label: '新潟ブルズ', short: 'NB' },
  });

  // --- 昇降格のお知らせで落ちないこと ---------------------------------
  const view = {
    notices: [
      {
        type: 'promotion',
        year: 1,
        moves: [
          { teamId: '宮崎アトラス', from: 'B', to: 'A' },
          { teamId: '新潟ブルズ', from: 'A', to: 'B' },
        ],
      },
      {
        type: 'draft',
        year: 1,
        picks: [{ name: '指名選手', team: '宮崎アトラス', npbTeam: '東京', round: 1 }],
      },
    ],
    history: [],
  };
  let html = '';
  assert.doesNotThrow(() => {
    html = render(h(Notices, { view }));
  }, '昇降格のお知らせがあるとリーグ便りが落ちる');
  assert.match(html, /昇格・降格/, 'お知らせの見出しに種類が出ていない');
  assert.match(html, /2球団/, '昇降格の件数が出ていない');
  // 本文は付けた球団名（表示名）で出す。内部名は出さない
  assert.match(html, /湘南サンズ/, '昇格した球団の表示名が出ていない');
  assert.match(html, /2部 → 1部/, '移動の向きが出ていない');
  assert.match(html, /（昇格）/);
  assert.match(html, /（降格）/);
  assert.doesNotMatch(html, /宮崎アトラス/, '内部の球団名が出ている');
  // スマホ（compact）でも落ちない
  assert.doesNotThrow(() => renderToString(h(Notices, { view, compact: true })));
  // ⚠ 知らない種類のお知らせが来ても落とさない（種類を足したときの保険）
  assert.doesNotThrow(() =>
    renderToString(
      h(Notices, { view: { notices: [{ type: 'unknown', year: 2 }], history: [] } }),
    ),
  );

  // --- 順位表は部ごとに分けて出す ---------------------------------------
  const standings = [
    // ⚠ 2部の首位が全体の1位、という並び（実測で起きた形）
    { team: '宮崎アトラス', wins: 63, losses: 30, winRate: 0.677 },
    { team: '新潟ブルズ', wins: 50, losses: 43, winRate: 0.538 },
    { team: 'A2', wins: 40, losses: 53, winRate: 0.43 },
    { team: 'B2', wins: 30, losses: 63, winRate: 0.323 },
  ];
  const table = render(
    h(Standings, {
      view: {
        standings,
        teamName: '宮崎アトラス',
        teamLeagues: { 宮崎アトラス: 'B', B2: 'B', 新潟ブルズ: 'A', A2: 'A' },
      },
    }),
  );
  assert.ok(
    table.indexOf('1部') >= 0 && table.indexOf('1部') < table.indexOf('2部'),
    '1部・2部の見出しが無いか、順番が逆',
  );
  assert.ok(
    table.indexOf('新潟ブルズ') < table.indexOf('湘南サンズ'),
    '1部の表より先に2部の球団が出ている',
  );
  assert.match(table, /昇格圏/, '2部の1位に昇格圏の印が無い');
  assert.match(table, /降格圏/, '1部の最下位に降格圏の印が無い');
  // ⚠ 同率のときは、昇降格を決める順（勝率→勝利数→球団名）で並べる。
  //    全体の並びのまま出すと、昇格圏の印と実際に昇格する球団が食い違っていた
  const tied = render(
    h(Standings, {
      view: {
        standings: [
          { team: 'Z球団', wins: 40, losses: 30, winRate: 40 / 70 },
          { team: 'C球団', wins: 40, losses: 30, winRate: 40 / 70 },
        ],
        teamName: 'x',
        teamLeagues: { Z球団: 'B', C球団: 'B' },
      },
    }),
  );
  assert.ok(tied.indexOf('C球団') < tied.indexOf('Z球団'), '同率の並びが昇降格の判定と違う');
  // 部の情報が無い古いビューでは、従来どおり1つの表で出す（落ちない）
  assert.doesNotThrow(() =>
    renderToString(h(Standings, { view: { standings, teamName: 'x' } })),
  );

  // --- 始める手順（セットを選ぶ → 名前 → 決定） -------------------------
  // ⚠ **名前を決める欄が出ること**。`PackSelect` は `view` と `command` を
  //    受け取れなかったら欄ごと出さないので、親が渡し忘れても画面は
  //    操作できたまま、名前だけ付けられない状態になる（気づけない）。
  {
    const pack = {
      id: 'pack-1',
      name: 'セット1',
      counts: { pitcher: 12, catcher: 2, infield: 6, outfield: 4 },
      twoWay: 2,
      averageAge: 21.5,
      players: [
        {
          id: 1,
          name: '試験 太郎',
          rank: 'A',
          age: 21,
          position: 'pitcher',
          isTwoWay: false,
          batting: { meet: 40, power: 40 },
          physical: { speed: 50 },
          fielding: { defense: 50 },
          pitching: { velocity: 140, control: 50 },
        },
      ],
    };
    const packView = {
      teamName: '宮崎アトラス',
      members: [
        { teamName: '宮崎アトラス', displayName: '湘南サンズ', label: '管理者' },
      ],
    };
    const html = render(
      h(PackSelect, {
        packs: [pack],
        plan: null,
        busy: false,
        onChange: () => {},
        view: packView,
        run: () => {},
        command: () => {},
      }),
    );
    assert.match(html, /球団名とプレイヤー名/, '名前を決める欄が出ていない');
    assert.match(html, /この名前にする/, '名前を保存するボタンが無い');
    // ⚠ 保存済みの名前が入っていること（空欄だと毎回打ち直しになる）
    assert.match(html, /value="湘南サンズ"/, '保存済みの球団名が入っていない');
    assert.match(html, /value="管理者"/, '保存済みのプレイヤー名が入っていない');
    // ⚠ **名前はセットの下**。手順が「セットを選ぶ → 名前 → 決定」なので、
    //    上に置くと名前から始まることになる
    assert.ok(
      html.indexOf('online-pack-list') < html.indexOf('online-identity'),
      '名前の欄がセットより上にある',
    );
    // ⚠ 渡されなかったときは欄を出さない
    const bare = render(
      h(PackSelect, { packs: [pack], plan: null, busy: false, onChange: () => {} }),
    );
    assert.doesNotMatch(bare, /球団名とプレイヤー名/, '渡していないのに欄が出る');

    // ⚠ **親が渡し忘れていないこと**を、呼び出し元の字面で見る。
    //    部品だけ描いても親の渡し忘れは写らない。渡し忘れると欄が黙って
    //    消えるだけで、画面は操作できたまま名前が付けられない
    //    （`CLAUDE.md` の「引けないと戻るだけ」と同じ落とし穴）。
    //    `PhasePanel` 自体は下書きの保存や通信を抱えていて素で描けないので、
    //    ここは字面で押さえる。
    const panels = await readFile(
      join(here, '..', '..', 'src', 'online', 'LeaguePanels.jsx'),
      'utf8',
    );
    const call = panels.slice(
      panels.indexOf('<PackSelect'),
      panels.indexOf('/>', panels.indexOf('<PackSelect')),
    );
    assert.ok(call, '`PackSelect` を呼んでいる所が見つからない');
    for (const prop of ['view=', 'run=', 'command='])
      assert.ok(
        call.includes(prop),
        `PackSelect に ${prop} を渡していない（名前の欄が黙って消える）`,
      );
  }

  // --- 方針・采配（PC。`DesktopTactics`） ---------------------------------
  // ⚠ **打順・守備・先発・投手の役割をここに残さないこと**。移植した
  //    「スタメン設定／投手起用／守備分析」と丸ごと被り、同じことを2か所で
  //    設定できる状態になる（どちらが効くのか分からない）。
  {
    const lineupView = {
      teamName: '宮崎アトラス',
      roster: [
        {
          id: 1, name: '投手 一郎', position: 'pitcher', age: 24, fatigue: 0,
          pitching: { velocity: 140, control: 50, stamina: 50 },
        },
        {
          id: 2, name: '野手 二郎', position: 'left', age: 23, fatigue: 0,
          batting: { meet: 50, power: 50 },
        },
      ],
      lineup: {
        battingOrder: [{ playerId: 2, battingOrder: 1, position: 'left' }],
        starters: [1],
        strategy: {},
        pitcherRoles: {},
        autoTactics: {},
      },
    };
    const html = render(
      h(DesktopTactics, {
        view: lineupView,
        busy: false,
        run: () => {},
        command: () => {},
      }),
    );
    assert.match(html, /方針・采配/, '見出しが変わっていない');
    assert.match(html, /基本方針/, '基本方針が出ていない');
    assert.match(html, /自動采配/, '自動采配が出ていない');
    // ⚠ 区分の切り替え（タブ）を置かない。項目は2つだけなので要らない。
    //    ボタンを並べた選択肢（`Choice`）は `online-segments` を使うので、
    //    **どの並びも選択肢の中にある**ことで見る
    const segments = html.match(/class="online-segments"/g)?.length ?? 0;
    const choices = html.match(/class="online-choice"/g)?.length ?? 0;
    assert.ok(choices > 0, '選択肢がボタンで出ていない');
    assert.equal(segments, choices, '区分の切り替えが残っている');
    // ⚠ スタメン設定と被る**操作**を出さない。文面での案内は残してよい
    //    （「打順は『スタメン設定』で」と書いてある）ので、見出しと部品で見る
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
    assert.deepEqual(
      headings,
      ['基本方針', '自動采配'],
      `小見出しがちがう: ${headings.join('・')}`,
    );
    // 打順の行・先発のチェック欄そのものを出さない（PCは移植画面で設定する）
    assert.doesNotMatch(html, /class="online-lineup"/, 'PCに打順の行が残っている');
    assert.doesNotMatch(html, /online-check-info/, 'PCに先発のチェック欄が残っている');
  }

  // --- 進行はターンで出す（ゲーム内の日付を出さない） ---------------------
  // ⚠ オンラインは**ターンで進む**（1ターン＝実時間1時間＝ゲーム内1日）。
  //    ゲーム内の日付は進行の副産物でしかなく、出すと「4/18って何試合目？」と
  //    数え直すことになる。
  // ⚠ 実時間の締め切り（`formatDeadline`）は別もの。こちらは消さない——
  //    次にいつ進むかが分からなくなる。
  {
    assert.equal(
      turnOfDate({ year: 2024, month: 4, day: 1 }),
      1,
      '開幕が第1ターンでない',
    );
    assert.equal(turnOfDate({ year: 2024, month: 4, day: 18 }), 18);
    // ⚠ 数は**そのまま書く**（`SEASON_TURNS` から導くと何も確かめない）。
    //    ターン数を変えたらここも直す: 160ターンなら 4/1 の159日後＝9/7 が最終
    assert.equal(
      turnOfDate({ year: 2024, month: 9, day: 7 }),
      160,
      '最終ターンがちがう',
    );
    assert.equal(
      turnOfDate({ year: 2024, month: 9, day: 8 }),
      null,
      '範囲の外を数えている',
    );
    // ⚠ **「次の進行」は、時刻が無い理由まで書くこと**。手続き中は進行の時刻を
    //    持たない（決定で動く）ので、止まっているのと同じ「停止中」と出ていた。
    //    実際に「再開はどこ？」と聞かれた——止まっていないのに探すことになる
    assert.equal(
      nextAdvanceText({ nextAdvanceAt: null, phase: { kind: 'camp' } }),
      '手続きの決定待ち',
    );
    assert.equal(
      nextAdvanceText({ nextAdvanceAt: null, phase: null }),
      '停止中',
    );
    assert.match(
      nextAdvanceText({ nextAdvanceAt: '2026-11-08T03:45:00.000Z', phase: null }),
      /11\/8/,
      '時刻があるのに出していない',
    );
    // ⚠ 手続き中でも**時刻があるならそちらを出す**（決定後に再開した直後など）
    assert.match(
      nextAdvanceText({
        nextAdvanceAt: '2026-11-08T03:45:00.000Z',
        phase: { kind: 'camp' },
      }),
      /11\/8/,
      '時刻があるのに決定待ちと出している',
    );
    assert.match(formatTurn({ year: 2024, month: 1, day: 1 }), /開幕前/);
    // ⚠ 一覧は総数（/160）を出さない。6試合並ぶと同じ数字が6回出る
    assert.equal(turnLabel({ year: 2024, month: 4, day: 18 }), '第18ターン');
    assert.equal(formatTurn({ year: 2024, month: 4, day: 18 }), '第18ターン / 160');
    // ⚠ **総数は渡した値で出すこと**。進行中のリーグ（120ターンの日程）に
    //    新しい総数を当てると、日程に無い「第121ターン / 160」が出る
    assert.equal(
      formatTurn({ year: 2024, month: 4, day: 18 }, 120),
      '第18ターン / 120',
    );
    assert.equal(turnOfDate({ year: 2024, month: 9, day: 7 }, 120), null);
    assert.match(formatTurn({ year: 2024, month: 11, day: 10 }), /シーズン終了/);

    const resultsView = {
      teamName: '宮崎アトラス',
      results: [
        {
          gameId: 1,
          date: { year: 2024, month: 4, day: 18 },
          home: '宮崎アトラス',
          away: '新潟ブルズ',
          homeScore: 3,
          awayScore: 1,
          decisions: null,
        },
      ],
      upcoming: [],
    };
    const html = render(h(Results, { view: resultsView }));
    assert.match(html, /第18ターン/, '試合結果にターンが出ていない');
    // ⚠ ゲーム内の日付を出さない
    assert.doesNotMatch(html, /4\/18/, '試合結果にゲーム内の日付が出ている');
  }

  // --- 締め切りの表示（日本時間） ---------------------------------------
  assert.equal(formatDeadline('2026-11-07T15:00:00.000Z'), '11/8(日) 0:00');

  // --- 操作が済んだときの文（`OnlineApp.jsx` の `COMMAND_MESSAGES`） ------------
  // ⚠ **サーバーが受ける命令ごとに文があること**。無いと「保存しました」だけになり、
  //    決定したのか下書きなのか、トレードが成立したのか申し込んだだけなのか分からなかった。
  //    文の表は画面の部品の中にあるので、字面で押さえる
  {
    const service = await readFile(join(here, '..', '..', 'server', 'leagueService.mjs'), 'utf8');
    const app = await readFile(join(here, '..', '..', 'src', 'online', 'OnlineApp.jsx'), 'utf8');
    const types = [...new Set([...service.matchAll(/command\.type === '([a-zA-Z]+)'/g)].map((m) => m[1]))];
    const table = app.slice(app.indexOf('const COMMAND_MESSAGES = {'), app.indexOf('\n};', app.indexOf('const COMMAND_MESSAGES = {')));
    assert.ok(types.length > 10 && table, '命令の一覧か文の表が見つからない');
    const missing = types.filter((type) => !new RegExp(`^  ${type}:`, 'm').test(table));
    assert.deepEqual(missing, [], `済んだときの文が無い命令がある（「保存しました」だけになる）: ${missing.join(', ')}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  '■ 画面の描画: OK（昇降格のお知らせで落ちない / 表示名で出す / 順位表を部ごとに分ける / 締め切りを日本時間で出す / 進行をターンで出す / セットの下に名前を決める欄が出る / 方針・采配は2項目だけ / どの命令にも済んだときの文がある / トライアウトの注意の文を句点で区切る / 内訳は獲得後の名簿の人数）',
);
