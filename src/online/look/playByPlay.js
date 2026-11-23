// ============================================================
// 新しい見た目（試作）段3: 打席速報。試合の `plays`（サーバーの `inningPlaysOf`）を
// 1打席ずつの「場面」にして、実況の1行（テロップ）を作る。
//
// ⚠ **表示専用**。行の形はサーバーの `inningPlaysOf`（`server/recordedStats.mjs`）:
//    [打者の番号, 記号, 点, アウト, 塁（打席の前）, 守備位置, 向き, 飛距離, 角度]
//    5つ目からは打席速報のために足したもの（版20）。前からある試合の行は4つまでなので、
//    その試合は打席速報を出さない（`hasLivePlays`）。打球の4つは打球が前へ飛んだ打席だけ。
// ⚠ アプリ（`mobile/shared/.../LookPlay.kt`）に写してある。文を変えたら両方を直し、
//    `node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json`
//    で期待値を書き出し直す（答え合わせはアプリの `LookTest`）。
// ============================================================

/** 守備位置の番号（1 投手 … 9 ライト）→ 実況の呼び方 */
export const FIELDERS = ['', 'ピッチャー', 'キャッチャー', 'ファースト', 'セカンド', 'サード', 'ショート', 'レフト', 'センター', 'ライト'];
const BASE_NAMES = ['一', '二', '三'];

/** 打席速報を出せる試合か（版20より前の試合は塁と打球の記録が無い） */
export const hasLivePlays = (game) =>
  Object.values(game?.plays || {}).some((rows) => Array.isArray(rows) && rows.some((r) => Array.isArray(r) && r.length >= 5));

/** 半回の鍵（「3t」「3b」）を試合の順に並べる */
function halfKeys(plays) {
  return Object.keys(plays || {})
    .map((key) => ({ key, inning: parseInt(key, 10), half: key.slice(-1) }))
    .filter((k) => Number.isFinite(k.inning) && (k.half === 't' || k.half === 'b'))
    .sort((a, b) => a.inning - b.inning || (a.half === 't' ? -1 : 1));
}

/** 塁の並び（一塁＝1・二塁＝2・三塁＝4 の和）→ 「一・二塁」「満塁」 */
export function basesText(bases) {
  if (!bases) return '走者なし';
  if (bases === 7) return '満塁';
  return `${BASE_NAMES.filter((_, i) => bases & (1 << i)).join('・')}塁`;
}

/** 打球の向き（-45 三塁線 … 0 センター … 45 一塁線）→ 外野の呼び方 */
function fieldOf(dir) {
  if (dir < -11) return 'レフト';
  if (dir > 11) return 'ライト';
  return 'センター';
}
/** 長打の向き（左中間・右中間は間を抜けた打球） */
function gapOf(dir) {
  if (dir <= -26) return 'レフト線';
  if (dir < -8) return '左中間';
  if (dir <= 8) return 'センター';
  if (dir < 26) return '右中間';
  return 'ライト線';
}
const HOMERS = ['', 'ソロ', 'ツーラン', 'スリーラン', '満塁'];

/**
 * 実況の1行（「レフト前タイムリー」）。`!` が付くのは点が入った・長打のとき。
 * @param scene `liveScenes` の1つ
 */
export function playPhrase(scene) {
  const { code, runs, batted } = scene;
  const pos = batted ? FIELDERS[batted.pos] || '' : '';
  const timely = runs > 0 ? 'タイムリー' : '';
  switch (code) {
    case '本':
      return `${batted ? `${fieldOf(batted.dir)}スタンドへ` : ''}${HOMERS[Math.min(4, runs)] || ''}ホームラン！`;
    case '三':
      return `${batted ? `${gapOf(batted.dir)}への` : ''}${timely}三塁打${runs ? '！' : ''}`;
    case '二':
      return `${batted ? `${gapOf(batted.dir)}への` : ''}${timely}二塁打${runs ? '！' : ''}`;
    case '安':
      if (batted && batted.pos <= 6) return `${pos}への内野安打${runs ? `（${runs}点）` : ''}`;
      return `${batted ? `${fieldOf(batted.dir)}前` : ''}${runs ? 'タイムリー！' : 'ヒット'}`;
    case '四':
      return runs ? '押し出しの四球' : '四球を選ぶ';
    case '死':
      return runs ? '押し出しの死球' : '死球で出塁';
    case '振':
      return '三振';
    case '犠':
      return runs ? 'スクイズ成功！' : '送りバント成功';
    case '併':
      return pos ? `${pos}ゴロ併殺打` : '併殺打';
    case '失':
      return `${pos ? `${pos}の` : ''}失策で出塁${runs ? `（${runs}点）` : ''}`;
    case '走':
      return `走者が進んで${runs}点`;
    case '刺':
      return '走者がアウト';
    default: {
      // 凡退。打球の角度でゴロ・ライナー・フライに分ける
      if (!batted) return '凡退';
      const kind = batted.la < 10 ? 'ゴロ' : batted.la < 25 ? 'ライナー' : 'フライ';
      if (runs && kind === 'フライ') return `${pos}への犠牲フライ`;
      if (runs) return `${pos}${kind}の間に${runs}点`;
      return `${pos}${kind}`;
    }
  }
}

