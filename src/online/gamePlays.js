// ============================================================
// 回ごとの攻撃（打席の順）。サーバーが残した `game.plays` を読む形にする。
//
// ⚠ いしだ 2026-11-19「過去の成績をみたとき、スコアをクリックすると、その回の攻撃を
//    時系列で表示してほしい」。スコアボードの回の数字を押すと、その半回をここの形で出す。
// ⚠ 中身の作りはサーバーの `inningPlaysOf`（`server/recordedStats.mjs`）。
//    記号の並びは**両方で同じ**にすること（`PLAY_CODES`）。
// ⚠ **前からある試合には `plays` が無い**（打席の記録を残していなかった）。
//    無い試合は押せないようにする（`hasInningPlays`）。
// ============================================================

/** 記号 → 画面の文。⚠ サーバーの `playCode` が出す記号だけを持つ */
export const PLAY_TEXT = {
  本: 'ホームラン',
  三: '三塁打',
  二: '二塁打',
  安: '安打',
  四: '四球',
  死: '死球',
  振: '三振',
  犠: '犠打',
  併: '併殺打',
  失: '失策で出塁',
  凡: '凡退',
  走: '走者が進んで得点',
  刺: '走者がアウト',
};

/**
 * アウトになった打席（色を落とすため。古い試合ではアウトもこれで数える）。⚠ 犠打もアウト1つ
 * ⚠ 2026-11-20 監査: 記号から数えると盗塁死を数えず、振り逃げ・野選を1つと数えて、
 *    約7%の半回が「2死」で終わっていた。いまの試合は行の4つ目（その行で増えたアウト。
 *    サーバーの `e.outs`）を使う。3要素の行（前からある試合）だけ記号から数える。
 */
const OUT_CODES = new Set(['振', '犠', '併', '凡', '刺']);
/** 安打（色を変える。⚠ 四球・死球・失策は安打ではない） */
const HIT_CODES = new Set(['本', '三', '二', '安']);

/**
 * その打席の色の種類（いしだ 2026-11-20「安打なら黄色、打点も付いたら赤色など、
 * 視覚的にわかりやすくして」）。点が入った打席がいちばん強い。
 *   `score` … 点が入った（赤）／`hit` … 安打（黄）／`out` … アウト（落とす）／`plain` … そのほか
 */
export const playTone = (code, runs) =>
  (Number(runs) || 0) > 0 ? 'score' : HIT_CODES.has(code) ? 'hit' : OUT_CODES.has(code) ? 'out' : 'plain';

/** その半回の鍵（「3t」＝3回表・「3b」＝3回裏） */
export const inningKey = (inning, half) => `${inning}${half === 'bottom' ? 'b' : 't'}`;

/** 回ごとの攻撃が残っている試合か（古い試合には無い） */
export const hasInningPlays = (game) =>
  !!game?.plays && Object.keys(game.plays).length > 0;

/**
 * その半回の打席を、画面に出す形へ。
 * @returns `{ team, rows: [{ order, name, code, text, runs, outs }] }`
 *   `order` は打順ではなく**その回の何人目か**、`outs` はその打席が終わったあとのアウト数。
 */
export function inningPlays(game, inning, half) {
  const rows = game?.plays?.[inningKey(inning, half)];
  if (!Array.isArray(rows)) return null;
  const team = half === 'bottom' ? game.home : game.away;
  const players = game.teams?.[team] || [];
  let outs = 0;
  let order = 0;
  return {
    team,
    rows: rows.map(([index, code, runs, rowOuts]) => {
      if (rowOuts != null) outs += Number(rowOuts) || 0;
      // 古い試合（行が3要素）: 記号から数える。⚠ 併殺はアウト2つ
      else if (OUT_CODES.has(code)) outs += code === '併' ? 2 : 1;
      const player = index == null ? null : players[index];
      if (index != null) order += 1;
      return {
        order: index == null ? null : order,
        name: player?.name || (index == null ? null : '（記録なし）'),
        code,
        text: PLAY_TEXT[code] || code,
        runs: Number(runs) || 0,
        outs: Math.min(3, outs),
        tone: playTone(code, runs),
      };
    }),
  };
}

/** その半回に入った点（スコアボードの数字と合うこと） */
export const inningRuns = (game, inning, half) =>
  (game?.plays?.[inningKey(inning, half)] || []).reduce(
    (sum, row) => sum + (Number(row?.[2]) || 0),
    0,
  );
