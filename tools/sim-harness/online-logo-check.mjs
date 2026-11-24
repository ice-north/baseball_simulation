// 球団ロゴの検査（部品の表・型・おまかせ・保存の確かめ・ビュー）。
//   node tools/sim-harness/online-logo-check.mjs
//
// ⚠ 見るのは**壊れると気づきにくい性質**だけ（絵の出来は画面写真で見る。`online-logo-ui-check`）:
//    - 絵の名前の表（`logoMotifs.js`）と絵の形（`public/look/logo-icons.json`）が同じ名前を持つ
//      （片方だけ足すと、その絵を選んだロゴが黙って欠ける）
//    - 愛称の一覧（`pyramidLeague.js`）の全部に、合う絵が割り当ててある
//    - どの型・台座・書体・配色でも、描く手順の数字がすべて有限で、部品が8枚（小さい版は4枚）に収まり、
//      保存の確かめ（`cleanLogo`）を通る（＝画面で作れるロゴは必ず保存できる）
//    - おまかせの候補は同じ球団なら毎回同じ（サーバーと画面が同じ自動のロゴを出す）
//    - 保存の確かめは、知らない部品・壊れた数・長すぎる字・大きすぎるロゴを通さない
//    - 保存と取り消し（`applyProfile`）、球団を手放す・新しい人が入るとロゴが消える
//    - ビューの `teamLabels` に12球団ぶんのロゴと色が載り、画面の球団の色が選んだ色になる
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NICKNAMES, generatePyramidTeams } from '../../src/online/pyramidLeague.js';
import { buildTeamLooks, nameSource } from '../../src/online/look/teamLook.js';
import {
  LOGO_SHAPES,
  LOGO_BASES,
  LOGO_FONTS,
  LOGO_LATIN_FONTS,
  LOGO_MAX_LAYERS,
  LOGO_MINI_MAX_LAYERS,
  LOGO_TEXT_MAX,
  charWidth,
  logoColors,
} from '../../src/online/look/logoParts.js';
import { NICK_MOTIFS, GENERIC_MOTIFS, LOGO_ICON_NAMES, isLogoIcon, motifsFor } from '../../src/online/look/logoMotifs.js';
import {
  LOGO_TEMPLATE_KEYS,
  LOGO_MINI_KINDS,
  logoSchemes,
  logoCandidates,
  logoFromRecipe,
  buildLogoLayers,
  buildLogoMini,
  autoLogo,
  logoTeam,
  normalRecipe,
} from '../../src/online/look/logoBuild.js';
import { cleanLogo, cleanLogoColors, openLayer, LOGO_MAX_CHARS } from '../../src/online/look/logoData.js';
import { logoArt, logoNeedsIcons, logoLayersFor, LOGO_BOX, LOGO_MINI_SIZE } from '../../src/online/look/logoArt.js';
import { attachTeamLogos } from '../../src/online/look/teamLogo.js';
import { applyProfile, applyJoin } from '../../src/online/membership.js';
import { seasonService } from './lib/serviceRoute.mjs';

