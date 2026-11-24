import {
  TRADE_SLOTS,
  tradeSlot,
  slotStrength,
  fielderAssignment,
  pitchingStaff,
  rosterTops,
  squadStrength,
  BULLPEN_SIZE,
} from './tradeSearch.js';

// ============================================================
// 交換案に入れた選手が**相手球団にとって**どんな得になるか（相手に与えるメリット）。
//
// 【意図】いしだ 2026-11-24「選手を配置したときに相手に与えるメリットを表示してください」。
//   交換を組むとき、出す選手が相手でどう使われそうか（一番手になる・ローテに入る・控え）と、
//   相手の戦力がどれだけ上がるかが分かれば、相手が受けやすい形（win-win）を探せる。
//
// 【測り方】どれも CPU が実際に使う物差し（`tradeSearch.js`）だけで出す。
//   - 役割 … 交換**のあと**の相手の名簿で、その選手が当たる持ち場（`fielderAssignment`・`pitchingStaff`。
//     サーバーの値段と同じ割り当て）。野手は守備位置の一番手、投手はローテ・抑え・中継ぎの主力。
//   - 一番手との差 … 野手の一番手なら、交換前（相手が出す選手を抜いた名簿）のその持ち場の一番手より
//     どれだけ上か。空いていた持ち場なら「空き」。
//   - 弱い持ち場 … その持ち場の相手の一番手が、リーグの下から3分の1（`tradeThoughts.js` の `WEAK_RANK` と同じ線）。
//   - 戦力の上がり … その選手が抜けた場合と比べた `squadStrength` の差（交換のあとの名簿で）。
//   - 交換全体 … 相手の `squadStrength` の伸び（交換の前 → 後）と、弱くなる持ち場。
//     CPU は「提案した側の伸び − 自分の伸び」が決まり（`gapLimit`）を超えると断るので、
//     相手の伸びが大きいほど通りやすい。
// ⚠ 人数を目標（`ONLINE_ROSTER_TARGETS`）と比べて「足りない」とは言わない（初期の名簿は12球団すべてが
//    外野不足に見える。`tradeThoughts.js` の注）。人数が成り立つかは `rosterShortfall` が別に見る。
// ⚠ **アプリの `mobile/shared/.../TradeMerit.kt` と同じ式・同じ文**。変えたら両方を直し、
//    `node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json`
//    で期待値を書き出し直す（答え合わせはアプリの `LogicTest.tradeMeritMatchesWeb`）。
// ============================================================

/** 弱い持ち場とみなす順位（読めた球団の下から3分の1。`tradeThoughts.js` の `WEAK_RANK` と同じ） */
export const MERIT_WEAK_RANK = 2 / 3;

const isActive = (p) => p.isActive !== false;

/** 小数1桁の符号つき（"+3.2"・"-0.4"・"±0"）。⚠ アプリと同じ丸め（四捨五入は Math.round） */
export function signedPoints(v) {
  const r = Math.round(v * 10);
  if (r === 0) return '±0';
  const a = Math.abs(r);
  return `${r > 0 ? '+' : '-'}${Math.floor(a / 10)}.${a % 10}`;
}

/** 名簿の中でのその選手の役割（持ち場のキーと文） */
function roleIn(roster, p) {
  if (p.position === 'pitcher') {
    const { rotation, pen } = pitchingStaff(roster);
    const r = rotation.findIndex((q) => q.id === p.id);
    if (r >= 0) return { slot: 'sp', kind: 'rotation', order: r + 1 };
    const b = pen.findIndex((q) => q.id === p.id);
    if (b === 0) return { slot: 'cl', kind: 'closer', order: 1 };
    // ⚠ `squadStrength` が数える救援は pen の先頭から BULLPEN_SIZE 人（抑え込み）。それに合わせる
    if (b > 0 && b < BULLPEN_SIZE) return { slot: 'rp', kind: 'relief', order: b };
    return { slot: null, kind: 'bench', order: 0 };
  }
  const assigned = fielderAssignment(roster);
  const at = TRADE_SLOTS.find((s) => !s.pitcher && assigned[s.key]?.holder?.id === p.id);
  if (at) return { slot: at.key, kind: 'starter', order: 1 };
  // 2人目の捕手（`squadStrength` が数える）
  const catchers = roster
    .filter(isActive)
    .map((q) => ({ q, v: slotStrength(q, 'catcher') }))
    .filter((e) => e.v !== null)
    .sort((a, b) => b.v - a.v);
  if (catchers[1]?.q.id === p.id) return { slot: 'catcher', kind: 'backupCatcher', order: 2 };
  return { slot: null, kind: 'bench', order: 0 };
}

/** 持ち場ごとの相手の順位（リーグの中。1が最強） */
function slotRanks(roster, others) {
  const tops = rosterTops(roster);
  const rivals = Object.values(others || {}).map((r) => rosterTops(r || []));
  const teams = rivals.length + 1;
  return Object.fromEntries(
    TRADE_SLOTS.map((s) => {
      const score = tops[s.key]?.score ?? 0;
      const rank = 1 + rivals.filter((t) => (t[s.key]?.score ?? 0) > score).length;
      return [s.key, { rank, teams, weak: rivals.length > 0 && rank > teams * MERIT_WEAK_RANK }];
    }),
  );
}

