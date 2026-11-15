// ============================================================
// 人どうしの関わりのうち、保存に書くもの。
//   - あなたへのお知らせ（`member.inbox`）
//   - 取引の記録（`league.transactions`）
//   - トレードの提案の後片付け（選手が居なくなった・人が抜けた・年度が替わった）
//   - 最後に来た時刻と「おるすばん」（`member.lastSeenAt` / `member.away`）
//
// ⚠ ここは `TEAMS_DATA` を読まない。球団は呼ぶ側が渡す（エンジンの中なら
//    `TEAMS_DATA`、外なら保存した世界 `league.game.teams`）。
// ⚠ 決まりの数字は `src/online/social.js`（画面と共有）。
// ============================================================
import {
  INBOX_LIMIT,
  TRANSACTIONS_LIMIT,
  TEAM_TRANSACTIONS_KEEP,
  PRESENCE_REFRESH_HOURS,
  isAwayAt,
} from '../src/online/social.js';
import { validateLineup } from '../src/online/shared.js';
import { effectiveStaffModes } from './coachEngine.mjs';
import { projectLineup } from './projection.mjs';

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/** 画面に出す球団名（参加者が付けた名前。無ければ内部名） */
export function teamLabelIn(league, name) {
  const team = (league.teams || []).find((t) => t.name === name);
  return team?.displayName || name;
}

/**
 * その人に「あなたへのお知らせ」を1件足す。新しいものが先頭。
 * `entry` は `{ type, text, ...参照 }`。文はここで作って保存する（PC とアプリで同じ文を出すため）。
 * ⚠ 参加者でない人（CPU球団・抜けた人）には何もしない。
 */
export function pushInbox(league, userId, entry, now) {
  const member = (league.members || []).find((m) => m.userId === userId);
  if (!member) return null;
  const id = `n${(league.inboxSeq = (league.inboxSeq || 0) + 1)}`;
  member.inbox = [{ id, at: now, ...entry }, ...(member.inbox || [])].slice(0, INBOX_LIMIT);
  return id;
}

/**
 * 取引の記録を1件足す。新しいものが先頭。
 * `entry` は `{ kind: 'trade'|'release'|'signing', teams: [内部名], moves: [{ playerId, name, position, from, to }] }`。
 * ⚠ 選手の名前は**その時の名前で残す**（あとで名簿から消えても読めるように）。
 */
export function recordTransaction(league, entry, now) {
  if (!entry.moves?.length) return null;
  const id = `t${(league.transactionSeq = (league.transactionSeq || 0) + 1)}`;
  league.transactions = keepTransactions([
    {
      id,
      year: league.season?.year ?? null,
      date: clone(league.season?.currentDate) || null,
      at: now || null,
      ...entry,
    },
    ...(league.transactions || []),
  ]);
  return id;
}

/**
 * 取引の記録の残し方: 新しいほうから `TRANSACTIONS_LIMIT` 件に加え、**球団ごとに新しい
 * `TEAM_TRANSACTIONS_KEEP` 件**も残す（球団史の入退団履歴に使う）。
 * ⚠ 先方指摘「各チームの入退団履歴も見られるように（球団史・記録から）」。リーグ全体の200件だけだと
 *    2年ほどで古い年の入退団が消える。1球団は1年に入団1件・退団1件＋トレード数件なので、
 *    40件でおよそ10年ぶん残る。形は変えない（同じ配列のまま残す件数だけ増える）
 */
export function keepTransactions(list) {
  const perTeam = new Map();
  return list.filter((t, i) => {
    let keep = i < TRANSACTIONS_LIMIT;
    for (const team of t.teams || []) {
      const n = perTeam.get(team) || 0;
      perTeam.set(team, n + 1);
      if (n < TEAM_TRANSACTIONS_KEEP) keep = true;
    }
    return keep;
  });
}

