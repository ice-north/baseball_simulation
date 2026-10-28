import React from 'react';

// ============================================================
// チーム選択のカード（大学 / 社会人 / 独立 で共有）
//
// 【なぜ共有するか】選択画面は3モードぶんあり、どれも「名前とランク文字だけの
// 同じ色の角丸矩形」を**別々に**書いていた。6校並べても見分けがつかず、
// データにある `rank` / `budget` / `specialties` はどこにも出ていなかった。
// 表を二重に作らないのと同じ理由で、カードは1つにする。
//
// ⚠ **色はここで決めない**。呼ぶ側が `accent` を渡す。
//    ランクの色は `RANK_HEX`、独立リーグはリーグの色、というように
//    カテゴリごとに意味が違うため（`constants.js` の RANK_BG の注記と同じ話）。
// ⚠ 導入画面の語彙（`.lift-card` / すりガラス）を使う。本編の画面には持ち込まない。
// ============================================================

/**
 * 紋章の字。⚠ **1文字目をそのまま取らないこと**では済まない:
 *   「東京大学」も「東北福祉大学」も「東」になる。校名の頭2文字のうち、
 *   2文字目が「京」「北」など方角の続きなら2文字使う、という調整はしない——
 *   **同じリーグ内で重複しない限り1文字で足りる**（リーグは6〜12校）。
 *   呼ぶ側が重複を避けたいときは `crest` を明示的に渡す。
 */
export const crestOf = (name = '') => (name.trim()[0] || '?');

const Crest = ({ text, accent }) => (
  <div
    className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black"
    style={{
      color: accent,
      // 盾の質感。⚠ 単色の塗りだと「色つきの四角」で終わる。
      //    上を明るく下を沈めて、縁に同色の細い線を1本入れると金属に見える
      backgroundImage: `linear-gradient(160deg, ${accent}2e, ${accent}0f)`,
      boxShadow: `inset 0 0 0 1px ${accent}55, inset 0 1px 0 ${accent}44`,
    }}
  >
    {text}
  </div>
);

/** 0〜max の横棒。予算・戦力などの「量」を1本で見せる */
const Meter = ({ value, max = 100, accent }) => (
  <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
    <div className="h-full rounded-full"
         style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, backgroundColor: accent, opacity: 0.85 }} />
  </div>
);

const TeamSelectCard = ({
  name,
  crest,
  accent = '#94a3b8',
  rank,
  rankLabel,
  meter,          // { label, value, max }
  chips = [],     // 文字列の配列（得意分野など）
  note,           // 1行の補足
  selected = false,
  onClick,
}) => (
  <button
    onClick={onClick}
    aria-pressed={selected}
    className={`lift-card w-full text-left rounded-xl p-4 border bg-surface-2/80 ${
      selected ? 'border-transparent' : 'border-gray-700/70 hover:border-gray-500'
    }`}
    style={selected ? { boxShadow: `inset 0 0 0 2px ${accent}, 0 18px 38px -12px rgba(0,0,0,0.8)` } : undefined}
  >
    <div className="flex items-center gap-3">
      <Crest text={crest || crestOf(name)} accent={accent} />
      <div className="min-w-0 flex-1">
        {/* ⚠ チーム名は truncate すること。「埼玉武蔵ヒートベアーズ」級が入ると折り返して
            カードの高さが揃わなくなる（並べたときに段差が出る） */}
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-white truncate">{name}</span>
          {rank && (
            <span className="ml-auto shrink-0 text-sm font-black tabular-nums" style={{ color: accent }}>
              {rank}
            </span>
          )}
        </div>
        {(rankLabel || note) && (
          <div className="text-xs text-gray-400 truncate mt-0.5">{rankLabel || note}</div>
        )}
      </div>
    </div>

    {meter && (
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[11px] text-gray-400 mb-1">
          <span>{meter.label}</span>
          <span className="tabular-nums">{meter.value}</span>
        </div>
        <Meter value={meter.value} max={meter.max} accent={accent} />
      </div>
    )}

    {chips.length > 0 && (
      <div className="mt-2.5 flex flex-wrap gap-1">
        {chips.map((c) => (
          <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-black/30 text-gray-300 border border-white/5">
            {c}
          </span>
        ))}
      </div>
    )}
  </button>
);

export default TeamSelectCard;