/**
 * 相手に与えるメリット。
 * @param theirRoster 相手の名簿（交換の前）
 * @param giving 自球団が出す選手（相手が受け取る）
 * @param getIds 相手が出す選手の id
 * @param others 相手以外の球団の名簿 `{球団名: roster}`（弱い持ち場の順位に使う。空なら順位を出さない）
 * @returns `{ players: [{ id, name, role, over, open, weak, gain, tags }], gain, weaker, tags }`
 */
export function tradeMerits(theirRoster, giving, getIds, others = {}) {
  const to = theirRoster || [];
  const get = new Set(getIds || []);
  const give = (giving || []).filter(Boolean);
  // ⚠ 並びはサーバーの `rostersAfterTrade` と同じ（残った選手のあとに来た選手）
  const base = to.filter((p) => !get.has(p.id));
  const after = [...base, ...give];
  const baseTops = rosterTops(base);
  const beforeTops = rosterTops(to);
  const afterTops = rosterTops(after);
  const ranks = slotRanks(base, others);
  const full = squadStrength(after);
  const players = give.map((p) => {
    const role = roleIn(after, p);
    const slot = role.slot ? tradeSlot(role.slot) : null;
    const strength = slot ? slotStrength(p, slot.key) : null;
    const prev = slot ? baseTops[slot.key] : null;
    const open = role.kind === 'starter' && !prev?.holder;
    const over =
      role.kind === 'starter' && !open && strength != null ? strength - prev.score : null;
    const weak = slot && role.kind !== 'bench' && role.kind !== 'backupCatcher' && ranks[slot.key]?.weak
      ? ranks[slot.key]
      : null;
    const gain = full - squadStrength(after.filter((q) => q.id !== p.id));
    const entry = { id: p.id, name: p.name, role, slot, over, open, weak, gain };
    return { ...entry, tags: meritTags(entry) };
  });
  const gain = squadStrength(after) - squadStrength(to);
  // 交換で相手の一番手が弱くなる持ち場（出す選手が抜けて、来た選手で埋まらない）
  const weaker = TRADE_SLOTS.filter(
    (s) => (afterTops[s.key]?.score ?? 0) < (beforeTops[s.key]?.score ?? 0) - 0.05,
  ).map((s) => s.label);
  const result = { players, gain, weaker };
  return { ...result, tags: summaryTags(result, give.length, get.size) };
}

/** 役割の札（「遊撃の一番手」「先発ローテ3番手」） */
export function roleText(role, slot) {
  switch (role.kind) {
    case 'starter':
      return `${slot.label}の一番手`;
    case 'backupCatcher':
      return '2人目の捕手';
    case 'rotation':
      return `先発ローテ${role.order}番手`;
    case 'closer':
      return '抑え（救援の一番手）';
    case 'relief':
      return `中継ぎの主力（${role.order}番手）`;
    default:
      return '控え';
  }
}

/**
 * 1人ぶんの札。`{ text, tone }` の並び（tone: good 得・plain ふつう）。
 * ⚠ 文はアプリと同じ（期待値で答え合わせする）
 */
export function meritTags({ role, slot, over, open, weak, gain }) {
  const tags = [{ text: roleText(role, slot), tone: role.kind === 'bench' ? 'plain' : 'good' }];
  if (open) tags.push({ text: `空いていた${slot.label}を埋める`, tone: 'good' });
  else if (over != null)
    tags.push({
      // ⚠ 新しい選手が入ると前の一番手が別の持ち場へ回ることがあり、差は負にもなる（そのときは得とは書かない）
      text: Math.round(over * 10) === 0 ? '今の一番手と並ぶ' : `今の一番手より${signedPoints(over)}`,
      tone: Math.round(over * 10) >= 0 ? 'good' : 'plain',
    });
  if (weak) tags.push({ text: `弱い${slot.label}（${weak.rank}位/${weak.teams}）を補う`, tone: 'good' });
  tags.push({
    text: `戦力${signedPoints(gain)}`,
    tone: Math.round(gain * 10) > 0 ? 'good' : 'plain',
  });
  return tags;
}

/** 交換全体の札 */
function summaryTags({ gain, weaker }, giveCount, getCount) {
  if (!giveCount && !getCount) return [];
  const r = Math.round(gain * 10);
  const tags = [
    {
      text: `相手の戦力${signedPoints(gain)}`,
      tone: r > 0 ? 'good' : r < 0 ? 'bad' : 'plain',
    },
  ];
  if (weaker.length) tags.push({ text: `相手の${weaker.join('・')}が弱くなる`, tone: 'bad' });
  return tags;
}

/** 交換全体の1文（札の後ろに添える） */
export function meritSummaryText({ gain, players }) {
  const r = Math.round(gain * 10);
  const helped = players.filter((p) => p.role.kind !== 'bench').length;
  const head = r > 0 ? '相手の戦力が上がる交換です' : r < 0 ? '相手の戦力が下がる交換です' : '相手の戦力は変わりません';
  const tail = players.length
    ? helped
      ? `（出す${players.length}人のうち${helped}人が相手の主力に入る）。`
      : '（出す選手は相手では控えになる）。'
    : '（出す選手がいない）。';
  return head + tail;
}
