import React, { useEffect, useMemo, useState } from 'react';
import PitchZonePlot from '../components/PitchZonePlot.jsx';
import { RenderBases } from '../components/GameUIComponents.jsx';
import { getPitchTypeName } from '../utils/constants.js';
import {
  TACTIC_FIELDS,
  TACTIC_DEFAULTS,
  STARTER_ROLES,
  RELIEF_ROLES,
} from './tactics.js';
import { AbilityGrade } from './PlayerPerformance.jsx';
import { POS } from './api.js';
import { teamShort } from './gameText.js';
const RESULTS = {
  ball: 'ボール',
  called_strike: '見逃し',
  swinging_strike: '空振り',
  strikeout: '三振',
  foul: 'ファウル',
  single: '単打',
  double: '二塁打',
  triple: '三塁打',
  homerun: '本塁打',
  out: 'アウト',
  double_play: '併殺',
  hit_by_pitch: '死球',
  walk: '四球',
  error: '失策',
  bunt_fair: 'バント・フェア',
  bunt_popup: 'バント・飛球',
  bunt_foul: 'バント・ファウル',
};
const label = (frame) =>
  frame.kind === 'matchup'
    ? frame.pinchHit
      ? '代打'
      : '打席開始'
    : frame.kind === 'steal'
      ? frame.success
        ? '盗塁成功'
        : '盗塁死'
      : frame.kind === 'wild_pitch'
        ? '暴投・捕逸で進塁'
        : RESULTS[frame.result] || frame.result || 'プレー';
