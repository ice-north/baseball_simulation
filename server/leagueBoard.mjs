// ============================================================
// ホームに出すリーグ全体の眺めのうち、サーバーで作る分。
//   1. 今後の日程に重ねる先発予定（`withStarters`）
//   2. 各項目のベスト5（`leagueLeaders`）
//
// ⚠ 順位表の2部制分けは `projection.teamLeagues` ＋ 画面側の `Standings` が持つ。
//    ここで作り直さないこと（同じものが2つになる）。
//
// ⚠ **投影（表示用）であって、保存データではない**。ここで作った値を
//    判定や保存に使わないこと。内部名（`name`）での照合は呼ぶ側が行う。
// ⚠ 12球団×24人＝288人を毎回なめる。1回の投影で**1度だけ**呼ぶこと
//    （参加者ごとに呼ぶと人数ぶん重くなる）。
// ============================================================
import { observedSeason, completeCoverage, recordedStats } from './recordedStats.mjs';

/**
 * 試合ごとの先発予定（`{ home: { player, mark }, away: { player, mark } }` の並び）。
 * `withStarters` と、確定した先発の控え（`starterPicks.lockStarters`）が使う。
 */
export function starterSequence(games, teams, picks = null) {
  // 球団ごとの「次に投げるローテの位置」。⚠ 予告先発で指名した投手が投げると、ローテは
  //    その投手の次から回る（`dailyLineup.prepareDailyLineup`）ので、指名の後ろも同じく数える
  const cursor = {};
  // 予告先発（`picks`）: `{ ownTeam, picksOf(team), lockedOf(game), lockOf(team, game) }`。
  //   - 自球団の指名は確定前から出す（印は 'pick'、確定したら 'fixed'）
  //   - ほかの球団の指名は**確定してから**出す（印は 'fixed'）。確定前の指名を混ぜて数えると、
  //     その後ろの先発予定から指名が読めてしまう
  //   - 確定したときに控えた先発（`lockOf`）があれば、それを出す（印は 'fixed'）。試合の日も
  //     その投手が投げる。名簿に居ない・登録を外れたときは、試合の日と同じくローテの順に戻す
  //     （指名も見ない）。ローテに居ない投手が投げたときは、ローテは進まない
  const starterOf = (name, game) => {
    const rotation = teams[name]?.pitchingRotation;
    const list = rotation?.starters || [];
    if (!list.length) return { player: null, mark: null };
    if (!(name in cursor)) cursor[name] = rotation.currentStarterIndex || 0;
    const lock = picks?.lockOf?.(name, game);
    if (lock) {
      const held = teams[name].players.find((p) => p.id === lock.id);
      if (held && held.isActive !== false && (held.position === 'pitcher' || list.includes(held.id))) {
        if (list.includes(held.id)) cursor[name] = list.indexOf(held.id) + 1;
        return { player: held, mark: 'fixed' };
      }
      const id = list[cursor[name] % list.length];
      cursor[name] += 1;
      return { player: teams[name].players.find((p) => p.id === id) || null, mark: null };
    }
    const locked = !!picks?.lockedOf?.(game);
    const pick = picks?.picksOf?.(name)?.[game.id];
    const visible = pick != null && (name === picks?.ownTeam || locked) && list.includes(pick);
    const id = visible ? pick : list[cursor[name] % list.length];
    cursor[name] = (visible ? list.indexOf(pick) : cursor[name]) + 1;
    return {
      player: teams[name].players.find((p) => p.id === id) || null,
      mark: visible ? (locked ? 'fixed' : 'pick') : null,
    };
  };
  return games.map((g) => ({ home: starterOf(g.home, g), away: starterOf(g.away, g) }));
}

