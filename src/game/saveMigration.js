// ============================================================
// セーブデータのバージョン移行・正規化 - src/game/saveMigration.js
//
// 将来アップデートで能力やデータ構造が変わっても、旧セーブを壊さず読み込むための層。
// ロード時に:
//   1) バージョンを判定し、必要なマイグレーションを順に適用
//   2) 全選手に必須フィールドの既定値をバックフィル（欠損によるクラッシュ防止）
// 新しい破壊的変更を入れたら MIGRATIONS に1ステップ足すだけで対応できる。
// ============================================================

// 現行スキーマのバージョン。破壊的変更のたびに上げ、MIGRATIONSにステップを追加する。
export const CURRENT_SAVE_VERSION = '2.15.0';

// "a.b.c" を比較。a<b→-1, a>b→1, 等しい→0。数値でない部分は0扱い。
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// 正規分布ノイズ（既定値のばらつき用）。
const norm = (mu, sigma) =>
  Math.max(1, Math.min(100, Math.round(mu + (Math.sqrt(-2 * Math.log(Math.random() || 0.001)) * Math.cos(2 * Math.PI * Math.random())) * sigma)));

// 1選手に必須フィールドの既定値をバックフィルする（破壊しない・欠損のみ補う）。
export function normalizePlayer(p) {
  if (!p || typeof p !== 'object') return p;

  // 能力コンテナが欠けていても参照でクラッシュしないよう保証
  if (!p.physical) p.physical = {};
  if (!p.batting) p.batting = {};
  if (!p.fielding) p.fielding = {};
  const isPitcher = p.position === 'pitcher';
  if (isPitcher && !p.pitching) p.pitching = {};

  const ph = p.physical, ba = p.batting, fi = p.fielding;
  // フィジカル
  if (ph.speed == null) ph.speed = norm(45, 12);
  if (ph.arm == null) ph.arm = norm(50, 12);
  if (ph.throws == null) ph.throws = 'right';
  if (ph.bodyStamina == null) ph.bodyStamina = norm(50, 10);
  if (ph.recovery == null) ph.recovery = norm(55, 10);
  if (ph.muscle == null) ph.muscle = 50;
  if (ph.dexterity == null) ph.dexterity = 50;
  // 打撃
  if (ba.meet == null) ba.meet = norm(40, 12);
  if (ba.power == null) ba.power = norm(35, 12);
  if (ba.eye == null) ba.eye = norm(35, 10);
  if (ba.steal == null) ba.steal = norm(30, 10);
  if (ba.bats == null) ba.bats = 'right';
  // バント（旧セーブ互換: 従来はミート/走力から推定）
  if (ba.bunt == null) {
    ba.bunt = Math.min(99, Math.max(1, Math.round((ba.meet || 50) * 0.4 + (ph.speed || 50) * 0.3 + Math.random() * 20)));
  }
  // 守備
  if (fi.defense == null) fi.defense = norm(40, 12);
  // 投手
  if (isPitcher && p.pitching) {
    const pi = p.pitching;
    if (pi.velocity == null) pi.velocity = norm(130, 6);
    if (pi.control == null) pi.control = norm(40, 12);
    if (pi.stamina == null) pi.stamina = norm(70, 15);
    if (!Array.isArray(pi.arsenal)) pi.arsenal = [];
  }

  // 成長・性格・その他のスカラ
  if (p.growthPotential == null) p.growthPotential = 1.0;
  if (p.growthModifier == null) p.growthModifier = 0;
  if (p.fame == null) p.fame = 0;
  if (!p.personality) p.personality = { discipline: norm(50, 18), mental: norm(50, 18) };
  else {
    if (p.personality.discipline == null) p.personality.discipline = norm(50, 18);
    if (p.personality.mental == null) p.personality.mental = norm(50, 18);
  }
  if (!p.positionFitness) p.positionFitness = {};

  // 旧DHポジションは実ポジションへ寄せる
  if (p.position === 'dh') {
    const best = Object.entries(p.positionFitness).sort((a, b) => b[1] - a[1])[0];
    p.position = best ? best[0] : 'first';
  }
  return p;
}

// セーブ全体の選手を正規化（teamsData ＋ releasedPlayersPool）。
function normalizeSaveData(data) {
  if (data.teamsData && typeof data.teamsData === 'object') {
    Object.values(data.teamsData).forEach(team => {
      if (Array.isArray(team?.players)) team.players.forEach(normalizePlayer);
    });
  }
  if (Array.isArray(data.releasedPlayersPool)) {
    data.releasedPlayersPool.forEach(normalizePlayer);
  }
  return data;
}

// バージョン別の破壊的変更ステップ。version より古いセーブに apply() を適用する。
// 例: { version: '3.0.0', apply(data) { /* フィールド名変更など */ } }
const MIGRATIONS = [
  // （現時点では構造の破壊的変更なし。正規化のみで対応）
];

// セーブデータを現行スキーマへ移行する。
// @returns {{ data, fromVersion, applied: string[], warnings: string[] }}
export function migrateSaveData(saveData) {
  const applied = [];
  const warnings = [];
  const fromVersion = saveData.version || 'unknown';

  // 現行より新しいセーブ（ダウングレード）: 壊さずベストエフォートで読む
  if (fromVersion !== 'unknown' && compareVersions(fromVersion, CURRENT_SAVE_VERSION) > 0) {
    warnings.push(`このセーブは新しいバージョン(${fromVersion})のものです。一部データが正しく読めない可能性があります。`);
  }

  // 該当するマイグレーションを順に適用
  for (const m of MIGRATIONS) {
    if (compareVersions(fromVersion, m.version) < 0) {
      try { m.apply(saveData); applied.push(m.version); }
      catch (e) { warnings.push(`移行(${m.version})でエラー: ${e.message}`); }
    }
  }

  // 常に正規化（欠損フィールドのバックフィル）
  normalizeSaveData(saveData);
  saveData.version = CURRENT_SAVE_VERSION;

  return { data: saveData, fromVersion, applied, warnings };
}
