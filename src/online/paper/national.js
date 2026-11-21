// ============================================================
// 全国紙（リーグ全体を中立に書く「NEXT STAGE」。アプリ `FrontPageNational.kt` の写し）。
// ⚠ 文を変えるときはアプリと両方を直すこと（`kt.js` の先頭）。
// ============================================================
import { Pen, rate3, maxBy, sortByDesc, javaHash, cmpStr, list, obj, int, str, num } from './kt.js';
import { TONE } from './copy.js';
import { LEAGUE_NAMES, dateKey } from './paperView.js';
import {
  LINK_GAMES,
  article,
  positionNoun,
  staffNationalArticles,
  recentWorld,
  milestonesOn,
  milestoneBody,
  retiredBody,
  shortLine,
  winnerOf,
  loserOf,
  watchRow,
} from './local.js';
import { gb, gamesBehind } from './paper.js';
import { OFF_PHASES, paceLine } from './frontPage.js';
import { raceText, worldText, honorRows } from '../chronicleText.js';

function seasonEnd(view) {
  const tops = ['A', 'B']
    .map((l) => {
      const t = view.leagueTable(l).find((s) => s.gamesPlayed > 0);
      return t ? `${LEAGUE_NAMES[l]}は${view.teamShort(t.team)}` : null;
    })
    .filter((x) => x != null);
  return tops.length ? `今季、${tops.join('、')}が首位でシーズンを終えた。` : '';
}