/** 取引の記録に載せる選手の形 */
export function moveOf(player, from, to) {
  return {
    playerId: player.id,
    name: player.name,
    position: player.position || null,
    from: from || null,
    to: to || null,
  };
}

/**
 * 成り立たなくなったトレードの提案を取り下げ、当事者の人に知らせる。
 * - 出す／もらう選手が名簿に居ない（別のトレード・退団・引退・トライアウトの入れ替え）
 * - 提案した人・相手の人が参加者でなくなった（球団をCPUに戻した）
 * `all` を立てると全部を取り下げる（年度更新。`reason` に理由の文）。
 *
 * ⚠ 以前は「（移籍済み）」と出たまま残り、同時に出せる5件の枠を埋めていた。
 * ⚠ `teams` は呼ぶ側が渡す（エンジンの中なら `TEAMS_DATA`）。
 */
export function pruneTrades(league, teams, now, { all = false, reason = null } = {}) {
  if (!league.trades?.length) return 0;
  const members = new Set((league.members || []).map((m) => m.userId));
  const has = (teamName, id) => !!teams?.[teamName]?.players?.some((p) => p.id === id);
  const why = (t) => {
    if (all) return reason || '取り下げられました';
    // ⚠ CPU球団の側は userId が null（CPUからの提案は `from`、CPU球団への提案は `to`）。
    //    その球団に人が入ったら（CPUでなくなったら）取り下げる
    const memberTeams = new Set((league.members || []).map((m) => m.teamName));
    if (
      (t.from ? !members.has(t.from) : memberTeams.has(t.fromTeam)) ||
      (t.to ? !members.has(t.to) : memberTeams.has(t.toTeam))
    )
      return 'オーナーが替わったため、取り下げられました';
    if (t.offer.some((id) => !has(t.fromTeam, id)) || t.want.some((id) => !has(t.toTeam, id)))
      return '選手が移籍・退団したため、取り下げられました';
    return null;
  };
  const keep = [];
  let dropped = 0;
  for (const trade of league.trades) {
    const text = why(trade);
    if (!text) {
      keep.push(trade);
      continue;
    }
    dropped += 1;
    for (const userId of [trade.from, trade.to]) {
      if (!userId) continue;
      const mine = userId === trade.from;
      const other = teamLabelIn(league, mine ? trade.toTeam : trade.fromTeam);
      pushInbox(
        league,
        userId,
        {
          type: 'tradeWithdrawn',
          tradeId: trade.id,
          text: `${other}${mine ? 'への' : 'からの'}トレードの提案は、${text}`,
        },
        now,
      );
    }
  }
  league.trades = keep;
  return dropped;
}

/**
 * 最後に来た時刻を書く（ログイン・操作・画面を開いたとき）。書いたら true。
 * ⚠ **おるすばんはここで解く**（来た人の球団を指導者に任せたままにしない）。
 * ⚠ 前に書いてから `PRESENCE_REFRESH_HOURS` 経っていなければ書かない（画面を開くたびに
 *    保存が走らないように）。おるすばん中だけは必ず書いて解く。
 */
export function touchPresence(league, userId, now) {
  const member = (league?.members || []).find((m) => m.userId === userId);
  if (!member) return false;
  const last = Date.parse(member.lastSeenAt || '');
  const fresh =
    Number.isFinite(last) && Date.parse(now) - last < PRESENCE_REFRESH_HOURS * 3600 * 1000;
  if (fresh && !member.away) return false;
  member.lastSeenAt = now;
  if (member.away) {
    delete member.away;
    const restored = restoreAwayPlan(league, member);
    pushInbox(
      league,
      userId,
      {
        type: 'awayEnded',
        text:
          'おかえりなさい。留守の間は指導者に任せていました。任せ方は元の設定に戻っています' +
          (restored === 'restored'
            ? '。スタメン・投手起用も留守の前の形に戻しました'
            : restored === 'kept'
              ? '。留守の間に選手が入れ替わったので、スタメン・投手起用は指導者が組んだままです'
              : ''),
      },
      now,
    );
  }
  return true;
}

