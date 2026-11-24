// ============================================================
// 新しい見た目（試作）段3: 打席速報。試合の小窓（`GameHistory.jsx` の `GameRecord`）で、
// 試合を1打席ずつ追う（球場の図に走者と打球の線、実況の1行、その回の流れ）。
//
// ⚠ 中身は `playByPlay.js`（試合の `plays` から作る）。1球ごとの観戦記録（1試合約180KB）は使わない。
// ⚠ 入のときだけ出す（呼ぶ側の `GameRecord` が見る）。版20より前の試合には塁と打球の記録が無いので出さない。
// ⚠ `motion` のときは球場の図の代わりに「動きで見る」（`PlayMotion.jsx`）。自動は動きが終わってから次へ。
//    結果の文と点は、動きが終わってから出す（先に出すと、見る前に結果が分かってしまう）。
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { PlayField, TeamMark } from './Art.jsx';
import { liveScenes, highlightIndexes, orderPosition, basesText } from './playByPlay.js';
import PlayMotion from './PlayMotion.jsx';
import { basesBeforeOf } from './playMotion.js';
import { playTone } from '../gamePlays.js';
import { teamShort } from '../gameText.js';

const AUTO_MS = 1800;
/** 動きで見るとき、動きが終わってから次の打席までの間 */
const MOTION_GAP_MS = 700;

function Outs({ outs }) {
  return (
    <span className="online-live-outs" aria-label={`${outs}アウト`}>
      {[0, 1].map((i) => (
        <i key={i} data-on={outs > i || undefined} />
      ))}
    </span>
  );
}

export default function LivePlays({ game, motion = false }) {
  const scenes = useMemo(() => liveScenes(game, teamShort), [game]);
  const highlights = useMemo(() => highlightIndexes(scenes), [scenes]);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const [only, setOnly] = useState(false);
  // 動きで見る: 速さ（1・2）、もう一度の鍵、動きが終わった場面
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(0);
  const [finished, setFinished] = useState(-1);
  const order = useMemo(
    () => (only && highlights.length ? highlights : scenes.map((_, i) => i)),
    [only, highlights, scenes],
  );
  const at = orderPosition(order, index);
  const go = (step) => setIndex(order[Math.max(0, Math.min(order.length - 1, at + step))] ?? 0);
  // 最後の打席で「自動」を押したら頭から
  const toggleAuto = () => {
    if (!auto && at >= order.length - 1) setIndex(order[0] ?? 0);
    setAuto(!auto);
  };
  // 切りかえても、いま出ている場面から続ける
  const toggleOnly = () => {
    setIndex(order[at] ?? 0);
    setOnly(!only);
  };
  // 自動で次の打席へ（最後まで来たら止まる）
  useEffect(() => {
    if (!auto) return undefined;
    if (at >= order.length - 1) {
      setAuto(false);
      return undefined;
    }
    // 動きで見るときは、いまの場面の動きが終わるまで待つ
    if (motion && finished !== order[at]) return undefined;
    const timer = setTimeout(() => setIndex(order[at + 1]), motion ? MOTION_GAP_MS : AUTO_MS);
    return () => clearTimeout(timer);
  }, [auto, at, order, motion, finished]);
  const now = order[at];
  const scene = scenes[now];
  if (!scene) return <p className="online-muted">この試合の打席の記録はありません。</p>;
  // 動きで見る: 動きが終わるまでは、打席の前の点・アウト・塁を出す
  const revealed = !motion || finished === now;
  const before = basesBeforeOf(scenes, now);
  const score = revealed ? scene.score : scene.scoreBefore;
  // その半回の、いまの打席までの流れ（新しい順に4つ）
  const flow = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.inning === scene.inning && s.half === scene.half && (revealed ? i <= now : i < now))
    .slice(-4)
    .reverse();
  return (
    <section className="online-live" data-motion={motion || undefined} aria-label={motion ? '動きで見る' : '打席速報'}>
      <header className="online-live-bug">
        <span className="online-live-score">
          <TeamMark team={game.away} size={24} />
          {teamShort(game.away)}
          <b>{score.away}</b>-<b>{score.home}</b>
          {teamShort(game.home)}
          <TeamMark team={game.home} size={24} />
        </span>
        <span className="online-live-inning">
          {scene.inning}回{scene.half === 't' ? '表' : '裏'}
          <Outs outs={Math.min(2, revealed ? scene.outs : scene.outsBefore)} />
        </span>
      </header>
      {motion ? (
        <div className="online-motion">
          <PlayMotion game={game} scene={scene} before={before} speed={speed} replayKey={replay} onDone={() => setFinished(now)} />
          <div className="online-motion-tools">
            <button
              type="button"
              onClick={() => {
                // もう一度: 結果を隠し直し、動きが終わるまで自動で次へ行かない
                setFinished(-1);
                setReplay((n) => n + 1);
              }}
            >
              ↻ もう一度
            </button>
            <button type="button" aria-pressed={speed === 2} onClick={() => setSpeed(speed === 2 ? 1 : 2)}>
              ×2
            </button>
          </div>
        </div>
      ) : (
        <PlayField scene={scene} home={game.home} />
      )}
      {revealed ? (
        <div className="online-live-telop" data-tone={playTone(scene.code, scene.runs)}>
          <strong>
            {scene.batter?.name ? `${scene.batter.name}　` : ''}
            {scene.phrase}
          </strong>
          <small>{scene.situation}</small>
        </div>
      ) : (
        <div className="online-live-telop" data-wait>
          <strong>{scene.batter?.name ? `打者　${scene.batter.name}` : '走者が動く'}</strong>
          <small>
            {scene.outsBefore}死{basesText(before)}
          </small>
        </div>
      )}
      <ol className="online-live-flow">
        {flow.map(({ s, i }) => (
          <li key={i} data-tone={playTone(s.code, s.runs)} data-now={i === now || undefined}>
            <b>{s.code}</b>
            {s.batter?.name ? `${s.batter.name}　` : ''}
            {s.phrase}
          </li>
        ))}
      </ol>
      <nav className="online-live-controls" aria-label="打席を送る">
        <button type="button" onClick={() => go(-1)} disabled={at <= 0}>
          ◀ 前の打席
        </button>
        <button type="button" aria-pressed={auto} onClick={toggleAuto}>
          {auto ? '■ 止める' : '▶ 自動'}
        </button>
        <button type="button" onClick={() => go(1)} disabled={at >= order.length - 1}>
          次の打席 ▶
        </button>
        <button type="button" aria-pressed={only} onClick={toggleOnly} disabled={!highlights.length}>
          見どころだけ
        </button>
        <small>
          {at + 1} / {order.length}
        </small>
      </nav>
    </section>
  );
}
