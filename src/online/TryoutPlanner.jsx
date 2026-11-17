import React, { useMemo, useRef, useState } from 'react';
import { POS } from './api.js';
import { AbilityGrade, PlayerStatsButton } from './PlayerPerformance.jsx';
import { PageNav } from './PageNav.jsx';
import { rosterGroup, rosterCounts } from '../utils/constants.js';
import { AbilityValue } from '../components/AbilityValue.jsx';
import { formatStat } from './statsView.js';
import { playablePositions } from './lineupEdit.js';
import { PLAYER_KINDS, kindOf, pitchTypes } from './playerColumns.js';
import {
  POSITION_GROUPS,
  SORT_KEYS,
  filterCandidates,
  planSummary,
  addToPlan,
  removeFromPlan,
  shiftInPlan,
  moveInPlan,
  wishLimit,
  signTotal,
  wishedCount,
  minimumShort,
  fillsAutomatically,
  TRYOUT_WISH_MAX,
  WEIGHT_FIELDS,
  WEIGHT_MAX,
  WEIGHT_LEVELS,
  WEIGHTED_SORT_KEY,
  DEFAULT_WEIGHTS,
  sanitizeWeights,
  weightedScore,
  weightedRanked,
  teamFitRank,
} from './tryoutPlan.js';

// ============================================================
// 初期編成・トライアウトの希望リストを組み立てる画面。
//
// 【形】（2026-11-17 いしだ要望で作り替え）
//   - **上に「交渉する選手」**（獲得する人数・交渉中の人数・獲得後の名簿をここにまとめる）。
//   - **下に「受験者」を全幅**。PCは**スタメン設定・トレードと同じ1枚の表**
//     （`.online-lineup-table`）で、能力を網羅的に並べる。以前は左右2列で、
//     受験者の欄が画面の半分しかなく、能力は3つ（投手なら球速・制球・スタミナ）だけだった。
//   - 受験者の表は**投手と野手で分ける**。比べたい能力が違うので、1枚に混ぜると
//     片方の列が全部「—」になる（列はトレードと共通の `playerColumns.js`）。
// ⚠ **スマホは表にしない**（320px に能力の列が入らない）。`mobile` を受け取って
//    カードの行のまま出す（`online-edit-ui-check` が 320px で確かめている）。
//
// ⚠ **一人用のトライアウト画面は移植できない**。あちらは「順番が回ってきたら
//    1人選ぶ」生のドラフトで、こちらは非同期なので「希望リストを1回出す」。
//    操作の型が違うので、見せ方だけ借りて作り直している。
//
// ⚠ 候補は実測360人。以前は360行を1本のリストにして ↑↓ で並べ替えており、
//    300番目を1番にするのに299回押す必要があった。次に「獲得予定＋控え」に
//    分けたが、希望人数の入力・目標構成による飛ばし・控えの開閉が重なって
//    「使いにくい」（いしだ指摘）ままだった。
//
// ⚠ いまは**一覧から「交渉」を押して20人まで選ぶ**だけ。選んだ順が1位〜20位で、
//    ↑↓ とドラッグで入れ替えられる。同じ選手を複数の球団が希望したら、
//    **前年の順位が上の球団**が取る（`resolveTryout`）。
// ============================================================

/** 1ページに出す人数。PCは表なので多め、スマホはカードなので少なめ */
const PAGE = 20;
const MOBILE_PAGE = 12;
const GROUP_LABELS = {
  pitcher: '投手',
  catcher: '捕手',
  infielder: '内野手',
  outfielder: '外野手',
};

// 重みはこのブラウザにだけ覚える（サーバーへは送らない。保存の形を変えない）。
// ⚠ 読めない・書けないブラウザ（プライベートモードなど）でも画面は動かす
const WEIGHTS_KEY = 'baseball-online-tryout-weights';
function loadWeights() {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    if (raw) return sanitizeWeights(JSON.parse(raw));
  } catch {
    /* 既定の重みで続ける */
  }
  return { ...DEFAULT_WEIGHTS };
}
function storeWeights(weights) {
  try {
    localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
  } catch {
    /* 覚えられなくても、この画面の間は使える */
  }
}

/**
 * どこから来た人か（高校・大学・元の球団）。
 * ⚠ トライアウトは**知らない選手を選ぶ**場なので、素性は能力と同じくらいの手がかり。
 *    実測で120人のうち119人に出身が入っている
 */