/**
 * これから行う試合に**先発予定を重ねる**。
 *
 * ⚠ 並べ方（日付順・自球団を必ず含める）は `projection.upcomingGames` が正本。
 *    ここでは順番を変えず、先発だけ足す。並べ直すと出どころが2つになる。
 * ⚠ **予定であって確定ではない**。実際の先発は当日の疲労で入れ替わる
 *    （`prepareDailyLineup` が疲れた投手を外す）。画面にもそう書くこと。
 * ⚠ 同じ球団が続けて出るときは**ローテを回すこと**。毎回同じだと
 *    1人が全試合に先発する予定になる。
 */
export function withStarters(games, teams, statsOf = null, picks = null) {
  const sequence = starterSequence(games, teams, picks);
  // ⚠ 投げる手と今季成績は `statsOf` を渡したときだけ付ける。渡さない呼び出し
  //    （試合結果の画面が使う `upcoming`）は名前だけのままにする——あちらは
  //    一覧に出すだけで、投影を重くする意味がない。
  const profile = (teamName, player) => {
    if (!player) return null;
    const pitching = statsOf(teamName, player)?.pitching;
    const outs = pitching?.inningsPitched || 0;
    return {
      id: player.id,
      name: player.name,
      // 年齢と調子（新しい見た目の試作で、今日の一戦の札に顔を描く。顔はほかの画面と同じ作り）
      age: Number.isFinite(player.age) ? player.age : null,
      condition: Number.isInteger(player.condition) ? player.condition : null,
      // ⚠ 投げる手は `physical.throws`（選手直下ではない）。選手直下を見ると
      //    全員 undefined になり、**全員が右投げ**として出る。
      // ⚠ 既定は右。未設定の選手を「左」に倒すと、左投手が実際より多く見える
      throws: player.physical?.throws === 'left' ? 'left' : 'right',
      wins: pitching?.wins || 0,
      losses: pitching?.losses || 0,
      // ⚠ `inningsPitched` はアウト数。投げていなければ null（0.00 と出さない）
      era: outs > 0 ? ((pitching.earnedRuns || 0) * 27) / outs : null,
    };
  };
  return games.map((g, i) => {
    const { home, away } = sequence[i];
    return {
      ...g,
      homeStarter: home.player?.name || null,
      awayStarter: away.player?.name || null,
      // 予告先発の印（'pick'＝自球団の指名・確定前、'fixed'＝確定）。無ければ載せない
      ...(home.mark ? { homeStarterMark: home.mark } : null),
      ...(away.mark ? { awayStarterMark: away.mark } : null),
      ...(picks?.lockedOf ? { starterLocked: !!picks.lockedOf(g) } : null),
      ...(statsOf
        ? {
            homeStarterInfo: profile(g.home, home.player),
            awayStarterInfo: profile(g.away, away.player),
          }
        : null),
    };
  });
}

// ⚠ 率の項目は**規定に届いた選手だけ**で競う。届かない人を混ぜると、
//    3打数2安打の控えが打率1位になって順位表として意味を成さない。
const PLATE_PER_GAME = 3.1;
const INNINGS_PER_GAME = 1;

const LEADER_CATEGORIES = [
  {
    id: 'avg', label: '打率', side: 'batting', digits: 3, desc: true, qualified: true,
    of: (s) => (s.atBats > 0 ? s.hits / s.atBats : null),
  },
  { id: 'homeruns', label: '本塁打', side: 'batting', desc: true, of: (s) => s.homeruns },
  { id: 'rbis', label: '打点', side: 'batting', desc: true, of: (s) => s.rbis },
  { id: 'stolenBases', label: '盗塁', side: 'batting', desc: true, of: (s) => s.stolenBases },
  {
    id: 'era', label: '防御率', side: 'pitching', digits: 2, desc: false, qualified: true,
    of: (s) => (s.inningsPitched > 0 ? (s.earnedRuns * 27) / s.inningsPitched : null),
  },
  { id: 'wins', label: '勝利', side: 'pitching', desc: true, of: (s) => s.wins },
  { id: 'strikeouts', label: '奪三振', side: 'pitching', desc: true, of: (s) => s.strikeouts },
  { id: 'saves', label: 'セーブ', side: 'pitching', desc: true, of: (s) => s.saves },
];

