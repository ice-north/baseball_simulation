// ============================================================
// 今季総括号（A6）。終わった年のリーグ全体のまとめを、紙面の1号ぶんの記事にする。
//
// ⚠ 先方回答（2026-11-16）「余裕があれば」A6。1シーズン＝実時間1週間なので、週の終わり
//    （年度更新のあと〜開幕前＝日曜のキャンプ）に1号だけ出す。
// ⚠ **新しい記録は足さない**。材料は年度の記録（`league.history` の最後: 順位・表彰・プレーオフ・
//    昇降格）と年代記（節目・引退・プロ入り）と、記録（`league.records`）から数える通算だけ。
// ⚠ 文はサーバーが作り、PC（球団史・記録のいちばん上）とアプリ（全国紙）は同じ文を出す。
// ⚠ 乱数は引かない（同じ保存なら同じ号）。
// ============================================================
import { PYRAMID_LEAGUES, compareLeagueStanding } from '../src/online/pyramidLeague.js';
import { SEASON_START_MONTH } from '../src/online/shared.js';
import { CAREER_MILESTONES, SEASON_MILESTONES } from './chronicle.mjs';

const num = (v) => (Number.isFinite(v) ? v : 0);
/** 来季の注目に挙げる「あと少し」（節目の刻みの何割以内か） */
export const NEAR_SHARE = 0.15;
/** 来季の注目に挙げる人数 */
export const NEAR_MAX = 4;

/** 部ごとの順位表（昇降格と同じ並べ方） */
function tablesOf(entry) {
  const out = {};
  for (const l of PYRAMID_LEAGUES) {
    out[l.id] = (entry.standings || [])
      .filter((s) => entry.leagues?.[s.team] === l.id)
      .map((s) => ({ ...s, winRate: s.winRate ?? (s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0) }))
      .sort(compareLeagueStanding);
  }
  return out;
}

const record = (s) => `${s.wins}勝${s.losses}敗${s.draws ? `${s.draws}分` : ''}`;

/**
 * 通算の節目まで「あと少し」の現役（いま名簿にいる人）。少ない順。
 * `totals`: 記録の鍵 → 通算（終わった年まで）
 */
export function nearMilestones(totals, active, shortOf) {
  const out = [];
  for (const [key, who] of active) {
    const t = totals.get(key);
    if (!t) continue;
    for (const rule of CAREER_MILESTONES) {
      const v = num(t[rule.side]?.[rule.stat]);
      if (v <= 0) continue;
      const next = Math.max(rule.from, (Math.floor(v / rule.every) + 1) * rule.every);
      const left = next - v;
      if (left <= 0 || left > rule.every * NEAR_SHARE) continue;
      out.push({ key, name: who.name, team: who.team, label: `通算${next}${rule.label}`, left, unit: rule.label, share: left / rule.every });
    }
  }
  // 1人1つ（いちばん近いもの）
  out.sort((a, b) => a.share - b.share || a.left - b.left || a.name.localeCompare(b.name, 'ja'));
  const seen = new Set();
  return out
    .filter((x) => !seen.has(x.key) && seen.add(x.key))
    .slice(0, NEAR_MAX)
    .map((x) => ({ ...x, text: `${x.name}（${shortOf(x.team)}）は${x.label}まであと${x.left}` }));
}

/** 記録の鍵ごとの通算（終わった年まで。年の途中の今季は入れない） */
function careerTotals(league, beforeYear) {
  const out = new Map();
  for (const season of Object.values(league.records?.seasons || {})) {
    if (Number(season.year) >= beforeYear) continue;
    for (const [key, rec] of Object.entries(season.players || {})) {
      const t = out.get(key) || { batting: {}, pitching: {} };
      for (const side of ['batting', 'pitching'])
        for (const [k, v] of Object.entries(rec.stats?.[side] || {}))
          if (typeof v === 'number') t[side][k] = (t[side][k] || 0) + v;
      out.set(key, t);
    }
  }
  return out;
}

