// 新しい見た目（試作）: どの表でも同じ形で出す小さな部品（いしだ依頼 2026-11-23「統一感」）。
//   守備位置は色の札、段位は S〜F の札、順位は表彰台の色の札、良し悪しは色の札。
// ⚠ どれも入のときだけ札にする。切のときは今までの字（渡された字）をそのまま返す。
// ⚠ 色の決め方はここに持たない（守備位置は `api.js` の `posTone`、段位は `getRankColor`、
//    成績の段位は `statGrade.js`）。ここは「どう見せるか」だけ。
import React from 'react';
import { POS, posTone } from '../api.js';
import { getAbilityRank, getRankColor } from '../../utils/constants.js';
import { useLook } from './LookContext.jsx';
import { statGrade } from './statGrade.js';

/**
 * 守備位置。入のときは守備位置の色の小さな札（スタメン設定の札と同じ色）、切のときは字だけ。
 * @param label 出す字（無ければ `POS` の1字）
 */
export function PosChip({ position, label }) {
  const { on } = useLook();
  const text = label ?? (POS[position] || position) ?? null;
  const tone = posTone(position);
  if (!on || !tone) return text;
  return <span className={`online-pos-chip ${tone}`}>{text}</span>;
}

/** 段位の字の札（S〜F）。入のときだけ出す */
export function RankChip({ rank }) {
  const { on } = useLook();
  if (!on || !rank) return null;
  return (
    <b className={`online-rank-chip ${getRankColor(rank)}`} aria-hidden="true">
      <span>{rank}</span>
    </b>
  );
}

/** 能力の数字（守備・肩・走力など）。入のときは頭に S〜F の札、数字も段位の色。切のときは数字だけ */
export function AbilityNum({ value }) {
  const { on } = useLook();
  if (typeof value !== 'number') return '—';
  if (!on) return value;
  const rank = getAbilityRank(value);
  return (
    <span className={`online-stat-graded ${getRankColor(rank)}`}>
      <RankChip rank={rank} />
      {value}
    </span>
  );
}

/**
 * 守備範囲の段位（`defenseGrade` の `{ label, color }`。色は守備図の印と同じ）。
 * 入のときは札、切のときは今までどおり色の付いた字
 */
export function RangeGrade({ grade }) {
  const { on } = useLook();
  if (!grade) return null;
  if (!on) return <b style={{ color: grade.color }}>{grade.label}</b>;
  return (
    <b className="online-rank-chip" style={{ color: grade.color }}>
      <span>{grade.label}</span>
    </b>
  );
}

/**
 * 成績の数字（打率・OPS・防御率など）。入のときは頭にリーグ平均比の札を付け、数字も段位の色にする。
 * @param baseline `leagueBaseline(view, team)`。無ければ字だけ
 */
export function StatWithGrade({ column, value, player, baseline, children }) {
  const { on } = useLook();
  const grade = on && baseline ? statGrade(column, value, player, baseline) : null;
  if (!grade) return children;
  return (
    <span className={`online-stat-graded ${getRankColor(grade)}`} title={`リーグ平均と比べて${grade}`}>
      <RankChip rank={grade} />
      {children}
    </span>
  );
}

/**
 * 順位の札（1〜3位は表彰台の色。順位表の札と同じ）。切のときは「○位」の字
 * @param suffix 切のときに付ける字
 */
export function PlaceChip({ place, suffix = '位' }) {
  const { on } = useLook();
  if (place == null) return '—';
  if (!on) return `${place}${suffix}`;
  return (
    <span className="online-place-chip">
      <span className={`online-rank${place <= 3 ? ` is-podium is-podium-${place}` : ''}`}>{place}</span>
      {suffix}
    </span>
  );
}

/** 平均との差（+3 は緑、-2 は赤、同じなら ±0）。入のときだけ出す */
export function Delta({ value, base }) {
  const { on } = useLook();
  if (!on || value == null || base == null) return null;
  const d = Math.round(value - base);
  return (
    <small className={`online-delta${d > 0 ? ' is-up' : d < 0 ? ' is-down' : ''}`}>
      {d > 0 ? `+${d}` : d < 0 ? d : '±0'}
    </small>
  );
}

/**
 * 良し悪しの札（「まだ伸びる」「下り坂の見込み」など）。切のときは字だけ
 * @param tone good / warn / bad / plain
 */
export function ToneChip({ tone = 'plain', children }) {
  const { on } = useLook();
  if (!on) return children;
  return <span className={`online-tone-chip is-${tone}`}>{children}</span>;
}

/**
 * シーズンの進み具合の棒（左メニューの「第Nターン / 160」の下）。入のときだけ・試合のある間だけ出す
 * @param turn いまのターン（`turnOfDate`。開幕前・シーズン後は null）
 */
export function SeasonProgress({ turn, turns }) {
  const { on } = useLook();
  if (!on || !turn || !turns) return null;
  const rate = Math.max(0, Math.min(1, turn / turns));
  return (
    <span
      className="online-season-progress"
      style={{ '--progress': `${(rate * 100).toFixed(1)}%` }}
      role="presentation"
    />
  );
}
