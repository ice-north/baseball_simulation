import React, { useMemo, useState } from 'react';
import { POS } from './api.js';
import { AbilityGrade, PlayerStatsButton } from './PlayerPerformance.jsx';
import { PageNav } from './PageNav.jsx';
import {
  POSITION_GROUPS,
  SORT_KEYS,
  filterCandidates,
  moveRanked,
  swapRanked,
  planSummary,
} from './tryoutPlan.js';

// ============================================================
// 初期編成・トライアウトの希望リストを組み立てる画面（PC）。
//
// ⚠ **一人用のトライアウト画面は移植できない**。あちらは「順番が回ってきたら
//    1人選ぶ」生のドラフトで、こちらは非同期なので「希望リストを1回出す」。
//    操作の型が違うので、見せ方だけ借りて作り直している。
//
// ⚠ 候補は実測360人。以前は360行を1本のリストにして ↑↓ で並べ替えており、
//    300番目を1番にするのに299回押す必要があった。ここでは
//    「獲得予定の上位だけを並べ、残りは推奨順のまま控える」形にする。
//
// ⚠ `rankedIds` からは**誰も取り除かない**。サーバーは上から見て空いている人を
//    取るので、全員残しておくと競合したとき繰り上がる。「外す」は末尾送り。
// ============================================================

const PAGE = 12;

function Line({ player }) {
  if (!player) return null;
  return (
    <>
      <PlayerStatsButton player={player} panel="abilities" />
      <small>
        {player.age}歳 / {POS[player.position]} /{' '}
        {player.position === 'pitcher' ? (
          <>
            球速<AbilityGrade value={player.pitching?.velocity} velocity />{' '}
            制球<AbilityGrade value={player.pitching?.control} /> スタミナ
            <AbilityGrade value={player.pitching?.stamina} stamina />
          </>
        ) : (
          <>
            ミート<AbilityGrade value={player.batting?.meet} /> パワー
            <AbilityGrade value={player.batting?.power} /> 守備
            <AbilityGrade value={player.fielding?.defense} />
          </>
        )}
      </small>
    </>
  );
}