/**
 * 今季総括号。年度更新のあと〜開幕前だけ（それ以外は null）。
 * @param {(name: string) => string} shortOf 球団の短い名前
 * @returns {{ year: number, headline: string, lead: string, articles: { kicker: string, title: string, body: string }[] } | null}
 */
export function seasonReview(league, shortOf = (n) => n) {
  const year = league.season?.year;
  const last = league.history?.at?.(-1);
  if (!last || last.year !== year - 1) return null;
  if ((league.season.currentDate?.month || 0) >= SEASON_START_MONTH) return null;
  if (!last.leagues) return null;
  const tables = tablesOf(last);
  const articles = [];

  // 頂点（部の1位とプレーオフ）
  const tops = PYRAMID_LEAGUES.map((l) => ({ l, top: tables[l.id][0], second: tables[l.id][1] })).filter((x) => x.top);
  const crown = tops.map(({ l, top, second }) => {
    const gap = second ? ((top.wins - second.wins) + (second.losses - top.losses)) / 2 : null;
    const by = gap == null ? '' : gap === 0 ? `、2位${shortOf(second.team)}と同率で` : `、2位${shortOf(second.team)}に${gap}ゲーム差`;
    return `${l.name}は${shortOf(top.team)}が${record(top)}${by}で1位。`;
  });
  const po = last.playoffChampion
    ? last.playoffChampion === tops[0]?.top?.team
      ? `プレーオフも${shortOf(last.playoffChampion)}が制し、完全優勝を果たした。`
      : `プレーオフは${shortOf(last.playoffChampion)}が勝ち抜いた。`
    : '';
  if (crown.length)
    articles.push({
      kicker: '頂点',
      title: last.playoffChampion ? `${shortOf(last.playoffChampion)}、${last.year}年目の頂点に` : `${tops[0].l.name}は${shortOf(tops[0].top.team)}が1位`,
      body: crown.join('') + po,
    });

  // 昇格・降格
  const tierOf = (id) => PYRAMID_LEAGUES.find((l) => l.id === id)?.tier ?? 0;
  const up = (last.moves || []).filter((m) => tierOf(m.to) < tierOf(m.from));
  const down = (last.moves || []).filter((m) => tierOf(m.to) > tierOf(m.from));
  if (up.length || down.length) {
    const name = (id) => PYRAMID_LEAGUES.find((l) => l.id === id)?.name || id;
    articles.push({
      kicker: '昇格・降格',
      title: up[0] ? `${shortOf(up[0].teamId)}が${name(up[0].to)}へ` : `${shortOf(down[0].teamId)}、${name(down[0].to)}へ`,
      body:
        up.map((m) => `${shortOf(m.teamId)}が${name(m.to)}へ昇格。`).join('') +
        down.map((m) => `${shortOf(m.teamId)}は${name(m.to)}へ降格した。`).join('') +
        '来季は新しい顔ぶれで戦う。',
    });
  }

  // 年間表彰（部ごとの MVP・新人王と、タイトル）
  const honors = Object.entries(last.awards?.honors || {}).sort(([a], [b]) => a.localeCompare(b));
  const titles = [
    ['battingChampion', '首位打者'], ['homeRunKing', '本塁打王'], ['eraChampion', '最優秀防御率'], ['winsLeader', '最多勝'],
  ].filter(([k]) => last.awards?.[k]?.name);
  if (honors.length || titles.length) {
    const lname = (id) => PYRAMID_LEAGUES.find((l) => l.id === id)?.name || id;
    const firstMvp = honors.find(([, h]) => h.mvp)?.[1]?.mvp;
    articles.push({
      kicker: '年間表彰',
      title: firstMvp ? `MVPは${shortOf(firstMvp.team)}・${firstMvp.name}` : '今季の表彰',
      body:
        honors
          .map(([id, h]) =>
            [h.mvp && `${lname(id)}MVPは${h.mvp.name}（${shortOf(h.mvp.team)}）`, h.rookie && `新人王は${h.rookie.name}（${shortOf(h.rookie.team)}）`]
              .filter(Boolean)
              .join('、'),
          )
          .filter(Boolean)
          .map((s) => `${s}。`)
          .join('') +
        (titles.length
          ? titles.map(([k, label]) => `${label}は${last.awards[k].name}（${shortOf(last.awards[k].team)}）`).join('、') + '。'
          : ''),
    });
  }

  // 今季の記録（その年に届いた節目。大きい数字から）
  const c = league.chronicle || {};
  const hits = (c.milestones || []).filter((m) => m.year === last.year);
  if (hits.length) {
    // 重み: 通算は何段目か（100安打=1・200安打=2）、シーズンは何段目か（20本=1.5・30本=2.5）。珍しいものから
    const weight = (m) => {
      if (m.kind === 'career') {
        const rule = CAREER_MILESTONES.find((r) => r.side === m.side && r.stat === m.stat);
        return rule ? m.value / rule.every : 0;
      }
      const rule = SEASON_MILESTONES.find((r) => r.side === m.side && r.stat === m.stat);
      return rule ? rule.at.indexOf(m.value) + 1.5 : 0;
    };
    const best = [...hits].sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name, 'ja')).slice(0, 3);
    articles.push({
      kicker: '今季の記録',
      title: `${best[0].name}が${best[0].label}`,
      // ⚠ 数は書かない（節目は球団ごとに新しい20件しか残さないので、年の合計にならない）
      body: '今季の主な節目は、' + best.map((m) => `${shortOf(m.team)}の${m.name}が${m.label}`).join('、') + '。',
    });
  }

  // 去る人（引退とプロ入り）
  const retired = (c.retired || []).filter((r) => r.year === last.year).slice(0, 3);
  const pro = (c.proDrafted || []).filter((r) => r.year === last.year);
  if (retired.length || pro.length) {
    articles.push({
      kicker: '去る人',
      title: pro[0] ? `${shortOf(pro[0].team)}・${pro[0].name}、プロの世界へ` : `${shortOf(retired[0].team)}・${retired[0].name}が引退`,
      body:
        pro.map((r) => `${r.name}（${shortOf(r.team)}）は${r.npbTeam}から指名を受けた。`).join('') +
        (retired.length ? `${retired.map((r) => `${r.name}（${shortOf(r.team)}）`).join('、')}がユニフォームを脱いだ。` : ''),
    });
  }

  // 来季の注目（通算の節目まであと少しの現役）
  const active = new Map();
  for (const name of league.season.settings?.teamNames || [])
    for (const p of league.game?.teams?.[name]?.players || [])
      if (p.onlinePlayerId) active.set(p.onlinePlayerId, { name: p.name, team: name });
  const near = nearMilestones(careerTotals(league, year), active, shortOf);
  if (near.length)
    articles.push({
      kicker: '来季の注目',
      title: `${near[0].name}、${near[0].label}へあと${near[0].left}`,
      body: near.map((x) => x.text).join('。') + '。開幕から節目の記録に注目が集まる。',
    });

  const champs = tops.map(({ l, top }) => `${l.name}は${shortOf(top.team)}`).join('、');
  return {
    year: last.year,
    headline: `${last.year}年目を振り返る`,
    lead:
      (champs ? `${last.year}年目のシーズンは、${champs}が1位で終えた。` : '') +
      [up.length && `${up.map((m) => shortOf(m.teamId)).join('・')}が昇格`, down.length && `${down.map((m) => shortOf(m.teamId)).join('・')}が降格`]
        .filter(Boolean)
        .join('し、') +
      (up.length || down.length ? '。' : '') +
      'リーグの1年をまとめる。',
    articles,
  };
}