export function originOf(player) {
  const origin = player?.origin || {};
  if (origin.previousTeam) return `元${origin.previousTeam}`;
  return origin.university || origin.highSchool || '';
}

/** 名簿の同じ区分で何番手か（うちに入ったら使えるのか）。行でも表でも使う */
function FitMark({ fit }) {
  if (!fit) return null;
  return (
    <span
      className="online-tryout-fit"
      data-top={fit.rank <= 2 || undefined}
      title={`いまの名簿の${GROUP_LABELS[fit.group]}${fit.of}人と、同じ重みの評価値で比べた順位`}
    >
      うちの{GROUP_LABELS[fit.group]}で{fit.rank}番手
    </span>
  );
}

/** 選手1人の1行（名前・年齢・位置・主な能力）。交渉する選手の欄と、スマホの受験者で使う */
function Line({ player, score, fit }) {
  if (!player) return null;
  return (
    <>
      <PlayerStatsButton player={player} panel="abilities" />
      <FitMark fit={fit} />
      {/* 甲子園で名を上げた人（サーバーが付ける。`koshienNoteOf`） */}
      {player.koshien && <span className="online-tryout-fit">{player.koshien}</span>}
      <small>
        {score !== undefined && (
          <b className="online-tryout-score" title="重視する能力から出した評価値（0〜100）">
            評価{Math.round(score)}{' '}
          </b>
        )}
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
        {originOf(player) && ` / ${originOf(player)}`}
      </small>
    </>
  );
}

/**
 * 今季の成績の列を出すか。⚠ **出場した人が1人でも居るときだけ**。受験者はほとんどが
 * 高校生・大学生で、実測120人中**0人**しか今季の成績を持たない（元プロが混じる年だけ
 * 中身が入る）。出場数で見ないと「登板0・防御率—」の列が並んで、表が読みにくくなる。
 */
const PLAYING_TIME = { fielder: 'pa', pitcher: 'outs' };
const hasStats = (players, kind) => {
  const column = PLAYER_KINDS[kind].stats.find(
    (c) => c.id === PLAYING_TIME[kind],
  );
  return !!column && players.some((p) => Number(column.get(p)) > 0);
};

/**
 * 受験者の表（PC）。⚠ **スタメン設定・トレードと同じ表**（`.online-lineup-table`）。
 * 列は `playerColumns.js`（投手と野手で違う）＋ 交渉・評価・出身。
 */