// --- 絵の表と絵の形 ----------------------------------------------------------
const icons = JSON.parse(await readFile(new URL('../../public/look/logo-icons.json', import.meta.url), 'utf8'));
assert.deepEqual(Object.keys(icons).sort(), [...LOGO_ICON_NAMES].sort(), '絵の名前の表と絵の形の名前が食い違っている（tools/logo-icons.mjs で書き出し直す）');
assert.equal(new Set(LOGO_ICON_NAMES).size, LOGO_ICON_NAMES.length, '絵の名前が重複している');
for (const [name, d] of Object.entries(icons)) {
  assert.match(d, /^[Mm][0-9MmLlHhVvCcSsQqTtAaZz .,-]+$/, `絵の形に知らない字がある: ${name}`);
  assert.ok(d.length < 9000, `絵の形が大きすぎる: ${name}（${d.length}字）`);
}
assert.ok(isLogoIcon('baseball-bat'), '確かめで使う既定の絵が表に無い');
assert.ok(!isLogoIcon('constructor') && !isLogoIcon('__proto__') && !isLogoIcon(''), '表に無い名前を絵として通した');
for (const nick of NICKNAMES) {
  const list = NICK_MOTIFS[nick];
  assert.ok(list?.length, `愛称に絵が割り当てていない: ${nick}`);
  for (const m of list) assert.ok(isLogoIcon(m), `${nick} の絵 ${m} が表に無い`);
}
assert.equal(Object.keys(NICK_MOTIFS).length, NICKNAMES.length, '絵の割り当てに、一覧に無い愛称がある');
for (const m of GENERIC_MOTIFS) assert.ok(isLogoIcon(m), `どの球団でも使う絵 ${m} が表に無い`);
// 一覧に無い愛称（人が付けた名前）は、どの球団でも使う絵から3つ。同じ名前なら毎回同じ
assert.deepEqual(motifsFor('ほげほげ', 'A'), motifsFor('ほげほげ', 'A'));
assert.equal(motifsFor('ほげほげ', 'A').length, 3);
// 字の幅の表は 0x20〜0x7E の95字ぶん
for (const font of LOGO_LATIN_FONTS) {
  assert.ok(Object.hasOwn(LOGO_FONTS, font));
  for (let code = 0x20; code <= 0x7e; code++) {
    const w = charWidth(String.fromCodePoint(code), font);
    assert.ok(w > 0.1 && w < 1.3, `${font} の字の幅がおかしい: ${String.fromCodePoint(code)} = ${w}`);
  }
}
assert.equal(charWidth('あ', 'graduate'), 1);

// --- 描く手順 ---------------------------------------------------------------
const labelsOf = (teams) =>
  Object.fromEntries(teams.map((t) => [t.name, { label: t.name, city: t.city, nickname: t.name.slice(t.city.length) }]));