/**
 * 各項目の上位（既定は10人。PC・スマホの Web は上の5人を出し、アプリは10人を出す）。
 * 行には選手の id を添える（アプリが行から選手の詳細を開く。同じ名前の選手を取り違えないように）。
 * ⚠ 並びを決定的にすること（同値は名前で分ける）。実行のたびに順位が
 *    入れ替わると、見るたび違う人が1位になる。
 */
export function leagueLeaders(league, statsOf, labelOf = (n) => n, top = 10) {
  const names = league.season.settings.teamNames || [];
  const played = Object.fromEntries(
    (league.season.standings || []).map((s) => [s.team, s.gamesPlayed || 0]),
  );
  const entries = [];
  for (const team of names) {
    for (const player of league.game.teams[team]?.players || []) {
      entries.push({ team, player, stats: statsOf(team, player) });
    }
  }
  // ⚠ **今年プロに指名された選手も残す**（先方要望 2026-11-21「プロ指名された瞬間にチームから抜けるため、
  //    各成績のランキングからも消え、タイトルを獲っていないことになっている」）。指名は成績を確定した
  //    **後**（10月下旬）なのでタイトル（`frozenAwards`）には入っているが、この表はいまの名簿から作るので、
  //    年度更新までの間、首位打者が表から消えて2位の人が1位に見えていた。
  //    成績は試合の記録（`records.seasons[年].players`）から。記録が無い年（古いリーグ）は出せない
  const year = league.season.year;
  const recorded = league.records?.seasons?.[year]?.players || {};
  for (const row of league.chronicle?.proDrafted || []) {
    if (row.year !== year || !names.includes(row.team)) continue;
    const key = row.key || (row.player?.id != null ? `${row.team}:${row.player.id}:${row.name}` : null);
    const record = key ? recorded[key] : null;
    if (!record) continue;
    entries.push({
      team: row.team,
      player: { id: record.id ?? row.player?.id ?? null, name: row.name },
      stats: recordedStats(record),
      pro: row.npbTeam || true,
    });
  }
  return LEADER_CATEGORIES.map((category) => {
    const rows = entries
      .map((entry) => {
        const stats = entry.stats?.[category.side];
        if (!stats) return null;
        if (category.qualified) {
          const games = played[entry.team] || 0;
          const enough =
            category.side === 'batting'
              ? (Number.isFinite(stats.plateAppearances)
                  ? stats.plateAppearances
                  : (stats.atBats || 0) + (stats.walks || 0) +
                    (stats.hitByPitch || 0) + (stats.sacrificeBunts || 0) +
                    (stats.sacrificeFlies || 0)) >= games * PLATE_PER_GAME
              : (stats.inningsPitched || 0) / 3 >= games * INNINGS_PER_GAME;
          if (!enough) return null;
        }
        const value = category.of(stats);
        if (value === null || value === undefined || !Number.isFinite(value))
          return null;
        if (!category.qualified && value <= 0) return null;
        return {
          // ⚠ アプリは行を押すと選手の詳細を id で開く（名前で探すと、同じ球団の同名の別人に当たる）
          id: entry.player.id,
          name: entry.player.name,
          team: entry.team,
          label: labelOf(entry.team),
          value,
          // 今年プロに指名されて名簿を離れた選手（画面は名前に「プロへ」と添える）
          ...(entry.pro ? { pro: true } : {}),
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          (category.desc ? b.value - a.value : a.value - b.value) ||
          a.name.localeCompare(b.name, 'ja'),
      )
      .slice(0, top);
    return { id: category.id, label: category.label, digits: category.digits || 0, rows };
  });
}

/**
 * 球団ごとのチーム打率・チーム防御率。順位表に添える。
 *
 * 記録が完備していれば、当季のボックススコアを出場当時の球団ごとに足す。
 * 移籍した選手の個人成績には前の球団の分も含むため、今の名簿の合計では
 * トレードしただけで過去のチーム打率・防御率まで移ってしまう。
 * 未記録・部分記録のリーグは、欠けた試合を0にせず従来の名簿合計を使う。
 * ⚠ `inningsPitched` は**アウト数**（`leagueLeaders` の防御率と同じ式を使う）。
 *    イニング数だと思って9を掛けると3倍の防御率になる。
 * ⚠ 打席・投球回が0の球団は `null`。0除算を画面に出さない（開幕前は全球団）。
 * ⚠ 288人をなめるので、`leagueLeaders` と**同じ成績の引き当て**を渡すこと
 *    （投影で2回数え直さない）。
 */
export function teamSeasonStats(league, statsOf) {
  const names = league.season.settings.teamNames || [];
  const season = observedSeason(league);
  const games = season ? Object.values(season.games || {}) : [];
  const recorded = completeCoverage(league, season) && games.every((game) =>
    Array.isArray(game.teams?.[game.home]) && Array.isArray(game.teams?.[game.away]),
  );
  const totals = Object.fromEntries(
    names.map((name) => [name, { hits: 0, atBats: 0, earnedRuns: 0, outs: 0 }]),
  );
  const add = (total, stats) => {
    total.hits += stats?.batting?.hits || 0;
    total.atBats += stats?.batting?.atBats || 0;
    total.earnedRuns += stats?.pitching?.earnedRuns || 0;
    total.outs += stats?.pitching?.inningsPitched || 0;
  };
  if (recorded) {
    for (const game of games)
      for (const name of [game.home, game.away])
        if (Object.hasOwn(totals, name))
          for (const stats of game.teams[name]) add(totals[name], stats);
  } else {
    for (const name of names)
      for (const player of league.game.teams[name]?.players || [])
        add(totals[name], statsOf(name, player));
  }
  const out = {};
  for (const name of names) {
    const { hits, atBats, earnedRuns, outs } = totals[name];
    out[name] = {
      average: atBats > 0 ? hits / atBats : null,
      era: outs > 0 ? (earnedRuns * 27) / outs : null,
    };
  }
  return out;
}

// ⚠ 能力ランキングの項目表は**サーバーが持つ**。全球団をなめる必要があり、
//    画面には並べ替えの材料が無い（自球団の名簿しか持っていない）。
//    画面に同じ表を置くと、足したときに片方だけ直して食い違う。
const ABILITY_FIELDS = [
  { id: 'meet', label: 'ミート', side: 'batting', of: (p) => p.batting?.meet },
  { id: 'power', label: 'パワー', side: 'batting', of: (p) => p.batting?.power },
  { id: 'speed', label: '走力', side: 'batting', of: (p) => p.physical?.speed },
  { id: 'defense', label: '守備', side: 'batting', of: (p) => p.fielding?.defense },
  { id: 'arm', label: '肩', side: 'batting', of: (p) => p.physical?.arm },
  {
    id: 'velocity', label: '球速', side: 'pitching', velocity: true,
    of: (p) => p.pitching?.velocity,
  },
  { id: 'control', label: '制球', side: 'pitching', of: (p) => p.pitching?.control },
  {
    id: 'stamina', label: 'スタミナ', side: 'pitching', stamina: true,
    of: (p) => p.pitching?.stamina,
  },
  // ⚠ 先方指摘「基本的な能力しかランキングされていない。体幹、スピン、選球眼、捕手リードなども」。
  //    選手詳細に出している項目（`abilityRows`）のうち数字のものを足した。
  //    捕手リードは捕手だけ、体・精神の項目は投手と野手を合わせて競う（どちらにも効く）
  { id: 'eye', label: '選球眼', side: 'batting', of: (p) => p.batting?.eye },
  { id: 'steal', label: '盗塁技術', side: 'batting', of: (p) => p.batting?.steal },
  { id: 'bunt', label: 'バント', side: 'batting', of: (p) => p.batting?.bunt },
  {
    id: 'lead', label: '捕手リード', side: 'batting',
    only: (p) => p.position === 'catcher',
    of: (p) => p.catching?.lead,
  },
  { id: 'spin', label: '回転', side: 'pitching', of: (p) => p.pitching?.spinRate },
  {
    id: 'pitch', label: '変化球', side: 'pitching',
    // 持ち球（直球を除く）でいちばん良いもの（契約更改の表の「変」と同じ）
    of: (p) => {
      const levels = (p.pitching?.arsenal || [])
        .filter((a) => a.type !== 'straight' && typeof a.level === 'number')
        .map((a) => a.level);
      return levels.length ? Math.max(...levels) : undefined;
    },
  },
  { id: 'body', label: '体力', side: 'body', of: (p) => p.physical?.bodyStamina },
  { id: 'recovery', label: '回復', side: 'body', of: (p) => p.physical?.recovery },
  { id: 'muscle', label: '体幹', side: 'body', of: (p) => p.physical?.muscle },
  { id: 'mental', label: '精神力', side: 'body', of: (p) => p.personality?.mental },
];

/**
 * 能力ランキング（**リーグ全球団**の中での上位）。
 *
 * ⚠ 以前は自球団の中だけだった。12球団288人の中での位置が分からないと、
 *    自分の選手が強いのか弱いのか判断できない。
 * ⚠ 能力は元から公開の情報（他球団の名簿は「選手成績」から能力も見られる）。
 *    ここで新しく秘密を開けているわけではない。
 * ⚠ 並びを決定的にすること（同値は名前で分ける）。実行のたびに順位が
 *    入れ替わると、見るたび違う人が1位になる。
 * ⚠ 投手の項目は投手だけ、野手の項目は野手だけで競う。混ぜると
 *    「走力ランキングが投手で埋まる」ようなことが起きる。体・精神（`side: 'body'`）だけは全員で競う。
 * ⚠ **ベスト10まで出す**。5人だと、12球団288人の中で「上澄みのさらに上」しか
 *    見えず、自分の選手が入っているかどうかの判断に使えない。
 */
export function abilityLeaders(league, labelOf = (n) => n, top = 10) {
  const entries = [];
  for (const team of league.season.settings.teamNames || [])
    for (const player of league.game.teams[team]?.players || [])
      entries.push({ team, player });
  return ABILITY_FIELDS.map((field) => {
    const pool = entries.filter(({ player }) =>
      field.only
        ? field.only(player)
        : field.side === 'body'
          ? true
          : field.side === 'pitching'
            ? player.position === 'pitcher'
            : player.position !== 'pitcher',
    );
    const rows = pool
      .map(({ team, player }) => ({ team, player, value: field.of(player) }))
      .filter((row) => typeof row.value === 'number')
      .sort(
        (a, b) =>
          b.value - a.value || a.player.name.localeCompare(b.player.name, 'ja'),
      )
      .slice(0, top)
      .map(({ team, player, value }) => ({
        id: player.id,
        name: player.name,
        team,
        label: labelOf(team),
        position: player.position,
        age: player.age,
        value,
        // 選手情報の小窓に出すぶんだけ（全項目は載せない）
        batting: { meet: player.batting?.meet, power: player.batting?.power },
        physical: { speed: player.physical?.speed, arm: player.physical?.arm },
        fielding: { defense: player.fielding?.defense },
        pitching: {
          velocity: player.pitching?.velocity,
          control: player.pitching?.control,
          stamina: player.pitching?.stamina,
        },
      }));
    return {
      id: field.id,
      label: field.label,
      side: field.side,
      velocity: !!field.velocity,
      stamina: !!field.stamina,
      rows,
    };
  });
}

// 通算成績ランキングの項目。⚠ 率（打率・防御率）は合計から出し直す（年ごとの率を平均しない）
const CAREER_FIELDS = [
  { id: 'avg', label: '打率', side: 'batting', format: 'rate', qualified: 'pa',
    of: (b) => (b.atBats > 0 ? b.hits / b.atBats : null) },
  { id: 'homeruns', label: '本塁打', side: 'batting', of: (b) => b.homeruns },
  { id: 'rbis', label: '打点', side: 'batting', of: (b) => b.rbis },
  { id: 'hits', label: '安打', side: 'batting', of: (b) => b.hits },
  { id: 'stolenBases', label: '盗塁', side: 'batting', of: (b) => b.stolenBases },
  { id: 'games', label: '試合', side: 'batting', of: (b) => b.games },
  { id: 'era', label: '防御率', side: 'pitching', format: 'decimal', asc: true, qualified: 'outs',
    of: (q) => (q.inningsPitched > 0 ? (q.earnedRuns * 27) / q.inningsPitched : null) },
  { id: 'wins', label: '勝利', side: 'pitching', of: (q) => q.wins },
  { id: 'saves', label: 'セーブ', side: 'pitching', of: (q) => q.saves },
  { id: 'holds', label: 'ホールド', side: 'pitching', of: (q) => q.holds },
  { id: 'strikeouts', label: '奪三振', side: 'pitching', of: (q) => q.strikeouts },
  { id: 'pitchingGames', label: '登板', side: 'pitching', of: (q) => q.games },
];

/**
 * 記録の鍵ごとの通算（このリーグを始めてからの合計）。`team` は最後に記録が付いた球団、
 * `lastYear` はその年、`years` は記録のある年の数。
 */
function careerTotals(league) {
  const totals = new Map();
  for (const season of Object.values(league.records?.seasons || {}).sort((a, b) => a.year - b.year))
    for (const record of Object.values(season.players || {})) {
      const t = totals.get(record.key) || {
        key: record.key,
        name: record.name,
        team: null,
        lastYear: null,
        years: 0,
        batting: {},
        pitching: {},
      };
      t.name = record.name || t.name;
      if (record.teams?.length) t.team = record.teams[record.teams.length - 1];
      t.lastYear = season.year;
      t.years += 1;
      for (const side of ['batting', 'pitching'])
        for (const [k, v] of Object.entries(record.stats?.[side] || {}))
          if (typeof v === 'number') t[side][k] = (t[side][k] || 0) + v;
      totals.set(record.key, t);
    }
  return totals;
}

/** いま名簿に居る選手（鍵 → 球団と選手） */
function activeByKey(league) {
  const active = new Map();
  for (const team of league.season.settings.teamNames || [])
    for (const p of league.game.teams[team]?.players || [])
      if (p.onlinePlayerId) active.set(p.onlinePlayerId, { team, player: p });
  return active;
}

/** 通算ランキングに出す人数（先方要望 2026-11-16: 10位まで → 50位まで） */
export const CAREER_LEADERS_TOP = 50;

/**
 * その球団で最後に記録を残し、いまはどの名簿にも居ない選手（引退・解雇・退団）の通算。
 *
 * ⚠ 先方要望（2026-11-16）「引退・解雇後も成績が残るように」。球団ごとの通算成績の表は
 *    いまの名簿から作るので、居なくなった選手はそこから消えていた（記録は残っている）。
 *    よそへ移籍した選手は移籍先の表に出るので、ここには入れない。
 * ⚠ 率は合計から出し直す（年ごとの率を平均しない）。打席が無い投手・投げていない野手は片方だけ
 */
export function formerCareers(league, teamName, limit = 60) {
  const active = activeByKey(league);
  const outs = (q) => q.inningsPitched || 0;
  return [...careerTotals(league).values()]
    .filter((t) => t.team === teamName && !active.has(t.key))
    .filter((t) => (t.batting.games || 0) > 0 || (t.pitching.games || 0) > 0)
    .sort((a, b) => (b.lastYear || 0) - (a.lastYear || 0) || String(a.name).localeCompare(String(b.name), 'ja'))
    .slice(0, limit)
    .map((t) => {
      const b = t.batting,
        q = t.pitching;
      return {
        key: t.key,
        name: t.name,
        lastYear: t.lastYear,
        years: t.years,
        batting: (b.atBats || 0) + (b.walks || 0) > 0
          ? {
              games: b.games || 0,
              atBats: b.atBats || 0,
              hits: b.hits || 0,
              homeruns: b.homeruns || 0,
              rbis: b.rbis || 0,
              stolenBases: b.stolenBases || 0,
              avg: b.atBats > 0 ? b.hits / b.atBats : null,
            }
          : null,
        pitching: outs(q) > 0
          ? {
              games: q.games || 0,
              wins: q.wins || 0,
              losses: q.losses || 0,
              saves: q.saves || 0,
              holds: q.holds || 0,
              strikeouts: q.strikeouts || 0,
              innings: outs(q) / 3,
              era: (q.earnedRuns * 27) / outs(q),
            }
          : null,
      };
    });
}

/**
 * 通算成績ランキング（**リーグ全球団**の選手の、このリーグを始めてからの合計。上位50人）。
 *
 * ⚠ 先方指摘「各チームごとの通算成績しか見られない。全チームの選手をランキング化した通算成績も」。
 * ⚠ 合計は対人リーグの記録（`records.seasons[年].players`。選手の鍵は球団をまたいで同じ
 *    `onlinePlayerId`）を年をまたいで足す。選手の詳細の「対人通算」と同じ材料。
 *    退団・引退した選手も残す（通算の記録なので）。いま名簿に居る選手は `id` を付け、
 *    画面が名前から詳細を開ける。
 * ⚠ 率の項目は規定に届いた選手だけ: 打率は打席が「記録上いちばん多く出た選手の試合数×3.1」以上、
 *    防御率は投球回が同じ試合数以上（1試合1回）。少ない打席の高打率で埋まらないように。
 * ⚠ 並びは決定的に（同値は名前で分ける）。
 */
export function careerLeaders(league, top = CAREER_LEADERS_TOP) {
  const totals = careerTotals(league);
  const active = activeByKey(league);
  const list = [...totals.values()];
  const maxGames = Math.max(0, ...list.map((t) => t.batting.games || 0), ...list.map((t) => t.pitching.games || 0));
  const qualifies = {
    pa: (t) => {
      const b = t.batting;
      const pa = (b.atBats || 0) + (b.walks || 0) + (b.hitByPitch || 0) + (b.sacrificeBunts || 0) + (b.sacrificeFlies || 0);
      return pa >= maxGames * 3.1;
    },
    outs: (t) => (t.pitching.inningsPitched || 0) >= maxGames * 3,
  };
  return CAREER_FIELDS.map((field) => {
    const rows = list
      .filter((t) => !field.qualified || qualifies[field.qualified](t))
      .map((t) => ({ t, value: field.of(t[field.side]) }))
      .filter((r) => typeof r.value === 'number' && Number.isFinite(r.value) && (field.format || r.value > 0))
      .sort(
        (a, b) =>
          (field.asc ? a.value - b.value : b.value - a.value) ||
          String(a.t.name).localeCompare(String(b.t.name), 'ja'),
      )
      .slice(0, top)
      // ⚠ 行は**画面が使う項目だけ**（2026-11-16 監査）。上位50人×項目数で全体のビューの4割を
      //    占めていたので、どちらの画面も読まない表示名（`label`）と守備位置を外した。
      //    球団の短い名前は画面が球団名から作る（`teamShort`）
      .map(({ t, value }) => {
        const now = active.get(t.key);
        return {
          key: t.key,
          id: now ? now.player.id : null,
          name: now?.player.name || t.name,
          team: now?.team || t.team,
          active: !!now,
          value,
        };
      });
    return {
      id: field.id,
      label: field.label,
      side: field.side,
      format: field.format || 'count',
      qualified: field.qualified
        ? field.qualified === 'pa'
          ? `規定: ${Math.ceil(maxGames * 3.1)}打席以上`
          : `規定: ${maxGames}投球回以上`
        : null,
      rows,
    };
  });
}