function PoolTable({
  kind,
  players,
  withStats,
  scores,
  fitOf,
  wanted,
  busy,
  limit,
  onNegotiate,
  onDrop,
}) {
  const k = PLAYER_KINDS[kind];
  const stats = withStats ? k.stats : [];
  // ⚠ 満員のときは押せなくし、理由を添える。押せたままだと知らせが上の欄（画面の外）に出て、
  //    押した場所からは何も起きないように見えた
  const full = limit === 0 || wanted.length >= limit;
  const fullReason =
    limit === 0
      ? '名簿に空きがないので、交渉できません'
      : `交渉できるのは${limit}人までです。誰かの交渉をやめてから選んでください`;
  return (
    <table className="online-lineup-table online-tryout-table" data-kind={kind}>
      <caption>{k.label}</caption>
      <thead>
        <tr>
          <th className="online-tryout-pick">交渉</th>
          <th className="online-lineup-person">選手</th>
          <th className="online-tryout-poscell">
            {kind === 'pitcher' ? '投' : '守備'}
          </th>
          <th>年齢</th>
          <th
            className="is-sep online-tryout-scorecell"
            title="重視する能力から出した評価値（0〜100）。「重視する能力」で変わる"
          >
            評価
          </th>
          {k.abilities.map((a, i) => (
            <th key={a.key} className={i === 0 ? 'is-sep' : ''} title={a.title}>
              {a.label}
            </th>
          ))}
          {kind === 'pitcher' && (
            <th className="is-sep online-tryout-pitches">変化球</th>
          )}
          {stats.map((column, i) => (
            <th
              key={column.id}
              className={i === 0 ? 'is-sep is-stat' : 'is-stat'}
              title={`今季の${column.label}`}
            >
              {k.statLabel[column.id] || column.label}
            </th>
          ))}
          {/* ⚠ 「出どころ」は投手の能力（球の見えにくさ）の名前なので使わない */}
          <th className="is-sep online-tryout-origin" title="高校・大学・元の球団">
            出身
          </th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          const rank = wanted.indexOf(p.id);
          return (
            <tr key={p.id} data-player={p.id} data-wanted={rank >= 0 || undefined}>
              <td className="online-tryout-pick">
                {/* ⚠ ボタンは**1つだけ**（いしだ要望）。以前は「最優先へ」と
                    「指名に加える」の2つあり、どちらを押すのか毎回考えることに
                    なっていた。順位は上の一覧で↑↓・ドラッグで入れ替える */}
                {rank >= 0 ? (
                  <button
                    type="button"
                    className="online-tryout-negotiating"
                    aria-label={`${p.name}との交渉をやめる`}
                    disabled={busy}
                    onClick={() => onDrop(p.id)}
                  >
                    交渉中 {rank + 1}位
                  </button>
                ) : (
                  <button
                    type="button"
                    className="online-primary online-tryout-negotiate"
                    aria-label={`${p.name}と交渉する`}
                    disabled={busy || full}
                    title={full ? fullReason : undefined}
                    onClick={() => onNegotiate(p.id)}
                  >
                    交渉
                  </button>
                )}
              </td>
              <td className="online-lineup-person online-tryout-person">
                <PlayerStatsButton player={p} panel="abilities" />
                <FitMark fit={fitOf(p)} />
                {p.koshien && (
                  <span className="online-tryout-fit">{p.koshien}</span>
                )}
              </td>
              <td className="online-tryout-poscell">
                {kind === 'pitcher' ? (
                  p.physical?.throws === 'left' ? '左' : '右'
                ) : (
                  <span
                    className="online-lineup-playable"
                    title="本職と、ほかに守れる位置（適性の高い順）"
                  >
                    <span className="online-lineup-pos is-bench">
                      {POS[p.position] || '?'}
                    </span>
                    {playablePositions(p)
                      .filter((e) => e.position !== p.position)
                      .slice(0, 2)
                      .map((e) => (
                        <span key={e.position}>{POS[e.position]}</span>
                      ))}
                  </span>
                )}
              </td>
              <td>{p.age ?? '—'}</td>
              <td className="is-sep online-tryout-scorecell">
                <b
                  className="online-tryout-score"
                  title="重視する能力から出した評価値（0〜100）"
                >
                  {Math.round(scores.get(p.id) ?? 0)}
                </b>
              </td>
              {k.abilities.map((a, i) => (
                <td key={a.key} className={i === 0 ? 'is-sep' : ''}>
                  <AbilityValue
                    value={a.get(p)}
                    isVel={a.isVel}
                    isSta={a.isSta}
                    placeholder="—"
                  />
                </td>
              ))}
              {kind === 'pitcher' && (
                <td className="is-sep online-tryout-pitches" title={pitchTypes(p)}>
                  {pitchTypes(p) || '—'}
                </td>
              )}
              {stats.map((column, i) => (
                <td
                  key={column.id}
                  className={i === 0 ? 'is-sep is-stat' : 'is-stat'}
                >
                  {formatStat(column, column.get(p))}
                </td>
              ))}
              <td
                className="is-sep online-tryout-origin"
                title={originOf(p) || undefined}
              >
                {originOf(p) || '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function TryoutPlanner({
  plan,
  candidates,
  roster,
  maxCount,
  // 決めていないときの人数（標準の26人までの空き。上限28人の枠のうち）。手続きの画面
  // （`PhasePanel`）は必ず渡す。渡さないときだけ空き枠（`maxCount`）を既定にする
  fillCount = maxCount,
  busy,
  // ⚠ スマホは受験者を**表にしない**（320px に能力の列が入らない）
  mobile,
  onChange,
  onReset,
}) {
  const [group, setGroup] = useState('all');
  // ⚠ 既定は「評価値」。重みを変えたら、候補の並びもその重みで見えるようにする
  const [sortKey, setSortKey] = useState(WEIGHTED_SORT_KEY);
  const [weights, setWeightsState] = useState(loadWeights);
  const setWeights = (next) => {
    const clean = sanitizeWeights(next);
    setWeightsState(clean);
    storeWeights(clean);
  };
  const scores = useMemo(
    () => new Map(candidates.map((p) => [p.id, weightedScore(p, weights)])),
    [candidates, weights],
  );
  const scoreOf = (p) => scores.get(p.id) ?? 0;
  const fitOf = (p) => teamFitRank(p, roster, weights);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  // ⚠ お知らせは**出したときの希望順と組で持つ**。「標準案に戻す」など外から
  //    希望順が変わったら出さない（「作り直しました」が標準案の上に残っていた）
  const [noticeState, setNoticeState] = useState(null);
  const notice =
    noticeState && noticeState.for === plan.rankedIds ? noticeState.text : '';
  const setNotice = (text, rankedIds = plan.rankedIds) =>
    setNoticeState(text ? { text, for: rankedIds } : null);

  const byId = useMemo(
    () => new Map(candidates.map((p) => [p.id, p])),
    [candidates],
  );
  // ⚠ 交渉できる人数は空き枠で切らない（獲得する人数より多く並べ、取られたら繰り上げる）
  const limit = wishLimit(maxCount);
  // ⚠ 上限で切って読む。交渉リストの形にする前に保存した提出は候補360人を
  //    全部並べており、そのままだと「交渉中 360/20」で出し直しも弾かれた
  const wanted = useMemo(
    () => (plan.rankedIds.length > limit ? plan.rankedIds.slice(0, limit) : plan.rankedIds),
    [plan.rankedIds, limit],
  );
  // 獲得する人数（枠）。決めていなければ標準の人数（26人）まで
  const total = signTotal(plan, maxCount, fillCount);
  // 交渉した選手のうち取りにいく人数（獲得する人数で切る）
  const count = wishedCount(wanted, total);
  // ⚠ 人数を決めていない案（標準案・古い提出）だけ、交渉した人で足りないぶんを自動で埋める。
  //    決めた提出は交渉した人しか取らない（`fillsAutomatically`。サーバーと同じ判定）
  const autoFill = fillsAutomatically(plan) ? Math.max(0, total - count) : 0;
  const shortList = !fillsAutomatically(plan) && wanted.length < total;
  const { picked, targets, blocking, warnings } = planSummary(
    wanted,
    candidates,
    count,
    roster,
  );
  // 獲得したあとの名簿の内訳（目標と比べるのはこちら。下の見出しの注）
  const after = rosterCounts([...(roster || []), ...picked]);
  // ⚠ 最低限（投1・捕1・野8）に届かないぶんはサーバーが人数を超えて補うので、その分も足す。
  //    自動で埋めない提出は、交渉した人（取りにいく人数）までしか増えない
  const afterSize =
    (roster || []).length +
    Math.max(count + autoFill, picked.length + minimumShort(roster, picked));
  const wantedSet = useMemo(() => new Set(wanted), [wanted.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useMemo(
    () => filterCandidates(candidates, { group, query, sortKey, scoreOf }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scoreOf は scores から決まる
    [candidates, group, query, sortKey, scores],
  );
  const size = mobile ? MOBILE_PAGE : PAGE;
  const shown = pool.slice(page * size, page * size + size);
  // PCは投手と野手で表を分ける。⚠ **出ている人だけ**（空の表は出さない）
  const sections = ['pitcher', 'fielder']
    .map((kind) => ({
      kind,
      players: shown.filter((p) => kindOf(p) === kind),
      // ⚠ 成績の列を出すかは**絞り込んだ全員**で決める（表示中の20人で決めると、
      //    元プロが居るページだけ列が増え、ページを送るたびに表の幅が変わる）
      withStats: hasStats(pool.filter((p) => kindOf(p) === kind), kind),
    }))
    .filter((s) => s.players.length);

  const setRanked = (rankedIds) => {
    setNotice('');
    onChange({ ...plan, rankedIds, count: wishedCount(rankedIds, total), total });
  };
  const setTotal = (next) => {
    const t = Math.max(0, Math.min(maxCount, next));
    setNotice('');
    onChange({ ...plan, total: t, count: wishedCount(wanted, t) });
  };
  const drop = (id) => setRanked(removeFromPlan(wanted, id));
  const shift = (index, delta) => setRanked(shiftInPlan(wanted, index, delta));
  // ドラッグで from 位 → to 位 へ動かす（間の選手は1つずつずれる）
  const moveTo = (from, to) => {
    if (wanted[from] === undefined) return;
    setRanked(moveInPlan(wanted, wanted[from], to));
  };
  const dragFrom = useRef(null);
  // ⚠ 黙って何も起きない、を作らない。満員のときは理由を出す
  const negotiate = (id) => {
    if (wanted.length >= limit) {
      setNotice(
        limit === 0
          ? '名簿に空きがないので、交渉できません。'
          : `交渉できるのは${limit}人までです。誰かの交渉をやめてから選んでください。`,
      );
      return;
    }
    setRanked(addToPlan(wanted, id, limit));
  };

  return (
    <div className="online-tryout">
      <section className="online-tryout-wanted">
      {/* ⚠ **獲得する人数を決められるようにする**（先方指摘「指名選手の人数を決められない」）。
            交渉した人数とは別に持つ。交渉が多ければ上位から人数ぶん取り（取られたら下が繰り上がる）、
            少なければ、人数を決めていない案（標準案）だけ残りを自動で埋める（`fillsAutomatically`）。
            既定は標準の26人まで（`fillCount`） */}
        <div className="online-tryout-head">
          <h3 className="online-tryout-wanted-title">
            交渉する選手 {wanted.length}人{' '}
            {/* ⚠ 目標も並べて出す。超えたぶんは飛ばされるので、
                数字だけだと「希望したのに入らない」理由が分からない
                ⚠ **分子は獲得したあとの名簿の人数**（いまの名簿＋獲得予定）。目標は名簿
                全体の人数で、飛ばすかどうかもそれで決まる。以前は分子が獲得予定だけで、
                「投2/11」が「あと9人取れる」に読めた（実際は名簿に投手が9人いて満杯） */}
            <small>
              {`獲得後の名簿 投${after.pitcher}/${targets.pitcher} 捕${after.catcher}/${targets.catcher} 内${after.infielder}/${targets.infielder} 外${after.outfielder}/${targets.outfielder}`}
            </small>
          </h3>
          <div className="online-tryout-total" role="group" aria-label="獲得する人数">
            <span>獲得する人数</span>
            <button
              type="button"
              aria-label="獲得する人数を1人減らす"
              disabled={busy || total <= 0}
              onClick={() => setTotal(total - 1)}
            >
              −
            </button>
            <b>{total}人</b>
            <button
              type="button"
              aria-label="獲得する人数を1人増やす"
              disabled={busy || total >= maxCount}
              onClick={() => setTotal(total + 1)}
            >
              ＋
            </button>
            <small>
              空き枠{maxCount}人（標準は{(roster || []).length + fillCount}人・上限{(roster || []).length + maxCount}人）
              {total < maxCount && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="online-tryout-fill"
                    disabled={busy}
                    onClick={() => setTotal(maxCount)}
                  >
                    枠いっぱいにする
                  </button>
                </>
              )}
            </small>
          </div>
          <p className="online-tryout-limit">
            交渉中 <b>{wanted.length}</b> / {limit}人
            <small>
              {limit === 0
                ? '名簿に空きがないので、交渉できません'
                : `1位から${TRYOUT_WISH_MAX}位まで選べます。獲得する人数より多く並べておくと、取られたときに繰り上がります`}
            </small>
          </p>
          <button type="button" disabled={busy} onClick={onReset}>
            標準案に戻す
          </button>
        </div>
          {/* ⚠ 成り立たない編成は、提出した瞬間ではなく**ここ**で知らせる。
              手続きは全員ぶんまとめて処理されるので、1球団が成り立たないと
              全員が先へ進めない */}
          {/* ⚠ **文の区切りは句点で、1つの文字列にして書く**。以前は行頭の全角空白で
              区切っていたが、JSX は行頭の空白（全角も）を落とすので
              「…4人未満ですこの位置は…」と文がつながって出ていた */}
          {blocking.length > 0 && (
            <p role="alert" className="online-tryout-block">
              {/* ⚠ 決定は止めない（サーバーが足りない守備位置を補う）。上の「獲得しません…補います」と
                  食い違わないよう、「決定できない」とは書かない */}
              {`交渉した選手だけでは足りません: ${blocking.join(' / ')}。足りない守備位置は自動で補います（希望どおりにしたいなら、その位置の選手と交渉してください）。`}
            </p>
          )}
          {warnings.length > 0 && (
            <p role="alert" className="online-tryout-warn">
              {`${warnings.join('。')}。人数が足りない位置は自動で埋められます。`}
            </p>
          )}
          {notice && (
            <p role="status" className="online-tryout-warn">
              {notice}
            </p>
          )}
          {wanted.length === 0 && (
            <p>
              下の受験者から「交渉」を押すと、ここに1位から並びます。
              {limit > 0 ? `${limit}人まで選べます。` : '名簿に空きがありません。'}
            </p>
          )}
          <ol className="online-tryout-list">
            {wanted.map((id, i) => (
              <li
                key={id}
                draggable={!busy}
                title="ドラッグで希望順位を入れ替え"
                onDragStart={(e) => {
                  dragFrom.current = i;
                  e.dataTransfer.effectAllowed = 'move';
                  // setDataがないとFirefox等でドラッグが開始されない
                  try { e.dataTransfer.setData('text/plain', String(id)); } catch { /* 無視 */ }
                  e.currentTarget.classList.add('is-dragging');
                }}
                onDragEnd={(e) => {
                  dragFrom.current = null;
                  e.currentTarget.classList.remove('is-dragging');
                }}
                onDragOver={(e) => {
                  if (dragFrom.current === null) return;
                  e.preventDefault();
                  e.currentTarget.classList.add('is-drop-target');
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('is-drop-target')}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('is-drop-target');
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (from !== null) moveTo(from, i);
                }}
              >
                <span className="online-drag-handle" aria-hidden="true">⠿</span>
                <span className="online-tryout-rank">{i + 1}</span>
                <span className="online-tryout-person">
                  <Line player={byId.get(id)} score={scores.get(id)} fit={fitOf(byId.get(id))} />
                </span>
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
                  aria-label={`${byId.get(id)?.name}との交渉をやめる`}
                  disabled={busy}
                  onClick={() => drop(id)}
                >
                  やめる
                </button>
              </li>
            ))}
          </ol>
      {/* ⚠ **競合の決まり方を書く**。順位を上げるご褒美だと分かるようにする
            （いしだ要望）。書かないと「なぜ取られたのか」が画面から読めない */}
        <p className="online-muted">
          1位から順に取りにいきます。<strong>同じ選手を他球団も希望したときは、
          前年の順位が上の球団が獲得します</strong>（取られたぶんは下から繰り上がります）。
          {/* ⚠ 目標の構成だけは語の途中で割らない（`online-tryout-targets`）。
              ほかの `strong` にも nowrap を当てると、文が長いので 320px で外へ出る */}
          名簿の目標は
          <strong className="online-tryout-targets">
            投{targets.pitcher}・捕{targets.catcher}・内{targets.infielder}・外
            {targets.outfielder}
          </strong>
          です。<strong>獲得するのは上で決めた人数まで</strong>で、
          <strong>交渉した選手しか取りません</strong>（交渉した人が尽きたら、人数に届かなくてもそこで止めます。
          投手・捕手・野手が最低限に届かないときだけ、足りない位置を補います）。
        </p>
        {/* 決めた人数と交渉した人数の関係を1行で（どちらが余るかで意味が変わる） */}
        <p className="online-tryout-total-note">
          {total === 0
            ? '今年は獲得しません（投手・捕手・野手が最低限に届かないときだけ、足りない位置を補います）。'
            : wanted.length > total
              ? `交渉した${wanted.length}人のうち、上位から${total}人を取ります。他球団に取られたら下位が繰り上がります。`
              : autoFill > 0
                ? `標準案です。交渉した${count}人に、自動で${autoFill}人を足して${total}人獲得します。`
                : shortList
                  ? `交渉した${count}人しか並んでいないので、獲得は多くても${count}人です（${total}人に届きません）。取られたときの控えも並べておくと繰り上がります。`
                  : `交渉した${count}人を獲得します。他球団に取られたら、そのぶんは減ります。`}
          {` 獲得後の名簿は${afterSize}人（枠${(roster || []).length + maxCount}人）です。`}
        </p>
      </section>

      {/* ⚠ 標準案（サーバーが作る既定の希望順）は決まった配分でしか見ない。
          どの能力を重く見るかを参加者が決め、その評価値でおすすめ順を作れるようにする */}
      <details className="online-tryout-weights">
        <summary>重視する能力（評価値の重み）</summary>
        <p className="online-muted">
          能力ごとに「軽視・やや軽視・普通・やや重視・重視・最重視」を選ぶと、
          0.6・0.8・1.0・1.2・1.4・1.6 倍で重み付けした平均を「評価」（0〜100）として出します。
          投手と野手は別の能力で計算します。重みはこのブラウザに覚えます。
        </p>
        {[
          ['fielder', '野手'],
          ['pitcher', '投手'],
          ['common', '共通'],
        ].map(([side, title]) => (
          <fieldset key={side}>
            <legend>{title}</legend>
            {WEIGHT_FIELDS.filter((f) => f.group === side).map((f) => (
              <label key={f.key}>
                <span>{f.label}</span>
                <input
                  type="range"
                  min="0"
                  max={WEIGHT_MAX}
                  step="1"
                  value={weights[f.key]}
                  aria-label={`${f.label}の重み`}
                  aria-valuetext={WEIGHT_LEVELS[weights[f.key]]?.label}
                  onChange={(e) =>
                    setWeights({ ...weights, [f.key]: e.target.value })
                  }
                />
                <output>{WEIGHT_LEVELS[weights[f.key]]?.label}</output>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="online-tryout-weight-actions">
          <button
            type="button"
            className="online-primary"
            disabled={busy}
            onClick={() => {
              // ⚠ **交渉できる人数まで**で作る。以前は候補を全員並べていた
              const next = weightedRanked(candidates, weights, roster, limit);
              setRanked(next);
              setNotice(
                `評価の高い順に、投・捕・内・外の目標人数を守って${next.length}人選び直しました。`,
                next,
              );
            }}
          >
            この重みで{limit}人選ぶ
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setWeights(DEFAULT_WEIGHTS)}
          >
            重みを標準に戻す
          </button>
        </div>
      </details>
      <section className="online-tryout-pool">
        <div className="online-tryout-pool-head">
          <h3>
            受験者 {pool.length}人
            <small>
              {pool.length
                ? `${page * size + 1}〜${Math.min(pool.length, page * size + size)}人目を出しています。名前を押すと選手の詳細が開きます`
                : 'この絞り込みに合う受験者がいません'}
            </small>
          </h3>
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
                <option value={WEIGHTED_SORT_KEY}>評価値（重み）</option>
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
        </div>
        {mobile ? (
          // ⚠ スマホは表にしない（320px に能力の列が入らない）。カードの行のまま
          <ul className="online-tryout-list">
            {shown.map((p) => (
              <li
                key={p.id}
                data-player={p.id}
                data-wanted={wantedSet.has(p.id) || undefined}
              >
                <span className="online-tryout-person">
                  <Line player={p} score={scores.get(p.id)} fit={fitOf(p)} />
                </span>
                {/* ⚠ ボタンは**1つだけ**（いしだ要望）。以前は「最優先へ」と
                    「指名に加える」の2つあり、どちらを押すのか毎回考えることに
                    なっていた。順位は上の一覧で↑↓・ドラッグで入れ替える */}
                {wantedSet.has(p.id) ? (
                  <button
                    type="button"
                    className="online-tryout-negotiating"
                    aria-label={`${p.name}との交渉をやめる`}
                    disabled={busy}
                    onClick={() => drop(p.id)}
                  >
                    交渉中 {wanted.indexOf(p.id) + 1}位
                  </button>
                ) : (
                  <button
                    type="button"
                    className="online-primary online-tryout-negotiate"
                    aria-label={`${p.name}と交渉する`}
                    disabled={busy || limit === 0 || wanted.length >= limit}
                    onClick={() => negotiate(p.id)}
                  >
                    交渉
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="online-lineup-scroll">
            {sections.map((section) => (
              <PoolTable
                key={section.kind}
                kind={section.kind}
                players={section.players}
                withStats={section.withStats}
                scores={scores}
                fitOf={fitOf}
                wanted={wanted}
                busy={busy}
                limit={limit}
                onNegotiate={negotiate}
                onDrop={drop}
              />
            ))}
          </div>
        )}
        <PageNav page={page} count={pool.length} size={size} setPage={setPage} />
      </section>
    </div>
  );
}
