import React, { useState } from 'react';
import { POS } from './api.js';
import { AbilityGrade, PlayerStatsButton } from './PlayerPerformance.jsx';
import { statGroup, formatStat } from './statsView.js';
import { ONLINE_ROSTER_TARGETS, ROSTER_LIMIT, ROSTER_STANDARD } from './shared.js';
import { rosterGroup } from '../utils/constants.js';
import { contractColumns, sortContractRoster, STAFF_MOVE_CHOICES, STAFF_ROLE_NAMES as ROLE_NAMES, staffMoveLines } from './contractTable.js';

export { staffMoveLines };

// ============================================================
// 契約更改（解雇する選手を選ぶ）。
//
// ⚠ いしだ指摘: 選手を切るときに適切に判断できているのか分からない。
//    以前は名前と能力3つだけの一覧で、
//      ・今季どれだけ出たか（成績）
//      ・標準案がなぜその選手を出すのか
//      ・出したあと守備位置ごとに何人残り、トライアウトで何人獲れるか
//    が見えなかった。標準案の理由は**選んでいる式そのもの**
//    （`contractRules.releaseScore`）からサーバーが作る（`phase.releaseAdvice`）。
//    画面で別の理屈を書かない。
// ⚠ 先方指摘「2列13行を1列26行に。名前・投打・年齢・各パラメータ・成績を網羅し、
//    最右に解雇ボタン。各能力値でソートできるように」。**1人1行の表**にし、見出しを押すと
//    その列で並べ替える（もう一度押すと逆順）。列の定義と並べ方は `contractTable.js`
//    （node から検査できるように画面と分けてある）。
// ⚠ 表は横に長い（列が20を超える）。狭い画面では表だけ横に送る（ページ全体を広げない）。
// ============================================================

const GROUPS = [
  ['pitcher', '投手'],
  ['catcher', '捕手'],
  ['infielder', '内野'],
  ['outfielder', '外野'],
];

/** 成績の列（`statsView` の列をそのまま使う。画面ごとに別の式を書かない） */
const statColumn = (category, group, id) =>
  statGroup(category, group).columns.find((c) => c.id === id);

function Cell({ column, player }) {
  const value = column.get(player);
  if (column.kind === 'ability')
    return value === null ? (
      <span className="online-muted">—</span>
    ) : (
      <AbilityGrade value={value} velocity={column.velocity} stamina={column.stamina} />
    );
  if (column.kind === 'stat') {
    const source = statColumn(column.category, column.group, column.stat);
    return value === null ? (
      <span className="online-muted">—</span>
    ) : (
      formatStat(source || { format: column.format }, value)
    );
  }
  if (column.text) return column.text(player) ?? <span className="online-muted">—</span>;
  return value ?? '—';
}

/** コーチ打診の役職（`server/coachEngine.mjs` の `hirePlayerAsCoach`）。⚠ 役職はアプリの ProceduresScreen.kt（`COACH_OFFER_ROLES`）と同じ。ボタンの名前も同じ（「投手コーチに打診」など） */
export const COACH_OFFER_ROLES = [
  ['pitching', '投手コーチ'],
  ['batting', '野手コーチ'],
];

