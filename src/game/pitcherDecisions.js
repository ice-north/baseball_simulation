// ============================================================
// 勝利・敗戦・セーブ・ホールドの判定（自動シミュ / 采配モードで共有）
//
// ⚠ **判定はここ1箇所**。以前は DateProgressScreen / gameSetup / App.jsx の試合終了画面に
//    3本の別実装があり、どれも**リードの移り変わりを見ていなかった**
//    （「先発が5回以上なら先発の勝ち」「先発が失点していれば先発の負け」
//    「最後の投手が3アウト以上・最終点差3以内ならセーブ」）。
//    実測（726試合）: 先発勝利の28%が降板時にリードしていない投手 /
//    先発敗戦の23%が降板時にリードか同点 / セーブの16%が同点・ビハインドで登板していた。
//
// 入力はどちらのエンジンでも作れる最小限にしてある:
//   appearances … 各チームの登板順（先発を含む）{ id, seq, entryScore:{home,away} }
//   lastLead    … 勝ったチームが**最後に**リードを奪った瞬間
//                 { team:'home'|'away', pitcherId（そのチームの投手）, oppPitcherId, seq }
//   outsOf(side, id) … その投手が取ったアウト数
//
// 公式記録の規則を次のように近似する（走者の責任投手は追っていない）:
//   勝利 … 決勝点を奪った時点で投げていた投手（責任投手）。先発が5回未満なら
//          勝利チームのリリーフで最も長く投げた投手
//   敗戦 … 決勝点を奪われた時点で投げていた投手
//   セーブ … 最後に投げた投手（勝利投手・先発を除く）が、3点差以内のリードで登板して
//          1回以上投げた、または3回以上投げた
//   ホールド … 決勝点の後に、3点差以内のリードで登板して1アウト以上取り、
//          リードを保ったまま降りたリリーフ（勝利・セーブ・最後の投手を除く）
// ============================================================

const SIDES = ['home', 'away'];
const other = (side) => (side === 'home' ? 'away' : 'home');
const leadOf = (score, side) => (score?.[side] || 0) - (score?.[other(side)] || 0);

export function decidePitchers({ finalScore, appearances, lastLead, outsOf }) {
  const out = { win: null, loss: null, save: null, holds: [], winSide: null };
  if (!finalScore || finalScore.home === finalScore.away) return out;
  const winSide = finalScore.home > finalScore.away ? 'home' : 'away';
  const loseSide = other(winSide);
  out.winSide = winSide;

  const winApps = (appearances?.[winSide] || []).filter(a => outsOf(winSide, a.id) > 0 || a.isStarter);
  const loseApps = (appearances?.[loseSide] || []).filter(a => outsOf(loseSide, a.id) > 0 || a.isStarter);
  if (winApps.length === 0) return out;
  const starter = winApps.find(a => a.isStarter) || winApps[0];

  // 決勝点を奪った瞬間。記録が無い場合（旧データ）は試合の最初から勝っていたとみなす
  const decisive = (lastLead && lastLead.team === winSide) ? lastLead : null;
  const ofRecordId = decisive?.pitcherId ?? starter.id;

  // 勝利
  if (ofRecordId === starter.id && outsOf(winSide, starter.id) < 15) {
    const relievers = winApps.filter(a => a.id !== starter.id);
    out.win = relievers.length
      ? relievers.reduce((b, a) => (outsOf(winSide, a.id) > outsOf(winSide, b.id) ? a : b)).id
      : starter.id;   // 継投なし（コールド等）
  } else {
    out.win = ofRecordId;
  }

  // 敗戦
  if (decisive?.oppPitcherId != null) out.loss = decisive.oppPitcherId;
  else if (loseApps.length) out.loss = (loseApps.find(a => a.isStarter) || loseApps[0]).id;

  // セーブ（最後に投げた投手）
  const finisher = [...winApps].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).at(-1);
  if (finisher && finisher.id !== out.win && finisher.id !== starter.id) {
    const lead = leadOf(finisher.entryScore, winSide);
    const outs = outsOf(winSide, finisher.id);
    if ((lead >= 1 && lead <= 3 && outs >= 3) || (lead >= 1 && outs >= 9)) out.save = finisher.id;
  }

  // ホールド（決勝点より後に登板し、リードを保って降りた＝その後にリードを失っていない）
  const decisiveSeq = decisive?.seq ?? -1;
  for (const a of winApps) {
    if (a.id === starter.id || a.id === out.win || a.id === out.save || a === finisher) continue;
    if ((a.seq ?? 0) < decisiveSeq) continue;
    const lead = leadOf(a.entryScore, winSide);
    if (lead >= 1 && lead <= 3 && outsOf(winSide, a.id) >= 1) out.holds.push(a.id);
  }
  return out;
}

