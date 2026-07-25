// ============================================================
// OB名鑑レジストリ - src/game/obRegistry.js
//
// プロ（NPB）へ送り出した教え子を、セーブスロットを横断して永続保存する。
// TEAMS_DATA 内の team.npbAlumni は「そのセーブの記録」だが、サンドボックスモードは
// TEAMS_DATA を初期化するため参照できない。そこで localStorage 上の独立した名簿に
// ミラーし、どのプレイからでも歴代OBを呼び出して遊べるようにする。
//
// 保存するのは能力・素質のみ（成績ログは持たない）。容量肥大を防ぐため上限を設ける。
// ============================================================

const OB_REGISTRY_KEY = 'baseballSim_obRegistry';
const MAX_ENTRIES = 500;

const readRaw = () => {
  try {
    const raw = localStorage.getItem(OB_REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

/** 歴代OB一覧を返す（新しい順） */
export const getObRegistry = () => readRaw();

/** OBを追加する。同一選手(playerId+draftYear+name)は重複登録しない */
export const addToObRegistry = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  try {
    const current = readRaw();
    const seen = new Set(current.map(e => `${e.playerId}_${e.draftYear}_${e.name}`));
    let added = 0;
    for (const e of entries) {
      if (!e) continue;
      const key = `${e.playerId}_${e.draftYear}_${e.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      current.unshift({ ...e, registeredAt: new Date().toISOString() });
      added++;
    }
    if (added === 0) return 0;
    localStorage.setItem(OB_REGISTRY_KEY, JSON.stringify(current.slice(0, MAX_ENTRIES)));
    return added;
  } catch (_) {
    return 0;
  }
};

/** 名鑑を全消去する */
export const clearObRegistry = () => {
  try { localStorage.removeItem(OB_REGISTRY_KEY); } catch (_) { /* noop */ }
};

/**
 * OB名鑑のエントリをプレイ可能な選手オブジェクトに変換する（サンドボックス投入用）。
 * 指名時点の能力をそのまま復元し、成績は新規化する。
 */
export const convertObToPlayer = (ob, id) => ({
  id,
  name: ob.name,
  age: ob.age || 22,
  position: ob.position || 'pitcher',
  battingOrder: 0,
  isStarter: false,
  batting: ob.batting || { meet: 50, power: 50, eye: 50, bats: 'right', bunt: 30, steal: 30 },
  pitching: ob.pitching || { velocity: 140, control: 50, stamina: 100, form: 'overhand', arsenal: [{ type: 'straight', level: 50 }] },
  physical: ob.physical || { speed: 50, arm: 50, throws: 'right', bodyStamina: 50, recovery: 50 },
  fielding: ob.fielding || { defense: 50 },
  catching: ob.catching || { lead: 30 },
  positionFitness: ob.positionFitness || {},
  growthPotential: ob.growthPotential || 1.0,
  personality: ob.personality || { discipline: 50, mental: 50 },
  traits: ob.traits || [],
  careerHistory: ob.careerHistory || [],
  fame: ob.fame || 0,
  fatigue: 0,
  experience: 0,
  growthModifier: 0,
  condition: 2,
  // 由来を残す（表示・懐古用）
  obOrigin: { fromTeam: ob.fromTeam || null, draftYear: ob.draftYear, npbTeam: ob.npbTeam, draftRound: ob.draftRound },
  seasonStats: {
    batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, sacrificeBunts: 0 },
    pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 },
  },
  careerStats: {
    batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, sacrificeBunts: 0 },
    pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 },
  },
});