const teamsOf = (labels) => {
  const looks = buildTeamLooks(labels);
  return Object.keys(labels).map((name) => logoTeam(looks[name], nameSource(name, labels[name]), labels[name].nickname));
};
/** 描く手順の数字がすべて有限で、字が空でない */
function assertArt(art, what) {
  assert.deepEqual(art.box, LOGO_BOX);
  assert.ok(art.items.length >= 1, `${what}: 何も描いていない`);
  for (const item of art.items) {
    assert.equal(item.tf.length, 7, what);
    for (const v of item.tf) assert.ok(Number.isFinite(v), `${what}: 変形に数でないものがある ${JSON.stringify(item.tf)}`);
    assert.ok(item.fill || item.stroke, `${what}: 色が無い`);
    for (const c of [item.fill, item.stroke]) if (c) assert.match(c, /^#[0-9a-f]{6}$/, `${what}: 色 ${c}`);
    if (item.sw !== undefined) assert.ok(Number.isFinite(item.sw) && item.sw > 0, `${what}: 線の太さ ${item.sw}`);
    if (item.t === 'text') {
      assert.ok(item.text.trim(), `${what}: 空の字`);
      assert.ok(Number.isFinite(item.size) && item.size > 0 && Number.isFinite(item.y), what);
      assert.ok(Object.hasOwn(LOGO_FONTS, item.font), `${what}: 書体 ${item.font}`);
    } else {
      assert.equal(item.t, 'path', what);
      assert.ok(typeof item.d === 'string' && /^[Mm]/.test(item.d), `${what}: 形が無い`);
    }
  }
}
/** 画面で作れるロゴは、そのまま保存の確かめを通る（通ったあとも同じ絵になる） */
function assertSavable(team, logo, what) {
  assert.ok(logo.layers.length >= 1 && logo.layers.length <= LOGO_MAX_LAYERS, `${what}: 部品 ${logo.layers.length} 枚`);
  if (logo.mini) assert.ok(logo.mini.length >= 1 && logo.mini.length <= LOGO_MINI_MAX_LAYERS, `${what}: 小さい版 ${logo.mini.length} 枚`);
  const cleaned = cleanLogo({ ...logo, colors: team.colors });
  assert.ok(cleaned, `${what}: 保存の確かめを通らない`);
  assert.deepEqual(logoArt(cleaned.layers, team.colors, icons), logoArt(logo.layers, team.colors, icons), `${what}: 確かめを通すと絵が変わる`);
  if (logo.mini) assert.deepEqual(logoArt(cleaned.mini, team.colors, icons), logoArt(logo.mini, team.colors, icons), `${what}: 確かめで小さい版が変わる`);
  // 確かめたものをもう一度確かめても同じ（保存を繰り返しても形が変わらない）
  assert.deepEqual(cleanLogo(cleaned), cleaned, `${what}: 確かめ直すと変わる`);
  return cleaned;
}

let biggest = 0;
let withIcons = 0;
let autos = 0;
for (let seed = 1; seed <= 300; seed++) {
  const teams = teamsOf(labelsOf(generatePyramidTeams(seed)));
  const seen = new Set();
  for (const team of teams) {
    // 自動のロゴ: 同じ球団なら毎回同じ。12球団で重ならない
    const auto = autoLogo(team);
    assert.deepEqual(autoLogo({ ...team, colors: [...team.colors] }), auto, `種${seed}: 自動のロゴが呼ぶたびに変わる`);
    const cleaned = assertSavable(team, auto, `種${seed} ${team.name} 自動`);
    biggest = Math.max(biggest, JSON.stringify(cleaned).length);
    assertArt(logoArt(auto.layers, team.colors, icons), `種${seed} ${team.name} 自動`);
    assertArt(logoArt(auto.mini, team.colors, icons), `種${seed} ${team.name} 自動の小さい版`);
    // 小さい版（台座に頭文字）は絵を使わない（順位表だけの画面で絵の形を読まなくてよい）
    assert.equal(logoNeedsIcons(auto.mini), false, '自動の小さい版が絵を使っている');
    if (logoNeedsIcons(auto.layers)) withIcons++;
    autos++;
    seen.add(JSON.stringify(logoArt(auto.layers, team.colors, icons).items));
  }
  assert.equal(seen.size, 12, `種${seed}: 自動のロゴが重なった`);
}
assert.ok(withIcons > autos * 0.4, `絵を使う自動のロゴが少なすぎる（${withIcons}/${autos}）`);

// どの型 × 台座 × 書体 × 配色 × 頭文字 × ことば でも描けて、保存できる
{
  const teams = teamsOf(labelsOf(generatePyramidTeams(7)));
  // 長い名前・和文の名前（人が付けた名前）でも崩れない
  teams.push({ name: '長', mono: 'HO', latin: 'HIGASHIOSAKA', city: 'HIGASHIOSAKA', nick: 'THUNDERBIRDS', nickname: 'サンダーバーズ', colors: teams[0].colors });
  teams.push({ name: '和', mono: '虎', latin: '', city: '', nick: '', nickname: '猛虎会', colors: teams[1].colors });
  let count = 0;
  for (const [ti, team] of teams.entries()) {
    const schemes = logoSchemes(logoColors(team.colors)).length;
    assert.ok(schemes >= 1 && schemes <= 10);
    for (const tpl of LOGO_TEMPLATE_KEYS)
      for (const [bi, base] of LOGO_BASES.entries())
        for (const [fi, font] of LOGO_LATIN_FONTS.entries()) {
          const recipe = { tpl, base, font, motif: LOGO_ICON_NAMES[(ti * 31 + bi * 7 + fi) % LOGO_ICON_NAMES.length], scheme: (ti + bi + fi) % schemes, ini: (bi + fi) % 2, word: (ti + bi) % 2 };
          const what = `${team.name} ${tpl}/${base}/${font}`;
          const logo = logoFromRecipe(team, recipe);
          const cleaned = assertSavable(team, logo, what);
          biggest = Math.max(biggest, JSON.stringify(cleaned).length);
          assertArt(logoArt(logo.layers, team.colors, icons), what);
          for (const [kind] of LOGO_MINI_KINDS) {
            if (kind === 'same') continue;
            const mini = buildLogoMini(team, normalRecipe(recipe), kind);
            assert.ok(mini.length >= 1 && mini.length <= LOGO_MINI_MAX_LAYERS, `${what} 小さい版 ${kind}`);
            assertArt(logoArt(mini, team.colors, icons), `${what} 小さい版 ${kind}`);
          }
          count++;
        }
    // 打った頭文字・ことばが入る。長すぎる字は切る
    const typed = buildLogoLayers(team, normalRecipe({ tpl: 'crest', mono: 'QZ', text: 'x'.repeat(40) }));
    for (const L of typed) if (L.k === 'text') assert.ok([...L.t].length <= LOGO_TEXT_MAX, '字が長すぎる');
    assert.ok(buildLogoLayers(team, normalRecipe({ tpl: 'mono', mono: 'QZ' })).some((L) => L.t === 'QZ'), '打った頭文字が入らない');
  }
  assert.ok(count >= 14 * 11 * 8 * 3);
}
assert.ok(biggest <= LOGO_MAX_CHARS * 0.6, `型どおりのロゴが保存の上限に近い（${biggest} / ${LOGO_MAX_CHARS}字）`);

// おまかせの候補: 12個・毎回同じ・ページを変えると変わる・型は11種がひと通り出る
{
  const [team] = teamsOf(labelsOf(generatePyramidTeams(3)));
  const page0 = logoCandidates(team, 0);
  assert.equal(page0.length, 12);
  assert.deepEqual(logoCandidates(team, 0), page0);
  assert.notDeepEqual(logoCandidates(team, 1), page0);
  assert.equal(new Set(page0.map((r) => r.tpl)).size, LOGO_TEMPLATE_KEYS.length, '候補に出ない型がある');
  for (const r of page0) assert.deepEqual(normalRecipe(r), { ...normalRecipe(r) });
  // 色を変えても、型・台座・絵・書体は変わらない（配色の番号だけが色の組に合わせて変わりうる）
  const recolored = logoCandidates({ ...team, colors: ['#111111', '#eeeeee', '#cc0000'] }, 0);
  assert.deepEqual(recolored.map((r) => [r.tpl, r.base, r.motif, r.font]), page0.map((r) => [r.tpl, r.base, r.motif, r.font]));
}

// --- 保存の確かめ -------------------------------------------------------------
{
  const ok = { k: 'circle', c: 0 };
  assert.equal(cleanLogo(null), null);
  assert.equal(cleanLogo({ layers: [] }), null);
  assert.equal(cleanLogo({ layers: 'x' }), null);
  assert.equal(cleanLogo({ layers: [{ k: 'no-such-shape' }, { k: 'constructor' }, { k: 'text', t: '   ' }, null, 3] }), null, '使えない部品だけなのに通した');
  // 多すぎる部品は先頭の8枚まで
  assert.equal(cleanLogo({ layers: Array.from({ length: 30 }, () => ok) }).layers.length, LOGO_MAX_LAYERS);
  assert.equal(cleanLogo({ layers: [ok], mini: Array.from({ length: 30 }, () => ok) }).mini.length, LOGO_MINI_MAX_LAYERS);
  // 数は範囲に収め、小数2桁に丸める。数でないものは既定に戻す（既定は書かない）
  const L = cleanLogo({ layers: [{ k: 'star', x: 1e9, y: NaN, s: -4, r: '12.3456', c: 99, o: '#ABCDEF', ow: 3.14159, f: 'yes', junk: 1 }] }).layers[0];
  assert.deepEqual(L, { k: 'star', x: 130, s: 0.03, r: 12.35, c: 0, o: '#abcdef', ow: 3.14, f: 1 });
  // 字: 制御文字を落とし、14字で切る。知らない書体は既定。小さすぎる弧はまっすぐ
  const T = cleanLogo({ layers: [{ k: 'text', t: `A\u0000B\n${'c'.repeat(40)}`, font: 'comic', arc: 3, line: 4 }] }).layers[0];
  assert.equal([...T.t].length, LOGO_TEXT_MAX);
  assert.ok(T.t.startsWith('ABc'));
  assert.equal(T.font, 'graduate');
  assert.equal(T.arc, undefined);
  assert.equal(T.line, undefined, '字に線だけの指定が残った');
  // 色: 番号 0〜4 か #rrggbb だけ。それ以外の文字列（url(...) など）は通さない
  assert.equal(cleanLogo({ layers: [{ k: 'circle', c: 'url(#x)' }] }).layers[0].c, 0);
  assert.equal(cleanLogo({ layers: [{ k: 'circle', c: 1, o: 'red', ow: 2 }] }).layers[0].o, undefined);
  assert.equal(cleanLogoColors(['#FFFFFF', '#000000', '#12ab34']).join(), '#ffffff,#000000,#12ab34');
  assert.equal(cleanLogoColors(['#fff', '#000000', '#12ab34']), null);
  assert.equal(cleanLogoColors(['#ffffff', '#000000']), null);
  assert.equal(cleanLogo({ layers: [ok], colors: ['red', 'blue', 'green'] }).colors, undefined);
  // 作り方の控え（rec）: 知らない値は既定に直す。絵の名前は表で確かめる
  const rec = cleanLogo({ layers: [ok], rec: { tpl: 'nope', base: 'nope', motif: '<script>', font: 'nope', scheme: -5, mono: 'ABCDEF', text: 'x'.repeat(99) } }).rec;
  assert.ok(LOGO_TEMPLATE_KEYS.includes(rec.tpl) && LOGO_BASES.includes(rec.base) && LOGO_LATIN_FONTS.includes(rec.font));
  assert.ok(isLogoIcon(rec.motif));
  assert.ok(Number.isInteger(rec.scheme) && rec.scheme >= 0);
  assert.ok((rec.mono || '').length <= 2 && [...(rec.text || '')].length <= LOGO_TEXT_MAX);
  // 上限より大きいロゴは保存しない（8枚とも長い和文の字＋色を全部書いても収まるが、形を足したときの守り）
  const fat = { layers: Array.from({ length: 8 }, () => ({ k: 'text', t: '東'.repeat(14), x: 12.34, y: 56.78, s: 1.23, r: 45.67, c: '#123456', o: '#654321', ow: 1.5, f: 1, font: 'yellowtail', arc: -45.5 })) };
  const fatClean = cleanLogo(fat);
  assert.ok(fatClean === null || JSON.stringify(fatClean).length <= LOGO_MAX_CHARS);
  // 開くと既定が入る（描く側は既定を知らなくてよい）
  assert.deepEqual(openLayer({ k: 'text', t: 'A', c: 1 }), { x: 50, y: 50, s: 1, r: 0, c: 1, font: 'graduate', arc: 0, k: 'text', t: 'A' });
  // 絵の形がまだ無いときは、絵の部品だけ飛ばして描く（落ちない）
  const some = [{ k: 'circle', c: 0 }, { k: 'baseball-bat', c: 1 }];
  assert.equal(logoNeedsIcons(some), true);
  assert.equal(logoArt(some, ['#111111', '#eeeeee', '#cc0000'], null).items.length, 1);
  assert.equal(logoArt(some, ['#111111', '#eeeeee', '#cc0000'], icons).items.length, 2);
  // 小さく出すとき（32px 以下）だけ小さい版
  const logo = { layers: some, mini: [ok] };
  assert.equal(LOGO_MINI_SIZE, 32);
  assert.equal(logoLayersFor(logo, 32), logo.mini);
  assert.equal(logoLayersFor(logo, 33), logo.layers);
  assert.equal(logoLayersFor({ layers: some }, 16), some);
  assert.deepEqual(logoLayersFor(null, 16), []);
}

// --- 保存と取り消し -----------------------------------------------------------
{
  const league = { teams: generatePyramidTeams(20261124).map((t) => ({ ...t })), members: [] };
  const first = applyJoin(league, { userId: 'u1', teamName: 'ロゴの球団', now: 'x' });
  const teamOf = (name) => league.teams.find((t) => t.name === name);
  const myTeam = teamOf(first.teamName);
  const logo = { layers: [{ k: 'shield', c: 0, o: 2, ow: 3 }, { k: 'text', t: 'A', c: 1, s: 0.9 }], colors: ['#102040', '#ffcc00', '#ffffff'] };
  const saved = applyProfile(league, { userId: 'u1', logo });
  assert.deepEqual(myTeam.logo, cleanLogo(logo));
  assert.deepEqual(saved.logo, myTeam.logo);
  // ロゴを送らない保存（名前・ひとこと）ではロゴに触らない
  applyProfile(league, { userId: 'u1', comment: 'こんにちは' });
  assert.deepEqual(myTeam.logo, cleanLogo(logo));
  // 使えないロゴは断って、前のロゴを残す
  assert.throws(() => applyProfile(league, { userId: 'u1', logo: { layers: [{ k: 'nope' }] } }), /このロゴは保存できません/);
  assert.deepEqual(myTeam.logo, cleanLogo(logo));
  // ほかの球団には付かない
  assert.equal(league.teams.filter((t) => t.logo).length, 1);
  // null で自動に戻す
  assert.equal(applyProfile(league, { userId: 'u1', logo: null }).logo, null);
  assert.equal(myTeam.logo, undefined);
  // 新しい人が入った球団は、前のオーナーのロゴを引き継がない
  for (const t of league.teams) if (t !== myTeam) t.logo = cleanLogo(logo);
  const joined = applyJoin(league, { userId: 'u2', teamName: 'あたらしい球団', now: 'x' });
  assert.equal(teamOf(joined.teamName).logo, undefined, '新しいオーナーに前のロゴが残った');
}

// --- ビュー ------------------------------------------------------------------
{
  // 自動のロゴと色を名前だけから決め、人が作ったロゴはそのまま載せる
  const labels = labelsOf(generatePyramidTeams(11));
  const names = Object.keys(labels);
  const mine = cleanLogo({ layers: [{ k: 'hex', c: 2 }, { k: 'text', t: 'ZZ', c: 0 }], colors: ['#010203', '#040506', '#070809'] });
  attachTeamLogos(labels, (name) => (name === names[0] ? mine : undefined));
  assert.deepEqual(labels[names[0]].logo, { ...mine, colors: mine.colors });
  for (const name of names.slice(1)) {
    const logo = labels[name].logo;
    assert.equal(logo.auto, 1);
    assert.ok(logo.layers.length && logo.mini.length && cleanLogoColors(logo.colors), `${name} の自動のロゴが載っていない`);
  }
  // 画面: 載ってきた色が球団の色になる（頭文字は名前から決めたまま）
  const before = buildTeamLooks(labelsOf(generatePyramidTeams(11)));
  const after = buildTeamLooks(labels);
  assert.deepEqual([after[names[0]].c1, after[names[0]].c2, after[names[0]].c3], mine.colors);
  assert.equal(after[names[0]].mono, before[names[0]].mono);
  for (const name of names.slice(1)) {
    assert.deepEqual([after[name].c1, after[name].c2, after[name].c3], [before[name].c1, before[name].c2, before[name].c3]);
    assert.equal(after[name].logo, labels[name].logo);
  }
}
{
  // 本物のサーバーの答え: 12球団ぶん載る。保存すると自分の球団だけ変わり、取り消すと自動に戻る
  const { service, sessionId } = await seasonService({ days: 0 });
  const view0 = await service.view('admin', sessionId);
  const names = Object.keys(view0.teamLabels);
  assert.equal(names.length, 12);
  for (const name of names) {
    const logo = view0.teamLabels[name].logo;
    assert.ok(logo?.layers?.length && logo.auto === 1 && cleanLogoColors(logo.colors), `${name} のロゴがビューに無い`);
  }
  const bytes = JSON.stringify(names.map((n) => view0.teamLabels[n].logo)).length;
  assert.ok(bytes < 9000, `ビューのロゴが大きい（12球団で ${bytes} 字）`);
  const logo = { layers: [{ k: 'seal', c: 1, o: 0, ow: 4 }, { k: 'text', t: 'OK', c: 0, font: 'alfa' }], colors: ['#0a2a66', '#ffd23f', '#ffffff'], rec: { tpl: 'mono' } };
  const done = await service.command('admin', sessionId, { requestId: 'logo-save-1', revision: view0.revision, type: 'profile', payload: { logo } });
  assert.equal(done.ok, true);
  const view1 = await service.view('admin', sessionId);
  const mine = view1.teamLabels[view1.teamName].logo;
  assert.equal(mine.auto, undefined);
  assert.deepEqual(mine.layers, cleanLogo(logo).layers);
  assert.deepEqual(mine.colors, logo.colors);
  for (const name of names) if (name !== view1.teamName) assert.deepEqual(view1.teamLabels[name].logo, view0.teamLabels[name].logo, 'ほかの球団のロゴが変わった');
  const bad = await service
    .command('admin', sessionId, { requestId: 'logo-save-2', revision: view1.revision, type: 'profile', payload: { logo: { layers: [] } } })
    .catch((e) => e);
  assert.match(String(bad?.message || bad?.error), /このロゴは保存できません/);
  const view2 = await service.view('admin', sessionId);
  await service.command('admin', sessionId, { requestId: 'logo-save-3', revision: view2.revision, type: 'profile', payload: { logo: null } });
  const view3 = await service.view('admin', sessionId);
  assert.deepEqual(view3.teamLabels[view3.teamName].logo, view0.teamLabels[view0.teamName].logo, '取り消しても自動のロゴに戻らない');
}
console.log(`online-logo-check: ok（型どおりのロゴは最大 ${biggest} 字）`);
