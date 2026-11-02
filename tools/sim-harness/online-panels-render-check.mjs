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
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Notices, Standings, formatDeadline } from '../../src/online/LeaguePanels.jsx';
import { setTeamLabels } from '../../src/online/gameText.js';
export { React, renderToString, Notices, Standings, formatDeadline, setTeamLabels };
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
  const { React, renderToString, Notices, Standings, formatDeadline, setTeamLabels } =
    await import(pathToFileURL(file).href);
  const h = React.createElement;
  // React が文字の継ぎ目に入れる印（<!-- -->）を外して、見える文面で比べる
  const render = (element) => renderToString(element).replaceAll('<!-- -->', '');

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
  // 部の情報が無い古いビューでは、従来どおり1つの表で出す（落ちない）
  assert.doesNotThrow(() =>
    renderToString(h(Standings, { view: { standings, teamName: 'x' } })),
  );

  // --- 締め切りの表示（日本時間） ---------------------------------------
  assert.equal(formatDeadline('2026-11-07T15:00:00.000Z'), '11/8(日) 0:00');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  '■ リーグ便り・順位表の描画: OK（昇降格のお知らせで落ちない / 表示名で出す / 順位表を部ごとに分ける / 締め切りを日本時間で出す）',
);
