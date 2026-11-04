// ============================================================
// 球団間のトレード。
//
// 【流れ】提案 → 相手が「受ける／逆提案／断る」。
//   - 受ける → その場で成立し、選手が入れ替わる
//   - 逆提案 → **提案した側に戻る**。そこで受ければ成立、断れば消える
//   - 断る   → 消える
// ⚠ **逆提案は1回だけ**。何度でも投げ返せると終わらない。2回目の返事は
//    「受ける」か「断る」だけにする。
//
// ⚠ **ここは純粋な計算だけを持つこと**。保存・通信・乱数の生成に触らない。
//    `Math.random()` を呼ばない（シードから決まる必要がある）。
//    配線（API・サーバー）は別のファイルで行う。
// ============================================================
import { requireOnline, ROSTER_LIMIT } from './shared.js';

/** 1球団が同時に抱えられる提案の数。⚠ 無制限だと相手の画面を埋められる */
export const MAX_OPEN_TRADES = 5;

/**
 * 名簿として成り立つか。⚠ トライアウトの解決と**同じ条件**にする
 *    （`resolveTryout` の最後の検査）。ここだけ緩めると、トレードで
 *    捕手のいない球団を作れてしまう。
 */
export function rosterShortfall(players) {
  const problems = [];
  if (players.length > ROSTER_LIMIT)
    problems.push(`${ROSTER_LIMIT}人を超えます（${players.length}人）`);
  if (!players.some((p) => p.position === 'pitcher')) problems.push('投手が居なくなります');
  if (!players.some((p) => p.position === 'catcher')) problems.push('捕手が居なくなります');
  const fielders = players.filter((p) => p.position !== 'pitcher').length;
  if (fielders < 8) problems.push(`野手が8人を割ります（${fielders}人）`);
  return problems;
}

/** トレード後の両球団の名簿。⚠ 元の配列は書き換えない */
export function rostersAfterTrade(fromPlayers, toPlayers, offerIds, wantIds) {
  const offer = new Set(offerIds);
  const want = new Set(wantIds);
  const moving = fromPlayers.filter((p) => offer.has(p.id));
  const coming = toPlayers.filter((p) => want.has(p.id));
  return {
    from: [...fromPlayers.filter((p) => !offer.has(p.id)), ...coming],
    to: [...toPlayers.filter((p) => !want.has(p.id)), ...moving],
    moving,
    coming,
  };
}

/**
 * 提案の中身が通るか。**提案のときと、成立のときの両方で呼ぶこと**。
 *
 * ⚠ 提案から成立までの間に、選手が別のトレードで移っていることがある。
 *    提案のときに見ただけだと、居ない選手を動かして名簿が壊れる。
 */
export function assertTradeAllowed(fromTeam, toTeam, offerIds, wantIds) {
  requireOnline(
    Array.isArray(offerIds) && Array.isArray(wantIds),
    'トレードの内容が不正です',
  );
  requireOnline(
    new Set(offerIds).size === offerIds.length &&
      new Set(wantIds).size === wantIds.length,
    '同じ選手を2回指定しています',
  );
  requireOnline(
    offerIds.length + wantIds.length >= 1,
    '選手を1人以上入れてください',
  );
  const has = (team, ids) =>
    ids.every((id) => team.players.some((p) => p.id === id));
  requireOnline(has(fromTeam, offerIds), '出す選手が名簿にいません', 409);
  requireOnline(has(toTeam, wantIds), '相手の名簿にいない選手です', 409);
  const after = rostersAfterTrade(
    fromTeam.players,
    toTeam.players,
    offerIds,
    wantIds,
  );
  // ⚠ **両方の球団を見る**。自分の名簿だけ見ていると、相手を壊すトレードが通る
  const mine = rosterShortfall(after.from);
  const theirs = rosterShortfall(after.to);
  requireOnline(!mine.length, `自球団の名簿が成り立ちません: ${mine.join('・')}`);
  requireOnline(
    !theirs.length,
    `相手の名簿が成り立ちません: ${theirs.join('・')}`,
  );
  return after;
}

/**
 * 返事ができるのは誰か。
 * ⚠ **手番を持っている側だけ**。両方が同時に受けられると、二重に成立する。
 */
export const canRespond = (trade, userId) =>
  trade.turn === 'to' ? trade.to === userId : trade.from === userId;

/**
 * 逆提案を出せるか。
 * ⚠ **最初の返事のときだけ**。投げ返しが続くと終わらない。
 */
export const canCounter = (trade, userId) =>
  canRespond(trade, userId) && !trade.countered && trade.turn === 'to';
