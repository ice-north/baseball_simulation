import React, { useMemo, useState } from 'react';
import { POS } from './api.js';
import { AbilityGrade, PlayerStatsButton } from './PlayerPerformance.jsx';
import { PageNav } from './PageNav.jsx';
import { rosterGroup } from '../utils/constants.js';
import {
  POSITION_GROUPS,
  SORT_KEYS,
  filterCandidates,
  planSummary,
  plannedPicks,
  addToPlan,
  benchFromPlan,
  shiftInPlan,
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
const GROUP_LABELS = {
  pitcher: '投手',
  catcher: '捕手',
  infielder: '内野手',
  outfielder: '外野手',
};

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
  const [notice, setNotice] = useState('');

  const byId = useMemo(
    () => new Map(candidates.map((p) => [p.id, p])),
    [candidates],
  );
  const count = Math.min(plan.count, plan.rankedIds.length);
  // ⚠ **希望順の上から count 人、ではない**。サーバーは目標構成
  //    （投手10・捕手2・内野6・外野6）を超える区分を飛ばすので、
  //    同じ規則で「実際に取る顔ぶれ」を出す。ここを希望順の先頭にすると、
  //    画面に並んでいる顔ぶれと実際に取る顔ぶれが食い違う
  const { counts, picked, targets, blocking, warnings } = planSummary(
    plan.rankedIds,
    candidates,
    count,
    roster,
  );
  const wanted = picked.map((p) => p.id);
  const wantedSet = useMemo(() => new Set(wanted), [wanted.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const bench = plan.rankedIds.filter((id) => !wantedSet.has(id));

  const pool = useMemo(
    () => filterCandidates(candidates, { group, query, sortKey }),
    [candidates, group, query, sortKey],
  );
  const shown = pool.slice(page * PAGE, page * PAGE + PAGE);

  const setRanked = (rankedIds) => {
    setNotice('');
    onChange({ ...plan, rankedIds });
  };
  // ⚠ 操作は**獲得予定を基準に**行う（`tryoutPlan.js` の説明を参照）。
  //    `rankedIds` の位置で動かすと、目標構成で飛ばされる選手が挟まったときに
  //    押した選手が入らない・消える・別の選手が入る、が起きていた
  // ⚠ 「外す」は**消さずに末尾へ**。消すと競合したときの繰り上がりが無くなる
  const drop = (id) =>
    setRanked(benchFromPlan(plan.rankedIds, candidates, count, roster, id));
  const shift = (index, delta) =>
    setRanked(shiftInPlan(plan.rankedIds, candidates, count, roster, index, delta));
  const add = (id, first) => {
    const next = addToPlan(plan.rankedIds, candidates, count, roster, id, { first });
    // ⚠ 黙って何も起きない、を作らない。今の名簿だけでその区分が目標を超えていると、
    //    サーバーも取りにいかないので、獲得予定には入れられない
    if (!plannedPicks(next, candidates, count, roster).some((p) => p.id === id)) {
      setNotice(
        `${byId.get(id)?.name}は、今の名簿だけで${GROUP_LABELS[rosterGroup(byId.get(id)?.position)]}が目標人数に達しているため、獲得予定に入れられません。`,
      );
      return;
    }
    setRanked(next);
  };

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
                // ⚠ 整数に丸める。「2.5」や不正な値をそのまま送ると、
                //    サーバーの「獲得人数が不正です」で弾かれる
                count: Math.max(
                  0,
                  Math.min(maxCount, Math.trunc(Number(e.target.value)) || 0),
                ),
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
        名簿が偏らないよう、<strong>投{targets.pitcher}・捕{targets.catcher}・内
        {targets.infielder}・外{targets.outfielder}</strong>
        を超える区分は飛ばします（CPUの球団も同じ目標です）。
      </p>

      <div className="online-tryout-grid">
        <section className="online-tryout-wanted">
          <h3>
            獲得予定 {wanted.length}人
            {/* ⚠ 目標も並べて出す。超えたぶんは飛ばされるので、
                数字だけだと「希望したのに入らない」理由が分からない */}
            <small>
              　投{counts.pitcher}/{targets.pitcher} 捕{counts.catcher}/
              {targets.catcher} 内{counts.infielder}/{targets.infielder} 外
              {counts.outfielder}/{targets.outfielder}
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
          {notice && (
            <p role="status" className="online-tryout-warn">
              {notice}
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
                {/* ⚠ 希望リストの隣ではなく**獲得予定の隣**と入れ替える。
                    間に飛ばされた選手が挟まっていると、希望リストの中で
                    1つ動かしても画面の並びが変わらず、壊れて見える */}
                <button
                  type="button"
                  aria-label={`${byId.get(id)?.name}の希望順位を上げる`}
                  disabled={i === 0 || busy}
                  onClick={() => shift(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${byId.get(id)?.name}の希望順位を下げる`}
                  disabled={i === wanted.length - 1 || busy}
                  onClick={() => shift(i, 1)}
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
            <ol className="online-tryout-list online-tryout-bench" start={wanted.length + 1}>
              {bench.slice(0, 40).map((id) => (
                <li key={id}>
                  <span className="online-tryout-person">
                    <Line player={byId.get(id)} />
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => add(id, true)}
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
                    {/* ⚠ 獲得予定の番号で出す。希望リスト全体の位置だと、
                        飛ばされた選手のぶん左の一覧の番号とずれる */}
                    指名中 {wanted.indexOf(p.id) + 1}位
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => add(p.id, true)}
                    >
                      最優先へ
                    </button>
                    <button
                      type="button"
                      disabled={busy || count === 0}
                      onClick={() => add(p.id, false)}
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
