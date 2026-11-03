import React, { useState } from 'react';
import { POS } from './api.js';
import { AbilityGrade, PlayerStatsButton } from './PlayerPerformance.jsx';

// ============================================================
// 初期メンバーの選択。20セットから1つ選ぶ。
//
// ⚠ **同じセットは1球団だけ**。選手のidと名前が重複すると、記録が
//    どちらの選手のものか分からなくなる。取り合いになったら球団名の順で
//    決まる（サーバー側）。ここでは「他の人が決めた」ことまでは分からない
//    ——決定は同時に開くので、画面で早い者勝ちにはできない。
// ⚠ 合計点はセット同士の釣り合いを測る目安であって、試合の強さではない。
//    実測で20セットの開きは1%前後。どれを選んでも極端な差は出ない。
// ============================================================

const GROUPS = [
  ['pitcher', '投'],
  ['catcher', '捕'],
  ['infield', '内'],
  ['outfield', '外'],
];

function Roster({ pack }) {
  const [side, setSide] = useState('all');
  const list = pack.players.filter((p) =>
    side === 'all'
      ? true
      : side === 'pitcher'
        ? p.position === 'pitcher'
        : p.position !== 'pitcher',
  );
  return (
    <>
      <div className="online-segments" aria-label="区分">
        {[
          ['all', `全員 ${pack.players.length}`],
          ['pitcher', '投手'],
          ['fielder', '野手'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={side === id} onClick={() => setSide(id)}>
            {label}
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>選手</th>
            <th>格</th>
            <th>齢</th>
            <th>位置</th>
            <th>ミート</th>
            <th>パワー</th>
            <th>走力</th>
            <th>守備</th>
            <th>球速</th>
            <th>制球</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <th>
                <PlayerStatsButton player={p} panel="abilities" />
                {/* ⚠ 二刀流は数が少ないので目印を出す。見落とすと編成を組み違える */}
                {p.isTwoWay && <small className="online-role-mark">二刀流</small>}
              </th>
              <td>{p.rank}</td>
              <td>{p.age}</td>
              <td>{POS[p.position]}</td>
              <td>
                <AbilityGrade value={p.batting?.meet} />
              </td>
              <td>
                <AbilityGrade value={p.batting?.power} />
              </td>
              <td>
                <AbilityGrade value={p.physical?.speed} />
              </td>
              <td>
                <AbilityGrade value={p.fielding?.defense} />
              </td>
              <td>
                <AbilityGrade value={p.pitching?.velocity} velocity />
              </td>
              <td>
                <AbilityGrade value={p.pitching?.control} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function PackSelect({ packs, plan, busy, onChange }) {
  const [open, setOpen] = useState(() => plan?.packId || packs[0]?.id);
  const shown = packs.find((p) => p.id === open) || packs[0];
  return (
    <div className="online-packs">
      <p className="online-muted">
        20セットから1つ選びます。どのセットも
        <strong>投12・捕2・内外10</strong>の24人（うち二刀流2人）で、格付けは
        <strong>A2・B10・C12</strong>、年齢は19〜24歳です。
        合計の力は揃えてあるので（開きは1%前後）、好みで選んで構いません。
        選んだセットは1球団だけが受け取ります（重なったら球団名の順）。
      </p>
      <div className="online-pack-list">
        {packs.map((pack) => (
          <button
            key={pack.id}
            className="online-pack-card"
            aria-pressed={plan?.packId === pack.id}
            aria-current={pack.id === open ? 'true' : undefined}
            disabled={busy}
            onClick={() => setOpen(pack.id)}
          >
            <strong>{pack.name}</strong>
            <small>
              {GROUPS.map(([key, label]) => `${label}${pack.counts[key]}`).join(' ')}
            </small>
            <small>
              平均{pack.averageAge}歳 · 二刀流{pack.twoWay}
            </small>
            {plan?.packId === pack.id && <span className="online-pack-chosen">選択中</span>}
          </button>
        ))}
      </div>
      {shown && (
        <section className="online-pack-detail">
          <div className="online-card-heading">
            <h3>{shown.name}</h3>
            <button
              className="online-primary"
              disabled={busy || plan?.packId === shown.id}
              onClick={() => onChange({ ...plan, packId: shown.id })}
            >
              {plan?.packId === shown.id ? '選択中' : 'このセットにする'}
            </button>
          </div>
          <Roster pack={shown} />
        </section>
      )}
    </div>
  );
}
