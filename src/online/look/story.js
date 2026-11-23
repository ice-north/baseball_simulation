// ============================================================
// 新しい見た目（試作）段4: 番記者と球団の出来事。
//   - 番記者: 地元紙の、その球団の担当記者。球団ごとに1人（名前・年齢・顔は球団名から決まる。保存しない）
//   - 番記者のひとこと（`reporterChat`）: 優勝・残留争い・連勝・次の試合をひとことで
//   - 球団の出来事の場面（`eventScene`）: 優勝・昇格・残留・降格が決まったときの、監督のひとこと。年に数回
//
// ⚠ **表示専用**。ビューにある順位・レース・指導者・名簿から作る。サーバーも保存も触らない。
// ⚠ アプリ（`mobile/shared/.../LookStory.kt`）に写してある。文を変えたら両方を直し、
//    `node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json`
//    で期待値を書き出し直す（答え合わせはアプリの `LookTest`）。
// ============================================================
import { hash, rng, pick } from './rng.js';
import { todayGameCard } from './todayGame.js';
import { PYRAMID_LEAGUES } from '../pyramidLeague.js';

const SURNAMES = [
  '早瀬', '水野', '片桐', '三宅', '小野寺', '白石', '野村', '高梨', '真田', '宮本', '古川', '岸田',
  '望月', '藤原', '桜井', '杉山', '長尾', '黒田', '秋山', '柳田', '森下', '今井', '大塚', '星野',
];
const GIVEN = ['みのり', 'ゆかり', '葵', '真央', '千尋', '遥', '彩', '美咲', '健太', '翔', '大輔', '拓海', '誠', '直樹', '亮', '和也'];

const shortOf = (view, team) => view?.teamLabels?.[team]?.short || team;
/** 名字（「小塩 紀洋」→「小塩」）。空白が無ければそのまま */
const surnameOf = (name) => String(name || '').split(/[ 　]/)[0];

/**
 * 球団の番記者。`seed` は顔の種（`faceArt` の `seed`、`suit: true` で描く）。
 * @returns `{ seed, name, age, title }`（title は「ラビッツ番」）
 */
export function reporterOf(team, labels = {}) {
  const r = rng(hash(`reporter:${team}`));
  const surname = pick(r, SURNAMES);
  const given = pick(r, GIVEN);
  const age = 24 + Math.floor(r() * 18);
  const label = labels?.[team] || {};
  return { seed: `reporter:${team}`, name: `${surname} ${given}`, age, title: `${label.nickname || label.short || team}番` };
}

/** 決まったレースの、番記者のひとこと（場面を出す前の紙面にも出す） */
const CLINCHED = {
  first: '優勝が決まりました！ 街じゅうがお祭り騒ぎです。',
  promotion: '昇格が決まりました！ 来季はいよいよ上の部です。',
  survive: '残留が決まりました。ひとまずほっとしましたね。',
  relegated: '降格が決まってしまいました…。来季は出直しです。',
};

/**
 * 番記者のひとこと（多くて2つ）。1つ目はレース（決着・マジック）か連勝・連敗、2つ目は次の試合。
 * 何も無ければ空。
 */
export function reporterChat(view) {
  const me = view?.teamName;
  if (!me) return [];
  const lines = [];
  const race = (view.races || []).find((r) => r.team === me);
  if (race) {
    if (race.clinched) lines.push(CLINCHED[race.kind] || '');
    else if (race.kind === 'survive') lines.push(`残留マジック${race.magic}。${race.rival ? `${shortOf(view, race.rival)}より先に決めたいですね。` : 'もうひと踏ん張りです。'}`);
    else lines.push(`マジック${race.magic}が点灯中です。${race.rival ? `${shortOf(view, race.rival)}の結果も気になりますね。` : ''}`);
  } else {
    const s = view.teamStreaks?.[me];
    if (s?.kind === 'W' && s.count >= 3) lines.push(`${s.count}連勝中です。ベンチの雰囲気もいいですよ。`);
    else if (s?.kind === 'L' && s.count >= 3) lines.push(`${s.count}連敗中…。そろそろ流れを変えたいところです。`);
  }
  const card = todayGameCard(view);
  if (card) {
    const when = card.title === '今日の一戦' ? '今日は' : '次は';
    const where = card.place === 'ホーム' ? '本拠地です' : `${card.city || '敵地'}に乗りこみます`;
    const starter = card.foe.starter ? `相手の先発は${card.foe.starter.name}の予定です。` : '';
    lines.push(`${when}${shortOf(view, card.foe.team)}戦、${where}。${starter}`);
  }
  return lines.filter(Boolean).slice(0, 2);
}

/**
 * 今季の主役（打点＋本塁打×2＋勝利×5＋セーブ×2 がいちばん多い選手）。記録が無ければ null。
 * ⚠ 並んだら名簿の先の選手
 */