/** 契約更改の「指導者の異動」の欄。席ごとに続投・退任・昇格を選ぶ */
function StaffMoves({ seats, plan, onMoves }) {
  const moves = plan.staffMoves || {};
  const offers = plan.coachOffers || {};
  const set = (role, to) => {
    const next = { ...moves };
    if (to == null) delete next[role];
    else next[role] = to;
    // ⚠ 監督に上げるコーチは退任にできない（サーバーも弾く）。昇格を選んだらそのコーチの退任を外す
    if (role === 'manager' && to && to !== 'leave') delete next[to];
    onMoves(next);
  };
  const lines = staffMoveLines(plan, seats);
  return (
    <section className="online-contract-staff" aria-label="指導者の異動">
      <h4>
        指導者の異動
        <small>年度更新で動きます。空いた席はキャンプの間に指導者のページで呼べます（呼ばなければキャンプの終わりに市場から埋めます）</small>
      </h4>
      <ul>
        {['manager', 'pitching', 'batting'].map((role) => {
          const coach = seats.find((s) => s.role === role)?.coach;
          const promoted = moves.manager === role;
          return (
            <li key={role}>
              <span className="online-contract-staff-seat">
                {ROLE_NAMES[role]}
                <b>{coach ? coach.name : '（空席）'}</b>
              </span>
              {coach && !promoted ? (
                <span className="online-segments" role="group" aria-label={`${ROLE_NAMES[role]}の異動`}>
                  {STAFF_MOVE_CHOICES[role].map(([to, label]) => {
                    // 昇格させるコーチが居なければ押せない
                    const missing = role === 'manager' && to && to !== 'leave' && !seats.find((s) => s.role === to)?.coach;
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={(moves[role] ?? null) === to}
                        disabled={missing}
                        onClick={() => set(role, to)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </span>
              ) : (
                <span className="online-muted">{promoted ? '監督に昇格' : 'キャンプの間に呼べます'}</span>
              )}
              {role !== 'manager' && offers[role] != null && (
                <span className="online-contract-staff-note">打診した選手が就任</span>
              )}
            </li>
          );
        })}
      </ul>
      {lines.length > 0 && <p className="online-contract-staff-plan">年度更新で: {lines.join('。')}。</p>}
    </section>
  );
}

export default function ContractPlanner({ roster, plan, advice = {}, staff = null, onChange }) {
  const released = new Set(plan.releaseIds);
  const offers = plan.coachOffers || {};
  const offerOf = (id) => COACH_OFFER_ROLES.find(([role]) => offers[role] === id)?.[0] || null;
  const remaining = roster.filter((p) => !released.has(p.id) && !offerOf(p.id));
  const counts = Object.fromEntries(GROUPS.map(([g]) => [g, 0]));
  for (const p of remaining) counts[rosterGroup(p.position)] += 1;
  // 並べ替え（列のidと向き）。null は名簿の並び（守備位置の順）
  const [sort, setSort] = useState(null);
  const columns = contractColumns();
  const rows = sortContractRoster(roster, sort && columns.find((c) => c.id === sort.id), sort?.dir);
  // ⚠ 解雇と打診は同じ選手に重ねない（サーバーも弾く）。片方を選んだらもう片方を外す
  const withoutOffer = (id) =>
    Object.fromEntries(Object.entries(offers).filter(([, x]) => x !== id));
  // 打診・異動が無ければ `coachOffers`・`staffMoves` ごと外す（前と同じ形の案を送る）
  const send = (releaseIds, coachOffers, staffMoves = plan.staffMoves || {}) => {
    const { coachOffers: _drop, staffMoves: _dropMoves, ...rest } = plan;
    void _drop;
    void _dropMoves;
    onChange({
      ...rest,
      releaseIds,
      ...(Object.keys(coachOffers).length ? { coachOffers } : {}),
      ...(Object.keys(staffMoves).length ? { staffMoves } : {}),
    });
  };
  const toggle = (id, on) =>
    send(
      on ? [...plan.releaseIds, id] : plan.releaseIds.filter((x) => x !== id),
      on ? withoutOffer(id) : offers,
    );
  const offer = (id, role) => {
    const next = withoutOffer(id);
    if (offers[role] !== id) next[role] = id;
    send(plan.releaseIds.filter((x) => x !== id), next);
  };
  const sortBy = (column) =>
    setSort((now) =>
      now?.id === column.id
        ? { id: column.id, dir: now.dir === 'desc' ? 'asc' : 'desc' }
        : { id: column.id, dir: column.dir || 'desc' },
    );
  return (
    <div>
      {staff?.seats && (
        <StaffMoves seats={staff.seats} plan={plan} onMoves={(next) => send(plan.releaseIds, offers, next)} />
      )}
      <p className="online-contract-summary">
        <strong>
          解雇予定 {released.size}人
          {Object.keys(offers).length > 0 && `・コーチ打診 ${Object.keys(offers).length}人`} → 残り {remaining.length}人
        </strong>
        <span>
          {GROUPS.map(([g, label]) => {
            const short = counts[g] < ONLINE_ROSTER_TARGETS[g];
            return (
              <span key={g} data-short={short || undefined}>
                {label}
                {counts[g]}/{ONLINE_ROSTER_TARGETS[g]}
              </span>
            );
          })}
        </span>
        <small>
          続くトライアウトで最大 {Math.max(0, ROSTER_LIMIT - remaining.length)}
          人を獲れます（標準{ROSTER_STANDARD}人・上限{ROSTER_LIMIT}人。人数を決めなければ標準まで埋めます）。目標に足りない区分はトライアウトで優先して埋まります。
        </small>
      </p>
      <p className="online-muted">
        右端の「解雇」を押した選手が退団します（もう一度押すと取り消し）。最低9人を残してください。
        見出しを押すと、その項目で並べ替えます。
        「投手C」「野手C」はコーチ打診です。打診した選手は現役を退いて名簿を離れ、年度更新でその役職のコーチに就きます（いまのコーチは市場へ戻ります。各役職1人まで）。
        上の「指導者の異動」で、監督の退任・コーチの監督への昇格・コーチの退任も決められます（年度更新で動きます）。
        標準案は「30歳以上」と「能力の低さ」で点を付けて選び、トライアウトで入れ替えるため
        毎年少なくとも3人を出します。このあとの年度更新で、若い選手は伸び、30歳を過ぎると衰えやすくなります。
      </p>
      <div className="online-contract-scroll">
        <table className="online-contract-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.id} className={column.className} title={column.title}>
                  <button
                    type="button"
                    aria-label={`${column.title || column.label}で並べ替え`}
                    aria-pressed={sort?.id === column.id}
                    onClick={() => sortBy(column)}
                  >
                    {column.label}
                    {sort?.id === column.id ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
              ))}
              <th className="online-contract-action">解雇</th>
              <th className="online-contract-action">コーチ打診</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const reasons = advice[p.id];
              const on = released.has(p.id);
              return (
                <tr key={p.id} data-released={on || offerOf(p.id) ? true : undefined}>
                  {columns.map((column) =>
                    column.id === 'name' ? (
                      <th key={column.id} scope="row" className="online-contract-name">
                        <PlayerStatsButton player={p} panel="abilities" />
                        {/* ⚠ 標準案の理由は名前の下の段に置く（横に並べると名前の欄が削られる） */}
                        {reasons && (
                          <span
                            className="online-contract-reason"
                            title="標準案（決めなかったときに使われる案）でこの選手が退団になる理由"
                          >
                            標準案で退団: {reasons.length ? reasons.join('・') : '枠を空けるため'}
                          </span>
                        )}
                      </th>
                    ) : (
                      <td key={column.id} className={column.className}>
                        <Cell column={column} player={p} />
                      </td>
                    ),
                  )}
                  <td className="online-contract-action">
                    {/* ⚠ 押せる大きさを保つ（スマホでは指で押す）。押した状態は aria-pressed で読める */}
                    <button
                      type="button"
                      className={on ? 'online-contract-release is-on' : 'online-contract-release'}
                      aria-pressed={on}
                      aria-label={`${p.name}（${p.age}歳 / ${POS[p.position]}）を解雇する`}
                      onClick={() => toggle(p.id, !on)}
                    >
                      {on ? '解雇予定' : '解雇'}
                    </button>
                  </td>
                  <td className="online-contract-action online-contract-offer">
                    {COACH_OFFER_ROLES.map(([role, label]) => {
                      const picked = offers[role] === p.id;
                      return (
                        <button
                          key={role}
                          type="button"
                          className={picked ? 'online-contract-release is-on' : 'online-contract-release'}
                          aria-pressed={picked}
                          aria-label={`${p.name}に${label}を打診する`}
                          title={picked ? `${label}に打診中（もう一度押すと取り消し）` : `${label}に打診する（いまの${label}と入れ替わります）`}
                          onClick={() => offer(p.id, role)}
                        >
                          {picked ? `${label.slice(0, 2)}C打診` : `${label.slice(0, 2)}C`}
                        </button>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
