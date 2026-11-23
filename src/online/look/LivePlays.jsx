// ============================================================
// 新しい見た目（試作）段3: 打席速報。試合の小窓（`GameHistory.jsx` の `GameRecord`）で、
// 試合を1打席ずつ追う（球場の図に走者と打球の線、実況の1行、その回の流れ）。
//
// ⚠ 中身は `playByPlay.js`（試合の `plays` から作る）。1球ごとの観戦記録（1試合約180KB）は使わない。
// ⚠ 入のときだけ出す（呼ぶ側の `GameRecord` が見る）。版20より前の試合には塁と打球の記録が無いので出さない。
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { FieldDiagram, TeamMark } from './Art.jsx';
import { liveScenes, highlightIndexes } from './playByPlay.js';
import { playTone } from '../gamePlays.js';
import { teamShort } from '../gameText.js';

const AUTO_MS = 1800;

function Outs({ outs }) {
  return (
    <span className="online-live-outs" aria-label={`${outs}アウト`}>
      {[0, 1].map((i) => (
        <i key={i} data-on={outs > i || undefined} />
      ))}
    </span>
  );
}

export default function LivePlays({ game }) {
  const scenes = useMemo(() => liveScenes(game, teamShort), [game]);
  const highlights = useMemo(() => highlightIndexes(scenes), [scenes]);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const [only, setOnly] = useState(false);
  const order = useMemo(
    () => (only && highlights.length ? highlights : scenes.map((_, i) => i)),
    [only, highlights, scenes],
  );
  const at = Math.max(0, order.indexOf(index) >= 0 ? order.indexOf(index) : order.findIndex((i) => i >= index));
  const go = (step) => setIndex(order[Math.max(0, Math.min(order.length - 1, at + step))] ?? 0);
  // 自動で次の打席へ（最後まで来たら止まる）
  useEffect(() => {
    if (!auto) return undefined;
    if (at >= order.length - 1) {
      setAuto(false);
      return undefined;
    }
    const timer = setTimeout(() => setIndex(order[at + 1]), AUTO_MS);
    return () => clearTimeout(timer);
  }, [auto, at, order]);
  const scene = scenes[order[at]];
  if (!scene) return <p className="online-muted">この試合の打席の記録はありません。</p>;
  // その半回の、いまの打席までの流れ（新しい順に4つ）
  const flow = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.inning === scene.inning && s.half === scene.half && i <= order[at])
    .slice(-4)
    .reverse();
  return (
    <section className="online-live" aria-label="打席速報">
      <header className="online-live-bug">
        <span className="online-live-score">
          <TeamMark team={game.away} size={24} />
          {teamShort(game.away)}
          <b>{scene.score.away}</b>-<b>{scene.score.home}</b>
          {teamShort(game.home)}
          <TeamMark team={game.home} size={24} />
        </span>
        <span className="online-live-inning">
          {scene.inning}回{scene.half === 't' ? '表' : '裏'}
          <Outs outs={Math.min(2, scene.outs)} />
        </span>
      </header>
      <FieldDiagram scene={scene} home={game.home} />
      <div className="online-live-telop" data-tone={playTone(scene.code, scene.runs)}>
        <strong>
          {scene.batter?.name ? `${scene.batter.name}　` : ''}
          {scene.phrase}
        </strong>
        <small>{scene.situation}</small>
      </div>
      <ol className="online-live-flow">
        {flow.map(({ s, i }) => (
          <li key={i} data-tone={playTone(s.code, s.runs)} data-now={i === order[at] || undefined}>
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
        <button type="button" aria-pressed={auto} onClick={() => setAuto(!auto)}>
          {auto ? '■ 止める' : '▶ 自動'}
        </button>
        <button type="button" onClick={() => go(1)} disabled={at >= order.length - 1}>
          次の打席 ▶
        </button>
        <button type="button" aria-pressed={only} onClick={() => setOnly(!only)} disabled={!highlights.length}>
          見どころだけ
        </button>
        <small>
          {at + 1} / {order.length}
        </small>
      </nav>
    </section>
  );
}