/**
 * 試合中のリード変化と登板順を記録する小さな帳簿（両エンジンで同じ形）。
 * `observe` を「得点・投手が変わりうる区切り」ごとに呼ぶ（打席ごと等）。
 */
export function createDecisionLog() {
  return { seq: 0, leader: null, lastLead: null, appearances: { home: [], away: [] } };
}

export function observeDecisionLog(log, { score, pitcherIds }) {
  log.seq++;
  for (const side of SIDES) {
    const id = pitcherIds?.[side];
    if (id == null) continue;
    const list = log.appearances[side];
    if (list.length === 0 || list[list.length - 1].id !== id) {
      list.push({ id, seq: log.seq, entryScore: { ...score }, isStarter: list.length === 0 });
    }
  }
  const d = (score.home || 0) - (score.away || 0);
  const leader = d > 0 ? 'home' : d < 0 ? 'away' : null;
  if (leader && leader !== log.leader) {
    log.lastLead = {
      team: leader,
      pitcherId: pitcherIds?.[leader] ?? null,
      oppPitcherId: pitcherIds?.[other(leader)] ?? null,
      seq: log.seq,
    };
  }
  log.leader = leader;
}

/**
 * `autoSimulateGame` の結果（両チームの試合中の選手＋ decisionLog）から判定する。
 * 戻り値は選手オブジェクト（試合中のコピー）: { winningPitcher, losingPitcher, savePitcher, holdPitchers }
 */
export function decisionsFromResult(result) {
  const d = { winningPitcher: null, losingPitcher: null, savePitcher: null, holdPitchers: [] };
  if (!result?.decisionLog || result.homeScore === result.awayScore) return d;
  const teamOf = (side) => (side === 'home' ? result.homeTeam : result.awayTeam);
  const find = (side, id) => (id == null ? null : teamOf(side)?.players?.find(p => p.id === id) || null);
  const outsOf = (side, id) => find(side, id)?.gameStats?.pitching?.outs || 0;
  const r = decidePitchers({
    finalScore: { home: result.homeScore, away: result.awayScore },
    appearances: result.decisionLog.appearances,
    lastLead: result.decisionLog.lastLead,
    outsOf,
  });
  if (!r.winSide) return d;
  const loseSide = other(r.winSide);
  d.winningPitcher = find(r.winSide, r.win);
  d.losingPitcher = find(loseSide, r.loss);
  d.savePitcher = find(r.winSide, r.save);
  d.holdPitchers = r.holds.map(id => find(r.winSide, id)).filter(Boolean);
  return d;
}

/**
 * 判定をシーズン成績（wins / losses / saves / holds）に積む。
 * ⚠ **1試合1回・この関数だけ**。以前は日程進行の画面だけが記録しており、
 *    トーナメント・背景のリーグ戦（社会人モードでは全試合）は勝敗が0のままだった。
 */
export function recordDecisions(decisions, { winTeam, loseTeam }, teams) {
  const add = (p, teamName, stat) => {
    if (!p) return;
    const pd = teams?.[teamName]?.players?.find(x => x.id === p.id);
    if (!pd) return;
    if (!pd.seasonStats) pd.seasonStats = { batting: {}, pitching: {} };
    if (!pd.seasonStats.pitching) pd.seasonStats.pitching = {};
    const prev = pd.seasonStats.pitching[stat] || 0;
    pd.seasonStats.pitching[stat] = (Number.isFinite(prev) ? prev : 0) + 1;
  };
  add(decisions.winningPitcher, winTeam, 'wins');
  add(decisions.losingPitcher, loseTeam, 'losses');
  add(decisions.savePitcher, winTeam, 'saves');
  (decisions.holdPitchers || []).forEach(p => add(p, winTeam, 'holds'));
}