/** 全国紙の紙面。題字の下（球団・順位・日付）は同じ日の地元紙（local）を写す */
export function buildNationalPage(view, raw, local) {
  const date = view.currentDate;
  const pen = new Pen((date ? dateKey(date) : 0) + 7);
  const latestDay = view.results.length ? Math.max(...view.results.map((r) => dateKey(r.date))) : null;
  const today = view.results.filter((r) => latestDay != null && dateKey(r.date) === latestDay && r.homeScore != null && r.awayScore != null);
  const owners = new Set(Object.keys(view.teamOwners));
  const top2 = new Map();
  new Set(Object.values(view.teamLeagues)).forEach((l) => {
    top2.set(
      l,
      new Set(
        view
          .leagueTable(l)
          .filter((s) => s.gamesPlayed > 0)
          .slice(0, 2)
          .map((s) => s.team),
      ),
    );
  });
  const clashOf = (g) => {
    const league = view.teamLeagues[g.home];
    const t = league != null ? top2.get(league) : null;
    return !!t && t.has(g.home) && t.has(g.away);
  };
  const wStreak = (t) => (t != null && view.teamStreaks[t]?.kind === 'W' ? view.teamStreaks[t].count : 0);
  const lStreak = (t) => (t != null && view.teamStreaks[t]?.kind === 'L' ? view.teamStreaks[t].count : 0);

  const stories = today.map((g) => {
    const w = winnerOf(g);
    const l = loserOf(g);
    const ws = wStreak(w);
    const ls = lStreak(l);
    const diff = Math.abs((g.homeScore ?? 0) - (g.awayScore ?? 0));
    const league = view.teamLeagues[g.home];
    let pts = 0;
    if (league != null && clashOf(g)) pts += 10;
    if (ws >= 3) pts += ws * 3;
    if (ls >= 5) pts += ls * 2;
    if (diff >= 7) pts += 5;
    if (w != null && Math.min(g.homeScore ?? 0, g.awayScore ?? 0) === 0) pts += 4;
    if (owners.has(g.home) || owners.has(g.away)) pts += 2;
    if (league === 'A') pts += 1;
    return { g, points: pts };
  });
  const offPhase = OFF_PHASES.has(view.phase?.kind);
  const story = offPhase ? null : maxBy(stories, (s) => s.points);
  const review = view.seasonReview && view.seasonReview.articles.length && story == null ? view.seasonReview : null;

  let headline;
  let kicker = null;
  let lead = null;
  let subhead = null;
  let score = null;
  let extra = false;
  let bigHead = null;
  if (story != null) {
    const g = story.g;
    const w = winnerOf(g);
    const l = loserOf(g);
    const league = (view.teamLeagues[g.home] != null ? LEAGUE_NAMES[view.teamLeagues[g.home]] : null) ?? '';
    score = { away: view.teamShort(g.away), awayScore: g.awayScore ?? 0, home: view.teamShort(g.home), homeScore: g.homeScore ?? 0 };
    if (w == null || l == null) {
      headline = pen.pick([`${view.teamShort(g.home)}と${view.teamShort(g.away)}、譲らず`, `${view.teamShort(g.home)}・${view.teamShort(g.away)} 痛み分け`], 1);
      lead = `${league}の${view.teamShort(g.home)}と${view.teamShort(g.away)}は${g.homeScore}-${g.awayScore}で引き分けた。`;
    } else {
      const W = view.teamShort(w);
      const L = view.teamShort(l);
      const ws = wStreak(w);
      const ls = lStreak(l);
      const wScore = Math.max(g.homeScore ?? 0, g.awayScore ?? 0);
      const lScore = Math.min(g.homeScore ?? 0, g.awayScore ?? 0);
      const clash = clashOf(g);
      let pool;
      if (clash) pool = [`首位攻防 ${W}が${L}を下す`, `${W}、首位攻防を制す`, `上位対決は${W}に軍配`];
      else if (ws >= 5) pool = [`${W}破竹の${ws}連勝`, `${W}止まらない${ws}連勝`, `${ws}連勝 ${W}の勢い本物`];
      else if (ls >= 5) pool = [`${L}泥沼の${ls}連敗`, `${L}${ls}連敗 ${W}に屈す`];
      else if (wScore - lScore >= 7) pool = [`${W}打線爆発 ${L}から${wScore}点`, `${W}、${wScore}得点で${L}に大勝`];
      else if (lScore === 0) pool = [`${W}、${L}を零封`, `${W}投手陣 ${L}を完封`];
      else if (ws >= 3) pool = [`${W}${ws}連勝`, `${W}、${L}を下して${ws}連勝`];
      else pool = [`${W}、${L}を下す`, `${W}が${L}に勝利`, `${W}白星 ${L}を退ける`];
      headline = pen.pick(pool, 2);
      extra = ws >= 10;
      if (clash) bigHead = '首位攻防';
      else if (ws >= 5) bigHead = `${ws}連勝`;
      else if (ls >= 5) bigHead = `${ls}連敗`;
      else if (wScore - lScore >= 7) bigHead = '大勝';
      else if (lScore === 0) bigHead = '零封';
      else if (ws >= 3) bigHead = `${ws}連勝`;
      else if (wScore - lScore === 1) bigHead = '接戦制す';
      else bigHead = '快勝';
      kicker = [league || null, ws >= 2 ? `${ws}連勝` : null].filter((x) => x != null).join('・') || null;
      const winPlace = w === g.home ? '本拠地' : '敵地';
      const table = view.teamLeagues[w] != null ? view.leagueTable(view.teamLeagues[w]) : [];
      const rank = table.findIndex((s) => s.team === w);
      const row = table[rank];
      const rec = row ? `${W}はこれで${row.wins}勝${row.losses}敗${row.draws > 0 ? `${row.draws}分` : ''}、${league}${rank + 1}位。` : '';
      const date0 = g.date ? `${g.date.month}月${g.date.day}日、` : '';
      lead = `${date0}${league}の${W}は${winPlace}で${L}と対戦し、${wScore}-${lScore}で勝った。${rec}`;
      const wp = g.decisions?.winningPitcher?.name;
      const sp = g.decisions?.savePitcher?.name;
      subhead = wp != null ? `勝ち投手は${wp}` + (sp != null ? `、${sp}がセーブ` : '') : null;
    }
  } else {
    let h;
    let l;
    switch (view.phase?.kind) {
      case 'pack_select':
        [h, l] = ['新リーグ開幕へ 各球団が顔ぶれ選び', '参加する球団が、最初の24人を選んでいる。'];
        break;
      case 'camp':
        [h, l] = [pen.pick(['球春到来 12球団がキャンプイン', '各球団、開幕へ汗'], 1), 'どの球団が伸びるか。キャンプの過ごし方が開幕後を左右する。'];
        break;
      case 'contract':
        [h, l] = ['ストーブリーグ開幕 各球団が来季へ', '契約更改の季節。残す選手と手放す選手の見極めが始まった。' + seasonEnd(view)];
        break;
      case 'tryout':
        [h, l] = ['トライアウト 新天地を求めて', '各球団の補強の取り合いが始まる。' + seasonEnd(view)];
        break;
      case 'offseason':
        [h, l] = ['新たな1年へ 昇格・降格の明暗', '年度が替わり、新しい所属でのシーズンが始まる。'];
        break;
      default:
        [h, l] = [pen.pick(['開幕迫る 12球団の戦力は', 'まもなく開幕 頂点はどこだ'], 1), '開幕を前に、各球団の準備は最終段階に入った。'];
    }
    headline = h;
    lead = l;
    if (review != null) {
      headline = `今季総括号 ${review.headline}`;
      lead = review.lead;
      kicker = '今季総括号';
      bigHead = '総括';
    }
  }

  const articles = [];
  review?.articles.forEach((a) => articles.push(article(a.kicker ?? '', a.title ?? '', a.body ?? '', LINK_GAMES)));
  // 1部・2部の戦線
  for (const league of ['A', 'B']) {
    const table = view.leagueTable(league).filter((s) => s.gamesPlayed > 0);
    if (table.length < 2) continue;
    const name = LEAGUE_NAMES[league] ?? league;
    const top = table[0];
    const second = table[1];
    const last = table[table.length - 1];
    const T = view.teamShort(top.team);
    const S = view.teamShort(second.team);
    const g2 = gamesBehind(top, second);
    let body;
    if (offPhase) body = `${T}が${top.wins}勝${top.losses}敗で首位、` + (g2 === 0 ? `${S}と並んで` : `2位の${S}に${gb(g2)}差をつけて`) + 'シーズンを終えた。';
    else {
      body = `首位は${T}（${top.wins}勝${top.losses}敗）。`;
      body += g2 === 0 ? `${S}がゲーム差なしで並ぶ。` : `2位の${S}が${gb(g2)}差で追う。`;
      if (league === 'A') {
        if (!view.races.some((r) => r.kind === 'relegated' && r.team === last.team)) body += `最下位の${view.teamShort(last.team)}は2部降格の危機にある。`;
      } else body += '優勝すれば1部へ昇格する。';
    }
    const salt = 30 + javaHash(league);
    let title;
    if (offPhase) title = `${name}、${T}が首位で終える`;
    else if (g2 === 0) title = `${name}は${T}と${S}が首位並ぶ`;
    else if (g2 >= 5) title = pen.pick([`${name}、${T}が独走`, `${T}独走 ${name}首位を快走`], salt);
    else if (league === 'B') title = pen.pick([`昇格争い ${T}が先頭`, `1部昇格へ ${T}が一歩リード`], salt);
    else title = pen.pick([`${name}首位は${T}`, `${T}が${name}首位 ${S}追う`], salt);
    const races = view.races
      .filter((r) => r.league === league)
      .map((r) => raceText(r, view.teamShort))
      .filter(Boolean);
    const dr = view.races.find((r) => r.league === league && r.clinched && (r.kind === 'first' || r.kind === 'promotion'));
    const decided = dr ? raceText(dr, view.teamShort) : null;
    articles.push(article(`${name}戦線`, decided?.head ?? title, body + races.map((t) => `${t.head}。`).join(''), LINK_GAMES));
  }
  // 連勝・連敗（1面に出した球団以外）
  const headTeams = story ? new Set([story.g.home, story.g.away]) : new Set();
  const entries = Object.entries(view.teamStreaks);
  const hot = sortByDesc(
    entries.filter(([t, s]) => s.kind === 'W' && s.count >= 3 && !headTeams.has(t)),
    (e) => e[1].count,
  );
  const cold = sortByDesc(
    entries.filter(([t, s]) => s.kind === 'L' && s.count >= 3 && !headTeams.has(t)),
    (e) => e[1].count,
  );
  if ((hot.length || cold.length) && !offPhase) {
    const a = hot
      .slice(0, 3)
      .map(([t, s]) => `${view.teamShort(t)}が${s.count}連勝`)
      .join('、');
    const b = cold
      .slice(0, 3)
      .map(([t, s]) => `${view.teamShort(t)}は${s.count}連敗`)
      .join('、');
    const body = (a ? `${a}。` : '') + (b ? `${b}。` : '');
    const title = hot.length ? `${view.teamShort(hot[0][0])}${hot[0][1].count}連勝 勢いに乗る` : `${view.teamShort(cold[0][0])}、${cold[0][1].count}連敗で苦境`;
    articles.push(article('連勝・連敗', title, body, LINK_GAMES));
  }
  // オーナーたちの戦い
  const humans = Object.keys(view.teamOwners).filter((t) => t in view.teamLeagues);
  if (humans.length >= 2) {
    const lines = humans.map((t) => {
      const league = view.teamLeagues[t];
      const table = view.leagueTable(league);
      const rank = table.findIndex((s) => s.team === t);
      const o = view.teamOwners[t];
      const who = o != null && o.trim() !== '' ? `${o}オーナーの` : '';
      const row = table[rank];
      return `${who}${view.teamShort(t)}は${LEAGUE_NAMES[league]}${rank + 1}位` + (row && row.gamesPlayed > 0 ? `（${row.wins}勝${row.losses}敗）` : '');
    });
    const voices = view.members
      .filter((m) => m.comment != null && String(m.comment).trim() !== '' && humans.includes(m.teamName))
      .map((m, i) => [m, i])
      .sort((x, y) => cmpStr(y[0].commentAt ?? '', x[0].commentAt ?? '') || x[1] - y[1])
      .slice(0, 2)
      .map(([m]) => {
        const o = view.teamOwners[m.teamName];
        const who = o != null && o.trim() !== '' ? o : view.teamShort(m.teamName ?? '');
        return `${who}オーナーは「${m.comment}」と語る。`;
      })
      .join('');
    articles.push(article('オーナーたちの戦い', `${humans.length}人のオーナー、それぞれの現在地`, lines.join('、') + '。' + voices, LINK_GAMES));
  }
  // 記録（最新の試合の日に届いた節目。リーグ全体）
  if (!offPhase) {
    const day = view.results.length ? view.results[view.results.length - 1].date : null;
    const hits = milestonesOn(view, day);
    const m = hits[0];
    if (m)
      articles.push(
        article(
          '記録',
          hits.length === 1 ? `${view.teamShort(m.team)}・${m.name}、${m.label}` : `${m.name}が${m.label} 節目の記録が${hits.length}つ`,
          milestoneBody(hits, view.teamShort),
          LINK_GAMES,
        ),
      );
  }
  // 指導者
  articles.push(...staffNationalArticles(view, offPhase, new Set(today.map(winnerOf).filter((x) => x != null))));
  // 年間表彰
  const h = view.chronicle.honors;
  if (h && h.year === view.year && h.leagues.length) {
    const top = h.leagues[0].mvp;
    const rows = honorRows(h, view.teamShort).filter((r) => !r.head.endsWith('ベストナイン'));
    articles.push(
      article(
        '年間表彰',
        top ? `${h.leagues[0].league}MVPは${view.teamShort(top.team)}・${top.name}` : '今季の表彰が決まる',
        rows.map((r) => `${r.head}は${r.body}。`).join(''),
        LINK_GAMES,
      ),
    );
  }
  // プロの便り
  const news = view.chronicle.proNews;
  if (news.length) {
    const top = news[0];
    const head =
      top.highlight == null
        ? `元${view.teamShort(top.team)}・${top.name}、プロでの今季`
        : top.highlight === 'ended'
          ? `元${view.teamShort(top.team)}・${top.name}、プロの舞台を去る`
          : `元${view.teamShort(top.team)}・${top.name}、${top.highlight}`;
    const after = (t) => {
      const i = t.indexOf(': ');
      return i < 0 ? t : t.slice(i + 2);
    };
    articles.push(article('プロの便り', head, news.map((x) => `${x.name}（元${view.teamShort(x.team)}）は${after(x.text)}。`).join(''), LINK_GAMES));
  }
  // 引退
  if (offPhase && view.chronicle.retired.length) {
    const gone = view.chronicle.retired;
    articles.push(article('引退', `${view.teamShort(gone[0].team)}・${gone[0].name}がユニフォームを脱ぐ`, retiredBody(gone, view.teamShort), LINK_GAMES));
  }
  // 球界の外から
  recentWorld(view).forEach((w) => {
    const t = worldText(w, view.teamShort);
    if (t) articles.push(article(w.kind === 'koshien' ? '甲子園' : '日本一決定戦', t.head, t.body, LINK_GAMES));
  });
  // タイトル戦線
  const boards = list(raw?.leaders).map(obj).filter(Boolean);
  const leadersLine = [
    ['avg', '打率'],
    ['homeruns', '本塁打'],
    ['wins', '勝利'],
  ]
    .map(([id, label]) => {
      const b = boards.find((x) => str(x.id) === id);
      const row = b ? obj(list(b.rows)[0]) : null;
      const v = row ? num(row.value) : null;
      if (v == null) return null;
      const value = id === 'avg' ? rate3(v) : `${Math.trunc(v)}${id === 'homeruns' ? '本' : '勝'}`;
      return `${label}は${str(row.name)}（${view.teamShort(str(row.team) ?? '')}）が${value}`;
    })
    .filter((x) => x != null);
  if (leadersLine.length) {
    const hrBoard = boards.find((x) => str(x.id) === 'homeruns') ?? null;
    const first = hrBoard ? obj(list(hrBoard.rows)[0]) : null;
    let pace = '';
    if (first) {
      const p = paceLine(hrBoard, first);
      pace = p === '' ? '' : `本塁打の${str(first.name)}は${p}`;
    }
    articles.push(
      article(
        'タイトル戦線',
        first ? `本塁打王争い ${str(first.name)}が先頭` : 'タイトル争い、序盤の主役は',
        leadersLine.join('、') + 'でトップに立つ。' + pace,
        LINK_GAMES,
      ),
    );
  }
  // プロ注目。ドラフトの気配（`proWatch`）があれば本物（リーグ全体で NPB が見ている選手）、
  // 無ければ飾り（能力ランキングから若い選手を）
  const watch = Array.isArray(raw?.proWatch) ? raw.proWatch.map(watchRow).filter(Boolean) : null;
  if (watch != null) {
    if (watch.length) {
      const w = pen.pick(watch, 40);
      const team = view.teamShort(w.team);
      const hot = watch.filter((x) => x.hot).length;
      articles.push(
        article(
          'ドラフト戦線',
          w.hot
            ? pen.pick([`${w.npb}、${team}の${w.name}に接触`, `${w.name}（${team}）に${w.npb}が接触`], 43)
            : pen.pick([`${w.npb}が${team}の${w.name}に熱視線！`, `${w.npb}、${w.name}（${team}）を視察`], 44),
          `${team}の${w.name}に、${w.npb}のスカウトが${w.hot ? '接触した。指名の候補に挙げているという。' : '足を運んだ。'}` +
            (watch.length >= 2 ? `このリーグでプロが追う選手は${watch.length}人${hot > 0 ? `、うち接触は${hot}人` : ''}。` : ''),
          LINK_GAMES,
        ),
      );
    }
  }
  const ability = list(raw?.abilityLeaders).map(obj).filter(Boolean);
  const scout = [
    ['velocity', '最速'],
    ['power', 'パワー'],
    ['speed', '走力'],
    ['meet', 'ミート'],
  ]
    .map(([id, label]) => {
      const b = ability.find((x) => str(x.id) === id);
      if (!b) return null;
      const row = list(b.rows)
        .map(obj)
        .filter(Boolean)
        .find((r) => (int(r.age) ?? 99) <= 25);
      return row ? [label, row, id] : null;
    })
    .filter(Boolean);
  if (watch == null && scout.length) {
    const [label, row, id] = pen.pick(scout, 40);
    const name = str(row.name) ?? '';
    const team = view.teamShort(str(row.team) ?? '');
    const value = int(row.value) ?? 0;
    const trait = id === 'velocity' ? `最速${value}km` : `${label}${value}`;
    const scouts = 2 + pen.pick([0, 1, 2, 3], 41);
    articles.push(
      article(
        'プロ注目',
        pen.pick([`${team}の${name}にNPBが熱視線`, `${trait}の${name}、スカウト${scouts}球団が視察`, `未来のプロ野球選手？ ${team}・${name}`], 42),
        `${int(row.age)}歳の${positionNoun(str(row.position))}・${name}（${team}）。リーグ屈指の${trait}に、NPB${scouts}球団のスカウトが足を運んだ。`,
        LINK_GAMES,
      ),
    );
  }
  const others = story ? today.filter((g) => g !== story.g) : [];
  return {
    ...local,
    paper: 'National',
    title: 'NEXT STAGE',
    badge: 'スポーツ',
    headline,
    kicker,
    subhead,
    lead,
    tone: story != null ? TONE.Win : TONE.None,
    score,
    lineScore: null,
    box: [],
    extra,
    articles,
    shorts: others.map((g) => shortLine(view, g, true)),
    bigHead,
    bigSub: bigHead != null ? headline : null,
    leadHead: null,
    caption: story ? `▲${view.teamShort(story.g.home)}の球場の得点板` : null,
    hero: null,
    index:
      review != null
        ? review.articles.slice(0, 3).map((a) => a.title)
        : [
            articles.find((a) => a.kicker === '1部戦線')?.title ?? null,
            articles.find((a) => a.kicker === '2部戦線')?.title ?? null,
            articles.some((a) => a.kicker === 'タイトル戦線') ? 'タイトル戦線' : null,
          ].filter((x) => x != null),
    results: others.map((g) => ({ away: view.teamShort(g.away), awayScore: g.awayScore ?? 0, home: view.teamShort(g.home), homeScore: g.homeScore ?? 0 })),
    frontArticles: null,
    teamPage: null,
    recordPage: null,
  };
}
