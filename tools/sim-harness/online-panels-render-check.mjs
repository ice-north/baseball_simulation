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
import { delegationSettles, staffModesDoneText } from '../../src/online/notices.js';

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
import CampPlanner, { CompletedCamp, subTargetChoices } from '../../src/online/CampPlanner.jsx';
import { setTeamLabels } from '../../src/online/gameText.js';
import TryoutPlanner from '../../src/online/TryoutPlanner.jsx';
import { LeagueTopics } from '../../src/online/Chronicle.jsx';
export {
  TryoutPlanner,
  LeagueTopics,
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
  CampPlanner,
  subTargetChoices,
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
    CampPlanner,
    subTargetChoices,
    DesktopTactics,
    Results,
    formatTurn,
    turnLabel,
    turnOfDate,
    nextAdvanceText,
    TryoutPlanner,
    LeagueTopics,
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

  // ⚠ 指導者の案・締め切りの標準案の方針は `{ mode: 'recommended' }` だけで、方向と段階を
  //    持たない。そこから「全員同じ方針」に切り替えた状態（方向・段階の無い mode: 'team'）で、
  //    説明が「undefined／undefined」になり、方針のボタンがどれも選ばれていなかった
  const campPlanner = render(h(CampPlanner, {
    view: {
      phase: { id: 'camp-check', kind: 'camp', camp: { rounds: 0, total: 4, plan: { policy: { mode: 'team' } } } },
      roster: [
        { id: 1, name: '野手の選手', position: 'short' },
        { id: 2, name: '投手の選手', position: 'pitcher' },
      ],
    },
    busy: false,
    run: () => {},
    command: () => {},
  }));
  assert.doesNotMatch(campPlanner, /undefined/, 'キャンプの方針の説明に undefined が出る');
  assert.match(campPlanner, /aria-pressed="true"[^>]*>[^<]*全体を伸ばす/, '方向の無い方針で育成方針のボタンがどれも選ばれていない');
  // 「おすすめ」（選手ごと）のときに「いまは『全体を伸ばす×技術』です」と出さない
  const recommendedCamp = render(h(CampPlanner, {
    view: {
      phase: { id: 'camp-check-rec', kind: 'camp', camp: { rounds: 0, total: 4, suggested: { policy: { mode: 'recommended' } } } },
      roster: [{ id: 1, name: '野手の選手', position: 'short' }],
    },
    busy: false,
    run: () => {},
    command: () => {},
  }));
  assert.doesNotMatch(recommendedCamp, /いまは「全体を伸ばす×技術」です/, '選手ごとの決め方なのに全員同じ方針の説明が出る');

  // ⚠ 球団史・リーグの話題の年は「N年目」。「2年」だと西暦や在籍年数に読める。
  //    節目は月日だけでなく年も出す（何年目の話か分からなかった）
  const topics = render(
    h(LeagueTopics, {
      view: {
        races: [],
        chronicle: {
          milestones: [{ year: 2, month: 5, day: 3, name: '節目の選手', team: 'x', kind: 'career', label: '通算100安打' }],
          world: [{ year: 2, kind: 'koshien', champion: '優勝校', runnerUp: '準優勝校' }],
        },
      },
    }),
  );
  assert.match(topics, /2年目 5月3日 節目の選手/, '節目に年が出ない');
  assert.match(topics, /2年目 夏の甲子園/, '裏の大会の年が「N年目」でない');
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
    // 野手8・投手1・捕手は候補から1人 → 決定はできるが、獲得後も投手が少ない（注意）
    const roster = [
      person(1, 'pitcher'),
      ...['first', 'second', 'third', 'short', 'left', 'center', 'right', 'first'].map(
        (pos, i) => person(10 + i, pos),
      ),
    ];
    const warned = tryout(roster, [person(100, 'catcher')], [100]);
    assert.match(
      warned,
      /獲得後も投手が5人未満です。人数が足りない位置は自動で埋められます。/,
      'トライアウトの注意が出ない',
    );
    // ⚠ **注意も獲得したあとの名簿で数える**（再監査 B3）。以前は獲得予定（捕手1人）だけを
    //    数えて、名簿に内野5人・外野3人いても「内野手が4人未満です」と出ていた
    assert.doesNotMatch(
      warned,
      /内野手が4人未満|外野手が3人未満/,
      'トライアウトの注意が獲得予定だけを数えている（名簿に足りている区分にも出る）',
    );
    // 3つ出るときは句点で区切る
    const thin = [
      person(1, 'pitcher'),
      ...['catcher', 'first', 'second', 'third', 'left', 'center'].map((pos, i) =>
        person(10 + i, pos),
      ),
    ];
    assert.match(
      tryout(thin, [person(100, 'catcher'), person(101, 'catcher')], [100, 101]),
      /獲得後も投手が5人未満です。獲得後も内野手が4人未満です。獲得後も外野手が3人未満です。人数が足りない位置は自動で埋められます。/,
      'トライアウトの注意の文が句点で区切られていない',
    );
    // 年末のふつうの名簿（投8・捕2・内4・外4）に、投3・内2を足す案では注意を出さない
    const yearEnd = [
      ...Array.from({ length: 8 }, (_, i) => person(200 + i, 'pitcher')),
      ...['catcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right', 'left'].map(
        (pos, i) => person(220 + i, pos),
      ),
    ];
    const picks = [
      person(300, 'pitcher'),
      person(301, 'pitcher'),
      person(302, 'pitcher'),
      person(303, 'second'),
      person(304, 'short'),
    ];
    const usual = tryout(yearEnd, picks, picks.map((p) => p.id));
    assert.match(usual, /獲得後の名簿 投11\/11 捕2\/2 内6\/6 外4\/7/, '前提: 獲得後の名簿の内訳');
    assert.doesNotMatch(usual, /未満です/, 'ふつうの年末の案に「投手が5人未満です」などの注意が出る');
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

  // --- 新球種の対象に「おすすめ」の印が付く ------------------------------
  // ⚠ **覚えやすさは球種の名前から分からない**（いしだ指摘: おすすめ球種が
  //    表示されない）。フォーム適性（`FORM_PITCH_AFFINITY`）と緩急の補完
  //    （`secondAffinity`）で成功率が変わるので、一人用のキャンプ画面と
  //    同じ印を添える（★フォーム適性 / ◆緩急適性）。
  {
    // アンダースローはシンカーに適性がある（`FORM_PITCH_AFFINITY.submarine`）
    const player = {
      id: 1,
      name: '検査投手',
      position: 'pitcher',
      pitching: {
        form: 'submarine',
        secondAffinity: 'curve',
        arsenal: [{ type: 'straight', level: 50 }],
      },
    };
    const labels = Object.fromEntries(subTargetChoices('newpitch', player));
    assert.ok(labels.sinker?.includes('★'), `フォーム適性の印が無い: ${labels.sinker}`);
    assert.ok(labels.curve?.includes('◆'), `緩急適性の印が無い: ${labels.curve}`);
    assert.ok(
      !labels.cutter?.includes('★') && !labels.cutter?.includes('◆'),
      `適性の無い球種に印が付いている: ${labels.cutter}`,
    );
    // ⚠ 持っている球種は新球種の対象に出さない（選んでも1クール捨てる）
    const owned = {
      ...player,
      pitching: {
        ...player.pitching,
        arsenal: [
          { type: 'straight', level: 50 },
          { type: 'sinker', level: 40 },
        ],
      },
    };
    assert.ok(
      !subTargetChoices('newpitch', owned).some(([k]) => k === 'sinker'),
      '持っている球種を新球種の対象に出している',
    );
  }

  // --- ホームの「リーグの話題」は件数に上限がある ----------------------
  // ⚠ ホームは1画面（1000px）に収める決まりで、右の列は順位表とこのカードだけ。
  //    ここが件数ぶん伸びると順位表ごと画面から出る
  //    （実測: 話題1件で898px、3件で1046px）。続きは「球団史・記録」で読める。
  // ⚠ ブラウザの検査（`online-lineup-board-ui-check` の「ホームが縦に長い」）でも
  //    捕まえるが、そちらは落ちても原因が分からない。ここで件数を直に見る
  {
    const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
    const topics = render(
      h(LeagueTopics, {
        view: {
          teamName: '宮崎アトラス',
          races: many(6, (i) => ({
            kind: 'first',
            team: '宮崎アトラス',
            rival: '新潟ブルズ',
            leagueName: '1部',
            magic: 10 + i,
            left: 5,
          })),
          chronicle: {
            milestones: many(6, (i) => ({
              year: 2,
              team: '宮崎アトラス',
              name: `選手${i}`,
              kind: 'homerun',
              value: 100 + i,
            })),
            world: many(6, (i) => ({
              year: 2,
              kind: 'koshien',
              champion: `高校${i}`,
              championPref: '東京',
              runnerUp: '準優勝校',
            })),
          },
        },
      }),
    );
    const articles = (topics.match(/<article/g) || []).length;
    assert.ok(
      articles > 0,
      'リーグの話題が1件も出ていない（上限で全部落としている）',
    );
    // ⚠ 3つの区分（マジック・節目・球界の外）に6件ずつ＝18件渡している。
    //    上限が効いていれば区分ごとに2件まで＝6件に収まる
    assert.ok(
      articles <= 6,
      `リーグの話題の件数に上限が無い: ${articles}件（18件渡した）`,
    );
    assert.match(topics, /球団史・記録/, '続きの案内が出ていない');
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
    // ⚠ **説明の年齢の幅はセットの中身から**（版3で19〜32歳に広げたとき、「19〜24歳」のまま残った）
    assert.match(bare, /年齢は21〜21歳です/, '説明の年齢の幅がセットの中身と違う');
    const wide = {
      ...pack,
      players: [
        { ...pack.players[0], id: 2, age: 19 },
        { ...pack.players[0], id: 3, age: 32 },
      ],
    };
    assert.match(
      render(h(PackSelect, { packs: [wide], plan: null, busy: false, onChange: () => {} })),
      /年齢は19〜32歳です/,
      '19〜32歳のセットなのに説明の年齢の幅が違う',
    );

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

  // --- 最後の1人が手続きを任せるときの確認と知らせ（再監査 A2。`notices.js`）------------
  // ⚠ サーバーは待たれている最後の1人が手続きの分野を「任せる」にした瞬間に手続きを進める
  //    （`updateStaffModes`）。画面はその条件のときだけ保存の前に確認を挟む
  {
    const view = (kind, members, phase = {}) => ({
      teamName: 'A',
      phase: { id: `1:${kind}`, kind, ...phase },
      members: members.map(([teamName, flags]) => ({ teamName, ...flags })),
    });
    const others = [['B', { ready: true }], ['C', { cpu: true }], ['D', { ready: true, delegated: true }]];
    assert.equal(
      delegationSettles(view('tryout', [['A', {}], ...others]), { tryout: 'delegate' }),
      'トライアウト',
      'ほかが全員決めているのに、任せる前の確認を出さない',
    );
    assert.equal(delegationSettles(view('contract', [['A', {}]]), { release: 'delegate' }), '契約更改', '1人リーグの契約更改');
    assert.equal(delegationSettles(view('camp', [['A', {}]]), { camp: 'delegate', tactics: 'delegate' }), 'キャンプ');
    // 決まらない変更には出さない
    assert.equal(delegationSettles(view('tryout', [['A', {}], ['B', {}]]), { tryout: 'delegate' }), null, 'ほかに決めていない人がいるのに確認を出す');
    assert.equal(delegationSettles(view('tryout', [['A', {}]]), { release: 'delegate' }), null, '手続きと関係の無い分野で確認を出す');
    assert.equal(delegationSettles(view('tryout', [['A', {}]]), { tryout: 'advice' }), null);
    assert.equal(delegationSettles(view('tryout', [['A', { ready: true }]]), { tryout: 'delegate' }), null, '決定済みの人に確認を出す');
    assert.equal(delegationSettles(view('tryout', [['A', { ready: true, delegated: true }]], { delegated: true }), { tryout: 'delegate' }), null);
    assert.equal(delegationSettles(view('offseason', [['A', {}]]), { tryout: 'delegate' }), null);
    assert.equal(delegationSettles({ teamName: 'A', members: [] }, { tryout: 'delegate' }), null, '手続きが無いときに確認を出す');
    // 知らせ: 手続きが終わったときだけ言い分ける
    const before = view('tryout', [['A', {}]]);
    assert.equal(
      staffModesDoneText({ modes: { tryout: 'delegate' } }, before, { phase: null }),
      '任せ方を変えました。トライアウトは指導者の案で決まりました',
    );
    assert.equal(staffModesDoneText({ modes: { tryout: 'delegate' } }, before, before), '任せ方を変えました');
    assert.equal(staffModesDoneText({ modes: { lineup: 'delegate' } }, before, { phase: null }), '任せ方を変えました');
    assert.equal(staffModesDoneText({ modes: { tryout: 'delegate' } }, { phase: null }, { phase: null }), '任せ方を変えました');
  }

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
  '■ 画面の描画: OK（昇降格のお知らせで落ちない / 表示名で出す / 順位表を部ごとに分ける / 締め切りを日本時間で出す / 進行をターンで出す / セットの下に名前を決める欄が出る / 方針・采配は2項目だけ / どの命令にも済んだときの文がある / トライアウトの注意の文を句点で区切る / 内訳と注意は獲得後の名簿の人数 / 最後の1人が任せる前の確認 / ホームのリーグの話題に件数の上限がある / 新球種の対象におすすめの印が付く）',
);
