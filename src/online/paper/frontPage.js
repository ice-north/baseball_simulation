// ============================================================
// 地元紙の紙面（アプリ `FrontPage.kt` の buildFrontPage の写し）。
// ⚠ 文を変えるときはアプリと両方を直すこと（`kt.js` の先頭）。
// PC には「お知らせ」（自分の番の手続き）・コラム（TIPS）・アプリの版の記事は無い（ホームと上の帯が受け持つ）。
// ============================================================
import { Pen, roundKt, idiv, rate3, sortBy, sortByDesc, maxBy, joinNN, orNull, list, obj, int, str, num } from './kt.js';
import {
  TONE,
  GameFacts,
  situation,
  winHeadline,
  loseHeadline,
  drawHeadline,
  heroSubhead,
  gameLead,
  phaseCopy,
  standingsCopy,
  leaderTitle,
  benchTitle,
  nextGameTitle,
} from './copy.js';
import { LEAGUE_NAMES, STATUS_LABELS, SEASON_START_MONTH, FIELDER_REST_FATIGUE, dayKey, dateKey, sameDate, turnOfDate, formatTurn } from './paperView.js';
import {
  LINK_LINEUP,
  LINK_GAMES,
  article,
  localTitle,
  hotRecent,
  coldRecent,
  lineScoreOf,
  boxLines,
  warningArticle,
  commentArticle,
  commentSpeaker,
  scoutArticle,
  watchRow,
  staffLocalArticles,
  recentWorld,
  milestonesOn,
  milestoneBody,
  retiredBody,
  shortLine,
  outcomeFor,
} from './local.js';
import { paperDate, bigHeadOf, bigSubOf, leadHeadOf, photoCaption, heroOf, buildTeamPage, buildRecordPage, splitFront, gb, gamesBehind } from './paper.js';
import { raceText, worldText } from '../chronicleText.js';

/** 手続きの時期（試合が無く、1面は時期の話にする） */
export const OFF_PHASES = new Set(['pack_select', 'initial_tryout', 'camp', 'contract', 'tryout', 'offseason']);

/** Kotlin の Double の書き方（整数でも「12.0」） */
const ktDouble = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
const one = (v) => (v == null ? '-' : ktDouble(roundKt(v * 10) / 10));
function two(v) {
  if (v == null) return '-';
  const r = roundKt(v * 100);
  return `${idiv(r, 100)}.${String(Math.abs(r) % 100).padStart(2, '0')}`;
}

const LEADER_UNITS = { homeruns: '本', rbis: '打点', stolenBases: '個', wins: '勝', strikeouts: '個', saves: 'セーブ' };

/** 「このままなら年間○本のペース。」 */
export function paceLine(board, row) {
  const pace = int(row.pace);
  if (pace == null) return '';
  const v0 = num(row.value);
  if (v0 == null) return '';
  const v = Math.trunc(v0);
  if (pace <= v) return '';
  return `このままなら年間${pace}${LEADER_UNITS[str(board.id)] ?? ''}のペース。`;
}

/** タイトルの値を文の中で読める形に（.531 / 2.15 / 12本 / 8個） */
function leaderValue(board, row) {
  const v = num(row.value);
  if (v == null) return '-';
  switch (int(board.digits) ?? 0) {
    case 3:
      return rate3(v);
    case 2:
      return two(v);
    case 1:
      return one(v);
    default:
      return String(Math.trunc(v)) + (LEADER_UNITS[str(board.id)] ?? '');
  }
}

const record = (s) => `${s.wins}勝${s.losses}敗${s.draws > 0 ? `${s.draws}分` : ''}`;
const gameKey = (g) => (g.gameId != null ? `#${g.gameId}` : JSON.stringify([g.date, g.home, g.away, g.homeScore, g.awayScore]));

/**
 * 地元紙の紙面。
 * @param history 自球団の今季の試合（古い順。`loadOwnHistory` で読む）
 * @param historyComplete history が今季の自球団の試合を全部含むか（対戦成績を書いてよいか）
 * @param opponent 次の相手の名簿（`team` の窓口。paperView の player に直したもの）
 */