export default function TryoutPlanner({
  plan,
  candidates,
  roster,
  maxCount,
  busy,
  onChange,
  onReset,
}) {
  const [group, setGroup] = useState('all');
  const [sortKey, setSortKey] = useState('overall');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [showBench, setShowBench] = useState(false);

  const byId = useMemo(
    () => new Map(candidates.map((p) => [p.id, p])),
    [candidates],
  );
  const count = Math.min(plan.count, plan.rankedIds.length);
  const wanted = plan.rankedIds.slice(0, count);
  const bench = plan.rankedIds.slice(count);
  const wantedSet = useMemo(() => new Set(wanted), [wanted]);
  const { counts, blocking, warnings } = planSummary(
    plan.rankedIds,
    candidates,
    count,
    roster,
  );

  const pool = useMemo(
    () => filterCandidates(candidates, { group, query, sortKey }),
    [candidates, group, query, sortKey],
  );
  const shown = pool.slice(page * PAGE, page * PAGE + PAGE);

  const setRanked = (rankedIds) => onChange({ ...plan, rankedIds });
  // ⚠ 「外す」は**消さずに末尾へ**。消すと競合したときの繰り上がりが無くなる
  const drop = (id) => setRanked(moveRanked(plan.rankedIds, id, plan.rankedIds.length));

  return (
    <div className="online-tryout">
      <div className="online-tryout-head">
        <label>
          獲得希望人数（最大{maxCount}人）
          <input
            type="number"
            min="0"
            max={maxCount}
            value={plan.count}
            onChange={(e) =>
              onChange({
                ...plan,
                count: Math.max(0, Math.min(maxCount, Number(e.target.value))),
              })
            }
          />
        </label>
        <button type="button" disabled={busy} onClick={onReset}>
          おすすめ順に戻す
        </button>
      </div>
      <p className="online-muted">
        上から順に取りにいきます。他球団に先を越された選手は飛ばして、控えから繰り上がります。
      </p>

      <div className="online-tryout-grid">
        <section className="online-tryout-wanted">
          <h3>
            獲得予定 {wanted.length}人
            <small>
              　投{counts.pitcher} 捕{counts.catcher} 内{counts.infield} 外
              {counts.outfield}
            </small>
          </h3>
          {/* ⚠ 成り立たない編成は、提出した瞬間ではなく**ここ**で知らせる。
              手続きは全員ぶんまとめて処理されるので、1球団が成り立たないと
              全員が先へ進めない */}
          {blocking.length > 0 && (
            <p role="alert" className="online-tryout-block">
              このままでは決定できません: {blocking.join(' / ')}
              　獲得希望人数を増やすか、希望順位を入れ替えてください。
            </p>
          )}
          {warnings.length > 0 && (
            <p role="alert" className="online-tryout-warn">
              {warnings.join(' / ')}
              　この位置は人数が足りないと自動で埋められます。
            </p>
          )}
          {wanted.length === 0 && <p>獲得希望人数を1人以上にしてください。</p>}
          <ol className="online-tryout-list">
            {wanted.map((id, i) => (
              <li key={id}>
                <span className="online-tryout-rank">{i + 1}</span>
                <span className="online-tryout-person">
                  <Line player={byId.get(id)} />
                </span>
                <button
                  type="button"
                  aria-label={`${byId.get(id)?.name}の希望順位を上げる`}
                  disabled={i === 0 || busy}
                  onClick={() => setRanked(swapRanked(plan.rankedIds, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${byId.get(id)?.name}の希望順位を下げる`}
                  disabled={i === wanted.length - 1 || busy}
                  onClick={() => setRanked(swapRanked(plan.rankedIds, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`${byId.get(id)?.name}を控えへ回す`}
                  disabled={busy}
                  onClick={() => drop(id)}
                >
                  控えへ
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="online-tryout-bench-toggle"
            aria-expanded={showBench}
            onClick={() => setShowBench(!showBench)}
          >
            控え {bench.length}人{showBench ? ' を閉じる' : ' を見る'}
          </button>
          {showBench && (
            <ol className="online-tryout-list online-tryout-bench" start={count + 1}>
              {bench.slice(0, 40).map((id) => (
                <li key={id}>
                  <span className="online-tryout-person">
                    <Line player={byId.get(id)} />
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRanked(moveRanked(plan.rankedIds, id, 0))}
                  >
                    最優先へ
                  </button>
                </li>
              ))}
              {bench.length > 40 && (
                <li className="online-muted">
                  ほか{bench.length - 40}人（下の「候補を探す」から指名できます）
                </li>
              )}
            </ol>
          )}
        </section>

        <section className="online-tryout-pool">
          <h3>候補を探す（{pool.length}人）</h3>
          <div className="online-segments" aria-label="守備位置">
            {POSITION_GROUPS.map((g) => (
              <button
                type="button"
                key={g.key}
                aria-pressed={group === g.key}
                onClick={() => {
                  setGroup(g.key);
                  setPage(0);
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="online-tryout-tools">
            <label>
              並べ替え
              <select
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value);
                  setPage(0);
                }}
              >
                {SORT_KEYS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              名前
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
          <ul className="online-tryout-list">
            {shown.map((p) => (
              <li key={p.id} data-wanted={wantedSet.has(p.id) || undefined}>
                <span className="online-tryout-person">
                  <Line player={p} />
                </span>
                {wantedSet.has(p.id) ? (
                  <span className="online-tryout-mark">
                    指名中 {plan.rankedIds.indexOf(p.id) + 1}位
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRanked(moveRanked(plan.rankedIds, p.id, 0))}
                    >
                      最優先へ
                    </button>
                    <button
                      type="button"
                      disabled={busy || count === 0}
                      onClick={() =>
                        setRanked(moveRanked(plan.rankedIds, p.id, count - 1))
                      }
                    >
                      指名に加える
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <PageNav page={page} count={pool.length} size={PAGE} setPage={setPage} />
        </section>
      </div>
    </div>
  );
}
