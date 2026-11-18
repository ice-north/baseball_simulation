import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { requireOnline } from '../src/online/shared.js';

/**
 * 招待リンク（管理者がボタンで作り、相手はリンクからアカウントを作って参加する）。
 *
 * ⚠ **保存はリーグの外**（保存一式の `bundle.invites`。`sessions` と同じ段）。
 *    リーグの形を変えないので `ONLINE_SCHEMA` は上げない。リーグを作り直しても招待は残る。
 * ⚠ **保存するのは合言葉のハッシュだけ**。保存一式やバックアップを見られても、
 *    そこからリンクを作り直せない。合言葉そのものは作った瞬間の返事にしか載らない。
 * ⚠ 1つのリンクで作れるアカウントは1つ。使う途中（アカウントを作っている間）は
 *    `claimedAt` で押さえて、同じリンクの同時押しで2つ作られないようにする。
 *    作るのに失敗したら押さえを外して、もう一度使えるようにする。
 */
export const INVITE_DAYS = 7;
/** 使う途中の押さえ。これより古い押さえは、途中で落ちたものとして外す */
export const INVITE_CLAIM_MS = 2 * 60000;
/** 未使用で持てる招待の数（作りすぎの歯止め） */
export const INVITE_OPEN_MAX = 12;
/** 使い終わった・期限切れの招待を記録に残す日数 */
const INVITE_KEEP_DAYS = 30;

const hashOf = (token) => createHash('sha256').update(String(token)).digest('hex');
const ms = (iso) => Date.parse(iso);

const isOpen = (invite, now) =>
  !invite.usedAt && !invite.revokedAt && ms(invite.expiresAt) > ms(now);

/** 古い記録を落とす（使い終わり・取り消し・期限切れから30日） */
function prune(bundle, now) {
  const limit = ms(now) - INVITE_KEEP_DAYS * 86400000;
  bundle.invites = (bundle.invites || []).filter(
    (i) => isOpen(i, now) || ms(i.usedAt || i.revokedAt || i.expiresAt) > limit,
  );
  return bundle.invites;
}

/** 管理者の画面に出す一覧（合言葉もハッシュも出さない） */
export function inviteList(bundle, now) {
  return (bundle.invites || [])
    .filter((i) => isOpen(i, now))
    .map((i) => ({ id: i.id, createdAt: i.createdAt, expiresAt: i.expiresAt }));
}

export function createInvite(bundle, now) {
  const invites = prune(bundle, now);
  requireOnline(
    invites.filter((i) => isOpen(i, now)).length < INVITE_OPEN_MAX,
    `未使用の招待が${INVITE_OPEN_MAX}件あります。使われていないものを取り消してから作ってください`,
    409,
  );
  const token = randomBytes(24).toString('base64url');
  const invite = {
    id: randomUUID(),
    hash: hashOf(token),
    createdAt: now,
    expiresAt: new Date(ms(now) + INVITE_DAYS * 86400000).toISOString(),
  };
  invites.push(invite);
  return { token, id: invite.id, expiresAt: invite.expiresAt };
}

/** 取り消す。`id` が無ければ未使用のものを全部 */
export function revokeInvites(bundle, now, id = null) {
  let count = 0;
  for (const invite of prune(bundle, now))
    if (isOpen(invite, now) && (!id || invite.id === id)) {
      invite.revokedAt = now;
      count += 1;
    }
  return count;
}

const findOpen = (bundle, token, now) => {
  requireOnline(
    typeof token === 'string' && /^[\w-]{20,80}$/.test(token),
    '招待リンクが正しくありません。届いたリンクをもう一度開いてください',
    400,
    'invite',
  );
  const hash = hashOf(token);
  const invite = (bundle.invites || []).find((i) => i.hash === hash);
  requireOnline(
    invite && !invite.revokedAt,
    '招待リンクが正しくないか、取り消されています。管理者に新しいリンクを頼んでください',
    404,
    'invite',
  );
  requireOnline(
    !invite.usedAt,
    'この招待リンクは使用済みです。作ったアカウントでログインしてください',
    409,
    'invite_used',
  );
  requireOnline(
    ms(invite.expiresAt) > ms(now),
    '招待リンクの期限が切れています。管理者に新しいリンクを頼んでください',
    410,
    'invite',
  );
  return invite;
};

/** リンクを開いたときの確かめ（まだ使えるか・期限）。押さえはしない */
export function peekInvite(bundle, token, now) {
  const invite = findOpen(bundle, token, now);
  return { expiresAt: invite.expiresAt };
}

/**
 * アカウントを作る前に押さえる。
 * ⚠ **リーグが満員なら断る**。アカウントだけできて参加できない、を作らない。
 */
export function claimInvite(bundle, token, now) {
  const invite = findOpen(bundle, token, now);
  requireOnline(
    !invite.claimedAt || ms(invite.claimedAt) + INVITE_CLAIM_MS <= ms(now),
    'この招待リンクは登録の途中です。少し待ってからもう一度お試しください',
    409,
    'busy',
  );
  const league = bundle.league;
  const teams = league?.season?.settings?.teamNames;
  if (Array.isArray(teams))
    requireOnline(
      (league.members || []).length < teams.length,
      '空いている球団がありません。管理者に相談してください',
      409,
    );
  const claim = randomUUID();
  invite.claimedAt = now;
  invite.claim = claim;
  return claim;
}

/** 作れたら使用済みに、作れなかったら押さえを外す */
export function finishInvite(bundle, token, claim, userId, now) {
  const invite = (bundle.invites || []).find((i) => i.hash === hashOf(token));
  if (!invite || invite.claim !== claim) return false;
  delete invite.claimedAt;
  delete invite.claim;
  if (userId) {
    invite.usedAt = now;
    invite.usedBy = userId;
  }
  return true;
}