export function buildFrontPage(view, raw, lastGame = null, { history = null, historyComplete = false, opponent = null } = {}) {
  const team = view.teamName ?? '';
  const me = view.teamShort(team);
  const date = view.currentDate;
  const turn = turnOfDate(date, view.seasonTurns);
  const issue =
    orNull(joinNN([date ? `${date.month}月${date.day}日` : null, turn != null ? `第${turn}ターン` : null], ' ')) ?? formatTurn(date, view.seasonTurns);

  const league = view.teamLeagues[team];
  const table = view.leagueTable(league);
  const rankIndex = table.findIndex((s) => s.team === team);
  const mine = rankIndex >= 0 ? table[rankIndex] : null;
  const leagueName = (league != null ? LEAGUE_NAMES[league] : null) ?? '';
  const placeText =
    mine != null && mine.gamesPlayed > 0 ? `${leagueName}${rankIndex + 1}位` + (rankIndex === 0 ? '' : `（首位と${gb(gamesBehind(table[0], mine))}差）`) : null;

  const recent = view.results.filter((r) => r.home === team || r.away === team);
  const seen = new Set();
  const own = [...(history ?? []), ...recent]
    .filter((r) => r.homeScore != null && r.awayScore != null)
    .filter((r) => {
      const k = gameKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.date?.month ?? 0) - (b.date?.month ?? 0) || (a.date?.day ?? 0) - (b.date?.day ?? 0) || (a.gameId ?? 0) - (b.gameId ?? 0));
  const outcome = (r) => outcomeFor(r, team);
  const last = own.length ? own[own.length - 1] : null;
  const articles = [];
  const pen = new Pen(last?.gameId != null ? last.gameId | 0 : dayKey(view.year ?? 0, date?.month ?? 0, date?.day ?? 0));

  let headline;
  let kicker = null;
  let subhead = null;
  let lead = null;
  let tone = TONE.None;
  let score = null;
  let lineScore = null;
  let box = [];
  let extra = false;
  let facts = null;
  let sit = null;
  let detailGame = null;

  const offPhase = OFF_PHASES.has(view.phase?.kind);
  if (!offPhase && last != null && last.homeScore != null && last.awayScore != null) {
    const home = last.home === team;
    const ours = home ? last.homeScore : last.awayScore;
    const theirs = home ? last.awayScore : last.homeScore;
    const opp = view.teamShort(home ? last.away : last.home);
    const now = outcome(last);
    const rev = [...own].reverse();
    let streak = 0;
    while (streak < rev.length && outcome(rev[streak]) === now) streak++;
    let broken = 0;
    if (!(now === 0 || streak !== 1)) {
      while (1 + broken < rev.length && outcome(rev[1 + broken]) === -now) broken++;
    }
    tone = now > 0 ? TONE.Win : now < 0 ? TONE.Lose : TONE.Draw;
    const lid = lastGame ? int(lastGame.gameId) : null;
    const detail = lastGame && (lid == null || lid === last.gameId) ? lastGame : null;
    facts = GameFacts.from(detail, team);
    detailGame = detail;
    const s = situation(me, opp, home, ours, theirs, streak, broken, mine ? rankIndex + 1 : null, facts);
    sit = s;
    headline = tone === TONE.Win ? winHeadline(s, pen) : tone === TONE.Lose ? loseHeadline(s, pen) : drawHeadline(s, pen);
    kicker = orNull(joinNN([streak >= 2 && tone !== TONE.Draw ? `${streak}${tone === TONE.Win ? '連勝' : '連敗'}` : null, placeText], '・'));
    score = { away: view.teamShort(last.away), awayScore: last.awayScore, home: view.teamShort(last.home), homeScore: last.homeScore };
    const d = last.decisions;
    subhead = heroSubhead(s, tone, pen);
    if (subhead == null) {
      if (tone === TONE.Win)
        subhead = orNull(
          joinNN([d?.winningPitcher?.name != null ? `勝ち投手 ${d.winningPitcher.name}` : null, d?.savePitcher?.name != null ? `S ${d.savePitcher.name}` : null], '　'),
        );
      else if (tone === TONE.Lose) subhead = d?.losingPitcher?.name != null ? `負け投手 ${d.losingPitcher.name}` : null;
    }
    const rec = mine ? `これで${record(mine)}${placeText != null ? `、${placeText}` : ''}。` : null;
    lead = gameLead(s, last.date ? `${last.date.month}月${last.date.day}日` : null, tone, rec, pen);
    extra = tone === TONE.Win && ((facts?.theirHits === 0 && theirs === 0) || streak >= 10);
    lineScore = detail ? lineScoreOf(detail, view) : null;
    box = boxLines(view, detail, team, last.decisions);
  } else {
    const [h, l] = phaseCopy(view.phase?.kind ?? null, view.pendingPack != null, date != null && date.month < SEASON_START_MONTH, me, pen);
    headline = h;
    lead =
      (view.phase?.kind === 'contract' || view.phase?.kind === 'tryout') && mine != null && mine.gamesPlayed > 0
        ? joinNN([l, `今季は${record(mine)}、${leagueName}${rankIndex + 1}位で終えた。`], '')
        : l;
  }

  // 記録達成
  if (!offPhase) {
    const ours = milestonesOn(view, last?.date).filter((m) => m.team === team);
    const m = ours[0];
    if (m)
      articles.push(
        article('記録達成', pen.pick([`${m.name}、${m.label}`, `${m.name}が${m.label}に到達`, `祝 ${m.name} ${m.label}`], 16), milestoneBody(ours, null), LINK_GAMES),
      );
  }
  // 引退
  if (offPhase) {
    const gone = view.chronicle.retired.filter((r) => r.team === team);
    if (gone.length)
      articles.push(
        article(
          '現役引退',
          gone.length === 1 ? `${gone[0].name}、現役引退` : `${gone[0].name}ら${gone.length}人が現役引退`,
          retiredBody(gone, null) + '長い間、お疲れさまでした。',
          LINK_GAMES,
        ),
      );
  }
  // 次戦予告
  const g = view.nextGames.find((x) => x.home === team || x.away === team);
  if (g) {
    const home = g.home === team;
    const oppName = home ? g.away : g.home;
    const opp = view.teamShort(oppName);
    const ourStarter = home ? g.homeStarterInfo : g.awayStarterInfo;
    const theirStarter = home ? g.awayStarterInfo : g.homeStarterInfo;
    const pitchers =
      ourStarter?.name != null && theirStarter?.name != null
        ? `先発は${ourStarter.name}（${ourStarter.wins}勝${ourStarter.losses}敗${ourStarter.era != null ? ` 防御率${two(ourStarter.era)}` : ''}）、` +
          `${opp}は${theirStarter.name}（${theirStarter.wins}勝${theirStarter.losses}敗）の予想。`
        : '先発はまだ決まっていない。';
    const versus = own.filter((x) => x.home === oppName || x.away === oppName);
    let h2h;
    if (!historyComplete) h2h = '';
    else if (!versus.length) h2h = '今季初対戦。';
    else {
      const w = versus.filter((x) => outcome(x) > 0).length;
      const l = versus.filter((x) => outcome(x) < 0).length;
      h2h = `今季の${opp}戦は${w}勝${l}敗${versus.length - w - l > 0 ? `${versus.length - w - l}分` : ''}。`;
    }
    const oldBoy = view.roster.find((p) => p.isActive && list(p.careerHistory).slice(0, -1).some((c) => c?.type === 'independent' && c?.label === oppName));
    const homecoming = oldBoy
      ? pen.pick([`${oldBoy.name}にとっては古巣との対戦になる。`, `古巣${opp}を相手に、${oldBoy.name}の${oldBoy.isPitcher ? '快投' : '一打'}に期待がかかる。`], 13)
      : '';
    const theirs = table.find((x) => x.team === oppName) ?? null;
    let showdown = null;
    if (!offPhase && mine != null && theirs != null && mine.gamesPlayed > 0) {
      const gap = Math.abs(gamesBehind(mine, theirs));
      const oppRank = table.indexOf(theirs);
      let kind = null;
      if (gap > 1.5) kind = null;
      else if (Math.min(rankIndex, oppRank) === 0) kind = '首位攻防';
      else if (league === 'A' && Math.min(rankIndex, oppRank) >= table.length - 2) kind = '残留争い';
      if (kind) showdown = [kind, gap];
    }
    const nextTitle = showdown
      ? pen.pick([`天王山 ${opp}との${showdown[0]}`, `${showdown[0]}の直接対決 ${opp}戦`, `負けられない${opp}戦`], 17)
      : nextGameTitle(opp, home, pen);
    const showdownLine = showdown
      ? showdown[1] === 0
        ? `ゲーム差なしで並ぶ${opp}との${showdown[0]}。`
        : `ゲーム差${gb(showdown[1])}の${opp}との${showdown[0]}。`
      : '';
    articles.push(article('次戦予告', nextTitle, showdownLine + pitchers + h2h + homecoming, LINK_LINEUP));
    if (opponent) {
      const w = warningArticle(opp, opponent, theirStarter, pen);
      if (w) articles.push(w);
    }
  }

  // 順位の行方
  if (!offPhase && table.length >= 2 && table[0].gamesPlayed > 0 && mine != null && mine.gamesPlayed > 0) {
    const top = table[0];
    const second = table[1] ?? null;
    const gap = second ? gamesBehind(top, second) : null;
    const behind = gamesBehind(top, mine);
    const [title, body] = standingsCopy({
      me,
      rankIndex,
      size: table.length,
      top: view.teamShort(top.team),
      topRecord: `${top.wins}勝${top.losses}敗`,
      second: second ? view.teamShort(second.team) : null,
      gapToSecond: gap != null ? gb(gap) : null,
      gapToSecondValue: gap,
      behind: gb(behind),
      behindValue: rankIndex > 0 ? behind : null,
      leagueName,
      placeText,
      pen,
    });
    articles.push(article('順位の行方', title, body, LINK_GAMES));
  }
  // マジック
  {
    const ownRace = view.races.find((r) => r.team === team) ?? null;
    const chased = view.races.find((r) => r.rival === team && !r.clinched) ?? null;
    const race = ownRace ?? chased;
    const t = race ? raceText(race, view.teamShort) : null;
    if (race && t) {
      const title = ownRace != null ? t.head : `${view.teamShort(race.team)}にマジック${race.magic} ${me}が止めるか`;
      articles.push(article(race.clinched ? '決定' : 'マジック', title, t.body, LINK_GAMES));
    }
  }
  // 独立リーグ日本一決定戦に自球団が出たとき
  {
    const w = recentWorld(view).find((x) => x.kind === 'grand' && x.ours === team);
    const t = w ? worldText(w, view.teamShort, view.teamLabel) : null;
    if (w && t) articles.push(article('日本一決定戦', w.champion === team ? `${me}、独立リーグ日本一` : `${me}は${w.oursResult ?? '出場'}`, t.body, LINK_GAMES));
  }

  // タイトル戦線
  const boards = list(raw?.leaders).map(obj).filter(Boolean);
  const ownLeaders = sortBy(
    boards.flatMap((b) =>
      list(b.rows)
        .map(obj)
        .filter(Boolean)
        .slice(0, 5)
        .map((row, i) => [b, i + 1, row])
        .filter(([, , row]) => str(row.team) === team),
    ),
    (x) => x[1],
  );
  if (ownLeaders.length) {
    const [b, rank, row] = ownLeaders[0];
    const name = str(row.name) ?? '';
    const label = str(b.label) ?? '';
    const others = ownLeaders
      .slice(1, 3)
      .map(([bb, r, rr]) => (str(rr.name) === name ? `${name}は${str(bb.label)}でも${r}位` : `${str(rr.name)}が${str(bb.label)}で${r}位`))
      .join('、');
    articles.push(
      article(
        'タイトル戦線',
        leaderTitle(name, label, rank, pen),
        `${label}は${leaderValue(b, row)}でリーグ${rank}位につける。` + paceLine(b, row) + (others ? `ほかにも、${others}。` : ''),
        LINK_GAMES,
      ),
    );
  } else {
    const b = boards.find((x) => str(x.id) === 'avg');
    const row = b ? obj(list(b.rows)[0]) : null;
    if (b && row) {
      const name = str(row.name) ?? '';
      articles.push(
        article(
          'タイトル戦線',
          pen.pick([`首位打者争い、${name}が先頭`, `打率トップは${name}`, `${name}、首位打者を走る`], 6),
          `${view.teamShort(str(row.team) ?? '')}の${name}が打率${leaderValue(b, row)}でトップ。${me}の選手は上位5人に居ない。`,
          LINK_GAMES,
        ),
      );
    }
  }

  // ベンチの話題
  const hot = view.roster.filter((p) => p.isActive && p.condition === 4).map((p) => p.name);
  const labelled = view.roster
    .filter((p) => p.isActive)
    .map((p) => {
      const l = list(p.performance?.batting?.labels).find((x) => x?.tone === 'good');
      return l ? `${p.name}（${l.text}）` : null;
    })
    .filter((x) => x != null);
  const tired = view.roster.filter((p) => p.isActive && (p.fatigue ?? 0) >= FIELDER_REST_FATIGUE && !p.isPitcher).map((p) => p.name);
  const hotBats = sortByDesc(
    view.roster.filter((p) => !offPhase && p.isActive && !p.isPitcher && hotRecent(p.recent)),
    (p) => idiv(p.recent.hits * 1000, Math.max(1, p.recent.atBats)),
  );
  const coldBats = view.roster.filter((p) => !offPhase && p.isActive && !p.isPitcher && coldRecent(p.recent));
  const streaker = maxBy(
    view.roster.filter((p) => !offPhase && p.isActive && (p.recent?.hitStreak ?? 0) >= 5),
    (p) => p.recent.hitStreak,
  );
  const hb = hotBats[0] ?? null;
  const cb = coldBats[0] ?? null;
  const bench = [
    hot.length ? pen.pick([`絶好調は${hot.slice(0, 3).join('・')}。`, `${hot.slice(0, 3).join('・')}の調子がいい。`], 9) : null,
    labelled.length
      ? pen.pick([`${labelled.slice(0, 2).join('、')}と、持ち味が数字に表れている。`, `数字の上でも${labelled.slice(0, 2).join('、')}が光る。`], 10)
      : null,
    hb
      ? hb === streaker
        ? `${hb.name}はここ${hb.recent.games}試合で${hb.recent.atBats}打数${hb.recent.hits}安打、${hb.recent.hitStreak}試合連続安打中と当たっている。`
        : pen.pick(
            [`${hb.name}はここ${hb.recent.games}試合で${hb.recent.atBats}打数${hb.recent.hits}安打と当たっている。`, `最近の${hb.name}は${hb.recent.games}試合${hb.recent.hits}安打と好調だ。`],
            14,
          )
      : null,
    streaker && streaker !== hb ? `${streaker.name}は${streaker.recent.hitStreak}試合連続安打中。` : null,
    cb
      ? pen.pick(
          [`一方、${cb.name}はここ${cb.recent.games}試合で${cb.recent.atBats}打数${cb.recent.hits}安打と苦しんでいる。`, `${cb.name}は${cb.recent.games}試合${cb.recent.hits}安打と当たりが止まった。`],
          15,
        )
      : null,
    tired.length ? pen.pick([`${tired.slice(0, 3).join('・')}は疲れがたまっており、休養が必要か。`, `${tired.slice(0, 3).join('・')}には疲れの色が見える。`], 11) : null,
  ].filter((x) => x != null);
  if (bench.length) {
    let title;
    if (streaker != null && streaker.recent.hitStreak >= 8) title = `${streaker.name}、${streaker.recent.hitStreak}試合連続安打`;
    else if (!hot.length && hotBats.length) title = pen.pick([`${hotBats[0].name}が好調`, `${hotBats[0].name}、バットが止まらない`, `当たってる${hotBats[0].name}`], 7);
    else title = benchTitle(hot[0] ?? null, tired[0] ?? null, me, pen);
    articles.push(article('ベンチ裏', title, bench.join(''), LINK_LINEUP));
  }
  // 試合後のひと言
  if (sit) {
    const [speaker, temper] = commentSpeaker(view);
    const c = commentArticle(speaker, tone, sit, pen, temper);
    if (c) articles.push(c);
  }
  // プロ注目（ドラフトの気配 `proWatch` があれば本物、無ければ飾り）
  {
    const watch = Array.isArray(raw?.proWatch) ? raw.proWatch.map(watchRow).filter(Boolean) : null;
    const sc = scoutArticle(view.roster, me, view.year, date, pen, watch, team, offPhase ? null : facts, offPhase ? null : sit);
    if (sc) articles.push(sc);
  }
  // 同窓・地元の縁
  if (view.ties.length) {
    const ties = view.ties;
    const alumni = ties.find((t) => t.kicker === '同窓対決');
    const pick = (alumni && pen.pick([true, false], 61) ? alumni : null) ?? pen.pick(ties, 62);
    articles.push(article(pick.kicker, pick.title, pick.body, LINK_LINEUP));
  }

  // リーグ便りの最新1件
  const n = obj(list(raw?.notices)[0]);
  if (n) {
    const items = list(n.picks ?? n.moves).map(obj).filter(Boolean);
    switch (str(n.type)) {
      case 'draft': {
        const ours = items.filter((x) => str(x.team) === team);
        articles.push(
          article(
            'ドラフト',
            ours.length ? `${me}から${ours.length}人がプロへ` : `ドラフト会議で${items.length}人が指名`,
            ours.length
              ? ours
                  .slice(0, 3)
                  .map((x) => `${str(x.name)}（${view.teamShort(str(x.npbTeam) ?? '')}）`)
                  .join('、') + 'が指名を受けた。'
              : `リーグから${items.length}人がNPBの球団へ。詳しくは試合タブのリーグ便りで。`,
            LINK_GAMES,
          ),
        );
        break;
      }
      case 'promotion': {
        const up = items
          .filter((x) => str(x.to) === 'A')
          .map((x) => str(x.teamId))
          .filter((x) => x != null)
          .map((x) => view.teamShort(x));
        articles.push(article('昇格・降格', up.length ? `${up.join('・')}が1部へ` : '入れ替えが決まる', `${items.length}球団の所属が入れ替わった。`, LINK_GAMES));
        break;
      }
      case 'trade': {
        const teams = list(n.teams)
          .map(str)
          .filter((x) => x != null)
          .map((x) => view.teamShort(x));
        articles.push(
          article(
            'トレード',
            `${teams.join('と')}がトレード成立`,
            items
              .slice(0, 4)
              .map((x) => `${str(x.name)}（→${view.teamShort(str(x.team) ?? '')}）`)
              .join('、') + 'が移籍する。',
            LINK_GAMES,
          ),
        );
        break;
      }
      case 'tryout': {
        const ours = items.filter((x) => str(x.team) === team);
        articles.push(
          article(
            'トライアウト',
            ours.length ? `${me}、トライアウトで${ours.length}人獲得` : `トライアウトで${items.length}人が新天地へ`,
            ours.length
              ? ours
                  .slice(0, 4)
                  .map((x) => str(x.name) ?? '')
                  .join('・') + 'が加わる。'
              : '詳しくは試合タブのリーグ便りで。',
            LINK_GAMES,
          ),
        );
        break;
      }
      default:
        break;
    }
  }

  // リーグ短信・きのうの結果（自球団の最新の試合と同じ日のほかの試合）
  const sameDay = !offPhase && last?.date
    ? view.results.filter((r) => sameDate(r.date, last.date) && r.home !== team && r.away !== team && r.homeScore != null && r.awayScore != null)
    : [];
  const latest = last?.date ? !view.results.some((r) => dateKey(r.date) > dateKey(last.date)) : false;
  const shorts = sameDay.map((r) => shortLine(view, r, latest));

  // 指導者
  articles.push(...staffLocalArticles(view, me, offPhase, pen));

  // 2面・3面
  const [front, rest] = splitFront(articles);
  const hero = heroOf(view, detailGame, team, tone, facts);
  const teamPage = !offPhase && last != null ? buildTeamPage(view, raw, team, me, own, tone, sit, detailGame, hero, rest, pen) : null;
  const recordPage = !offPhase && last != null ? buildRecordPage(view, raw, team, sit, detailGame, lineScore, facts, pen) : null;
  const ng = view.nextGames.find((x) => x.home === team || x.away === team);
  const nextOpp = ng ? view.teamShort(ng.home === team ? ng.away : ng.home) : null;
  const index = [
    nextOpp != null ? `次は${nextOpp}戦` : null,
    teamPage?.interview ? `2面 ${teamPage.interview.speaker}` : teamPage ? '2面 チームの今' : null,
    recordPage?.boxes?.length ? '3面 成績表' : recordPage ? '3面 順位' : null,
  ].filter((x) => x != null);
  const results = sameDay.map((r) => ({ away: view.teamShort(r.away), awayScore: r.awayScore, home: view.teamShort(r.home), homeScore: r.homeScore }));

  const standing = orNull(joinNN([orNull(leagueName), mine && mine.gamesPlayed > 0 ? `${rankIndex + 1}位 ${record(mine)}` : null], ' '));
  return {
    paper: 'Local',
    title: localTitle(me),
    badge: '地元紙',
    extra,
    lineScore,
    box,
    issue,
    team: view.teamLabel(team),
    standing,
    status: view.status != null ? STATUS_LABELS[view.status] ?? view.status : null,
    headline,
    kicker,
    subhead,
    lead,
    tone,
    score,
    articles,
    shorts,
    dateLine: paperDate(date),
    issueNo: turnOfDate(date, view.seasonTurns),
    bigHead: bigHeadOf(tone, sit),
    bigSub: sit ? bigSubOf(headline, me) : null,
    leadHead: leadHeadOf(tone, sit, mine && mine.gamesPlayed > 0 ? `${leagueName}${rankIndex + 1}位` : null),
    caption: photoCaption(tone, sit, lineScore),
    hero,
    index,
    results,
    frontArticles: teamPage == null ? null : front,
    teamPage,
    recordPage,
  };
}