export default function ReplayViewer({ game }) {
  const replay = game.replay;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [delay, setDelay] = useState(700);
  const [selected, setSelected] = useState(null);
  const frames = replay?.frames || [];
  const frame = frames[index];
  useEffect(() => {
    if (!playing || index >= frames.length - 1) return;
    const timer = setTimeout(() => setIndex((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [playing, index, delay, frames.length]);
  const lineups = useMemo(() => {
    const result = {};
    for (let n = 0; n <= index; n++)
      if (frames[n]?.lineups) Object.assign(result, frames[n].lineups);
    return result;
  }, [frames, index]);
  if (!frame)
    return (
      <p>
        この試合には観戦記録がありません。追加後に消化した試合から観戦できます。
      </p>
    );
  const offense = frame.top ? game.away : game.home;
  const defense = frame.top ? game.home : game.away;
  const find = (team, id) => replay.teams[team]?.find((p) => p.id === id);
  const batter = find(offense, frame.batterId),
    pitcher = find(defense, frame.pitcherId);
  const current = selected ? find(selected.team, selected.id) : batter;
  const lastMatchup = frames
    .slice(0, index + 1)
    .findLastIndex((f) => f.kind === 'matchup');
  const seenPitchers = {},
    changes = [];
  for (const f of frames.slice(0, index + 1)) {
    const team = f.top ? game.home : game.away;
    if (f.kind !== 'matchup') continue;
    if (
      seenPitchers[team] !== undefined &&
      seenPitchers[team] !== f.pitcherId
    ) {
      const change = game.pitcherChanges?.find(
        (c) =>
          c.team === team &&
          c.in === find(team, f.pitcherId)?.name &&
          c.inning === f.inning &&
          c.isTop === f.top,
      );
      changes.push({
        team,
        inning: f.inning,
        pitcher: find(team, f.pitcherId)?.name,
        reason: change?.reason,
      });
    }
    seenPitchers[team] = f.pitcherId;
  }
  const seek = (value) => {
    setPlaying(false);
    setIndex(value);
  };
  const jump = (kind) => {
    const next = frames.findIndex(
      (f, n) =>
        n > index &&
        (kind === 'batter'
          ? f.kind === 'matchup'
          : f.inning !== frame.inning || f.top !== frame.top),
    );
    seek(next >= 0 ? next : frames.length - 1);
  };
  const side = (team) => (
    <aside className="online-replay-team">
      <h3 title={team}>{teamShort(team)}</h3>
      <ol>
        {(lineups[team] || [])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((slot) => {
            const p = find(team, slot.id);
            return (
              <li
                key={slot.order}
                className={
                  team === offense && slot.id === frame.batterId
                    ? 'online-replay-active'
                    : ''
                }
              >
                <span>{slot.order}</span>
                <span>{POS[slot.position] || '—'}</span>
                <button onClick={() => setSelected({ team, id: slot.id })}>
                  {p?.name || '選手'}
                </button>
                <AbilityGrade value={p?.batting?.meet} />
                <AbilityGrade value={p?.batting?.power} />
              </li>
            );
          })}
      </ol>
      <small>打順・守備位置／ミート・パワー</small>
      <details>
        <summary>控え・投手を見る</summary>
        {replay.teams[team]
          ?.filter((p) => !(lineups[team] || []).some((s) => s.id === p.id))
          .map((p) => (
            <button key={p.id} onClick={() => setSelected({ team, id: p.id })}>
              {p.name}
            </button>
          ))}
      </details>
    </aside>
  );
  const innings = Array.from(
    { length: Math.max(9, frame.inning) },
    (_, n) => n + 1,
  );
  const runs = { [game.home]: {}, [game.away]: {} };
  let lastHome = 0,
    lastAway = 0;
  const homeStarted = new Set();
  for (let n = 0; n <= index; n++) {
    const f = frames[n],
      team = f.top ? game.away : game.home;
    if (!f.top) homeStarted.add(f.inning);
    runs[team][f.inning] ||= 0;
    runs[game.home][f.inning] =
      (runs[game.home][f.inning] || 0) + f.homeScore - lastHome;
    runs[game.away][f.inning] =
      (runs[game.away][f.inning] || 0) + f.awayScore - lastAway;
    // 未開始の攻撃へ0を作らない。
    if (f.top && !homeStarted.has(f.inning)) delete runs[game.home][f.inning];
    lastHome = f.homeScore;
    lastAway = f.awayScore;
  }
  return (
    <section className="online-replay" aria-label="観戦リプレイ">
      <div className="online-replay-controls">
        <button onClick={() => seek(0)}>最初</button>
        <button disabled={index === 0} onClick={() => seek(index - 1)}>
          前のプレー
        </button>
        <button
          disabled={index === frames.length - 1}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing && index < frames.length - 1 ? '一時停止' : '再生'}
        </button>
        <button
          disabled={index === frames.length - 1}
          onClick={() => seek(index + 1)}
        >
          次のプレー
        </button>
        <button onClick={() => jump('batter')}>次の打者</button>
        <button onClick={() => jump('inning')}>次の攻撃</button>
        <select
          aria-label="再生速度"
          value={delay}
          onChange={(e) => setDelay(Number(e.target.value))}
        >
          <option value={1400}>ゆっくり</option>
          <option value={700}>標準</option>
          <option value={250}>高速</option>
        </select>
        <input
          aria-label="観戦位置"
          type="range"
          min="0"
          max={frames.length - 1}
          value={index}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span>
          {index + 1} / {frames.length}
        </span>
      </div>
      <div className="online-replay-board">
        <strong>
          {frame.inning}回{frame.top ? '表' : '裏'}{' '}
          {index === frames.length - 1 ? '・試合終了' : ''}
        </strong>
        <table aria-label="イニングスコア">
          <thead>
            <tr>
              <th>球団</th>
              {innings.map((i) => (
                <th key={i}>{i}</th>
              ))}
              <th>計</th>
              <th>安</th>
              <th>失</th>
            </tr>
          </thead>
          <tbody>
            {[game.away, game.home].map((team) => (
              <tr key={team}>
                <th>{teamShort(team)}</th>
                {innings.map((i) => (
                  <td key={i}>
                    {runs[team][i] ??
                      (index === frames.length - 1 &&
                      team === game.home &&
                      i === frame.inning &&
                      frame.top &&
                      frame.homeScore > frame.awayScore
                        ? '×'
                        : '—')}
                  </td>
                ))}
                <td>
                  {team === game.home ? frame.homeScore : frame.awayScore}
                </td>
                <td>{team === game.home ? frame.homeHits : frame.awayHits}</td>
                <td>{team === game.home ? frame.homeErrors : frame.awayErrors}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Ｂ {frame.balls}　Ｓ {frame.strikes}　Ｏ {frame.outs}　投手{' '}
          {pitcher?.name}（{frame.pitcherPitches}球）　打者 {batter?.name}
        </p>
        <p>
          {frame.kind === 'pitch' && frame.pitch
            ? `${getPitchTypeName(frame.pitch.type)} ${Math.round(frame.pitch.velocity)} km/h`
            : ''}
          　{label(frame)}
        </p>
      </div>
      <div className="online-replay-layout">
        {side(game.away)}
        <div className="online-replay-center">
          <div className="online-replay-pitch-zone">
            <PitchZonePlot
              size={120}
              bats={batter?.batting?.bats}
              pitcherThrows={pitcher?.physical?.throws}
              pitches={frames
                .slice(0, index + 1)
                .filter(
                  (f, n) => f.kind === 'pitch' && f.pitch && n >= lastMatchup,
                )
                .map((f) => ({
                  pitchLoc: f.pitch,
                  pitchType: f.pitch.type,
                  resultType: f.result,
                }))}
            />
          </div>
          <RenderBases bases={frame.bases.map(Boolean)} readOnly />
          <div className="online-replay-batter">
            <strong>{current?.name}</strong>
            <small>試合開始時点の能力</small>
            <dl>
              <div>
                <dt>ミート</dt>
                <dd>{current?.batting?.meet ?? '—'}</dd>
              </div>
              <div>
                <dt>パワー</dt>
                <dd>{current?.batting?.power ?? '—'}</dd>
              </div>
              <div>
                <dt>走力</dt>
                <dd>{current?.physical?.speed ?? '—'}</dd>
              </div>
              <div>
                <dt>球速</dt>
                <dd>{current?.pitching?.velocity ?? '—'}</dd>
              </div>
              <div>
                <dt>制球</dt>
                <dd>{current?.pitching?.control ?? '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
        {side(game.home)}
      </div>
      <div className="online-replay-log" aria-label="試合経過">
        {frames.slice(Math.max(0, index - 9), index + 1).map((f, n) => (
          <p key={n}>
            {f.inning}回{f.top ? '表' : '裏'}　
            {find(f.top ? game.away : game.home, f.batterId)?.name}　{label(f)}
            　{f.awayScore}–{f.homeScore}
          </p>
        ))}
      </div>
      {changes.length > 0 && (
        <details>
          <summary>ここまでの継投・交代理由</summary>
          {changes.map((c, n) => (
            <p key={n}>
              {c.inning}回 {teamShort(c.team)}・{c.pitcher}：
              {c.reason || '自動継投'}
            </p>
          ))}
        </details>
      )}
      {replay.appliedPlan && (
        <details>
          <summary>この試合の自球団の事前設定</summary>
          <dl className="online-replay-applied">
            {Object.entries(TACTIC_FIELDS).map(([key, [label, options]]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {
                    options[
                      replay.appliedPlan.tactics?.[key] ?? TACTIC_DEFAULTS[key]
                    ]
                  }
                </dd>
              </div>
            ))}
            {Object.entries(replay.appliedPlan.pitcherRoles || {}).map(
              ([id, role]) => (
                <div key={id}>
                  <dt>
                    {replay.teams[replay.appliedTeam]?.find(
                      (p) => String(p.id) === id,
                    )?.name || '投手'}
                  </dt>
                  <dd>{STARTER_ROLES[role] || RELIEF_ROLES[role]}</dd>
                </div>
              ),
            )}
          </dl>
        </details>
      )}
      <small>
        記録済み試合の再生です。編成・采配・成績・日付は変更しません。
      </small>
    </section>
  );
}
