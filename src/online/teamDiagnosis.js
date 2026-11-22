// ============================================================
// チーム診断「なぜ勝てない？」（自球団だけ）。
//
// ⚠ 先方回答（2026-11-16）「余裕があれば」A1。得点と失点を部の平均と比べ、
//    **自分で直せること（打順・起用・守備位置・休ませ方）だけ**を3つまで挙げる。
//    能力そのもの（「打てる選手がいない」）や運は挙げない。直す画面へ飛べるよう `page` を付ける。
// ⚠ 数字と文はサーバーが作り（`projectLeague` の `diagnosis`）、PC・スマホWeb・アプリは並べるだけ。
// ⚠ 新しい記録は足さない。今季の成績（`seasonStats`）・名簿・疲労・起用・試合結果から作る。
// ⚠ 乱数を引かない。強さにも効かない（見せるだけ）。
// ============================================================
import { plateAppearances } from '../season/seasonManager.js';
import { POS_FULL } from './api.js';
import { restFatigueOf } from './shared.js';

/** 診断を出し始める試合数（少ないうちは数字が揺れる） */
export const DIAGNOSIS_MIN_GAMES = 10;
/** 挙げる数 */
export const DIAGNOSIS_MAX_ITEMS = 3;
/** 打線: 部の平均出塁率よりこれ以上低い先発野手を挙げる */
const OBP_GAP = 0.04;
/** 打線: 数える打席の下限 */
const MIN_PA = 30;
/** 打線: 控えの候補に数える打席の下限（少ないと数字が揺れるので、打席数を添えて出す） */
const MIN_BENCH_PA = 20;
/** 先発投手: 部の防御率よりこれ以上悪い先発を挙げる */
const ERA_GAP = 1.2;
/** 先発投手: 数える投球回（アウト数。15回） */
const MIN_OUTS = 45;
/** 救援（抑え・セットアッパー）: 部の防御率よりこれ以上悪い */
const RELIEF_ERA_GAP = 1.5;
const MIN_RELIEF_OUTS = 24;
/** 先発に回す候補（ローテの外の投手）に数える投球回（アウト数。10回） */
const MIN_ALT_OUTS = 30;
/** 疲れ: 野手の疲労がこれ以上だと試合の打撃・守備が目に見えて落ちる（疲労²/1200 で約3） */
export const DIAGNOSIS_FATIGUE = 60;
// ⚠ 球団の休養の目安（自動采配の `restLine`。`restFatigueOf`、標準80・早め60・遅め100）以上で代わりの居る野手は、
//    試合の日にサーバーが自動で休ませる。「疲れたまま出ています」とは言えないので、その人は挙げない
/** 守備: 守らせている位置の適性がこれ未満 */
const FITNESS_LOW = 60;

const n = (v) => (Number.isFinite(v) ? v : 0);
const rate3 = (v) => v.toFixed(3).replace(/^0/, '');
const era2 = (er, outs) => (outs > 0 ? (er * 27) / outs : null);
// ⚠ 出塁率の分母には犠飛を入れる（成績の表 `recordStats.js` の rates と同じ式。数字を食い違わせない）
const obpOf = (b) => {
  const d = plateAppearances(b || {}) + n(b?.sacrificeFlies);
  return d > 0 ? (n(b.hits) + n(b.walks) + n(b.hitByPitch)) / d : null;
};
/** 起用できる選手か（今は使えない選手を「試す手があります」と勧めない） */
const usable = (p) => p?.isActive !== false;

/** 部の球団ごとの得点・失点（1試合あたり）と、試合数 */
function runTable(teamNames, results) {
  const t = Object.fromEntries(teamNames.map((name) => [name, { games: 0, runs: 0, allowed: 0 }]));
  for (const g of results || []) {
    const hs = g.result?.homeScore;
    const as = g.result?.awayScore;
    if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
    if (t[g.home]) Object.assign(t[g.home], { games: t[g.home].games + 1, runs: t[g.home].runs + hs, allowed: t[g.home].allowed + as });
    if (t[g.away]) Object.assign(t[g.away], { games: t[g.away].games + 1, runs: t[g.away].runs + as, allowed: t[g.away].allowed + hs });
  }
  return t;
}

/**
 * @param team 自球団（`players`・`lineupSettings`・`pitchingRotation`）
 * @param rivals 同じ部の球団（自球団を含む）`[{ name, players }]`
 * @param results 今季の試合結果（`season.results`）
 * @param leagueName 部の名前（「1部」）
 * @param statsOf 今季の成績の引き当て（`projectLeague` の `seasonStatsOf`。成績の表と同じ数字にする）
 * @returns {{ summary: string, items: { kind: string, text: string, page: string }[] } | null}
 */