/**
 * おるすばんになる前の編成（スタメン・投手起用）を控える（`markAway` の直後、作り直す前に呼ぶ）。
 * ⚠ 留守の間は指導者の案で作り直す（`refreshTeamPlan`）ので、控えておかないと戻ってきた人の
 *    打順と投手起用が消える（任せ方の設定だけが元に戻り、編成は指導者の案のままになっていた）。
 */
export function keepAwayPlan(member, team) {
  if (!team) return;
  member.awayPlan = {
    lineupSettings: clone(team.lineupSettings) || null,
    pitchingRotation: clone(team.pitchingRotation) || null,
  };
}

/**
 * 戻ってきた人の編成を、留守の前の形に戻す（`touchPresence`）。
 * - 本人が任せていない分野（スタメン・投手起用）だけ戻す。任せている分野は指導者の案のまま
 * - 留守の間に選手が動いて（トレード・退団・入団）成り立たないときは戻さない（'kept'）
 * 戻したら 'restored'、控えが無い・戻す分野が無いなら null。
 * ⚠ 保存した世界（`league.game.teams`）を直接書く（編成の保存 `saveLineup` と同じ。エンジンは使わない）
 */
export function restoreAwayPlan(league, member) {
  const plan = member.awayPlan;
  delete member.awayPlan;
  if (!plan) return null;
  const team = league.game?.teams?.[member.teamName];
  if (!team) return null;
  const modes = effectiveStaffModes(league, member);
  const lineup = modes.lineup !== 'delegate' && plan.lineupSettings;
  const pitching = modes.pitching !== 'delegate' && plan.pitchingRotation;
  if (!lineup && !pitching) return null;
  const before = {
    lineupSettings: clone(team.lineupSettings),
    pitchingRotation: clone(team.pitchingRotation),
  };
  if (lineup) team.lineupSettings = clone(plan.lineupSettings);
  if (pitching) {
    const starters = plan.pitchingRotation.starters || [];
    team.pitchingRotation = {
      ...clone(plan.pitchingRotation),
      currentStarterIndex: starters.length
        ? (plan.pitchingRotation.currentStarterIndex || 0) % starters.length
        : 0,
    };
  }
  const active = new Set(team.players.filter((p) => p.isActive !== false).map((p) => p.id));
  const view = projectLineup(team);
  const ok = (() => {
    try {
      validateLineup(team, view);
    } catch {
      return false;
    }
    // ⚠ 打順の9番（投手）・ローテ・救援の役割に、もう居ない選手が残っていないこと
    const ids = [
      ...(team.lineupSettings?.battingOrder || []).map((e) => e.playerId),
      ...(team.pitchingRotation?.starters || []),
      ...Object.keys(view.pitcherRoles || {}).map(Number),
    ];
    return (team.pitchingRotation?.starters || []).length > 0 && ids.every((id) => active.has(id));
  })();
  if (ok) return 'restored';
  team.lineupSettings = before.lineupSettings;
  team.pitchingRotation = before.pitchingRotation;
  return 'kept';
}

/**
 * 来ていない人を「おるすばん」にする。新しく留守になった人を返す（呼ぶ側が編成を作り直す）。
 * ⚠ 本人の任せ方（`member.staffModes`）は書き換えない。印（`member.away`）だけ立てる。
 *    効き方は `coachEngine.effectiveStaffModes` が読む。
 */
export function markAway(league, now) {
  const started = [];
  for (const member of league.members || []) {
    if (member.away || !isAwayAt(member, now)) continue;
    member.away = true;
    started.push(member);
    pushInbox(
      league,
      member.userId,
      {
        type: 'awayStarted',
        text: 'しばらくお越しがなかったので、スタメン・投手起用・采配・手続きを指導者に任せています。開けば元に戻ります',
      },
      now,
    );
  }
  return started;
}
