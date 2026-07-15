// ============================================================
// 選手の物語（キャリアタイムライン）構築 - src/components/playerStory.js
//
// player.careerHistory（経歴）・statsHistory（年度別能力/成績）・
// professionalCareer.achievements（タイトル）・fame から、
// 時系列のストーリーイベント配列を組み立てる純粋関数。
// 「ドラフト漏れ→大学でブレイク→翌年指名」のような物語を可視化する材料を返す。
// ============================================================

// careerHistory の type ごとの見た目・文言。
const PATH_META = {
  highschool: { icon: '🏫', color: 'gray', verb: '' },
  university: { icon: '🎓', color: 'blue', verb: '入学' },
  corporate:  { icon: '🏢', color: 'green', verb: '入社' },
  corporate_join: { icon: '🏢', color: 'green', verb: '入社' },
  independent: { icon: '⚾', color: 'orange', verb: '入団' },
  club_join:  { icon: '🧢', color: 'teal', verb: '入部' },
  released:   { icon: '📋', color: 'red', verb: '自由契約' },
  draft:      { icon: '🎉', color: 'yellow', verb: '' },
};

// 技術系ステータスの日本語名（ブレイク要因の表示用）。
const STAT_LABEL = {
  meet: 'ミート', power: 'パワー', eye: '選球眼', speed: '走力', arm: '肩力',
  defense: '守備', steal: '盗塁', velocity: '球速', control: '制球', stamina: 'スタミナ',
};

// 2年分の能力から「伸び」の重み付き合計と、伸びた上位ステータスを求める。
// 球速は0-100スケールでないため ×2.2 で重み付け。
function abilityGain(prev, cur) {
  if (!prev || !cur) return { score: 0, tops: [] };
  const keys = ['meet', 'power', 'eye', 'speed', 'arm', 'defense', 'steal', 'control', 'stamina'];
  const deltas = [];
  let score = 0;
  for (const k of keys) {
    const d = (cur[k] || 0) - (prev[k] || 0);
    if (d > 0) { score += d; deltas.push({ k, d }); }
  }
  const vd = (cur.velocity || 0) - (prev.velocity || 0);
  if (vd > 0) { score += vd * 2.2; deltas.push({ k: 'velocity', d: vd }); }
  deltas.sort((a, b) => b.d - a.d);
  return { score, tops: deltas.slice(0, 3) };
}

// 年度別の能力系列を取り出す。statsHistory（自チーム選手）を優先し、
// なければ growthHistory（snapshotAbilityHistory が全チームに記録）を使う。
// これによりCPU/スカウト対象の選手でも「飛躍の年」を検出できる。
function getAbilitySeries(player) {
  const sh = (player.statsHistory || []).filter(e => e.abilities);
  if (sh.length >= 2) {
    return sh.map(e => ({ year: e.year, ...e.abilities }));
  }
  const gh = player.growthHistory || [];
  if (gh.length >= 2) {
    // growthHistory は既にフラット（year + 各能力）。eye/steal は持たないため0扱い。
    return gh.map(e => ({ ...e }));
  }
  return [];
}

// fame（0-100）を段階ラベルに変換。
export function fameLabel(fame) {
  const f = fame || 0;
  if (f >= 80) return { text: '全国区の知名度', color: 'text-yellow-300' };
  if (f >= 50) return { text: '評判が広まる', color: 'text-orange-300' };
  if (f >= 25) return { text: '地元で注目', color: 'text-blue-300' };
  if (f >= 8) return { text: '関係者に知られる', color: 'text-gray-300' };
  return { text: '無名', color: 'text-gray-400' };
}

// 選手のストーリーイベント配列（時系列昇順）を返す。
// 各要素: { year, icon, color, title, detail, kind }
export function buildPlayerStory(player) {
  if (!player) return { events: [], titles: [], breakoutYear: null };
  const events = [];

  // 1. 経歴（careerHistory）→ 経路ノード
  const history = player.careerHistory || [];
  for (const h of history) {
    if (h.type === 'achievement') {
      // 全国大会成績（例: 3年時 明治神宮大会 優勝）
      events.push({
        year: h.year ?? null,
        icon: '🏆',
        color: h.result === '優勝' ? 'yellow' : 'gray',
        title: `${h.grade ? `${h.grade}年時 ` : ''}${h.tournament} ${h.result}`.trim(),
        detail: h.team || null,
        kind: 'achievement',
      });
      continue;
    }
    const meta = PATH_META[h.type] || { icon: '•', color: 'gray', verb: '' };
    const title = meta.verb ? `${h.label} ${meta.verb}` : h.label;
    events.push({
      year: h.year ?? null,
      icon: meta.icon,
      color: meta.color,
      title: (title || '').trim(),
      detail: null,
      kind: h.type,
      order: 1, // 入団などの経路は同年内では指名(order 0)の後に並べる
    });
  }

  // 2. トライアウト指名（draftInfo）。独立リーグのトライアウトで選択された巡目。
  //    ※NPBドラフトではない。指名→入団の順になるよう order を早めに設定。
  if (player.draftInfo) {
    const round = player.draftInfo.round;
    events.push({
      year: player.draftInfo.year ?? null,
      icon: '🎯',
      color: 'yellow',
      title: round ? `トライアウト ${round}巡目指名` : 'トライアウト指名',
      detail: player.draftInfo.team || null,
      kind: 'draft',
      order: 0, // 同年内では入団より先に表示
    });
  }

  // 3. ブレイク（能力の急伸）を検出。statsHistory優先・growthHistoryフォールバック。
  const sh = getAbilitySeries(player);
  let breakoutYear = null;
  if (sh.length >= 2) {
    let best = { score: 0, idx: -1, tops: [] };
    for (let i = 1; i < sh.length; i++) {
      const g = abilityGain(sh[i - 1], sh[i]);
      if (g.score > best.score) best = { score: g.score, idx: i, tops: g.tops };
    }
    // 閾値: 重み付き合計12以上を「飛躍」とみなす
    if (best.idx >= 0 && best.score >= 12) {
      const entry = sh[best.idx];
      breakoutYear = entry.year;
      const topsStr = best.tops
        .map(t => `${STAT_LABEL[t.k] || t.k}+${t.k === 'velocity' ? t.d : t.d}${t.k === 'velocity' ? 'km' : ''}`)
        .join('・');
      events.push({
        year: entry.year ?? null,
        icon: '🔥',
        color: 'red',
        title: '飛躍の年',
        detail: topsStr ? `${topsStr} が大きく成長` : '能力が急伸',
        kind: 'breakout',
      });
    }
  }

  // 4. 年代順にソート（year が null のものは先頭へ寄せる）
  events.sort((a, b) => {
    if (a.year == null && b.year == null) return 0;
    if (a.year == null) return -1;
    if (b.year == null) return 1;
    if (a.year !== b.year) return a.year - b.year;
    return (a.order ?? 1) - (b.order ?? 1); // 同年内は指名→入団の順
  });

  // 5. タイトル（achievements）はまとめて別枠で返す（yearが0のため時系列に載せない）
  const titleCounts = {};
  for (const a of (player.professionalCareer?.achievements || [])) {
    if (a?.title) titleCounts[a.title] = (titleCounts[a.title] || 0) + 1;
  }
  const titles = Object.entries(titleCounts).map(([title, count]) => ({ title, count }));

  return { events, titles, breakoutYear };
}