export function diagnoseTeam({ team, teamName, rivals, results, leagueName = 'リーグ', statsOf = (_team, p) => p.seasonStats }) {
  if (!team?.players?.length || !rivals?.length) return null;
  const names = rivals.map((r) => r.name);
  const table = runTable(names, results);
  const own = table[teamName];
  if (!own || own.games < DIAGNOSIS_MIN_GAMES) return null;
  const per = (name, key) => (table[name].games ? table[name][key] / table[name].games : 0);
  const rankOf = (key, better) =>
    1 + names.filter((name) => name !== teamName && table[name].games && better(per(name, key), per(teamName, key))).length;
  const runRank = rankOf('runs', (a, b) => a > b);
  const allowRank = rankOf('allowed', (a, b) => a < b);
  const avg = (key) => {
    const list = names.filter((name) => table[name].games);
    return list.reduce((s, name) => s + per(name, key), 0) / (list.length || 1);
  };
  const summary =
    `得点は${leagueName}で${runRank}位（1試合${per(teamName, 'runs').toFixed(1)}点・平均${avg('runs').toFixed(1)}）、` +
    `失点は${allowRank}位（${per(teamName, 'allowed').toFixed(1)}点・平均${avg('allowed').toFixed(1)}）。`;

  // 部の平均（出塁率は打席のある人全員、防御率は投げた人全員）
  let pa = 0, on = 0, outs = 0, er = 0;
  for (const r of rivals)
    for (const p of r.players || []) {
      const st = statsOf(r.name, p);
      const b = st?.batting || {};
      const q = st?.pitching || {};
      pa += plateAppearances(b);
      on += n(b.hits) + n(b.walks) + n(b.hitByPitch);
      outs += n(q.inningsPitched);
      er += n(q.earnedRuns);
    }
  const lgObp = pa > 0 ? on / pa : 0.32;
  const lgEra = era2(er, outs) ?? 4;

  const byId = new Map(team.players.map((p) => [p.id, p]));
  const statsCache = new Map();
  const st = (p) => {
    if (!statsCache.has(p.id)) statsCache.set(p.id, statsOf(teamName, p) || {});
    return statsCache.get(p.id);
  };
  const bat = (p) => st(p).batting || {};
  const pit = (p) => st(p).pitching || {};
  const order = (team.lineupSettings?.battingOrder || []).filter((s) => s.position !== 'pitcher' && byId.has(s.playerId));
  const inLineup = new Set(order.map((s) => s.playerId));
  const rot = team.pitchingRotation || {};
  const starters = new Set(rot.starters || []);
  const items = [];

  // 1. 打線: 出塁できていない先発野手（控えにもっと出塁している人がいれば名前を出す）
  const weak = order
    .map((s) => ({ s, p: byId.get(s.playerId), b: bat(byId.get(s.playerId)) }))
    .filter((x) => plateAppearances(x.b) >= MIN_PA)
    .map((x) => ({ ...x, obp: obpOf(x.b) }))
    .filter((x) => x.obp != null && x.obp <= lgObp - OBP_GAP)
    .sort((a, b) => a.obp - b.obp)[0];
  if (weak) {
    const bench = team.players
      .filter((p) => usable(p) && p.position !== 'pitcher' && !inLineup.has(p.id) && plateAppearances(bat(p)) >= MIN_BENCH_PA)
      .map((p) => ({ p, obp: obpOf(bat(p)), pa: plateAppearances(bat(p)) }))
      .filter((x) => x.obp != null && x.obp >= weak.obp + 0.03)
      .sort((a, b) => b.obp - a.obp)[0];
    items.push({
      kind: 'batting',
      page: 'lineup',
      score: (lgObp - weak.obp) * 1000 + (runRank > names.length / 2 ? 20 : 0),
      text:
        `打線: ${weak.p.name}（${weak.s.battingOrder}番）の出塁率${rate3(weak.obp)}は${leagueName}の平均${rate3(lgObp)}を大きく下回っています。` +
        (bench
          ? `控えの${bench.p.name}（出塁率${rate3(bench.obp)}・${bench.pa}打席）を試すか、打順を下げる手があります。`
          : '打順を下げると、出塁する打者の打席が増えます。'),
    });
  }

  // 2. 先発投手: 打たれている先発（ローテの外にもっと抑えている投手がいれば名前を出す）
  const badStarter = team.players
    .filter((p) => starters.has(p.id) && n(pit(p).inningsPitched) >= MIN_OUTS)
    .map((p) => ({ p, era: era2(n(pit(p).earnedRuns), n(pit(p).inningsPitched)) }))
    .filter((x) => x.era >= lgEra + ERA_GAP)
    .sort((a, b) => b.era - a.era)[0];
  if (badStarter) {
    const alt = team.players
      .filter((p) => usable(p) && p.position === 'pitcher' && !starters.has(p.id) && n(pit(p).inningsPitched) >= MIN_ALT_OUTS)
      .map((p) => ({ p, era: era2(n(pit(p).earnedRuns), n(pit(p).inningsPitched)) }))
      .filter((x) => x.era < lgEra)
      .sort((a, b) => a.era - b.era)[0];
    items.push({
      kind: 'starter',
      page: 'rotation',
      score: (badStarter.era - lgEra) * 15 + (allowRank > names.length / 2 ? 20 : 0),
      text:
        `先発: ${badStarter.p.name}の防御率${badStarter.era.toFixed(2)}（${leagueName}の平均${lgEra.toFixed(2)}）。` +
        (alt ? `救援の${alt.p.name}（防御率${alt.era.toFixed(2)}）を先発に回す手があります。` : '登板の間隔や球数の目安を見直す手があります。'),
    });
  }

  // 3. 救援: 勝ちの場面を任せている投手（抑え・セットアッパー）が打たれている
  const late = [rot.closer, ...(rot.setupMen || [])].filter((id) => id != null);
  const badRelief = late
    .map((id) => byId.get(id))
    .filter((p) => p && n(pit(p).inningsPitched) >= MIN_RELIEF_OUTS)
    .map((p) => ({ p, era: era2(n(pit(p).earnedRuns), n(pit(p).inningsPitched)), closer: p.id === rot.closer }))
    .filter((x) => x.era >= lgEra + RELIEF_ERA_GAP)
    .sort((a, b) => b.era - a.era)[0];
  if (badRelief)
    items.push({
      kind: 'relief',
      page: 'rotation',
      score: (badRelief.era - lgEra) * 12,
      text: `救援: ${badRelief.closer ? '抑え' : 'セットアッパー'}の${badRelief.p.name}が防御率${badRelief.era.toFixed(2)}。終盤の逆転負けにつながります。役割を入れ替える手があります。`,
    });

  // 4. 疲れ: 疲れたまま出ている先発野手（試合の打撃・守備が落ちる）
  // ⚠ 休ませる目安は球団の自動采配から（監査 2026-11-21。80 に固定だと「早め」の球団で休む人を挙げていた）
  const restAt = restFatigueOf(team.onlineTactics);
  const tired = order
    .map((s) => byId.get(s.playerId))
    .filter((p) => n(p.fatigue) >= DIAGNOSIS_FATIGUE && n(p.fatigue) < restAt)
    .sort((a, b) => n(b.fatigue) - n(a.fatigue));
  if (tired.length)
    items.push({
      kind: 'fatigue',
      page: 'lineup',
      score: n(tired[0].fatigue) - 30,
      text: `疲れ: ${tired.slice(0, 3).map((p) => `${p.name}（疲労${Math.round(n(p.fatigue))}）`).join('、')}が疲れたまま出ています。休ませると打撃と守備が戻ります。`,
    });

  // 5. 守備: 適性の低い位置を守らせている
  const offPos = order
    .map((s) => ({ s, p: byId.get(s.playerId) }))
    .map((x) => ({ ...x, fit: x.p.positionFitness?.[x.s.position] }))
    .filter((x) => Number.isFinite(x.fit) && x.fit < FITNESS_LOW)
    .sort((a, b) => a.fit - b.fit)[0];
  if (offPos)
    items.push({
      kind: 'defense',
      page: 'lineup',
      score: (FITNESS_LOW - offPos.fit) + 15,
      text: `守備: ${offPos.p.name}は${POS_FULL[offPos.s.position] || offPos.s.position}の適性${offPos.fit}%。守れる選手に替えると失点が減ります。`,
    });

  // 6. 起用で直せる穴が無いのに部の下半分: 力の差。補強（トレード・トライアウト）を挙げる
  const lowerHalf = (rank) => rank > Math.ceil(names.length / 2);
  if (!items.length && (lowerHalf(runRank) || lowerHalf(allowRank))) {
    const bat = lowerHalf(runRank) && (!lowerHalf(allowRank) || runRank >= allowRank);
    items.push({
      kind: 'roster',
      page: 'transfer',
      score: 0,
      text: bat
        ? '補強: 起用で直せる穴は見当たらず、打線の力そのものが足りません。トレードやトライアウトで打てる野手を足す手があります。'
        : '補強: 起用で直せる穴は見当たらず、投手陣の力そのものが足りません。トレードやトライアウトで投手を足す手があります。',
    });
  }

  const picked = items
    .sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind))
    .slice(0, DIAGNOSIS_MAX_ITEMS)
    .map(({ kind, page, text }) => ({ kind, page, text }));
  return {
    games: own.games,
    summary,
    items: picked,
    // 何も無いときの一言
    note: picked.length ? null : '起用で直せそうな目立つ穴はありません。',
  };
}
