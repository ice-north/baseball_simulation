import React from 'react';
import { POS } from './api.js';
import { PlayerLine } from './TryoutPlanner.jsx';
import { seasonLine } from './statsView.js';
import { ONLINE_ROSTER_TARGETS, ROSTER_LIMIT } from './shared.js';
import { rosterGroup } from '../utils/constants.js';

// ============================================================
// 契約更改（退団させる選手を選ぶ）。
//
// ⚠ いしだ指摘: 選手を切るときに適切に判断できているのか分からない。
//    以前は名前と能力3つだけの一覧で、
//      ・今季どれだけ出たか（成績）
//      ・標準案がなぜその選手を出すのか
//      ・出したあと守備位置ごとに何人残り、トライアウトで何人獲れるか
//    が見えなかった。標準案の理由は**選んでいる式そのもの**
//    （`contractRules.releaseScore`）からサーバーが作る（`phase.releaseAdvice`）。
//    画面で別の理屈を書かない。
// ============================================================

const GROUPS = [
  ['pitcher', '投手'],
  ['catcher', '捕手'],
  ['infielder', '内野'],
  ['outfielder', '外野'],
];

export default function ContractPlanner({ roster, plan, advice = {}, onChange }) {
  const released = new Set(plan.releaseIds);
  const remaining = roster.filter((p) => !released.has(p.id));
  const counts = Object.fromEntries(GROUPS.map(([g]) => [g, 0]));
  for (const p of remaining) counts[rosterGroup(p.position)] += 1;
  const toggle = (id, on) =>
    onChange({
      releaseIds: on
        ? [...plan.releaseIds, id]
        : plan.releaseIds.filter((x) => x !== id),
    });
  return (
    <div className="online-contract">
      <p className="online-contract-summary">
        <strong>
          退団予定 {released.size}人 → 残り {remaining.length}人
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
          人を獲れます（上限{ROSTER_LIMIT}人）。目標に足りない区分はトライアウトで優先して埋まります。
        </small>
      </p>
      <p className="online-muted">
        チェックした選手が退団します。最低9人を残してください。
        標準案は「30歳以上」と「能力の低さ」で点を付けて選び、トライアウトで入れ替えるため
        毎年少なくとも3人を出します。このあとの年度更新で、若い選手は伸び、30歳を過ぎると衰えやすくなります。
      </p>
      {/* ⚠ 名前だけでなく能力と今季の成績も並べる。名前を押すと詳しい成績と能力を開く */}
      <ul className="online-tryout-list online-release-list">
        {roster.map((p) => {
          const reasons = advice[p.id];
          return (
            <li key={p.id} data-wanted={released.has(p.id) || undefined}>
              <input
                type="checkbox"
                aria-label={`${p.name}（${p.age}歳 / ${POS[p.position]}）を退団させる`}
                checked={released.has(p.id)}
                onChange={(e) => toggle(p.id, e.target.checked)}
              />
              {/* ⚠ 標準案の理由は**名前の下の段**に置く（横に並べない）。2列の一覧で
                  横に置くと、狭い画面（1024px）では名前の欄が90px前後に削られ、
                  能力と成績が4〜5行に折り返していた */}
              <span className="online-tryout-person">
                <PlayerLine player={p} />
                <small className="online-contract-season">{seasonLine(p)}</small>
                {reasons && (
                  <span
                    className="online-contract-reason"
                    title="標準案（決めなかったときに使われる案）でこの選手が退団になる理由"
                  >
                    標準案で退団: {reasons.length ? reasons.join('・') : '枠を空けるため'}
                  </span>
                )}
              </span>
              {released.has(p.id) && (
                <span className="online-tryout-mark">退団予定</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
