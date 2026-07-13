// ============================================================
// sim-harness 成績集計 & 不変条件チェック
// ============================================================

// リーグ全体の打撃・投球成績を seasonStats から集計する。
export function aggregateStats(TEAMS_DATA, names) {
  let AB = 0, H = 0, doubles = 0, triples = 0, HR = 0, BB = 0, K = 0, SB = 0;
  let outsIP = 0, ER = 0, pK = 0, pBB = 0, pH = 0;
  for (const name of names) {
    for (const p of TEAMS_DATA[name].players) {
      const b = p.seasonStats?.batting;
      if (b?.atBats) {
        AB += b.atBats; H += b.hits || 0; doubles += b.doubles || 0; triples += b.triples || 0;
        HR += b.homeruns || 0; BB += b.walks || 0; K += b.strikeouts || 0; SB += b.stolenBases || 0;
      }
      const pi = p.seasonStats?.pitching;
      if (pi?.inningsPitched) {
        outsIP += pi.inningsPitched; ER += pi.earnedRuns || 0;
        pK += pi.strikeouts || 0; pBB += pi.walks || 0; pH += pi.hits || 0;
      }
    }
  }
  const IP = outsIP / 3;
  const singles = H - doubles - triples - HR;
  const TB = singles + doubles * 2 + triples * 3 + HR * 4;
  return {
    AB, H, HR, BB, K, SB, IP,
    avg: H / AB,
    obp: (H + BB) / (AB + BB),
    slg: TB / AB,
    hrPerGamePerTeam: HR, // 呼び出し側で割る
    bbRate: BB / (AB + BB),
    kRate: K / (AB + BB),
    era: ER / IP * 9,
    k9: pK / IP * 9,
    bb9: pBB / IP * 9,
    h9: pH / IP * 9,
  };
}

// 構造的な不変条件をチェックする。壊れたら { ok:false, msg } を返す。
export function checkInvariants(TEAMS_DATA, names) {
  const problems = [];
  for (const name of names) {
    const players = TEAMS_DATA[name].players;

    // ID重複なし
    const ids = players.map(p => p.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) problems.push(`${name}: ID重複 ${[...new Set(dup)].join(',')}`);

    // ロスターが空でない
    if (players.length === 0) problems.push(`${name}: ロスターが空`);

    // 投手が最低限いる
    const pitchers = players.filter(p => p.position === 'pitcher');
    if (pitchers.length < 5) problems.push(`${name}: 投手が${pitchers.length}人（<5）`);

    // ローテーションの先発が存在し実在の選手を指す
    const rot = TEAMS_DATA[name].pitchingRotation;
    if (!rot?.starters?.length) {
      problems.push(`${name}: 先発ローテーション未設定`);
    } else {
      for (const sid of rot.starters) {
        if (!players.find(p => p.id === sid)) problems.push(`${name}: ローテ先発ID ${sid} が実在しない`);
      }
    }

    // 出場した野手の打率が[0,1]、防御率が非負など異常値がない
    for (const p of players) {
      const b = p.seasonStats?.batting;
      if (b?.atBats > 0) {
        const avg = b.hits / b.atBats;
        if (avg < 0 || avg > 1) problems.push(`${name} #${p.id}: 打率異常 ${avg.toFixed(3)}`);
        if (b.hits > b.atBats) problems.push(`${name} #${p.id}: 安打>打数`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