function starOf(roster) {
  let best = null;
  let top = 0;
  for (const p of roster || []) {
    const b = p.seasonStats?.batting || {};
    const pi = p.seasonStats?.pitching || {};
    const score = (b.rbis || 0) + (b.homeruns || 0) * 2 + (pi.wins || 0) * 5 + (pi.saves || 0) * 2;
    if (score > top) {
      top = score;
      best = p;
    }
  }
  return best;
}

/** 上（-1）か下（+1）の部の名前。知らない部なら空（「上の部」「下の部」と書く） */
const leagueAt = (id, step) => {
  const i = PYRAMID_LEAGUES.findIndex((l) => l.id === id);
  return i < 0 ? '' : PYRAMID_LEAGUES[i + step]?.name || '';
};

/** 決着の種類ごとの見出しと台詞（`s` は主役の名字。居なければ空） */
const EVENTS = {
  first: {
    good: true,
    heading: (race) => `${race.leagueName}優勝！`,
    coach: (s) => `「よくやった！ ${s ? `${s}、今季はお前がチームを引っぱってくれた。` : ''}オーナー、来季もこの場所に戻ってきましょう」`,
    reporter: (s) => `優勝が決まりました！ ${s ? `今季の主役は${s}選手。` : ''}街じゅうがお祭り騒ぎです。`,
  },
  promotion: {
    good: true,
    heading: (race) => `${race.leagueName}優勝！　来季は${leagueAt(race.league, -1) || '上の部'}へ`,
    coach: (s) => `「ついに上がれるぞ。${s ? `${s}の活躍がなければ届かなかった。` : ''}オーナー、来季に向けて補強を頼みます」`,
    reporter: (s) => `昇格が決まりました！ ${s ? `${s}選手の活躍が光った1年でした。` : ''}来季はいよいよ上の部です。`,
  },
  survive: {
    good: true,
    heading: (race) => `${race.leagueName}残留決定`,
    coach: (s) => `「苦しい1年だったが、なんとか踏みとどまった。${s ? `${s}、よく粘ってくれた。` : ''}来季は上を目指しましょう」`,
    reporter: (s) => `残留が決まりました。${s ? `${s}選手の踏ん張りが大きかったですね。` : ''}来季は上を目指しましょう。`,
  },
  relegated: {
    good: false,
    heading: (race) => `${race.leagueName}降格…　来季は${leagueAt(race.league, 1) || '下の部'}から`,
    coach: (s) => `「申し訳ない。来季は下からやり直しだ。${s ? `${s}を中心に、` : ''}もう一度はい上がってみせます」`,
    reporter: (s) => `降格が決まってしまいました…。${s ? `${s}選手を中心に、` : ''}来季は出直しです。`,
  },
};

/**
 * 球団の出来事の場面（自球団のレースが決まったとき）。無ければ null。
 * @returns `{ key, kind, good, title, heading, speaker, star, line }`
 *   `key` は見た印（同じ場面を2度出さない。端末に覚える）。
 *   `speaker` は `{ kind: 'coach' | 'reporter', id, seed, name, label, age }`（監督が居なければ番記者）。
 *   `star` は `{ id, seed, name, age, condition }` か null（`seed` は顔の種。選手の顔と同じ）
 */
export function eventScene(view) {
  const me = view?.teamName;
  if (!me) return null;
  const race = (view.races || []).find((r) => r.team === me && r.clinched && EVENTS[r.kind]);
  if (!race) return null;
  const def = EVENTS[race.kind];
  const manager = (view.staff?.seats || []).find((s) => s.role === 'manager')?.coach || null;
  const player = starOf(view.roster);
  const s = player ? surnameOf(player.name) : '';
  const month = view.currentDate?.month;
  const when = [view.year != null ? `${view.year}年目` : '', month ? `${month}月` : ''].filter(Boolean).join('・');
  let speaker;
  if (manager) {
    speaker = { kind: 'coach', id: manager.id || null, seed: `c${manager.id || manager.name}`, name: manager.name || '', label: `${surnameOf(manager.name)}監督`, age: manager.age || 50 };
  } else {
    const rep = reporterOf(me, view.teamLabels);
    speaker = { kind: 'reporter', id: null, seed: rep.seed, name: rep.name, label: `${rep.title}　${rep.name}`, age: rep.age };
  }
  return {
    key: `${me}:${view.year ?? ''}:${race.kind}`,
    kind: race.kind,
    good: def.good,
    title: `球団の出来事${when ? `　${when}` : ''}`,
    heading: def.heading(race),
    speaker,
    star: player
      ? { id: player.id ?? null, seed: `p${player.id ?? player.name}`, name: player.name || '', age: player.age ?? null, condition: player.condition ?? null }
      : null,
    line: manager ? def.coach(s) : def.reporter(s),
  };
}