/**
 * 自球団の今季の試合を、新しい順に1ページずつ読み、連勝・連敗が数えられる所まで集める（FrontPage.kt と同じ）。
 * @param readPage (page) => Promise<{ count, games }>（`games` の窓口、scope=own、size=200）
 * @param toResult 1試合を紙面の形に（paperView の gameResult）
 * @returns {Promise<[GameResult[], boolean]>} 古い順の試合と、今季の試合を全部読めたか
 */
export async function loadOwnHistory(team, readPage, toResult, maxPages = 8) {
  const games = [];
  let count = Infinity;
  for (let page = 0; page < maxPages; page++) {
    const data = (await readPage(page)) || {};
    count = int(data.count) ?? count;
    const rows = list(data.games)
      .map((e) => {
        try {
          return toResult(e);
        } catch {
          return null;
        }
      })
      .filter((r) => r && r.homeScore != null && r.awayScore != null);
    if (!rows.length) break;
    games.push(...rows);
    if (games.length >= count) break;
    let changes = 0;
    for (let i = 0; i + 1 < games.length; i++) if (outcomeFor(games[i], team) !== outcomeFor(games[i + 1], team)) changes++;
    if (changes >= 2 && games.length >= 10) break;
  }
  return [[...games].reverse(), games.length >= count];
}