/** 点の動きの1行（「三陸が勝ち越し（5-3）」）。点が入らなければアウトと塁 */
function situationText(scene, short, last) {
  const { team, runs, outs, basesAfter, scoreBefore, score, offense } = scene;
  if (runs > 0) {
    const other = offense === 'home' ? 'away' : 'home';
    const before = scoreBefore[offense] - scoreBefore[other];
    const after = score[offense] - score[other];
    // ⚠ 最後の打席で裏の球団が前に出たらサヨナラ
    const turn =
      last && offense === 'home' && after > 0
        ? 'サヨナラ'
        : before < 0 && after > 0
          ? '逆転'
          : before === 0 && after > 0
            ? '勝ち越し'
            : before < 0 && after === 0
              ? '同点'
              : '';
    const own = `${score[offense]}-${score[other]}`;
    return `${short(team)}が${runs}点${turn ? `、${turn}` : ''}（${own}）`;
  }
  if (last) return '試合終了';
  if (outs >= 3) return 'チェンジ';
  return `${outs}死${basesAfter == null ? '' : basesText(basesAfter)}`;
}

/**
 * 試合を1打席ずつの場面にする。打席の外の点（暴投など）とアウト（盗塁死など）も1場面にする。
 * @param short 球団の内部名 → 短い表示名
 * @returns `[{ inning, half, team, offense, batter, code, runs, outsBefore, outs, bases, basesAfter,
 *            batted, scoreBefore, score, phrase, situation }]`
 */
export function liveScenes(game, short = (t) => t) {
  const scenes = [];
  const score = { away: 0, home: 0 };
  for (const { key, inning, half } of halfKeys(game?.plays)) {
    const rows = (game.plays[key] || []).filter(Array.isArray);
    const offense = half === 'b' ? 'home' : 'away';
    const team = game[offense];
    const players = game.teams?.[team] || [];
    let outs = 0;
    const start = scenes.length;
    rows.forEach(([index, code, runs, rowOuts, bases, pos, dir, dist, la]) => {
      const before = { ...score };
      score[offense] += Number(runs) || 0;
      const outsBefore = outs;
      outs = Math.min(3, outs + (Number(rowOuts) || 0));
      const player = index == null ? null : players[index] || null;
      scenes.push({
        inning,
        half,
        team,
        offense,
        batter: player ? { id: player.id ?? null, name: player.name || '' } : null,
        code,
        runs: Number(runs) || 0,
        outsBefore,
        outs,
        bases: Number.isInteger(bases) ? bases : null,
        basesAfter: null,
        batted: Number.isInteger(pos) ? { pos, dir: Number(dir) || 0, dist: Number(dist) || 0, la: Number(la) || 0 } : null,
        scoreBefore: before,
        score: { ...score },
      });
    });
    // 打席の後の塁は、同じ半回で次に塁の分かる打席の前の塁（3つ目のアウトの後は空）。
    // ⚠ 打席の外の行（暴投の点・盗塁死）には塁の記録が無いので飛ばす
    for (let i = start; i < scenes.length; i++) {
      const next = scenes.slice(i + 1).find((s) => s.bases != null);
      scenes[i].basesAfter = scenes[i].outs >= 3 ? 0 : next ? next.bases : null;
    }
  }
  scenes.forEach((s, i) => {
    s.phrase = playPhrase(s);
    s.situation = situationText(s, short, i === scenes.length - 1);
  });
  return scenes;
}

/** 見どころ（点が入った・長打・併殺）だけの場面の番号 */
export const highlightIndexes = (scenes) =>
  scenes.flatMap((s, i) => (s.runs > 0 || s.code === '本' || s.code === '三' || s.code === '二' || s.code === '併' ? [i] : []));
