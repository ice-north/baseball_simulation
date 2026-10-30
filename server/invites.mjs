// 招待コードの発行。
//
// ⚠ **ゲームのシード乱数を使わないこと**。盤面の再現のための乱数は
//    シードから決まるので、同じシードのリーグなら次のコードが読める。
//    招待コードは当てられては困るので、暗号用の乱数を使う。
import { randomInt } from 'node:crypto';
import { newInviteCode } from '../src/online/membership.js';

/** 既存と重複しない招待コードを1つ作る */
export function issueInvite(league, now) {
  const used = new Set((league.invites || []).map((i) => i.code));
  // ⚠ 万一ぶつかっても回り続けないよう上限を置く（8文字31種なので実際は起きない）
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = newInviteCode(() => randomInt(0, 1_000_000) / 1_000_000);
    if (!used.has(code)) return { code, createdAt: now, usedBy: null };
  }
  throw new Error('招待コードを作れませんでした');
}
