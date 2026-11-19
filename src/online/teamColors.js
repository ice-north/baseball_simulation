// ============================================================
// 球団の色（12球団ぶん）。
//
// ⚠ いしだ 2026-11-19「主に画面が地味な点を修正して欲しい」。いちばん大きな原因は
//    **球団色が無く、12球団がどの画面でも同じ顔に見えること**だった（アクセントは
//    `--accent` の水色1色だけ。一人用の `EditScreen.jsx` に12色の配列が1画面だけある）。
//
// ⚠ **保存にも投影にも足していない**。内部名を並べ替えた順で割り当てるので、
//    同じリーグなら誰の画面でも同じ色になり、球団名を付け替えても色は変わらない
//    （内部名は記録の選手キーまで貫いていて変えられない＝色の台にちょうどよい）。
//    保存の形を変えないので `ONLINE_SCHEMA` も据え置き。
//
// ⚠ **2段ずつ持つこと**。地が2つあるので1色では足りない:
//      `deep`   … 明るい地（紙 `--surface-0` #abb1ad）の上の札。白文字を載せる
//      `bright` … 暗いカード（`--surface-2` #324d6c）の上の帯・札。黒文字を載せる
//    実測（コントラスト比）:
//      deep + 白文字 4.92〜9.07（AA）／deep と紙 2.26〜4.16
//      bright + 黒文字（#0f172a）6.45〜11.84（AA）／bright とカード 3.15〜5.77（非文字の3:1）
// ⚠ **紙の上に deep の札を置くときは細い暗い縁を付ける**。紙との差が緑・琥珀・黄緑で
//    2.3 までしかなく、縁が無いと形が溶ける（`online.css` の `.online-team-mark.is-paper`）。
// ============================================================

/** 12球団ぶんの色。⚠ 並びを変えると既存リーグの色が入れ替わる（見た目だけだが驚く） */
export const TEAM_PALETTE = [
  { key: 'blue', label: '青', deep: '#1d4ed8', bright: '#60a5fa' },
  { key: 'red', label: '赤', deep: '#b91c1c', bright: '#f87171' },
  { key: 'green', label: '緑', deep: '#15803d', bright: '#4ade80' },
  { key: 'amber', label: '琥珀', deep: '#a16207', bright: '#fbbf24' },
  { key: 'violet', label: '紫', deep: '#6d28d9', bright: '#a78bfa' },
  { key: 'teal', label: '青緑', deep: '#0f766e', bright: '#2dd4bf' },
  { key: 'orange', label: '橙', deep: '#c2410c', bright: '#fb923c' },
  { key: 'sky', label: '空', deep: '#0369a1', bright: '#38bdf8' },
  { key: 'pink', label: '桃', deep: '#be185d', bright: '#f472b6' },
  { key: 'lime', label: '黄緑', deep: '#4d7c0f', bright: '#a3e635' },
  { key: 'brown', label: '茶', deep: '#78350f', bright: '#d6a06a' },
  { key: 'magenta', label: '赤紫', deep: '#a21caf', bright: '#e879f9' },
];

/** 内部名 → 色の番号。`setTeamColors` で入れ替える（`setTeamLabels` と同じ時） */
let INDEX = {};

/**
 * リーグの球団名から色を割り当てる。⚠ **並べ替えた順**で割り当てること
 * （昇降格で `teamNames` の並びが変わっても色が入れ替わらないように）。
 */
export function setTeamColors(names) {
  const sorted = [...new Set(names || [])].sort();
  INDEX = Object.fromEntries(sorted.map((name, i) => [name, i % TEAM_PALETTE.length]));
}

/** 名前から番号を作る（リーグ外の球団・独立リーグの相手など、割り当てが無いとき） */
const hashIndex = (name) => {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) % 100003;
  return h % TEAM_PALETTE.length;
};

/** その球団の色。⚠ 知らない球団でも必ず何か返す（画面が色無しで崩れないように） */
export function teamColor(name) {
  const i = INDEX[name];
  return TEAM_PALETTE[i == null ? hashIndex(name) : i];
}
