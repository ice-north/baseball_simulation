import React from 'react';
import { Fatigue } from './BoardParts.jsx';
import { POS_FULL } from './api.js';
import { pitchTypes, totalBreak } from './playerColumns.js';
import { AbilityValue } from '../components/AbilityValue.jsx';
import { FORM_SHORT, FORM_NAME, getFatigueTone } from '../utils/constants.js';

// ============================================================
// 投手起用の表の見出しと行（オンラインPC版 `PitchingBoard.jsx` と一人用 `SoloPitchingBoard.jsx` で共通）。
//
// ⚠ 列はここ1か所で決める。以前は2つの画面に同じ見出しと行を写していて、能力の列を変えるのに
//    2つの PR が同じ変更を別々に入れていた（監査 2026-11-19）。
// 違うのは差し込みで渡す: 名前の欄（押したときの開き方・調子の印）、疲労の休みの線、今季成績の列
//   （一人用は `seasonStats.pitching` で投球回がアウト数、オンラインは `statsView.js` の列）。
// ============================================================

/** 成績の列の前の列の数: 順・役割・投手 / 投・フォーム・年齢・疲労 / 球速・制球・スタ・変化 */
const BASE_COLUMNS = 3 + 4 + 4;
/** 表の列の数。⚠ `colSpan` はこれで決める（ずれると罫線が折れる） */
export const pitchingColumnCount = (stats) => BASE_COLUMNS + stats.length;

/** 名前の色の意味。⚠ **色だけに頼らない**（読み上げとマウスオーバーに出す） */
const FATIGUE_TONE_TEXT = {
  warn: '疲れています（このまま投げ続けると成長が鈍ります）',
  heavy: 'かなり疲れています（成長の鈍り方が最も大きくなります）',
  '': undefined,
};

/**
 * 見出しの行。`stats`: `[{ id, label, title }]`（今季成績の列）。
 * `fatigueTitle`: 疲労の見出しの説明（休む線は一人用とオンラインで違う）
 */
export function PitchingHeaderRow({ stats, fatigueTitle }) {
  return (
    <tr>
      <th className="online-lineup-slot">順</th>
      <th className="online-pitch-rolecell">役割</th>
      <th className="online-lineup-person">投手</th>
      <th title="投げる手">投</th>
      {/* ⚠ **フォームを出す**。球種の相性（`FORM_PITCH_SYNERGY`）と左右の
          打者への効き方が変わるので、救援の並べ方を決めるのに要る */}
      <th title="投球フォーム">フォーム</th>
      <th>年齢</th>
      <th className="is-sep" title={fatigueTitle}>
        疲労
      </th>
      <th className="is-sep" title="球速">
        球速
      </th>
      <th title="制球">制球</th>
      <th title="スタミナ">スタ</th>
      <th title="変化球（直球を除く持ち球）のキレの合計。封印した球は数えない">変化</th>
      {stats.map((s, i) => (
        <th key={s.id} className={i === 0 ? 'is-sep is-stat' : 'is-stat'} title={`今季の${s.title}`}>
          {s.label}
        </th>
      ))}
    </tr>
  );
}

/**
 * 1人ぶんの欄（順・役割の後ろ）。
 * - `name`: 名前の欄の中身（選手を開くボタンと調子の印）
 * - `fatigue`: `{ rest, restText }`（その数で休みの赤を付ける。付けないなら rest に Infinity）
 * - `stats`: `[{ id, text }]`（今季成績の欄。見出しと同じ並び）
 */
export function PitchingCells({ player, starter, name, fatigue, stats }) {
  const tone = getFatigueTone(player.fatigue);
  return (
    <>
      {/* ⚠ 疲労は**名前にも色を付ける**（スタメン設定と同じ `getFatigueTone`）。
          同じ選手が画面ごとに違う見え方をしないよう、両方の表に当てる */}
      <td className={`online-lineup-person online-fatigue-${tone || 'none'}`} title={FATIGUE_TONE_TEXT[tone]}>
        {name}
        {player.position !== 'pitcher' && (
          <small className="online-role-mark" title="野手登録の選手です（二刀流）。役割の札から投手起用を外せます">
            野手・{POS_FULL[player.position] || ''}
          </small>
        )}
      </td>
      <td>{player.physical?.throws === 'left' ? '左' : '右'}</td>
      <td className="online-pitch-form" title={FORM_NAME[player.pitching?.form] || undefined}>
        {FORM_SHORT[player.pitching?.form] || '—'}
      </td>
      <td>{player.age ?? '—'}</td>
      <td className="is-sep">
        <Fatigue value={player.fatigue} rest={fatigue.rest} warn={starter ? 20 : 30} restText={fatigue.restText} />
      </td>
      <td className="is-sep">
        <AbilityValue value={player.pitching?.velocity} isVel placeholder="—" />
      </td>
      <td>
        <AbilityValue value={player.pitching?.control} placeholder="—" />
      </td>
      <td>
        <AbilityValue value={player.pitching?.stamina} isSta placeholder="—" />
      </td>
      <td title={pitchTypes(player) || '変化球なし'}>{totalBreak(player) ?? '—'}</td>
      {stats.map((s, i) => (
        <td key={s.id} className={i === 0 ? 'is-sep is-stat' : 'is-stat'}>
          {s.text}
        </td>
      ))}
    </>
  );
}
