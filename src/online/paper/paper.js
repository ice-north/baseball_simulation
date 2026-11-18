// ============================================================
// スポーツ紙らしい紙面の材料（アプリ `FrontPagePaper.kt` の写し）。
// 1面の縦見出し・写真の説明・ヒーロー欄と、2面（チーム面）・3面（記録面）を作る。
// ⚠ 文を変えるときはアプリと両方を直すこと（`kt.js` の先頭）。
// ============================================================
import { roundKt, idiv, rate3, maxBy, sortBy, sortByDesc, joinNN, list, obj, int, str, num } from './kt.js';
import { TONE, inningsText, allowed } from './copy.js';
import { POSITION_LABELS, LEAGUE_NAMES } from './paperView.js';
import {
  LINK_LINEUP,
  LINK_GAMES,
  LINK_TIPS,
  article,
  hotRecent,
  coldRecent,
  positionNoun,
  managerQuote,
  commentSpeaker,
  staffManager,
  milestonesOn,
  readableChangeReason,
  outcomeFor,
} from './local.js';
import { raceText } from '../chronicleText.js';

// ---------------------------------------------------------------------------------------------
// 日付

/** 曜日（0=日曜）。Zeller の公式 */
export function weekday(year, month, day) {
  let y = year;
  let m = month;
  if (m < 3) {
    m += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = idiv(y, 100);
  const h = (day + idiv(13 * (m + 1), 5) + k + idiv(k, 4) + idiv(j, 4) + 5 * j) % 7;
  return (h + 6) % 7;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 「4月23日（木曜日）」。暦の年が無ければ曜日を付けない */
export function paperDate(date) {
  if (!date) return null;
  const w = date.year > 1000 ? `（${WEEKDAYS[weekday(date.year, date.month, date.day)]}曜日）` : '';
  return `${date.month}月${date.day}日${w}`;
}

// ---------------------------------------------------------------------------------------------
// 試合の詳細（ボックススコア）

const POS_SHORT = { ...POSITION_LABELS, dh: '指', DH: '指' };

/** 試合の詳細の選手（打撃と投球の数） */
class DetailPlayer {
  constructor(o) {
    this.o = o;
    this.id = int(o.id);
    this.name = str(o.name) ?? '';
    this.pos = str(o.position);
    this.order = int(o.battingOrder) ?? 0;
  }
  b(k) {
    return int(o2(this.o.batting)?.[k]) ?? 0;
  }
  p(k) {
    return int(o2(this.o.pitching)?.[k]) ?? 0;
  }
  get outs() {
    return this.p('inningsPitched');
  }
  get batted() {
    return this.b('plateAppearances') > 0 || this.b('atBats') > 0;
  }
}
const o2 = (v) => obj(v);
const detailPlayers = (game, team) => list(obj(game?.teams)?.[team]).map(obj).filter(Boolean).map((p) => new DetailPlayer(p));

/** 姓だけ（「及川 邦敏」→「及川」） */
export function familyName(name) {
  const s = name.split(' ')[0].split('　')[0];
  return s.trim() === '' ? name : s;
}

/** 投げた順（継投の記録から。記録が無ければ投げたアウトの多い順） */
function pitchingOrder(game, team, players) {
  const threw = players.filter((p) => p.outs > 0 || p.p('battersFaced') > 0);
  const changes = list(game.pitcherChanges)
    .map(obj)
    .filter((c) => c && str(c.team) === team);
  if (!changes.length) return sortByDesc(threw, (p) => p.outs);
  const names = [];
  const first = str(changes[0]?.out);
  if (first != null) names.push(first);
  changes.forEach((c) => {
    const n = str(c.in);
    if (n != null && !names.includes(n)) names.push(n);
  });
  const byName = new Map();
  threw.forEach((p) => byName.set(p.name, p));
  const ordered = names.map((n) => byName.get(n)).filter(Boolean);
  return [...ordered, ...threw.filter((p) => !ordered.includes(p))];
}

function boxTeam(view, game, team) {
  const players = detailPlayers(game, team);
  if (!players.length) return null;
  const slots = sortBy(
    players.filter((p) => p.order > 0),
    (p) => p.order,
  ).map((p) => [p]);
  const extra = [];
  sortByDesc(
    players.filter((p) => p.order <= 0 && p.batted),
    (p) => p.b('plateAppearances'),
  ).forEach((p) => {
    const slot = slots.find((s) => s.length === 1 && s[0].pos === p.pos);
    if (slot) slot.push(p);
    else extra.push(p);
  });
  const row = (p, sub) => ({
    pos: POS_SHORT[p.pos] ?? '',
    name: familyName(p.name),
    ab: p.b('atBats'),
    h: p.b('hits'),
    rbi: p.b('rbis'),
    hr: p.b('homeruns'),
    sub,
  });
  const batters = [
    ...slots.flatMap((slot) => sortByDesc(slot, (p) => p.b('plateAppearances')).map((p, i) => row(p, i > 0))),
    ...extra.map((p) => row(p, true)),
  ];
  const all = [...slots.flat(), ...extra];
  const sum = (k) => all.reduce((s, p) => s + p.b(k), 0);
  const totals = [sum('atBats'), sum('hits'), sum('rbis'), sum('homeruns')];
  const pitchers = pitchingOrder(game, team, players).map((p) => ({
    name: familyName(p.name),
    ip: inningsText(p.outs, 'box'),
    h: p.p('hits'),
    so: p.p('strikeouts'),
    r: p.p('runsAllowed'),
    pitches: p.p('pitches'),
  }));
  return { name: view.teamShort(team), batters, totals, pitchers };
}

const ownFirst = (keys, team) => sortBy(keys, (k) => (k === team ? 0 : 1));

/** ▽本塁打・二塁打・三塁打・盗塁・失策 */
function boxNotes(view, game, team) {
  const teams = obj(game.teams);
  if (!teams) return [];
  const own = new Map(view.roster.map((p) => [p.id, p]));
  const order = ownFirst(Object.keys(teams), team);
  const playersOf = (t) => list(teams[t]).map(obj).filter(Boolean).map((p) => new DetailPlayer(p));
  const names = (stat, withCount = true) =>
    order
      .flatMap((t) =>
        playersOf(t)
          .filter((p) => p.b(stat) > 0)
          .map((p) => {
            const n = familyName(p.name) + (withCount && p.b(stat) >= 2 ? String(p.b(stat)) : '');
            return t === team ? n : `${n}（${teamMark(view, t)}）`;
          }),
      )
      .join('、');
  const homers = order
    .flatMap((t) =>
      playersOf(t)
        .filter((p) => p.b('homeruns') > 0)
        .map((p) => {
          const hr = p.b('homeruns');
          const total = t === team && p.id != null ? own.get(p.id)?.seasonStats?.batting?.homeruns : null;
          let nums = '';
          if (total != null && total >= hr) {
            const xs = [];
            for (let k = total - hr + 1; k <= total; k++) xs.push(`${k}号`);
            nums = xs.join('・');
          }
          return familyName(p.name) + nums + (t === team ? '' : `（${teamMark(view, t)}）`);
        }),
    )
    .join('、');
  const errors = order
    .map((t) => {
      const n = list(teams[t]).reduce((s, p) => s + (int(obj(obj(p)?.batting)?.errors) ?? 0), 0);
      return n > 0 ? `${view.teamShort(t)}${n}` : null;
    })
    .filter((x) => x != null)
    .join('、');
  const triples = names('triples');
  const doubles = names('doubles');
  const steals = names('stolenBases');
  return [
    homers ? `▽本塁打　${homers}` : null,
    triples ? `▽三塁打　${triples}` : null,
    doubles ? `▽二塁打　${doubles}` : null,
    steals ? `▽盗塁　${steals}` : null,
    errors ? `▽失策　${errors}` : null,
  ].filter((x) => x != null);
}

/** 継投の理由を短く（「先発早川 喜一が打ち込まれて降板」→「打ち込まれて降板」） */
function shortReason(text) {
  const t = text.trim();
  const i = t.indexOf('が');
  return (i >= 1 && i <= 14 ? t.substring(i + 1) : t).trim().slice(0, 18);
}

/** 継投メモ（自球団だけ。理由は遊ぶ人の言葉に直す） */
function relayNotes(game, team) {
  return list(game.pitcherChanges)
    .map(obj)
    .filter((c) => c && str(c.team) === team)
    .map((c) => {
      const out = str(c.out);
      const inn = str(c.in);
      if (out == null || inn == null) return null;
      const reason = str(c.reason);
      const why = reason != null ? shortReason(readableChangeReason(reason)) : str(c.role);
      return `${int(c.inning) ?? '-'}回　${familyName(out)}→${familyName(inn)}` + (why != null ? `（${why}）` : '');
    })
    .filter((x) => x != null);
}

// ---------------------------------------------------------------------------------------------
// 1面の縦見出し・写真の説明・ヒーロー

/** 1面の縦の大見出し（短い言葉）。場面が無ければ null */
export function bigHeadOf(tone, s) {
  if (!s) return null;
  const f = s.facts;
  if (tone === TONE.Win) {
    if (f?.theirHits === 0 && s.theirs === 0) return '快挙';
    if (f?.walkOff === true) return 'サヨナラ';
    if (s.theirs === 0 && f?.complete === true) return '完封';
    if (s.theirs === 0) return '零封';
    if (s.brokenStreak >= 3) return '連敗脱出';
    if (f != null && f.trailed && f.maxDeficit >= 3) return '大逆転';
    if (f != null && f.trailed) return '逆転';
    if (s.ours >= 10 || s.diff >= 7) return '猛打';
    if (f?.multiHomer != null || (f?.ourHomeruns ?? 0) >= 3) return '一発攻勢';
    if (s.streak >= 3) return `${s.streak}連勝`;
    if (s.diff === 1) return '競り勝つ';
    if (f?.complete === true) return '完投';
    return '快勝';
  }
  if (tone === TONE.Lose) {
    if (f?.ourHits === 0) return '屈辱';
    if (s.ours === 0) return '零敗';
    if (f?.walkOff === true) return 'サヨナラ';
    if (s.brokenStreak >= 3) return '連勝止まる';
    if (s.diff >= 7 || s.theirs >= 10) return '大敗';
    if (f != null && f.led && s.diff <= 3) return '逆転負け';
    if ((f?.ourErrors ?? 0) >= 2) return '守乱';
    if (s.diff === 1) return '惜敗';
    if (s.streak >= 3) return `${s.streak}連敗`;
    return '黒星';
  }
  if (tone === TONE.Draw) return '痛み分け';
  return null;
}

/** 縦の袖見出し（大見出しから自球団の名前を落としたもの） */
export function bigSubOf(headline, me) {
  let h = headline;
  if (h.startsWith(`${me}、`)) h = h.slice(me.length + 1);
  if (h.startsWith(me)) h = h.slice(me.length);
  h = h.trim();
  return h === '' ? headline : h;
}

/** リードの横の小見出し（縦） */
export function leadHeadOf(tone, s, place) {
  if (!s) return place;
  const f = s.facts;
  if (tone === TONE.Win) {
    if (f != null && f.ourHits >= 10) return `${s.place}で${f.ourHits}安打${s.ours}点`;
    if (s.theirs === 0) return '投手陣が零封';
    if (s.diff === 1) return '1点差を守り切る';
    return place ?? `${s.place}で白星`;
  }
  if (tone === TONE.Lose) {
    if (s.ours === 0) return '打線が沈黙';
    if (f?.walkOff === true) return '最後に力尽きる';
    if (s.diff >= 5) return '投手陣が崩れる';
    return place ?? `${s.place}で黒星`;
  }
  return place;
}

/** 写真（球場の得点板）の説明 */
export function photoCaption(tone, s, ls) {
  if (!s) return null;
  const f = s.facts;
  const park = s.home ? '本拠地' : `${s.opp}の球場`;
  const n = ls ? Math.max(ls.awayRuns.length, ls.homeRuns.length) : 0;
  const innings = n > 0 ? n : null;
  const lr = f?.theirInnings?.length ? f.theirInnings[f.theirInnings.length - 1] : null;
  const lastRuns = lr != null && lr > 0 ? lr : null;
  let text;
  if (f?.walkOff === true && tone === TONE.Win) text = `サヨナラ勝ちが決まった${park}の得点板`;
  else if (f?.walkOff === true && innings != null && lastRuns != null) text = `${innings}回裏に${lastRuns}点を奪われた${park}の得点板`;
  else if (f?.walkOff === true) text = `サヨナラ負けを喫した${park}の得点板`;
  else if (tone === TONE.Win && s.theirs === 0) text = `相手の欄に0が並んだ${park}の得点板`;
  else if (tone === TONE.Win && f?.winningHit != null) text = `${f.winningHit.inning}回に勝ち越した${park}の得点板`;
  else if (tone === TONE.Lose && s.ours === 0) text = `0が並んだ${park}の得点板`;
  else text = `${park}の得点板`;
  return `▲${text}`;
}

const POSITION_NOUNS = {
  pitcher: '投手',
  catcher: '捕手',
  first: '一塁手',
  second: '二塁手',
  third: '三塁手',
  short: '遊撃手',
  left: '左翼手',
  center: '中堅手',
  right: '右翼手',
  dh: '指名打者',
};

/** ヒーロー欄（勝った日はきょうのヒーロー、負けた日は敗戦の中の光）。詳細が無ければ null */
export function heroOf(view, game, team, tone, f) {
  if (game == null || f == null || tone === TONE.None) return null;
  const players = detailPlayers(game, team);
  const won = tone === TONE.Win;
  const bat = maxBy(
    players.filter((p) => p.batted),
    (p) => p.b('homeruns') * 4 + p.b('rbis') * 2 + p.b('hits'),
  );
  const ace = maxBy(players, (p) => p.outs);
  const batGood = bat != null && (bat.b('homeruns') > 0 || bat.b('rbis') >= 2 || bat.b('hits') >= 3);
  const aceGood = ace != null && ace.outs >= 18 && ace.p('runsAllowed') <= 2;
  const wn = f.winningHit?.name;
  const winner = wn != null ? players.find((p) => p.name === wn) ?? null : null;
  let pick;
  if (aceGood && (!batGood || (bat.b('homeruns') < 2 && ace.p('runsAllowed') === 0))) pick = ace;
  else if (batGood) pick = bat;
  else if (won && winner != null) pick = winner;
  else if (ace != null && ace.outs >= 15) pick = ace;
  else return null;
  const roster = pick.id != null ? view.roster.find((p) => p.id === pick.id) ?? null : null;
  const isPitcherLine = pick === ace && (pick.outs >= 15 || !pick.batted) && !(pick === bat && batGood);
  const lines = isPitcherLine
    ? [
        [pick.p('gamesStarted') > 0 || pitchingOrder(game, team, players)[0] === pick ? '先発' : '救援', false],
        [inningsText(pick.outs, 'prose'), true],
        [`${pick.p('runsAllowed')}失点`, true],
        pick.p('strikeouts') > 0 ? [`${pick.p('strikeouts')}奪三振`, false] : null,
      ].filter(Boolean)
    : [
        [`${pick.b('atBats')}打数`, false],
        [`${pick.b('hits')}安打`, pick.b('hits') >= 2],
        pick.b('homeruns') > 0 ? [`${pick.b('homeruns')}本塁打`, true] : null,
        pick.b('rbis') > 0 ? [`${pick.b('rbis')}打点`, pick.b('rbis') >= 2] : null,
      ].filter(Boolean);
  const summary = isPitcherLine
    ? (lines[0][0] === '先発' ? '先発で' : '救援で') +
      inningsText(pick.outs, 'prose') +
      allowed(pick.p('runsAllowed')) +
      (pick.p('strikeouts') > 0 ? `、${pick.p('strikeouts')}奪三振` : '')
    : lines.map((l) => l[0]).join('');
  let season = null;
  if (isPitcherLine) {
    const st = roster?.seasonStats?.pitching;
    if (st) season = `今季 ${st.wins}勝${st.losses}敗` + (st.saves > 0 ? `${st.saves}S` : '');
  } else {
    const st = roster?.seasonStats?.batting;
    if (st && st.atBats > 0) season = `今季 ${rate3(st.hits / st.atBats)} ${st.homeruns}本`;
  }
  return {
    title: won ? 'きょうのヒーロー' : tone === TONE.Lose ? '敗戦の中の光' : 'きょうの主役',
    name: pick.name,
    position: POSITION_NOUNS[pick.pos ?? roster?.position] ?? '',
    lines,
    season,
    summary,
  };
}

// ---------------------------------------------------------------------------------------------
// 2面（チーム面）

/** 監督の一問一答 */
export function interviewOf(view, tone, s, game, team, pen) {
  const coach = staffManager(view.staff);
  const [speaker0, temper] = commentSpeaker(view);
  if (speaker0 == null) return null;
  const speaker = `${speaker0}監督`;
  const f = s.facts;
  const quote = managerQuote(tone, s, pen, temper);
  if (quote == null) return null;
  const creed =
    coach?.pitch != null
      ? String(coach.pitch)
          .split('。')
          .find((x) => x.trim() !== '')
          ?.trim() ?? null
      : null;
  const qa = [];
  let q1;
  if (tone === TONE.Win && f?.walkOff === true) q1 = '――劇的なサヨナラ勝ち。';
  else if (tone === TONE.Win && f != null && f.trailed && f.maxDeficit >= 3) q1 = `――${f.maxDeficit}点差からの逆転。`;
  else if (tone === TONE.Win && s.theirs === 0) q1 = '――完封リレー。';
  else if (tone === TONE.Win && s.streak >= 3) q1 = `――${s.streak}連勝。`;
  else if (tone === TONE.Win) q1 = '――きょうの勝因は。';
  else if (tone === TONE.Lose && f?.walkOff === true) q1 = '――サヨナラ負け。';
  else if (tone === TONE.Lose && s.streak >= 3) q1 = `――${s.streak}連敗。`;
  else if (tone === TONE.Lose) q1 = '――きょうの敗因は。';
  else q1 = '――引き分けに終わった。';
  const a1 = tone === TONE.Win && creed != null && pen.pick([true, false], 60) ? `${creed}。それをやり切った結果だ` : quote;
  qa.push([q1, a1]);
  const tb = f?.topBatter;
  const b = tb && (tb.hr > 0 || tb.rbi >= 2 || tb.hits >= 3) ? tb : null;
  const ace = f?.ace;
  if (b != null) {
    const feat = b.hr >= 2 ? `${b.hr}本塁打` : b.hr === 1 ? '本塁打' : b.hits >= 3 ? `${b.hits}安打` : `${b.rbi}打点`;
    const pool =
      tone === TONE.Win
        ? ['調子が上がってきた。今はあいつに回せば何か起きる', 'よく打ってくれた。頼もしい', '練習の成果。本人の努力だ', 'こういう日を増やしてほしい']
        : tone === TONE.Lose
          ? ['あいつが打っても勝てなかった。周りが続かないと', '一人で打っても勝てない', 'あの打撃は明日につながる']
          : ['よく打ってくれた。あと1本が欲しかった', 'あの打撃は明日につながる'];
    qa.push([`――${familyName(b.name)}が${feat}。`, pen.pick(pool, 61)]);
  } else if (ace != null && ace.outs >= 18) {
    const pool =
      tone === TONE.Win
        ? ['試合をつくってくれた。言うことはない', '球に力があった', '捕手とよく話し合えていた']
        : tone === TONE.Lose
          ? ['よく投げた。打線が援護できなかった', '投手を責める試合ではない', '勝たせてあげたかった']
          : ['よく投げた。勝ちを付けてあげたかった', '試合をつくってくれた'];
    qa.push([`――${familyName(ace.name)}が${inningsText(ace.outs, 'prose')}${allowed(ace.runs)}。`, pen.pick(pool, 62)]);
  }
  const order = game ? pitchingOrder(game, team, detailPlayers(game, team)) : null;
  const starter = order?.[0] ?? null;
  if (starter != null && starter.outs < 15 && starter.p('runsAllowed') >= 3) {
    const early = starter.outs === 0 ? '1死も取れずに降板' : `${inningsText(starter.outs, 'prose')}で降板`;
    qa.push([
      `――先発の${familyName(starter.name)}は${early}。`,
      temper >= 1
        ? pen.pick(['あれでは任せられない。次は考える', '試合を壊した。反省してもらう'], 63)
        : pen.pick(['本人がいちばん悔しいはず。次も任せる', '調子が悪い日もある。切り替えてほしい'], 63),
    ]);
  } else if (s.streak >= 2 && tone === TONE.Win) {
    qa.push(['――チームの状態は。', pen.pick(['一戦一戦、やることは変わらない', 'いい雰囲気でやれている', '浮かれずにいきたい'], 64)]);
  }
  const how =
    temper >= 1 ? pen.pick(['熱っぽく', '語気を強めて'], 65) : temper <= -1 ? pen.pick(['穏やかに', '落ち着いた口調で'], 65) : pen.pick(['淡々と', '言葉を選びながら'], 65);
  const event =
    tone === TONE.Win
      ? f?.trailed === true && f.maxDeficit >= 3
        ? '大逆転劇'
        : f?.walkOff === true
          ? 'サヨナラ劇'
          : `${s.place}での白星`
      : tone === TONE.Lose
        ? `${s.place}での黒星`
        : '引き分け';
  return {
    title: `${speaker}「${shortQuote(quote)}」`,
    intro: `${event}から一夜。${speaker}は試合後、${how}語った。（一問一答）`,
    speaker,
    qa,
  };
}

/** 選手の談話（ヒーロー） */
export function heroTalk(hero, tone, pen) {
  if (!hero) return null;
  const pitcher = hero.position === '投手';
  const n = familyName(hero.name);
  let quote;
  let more;
  if (tone === TONE.Win && pitcher) {
    quote = pen.pick(['捕手のリードのおかげです', '野手に助けてもらいました', '次も長い回を投げたい', '真っすぐで押せた'], 70);
    more = pen.pick(['「次の登板も同じように投げたい」と話した。', '「まだまだ良くなる」と気を引き締めた。'], 71);
  } else if (tone === TONE.Win) {
    quote = pen.pick(['打てる球を待てている', '甘い球をしっかり振れた', 'チームの勝ちに貢献できてうれしい', 'とにかく必死でした'], 70);
    more = pen.pick(['「チームが勝つ打点を挙げたい」と次戦を見据えた。', '「明日も打てるよう準備します」と笑顔を見せた。', '「調子はいい」と手応えを口にした。'], 71);
  } else if (tone === TONE.Draw && pitcher) {
    quote = pen.pick(['最低限の仕事はできた', '勝ちを付けられず悔しい', '粘り強く投げられた'], 70);
    more = pen.pick(['「次は勝ちにつながる投球を」と話した。', '「負けなかったことを次に生かしたい」と前を向いた。'], 71);
  } else if (tone === TONE.Draw) {
    quote = pen.pick(['勝ち切りたかった', 'あと1本が出ていれば', '打てたのは良かったが、勝ちたかった'], 70);
    more = pen.pick(['「次こそ勝ちにつなげる」と前を向いた。', '「この感覚を次に生かしたい」と話した。'], 71);
  } else if (pitcher) {
    quote = pen.pick(['粘り切れず悔しい', '勝ちにつながる投球ができなかった'], 70);
    more = '「次は必ず」と前を向いた。';
  } else {
    quote = pen.pick(['勝ちにつながらず悔しい', '打てても負けたら意味がない'], 70);
    more = '「明日こそ勝てるように」と唇をかんだ。';
  }
  const season = hero.season != null ? `${hero.season.startsWith('今季 ') ? hero.season.slice(3) : hero.season}と、今季も数字を残している。` : '';
  return article('ヒーロー', `${n}「${quote}」`, `この日${hero.summary}の${hero.name}は「${quote}」と振り返った。` + season + more, LINK_LINEUP);
}

/** 調子の矢印（0〜4 → −2〜2） */
const arrowOf = (condition) => Math.min(2, Math.max(-2, (condition ?? 2) - 2));

function oneDecimal(v) {
  const r = roundKt(v * 10);
  return `${idiv(r, 10)}.${Math.abs(r % 10)}`;
}
function twoDecimals(v) {
  const r = roundKt(v * 100);
  return `${idiv(r, 100)}.${String(Math.abs(r) % 100).padStart(2, '0')}`;
}

/** チーム打率・防御率と、部の中の順位（teams は部の球団の数）。チームの成績が無ければ null */
function teamStatRanks(view, raw, team) {
  const stats = obj(raw?.teamStats);
  if (!stats) return null;
  const league = view.teamLeagues[team];
  const inLeague = Object.keys(stats).filter((k) => league == null || view.teamLeagues[k] === league);
  const mine = obj(stats[team]);
  if (!mine) return null;
  const avg = num(mine.average);
  const era = num(mine.era);
  return {
    avg,
    avgRank: avg != null ? 1 + inLeague.filter((k) => (num(obj(stats[k])?.average) ?? 0.0) > avg).length : null,
    era,
    eraRank: era != null ? 1 + inLeague.filter((k) => (num(obj(stats[k])?.era) ?? 99.0) < era).length : null,
    teams: inLeague.length,
  };
}

/** 次の相手を探る（相手の順位・連勝連敗・打率と防御率の順位・対戦成績） */
function opponentReport(view, raw, team, own) {
  const g = view.nextGames.find((x) => x.home === team || x.away === team);
  if (!g) return null;
  const opp = g.home === team ? g.away : g.home;
  const O = view.teamShort(opp);
  const league = view.teamLeagues[opp];
  const table = view.leagueTable(league);
  const rank = table.findIndex((x) => x.team === opp);
  const row = table[rank];
  const st = row && row.gamesPlayed > 0 ? row : null;
  const parts = [];
  if (st) parts.push(`${LEAGUE_NAMES[league] ?? ''}${rank + 1}位の${O}は${st.wins}勝${st.losses}敗。`);
  const sk = view.teamStreaks[opp];
  if (sk && sk.count >= 2 && sk.kind !== 'D') parts.push(`いま${sk.count}${sk.kind === 'W' ? '連勝' : '連敗'}中だ。`);
  const r = teamStatRanks(view, raw, opp);
  if (r) {
    if (r.avg != null && r.avgRank != null) parts.push(`チーム打率${rate3(r.avg)}は部で${r.avgRank}位、`);
    if (r.era != null && r.eraRank != null) parts.push(`防御率${twoDecimals(r.era)}は${r.eraRank}位。`);
    const ar = r.avgRank;
    const er = r.eraRank;
    if (ar != null && er != null) {
      if (ar <= 2 && er >= r.teams - 1) parts.push('打線は怖いが、投手陣には付け入る隙がある。');
      else if (er <= 2 && ar >= r.teams - 1) parts.push('投手陣は手ごわいが、打線は湿りがちだ。');
      else if (ar <= 2 && er <= 2) parts.push('投打に穴の少ない難敵だ。');
      else parts.push('');
    }
  }
  const versus = own.filter((x) => x.home === opp || x.away === opp);
  if (versus.length) {
    const w = versus.filter((x) => outcomeFor(x, team) > 0).length;
    const l = versus.filter((x) => outcomeFor(x, team) < 0).length;
    parts.push(`今季の対戦は${w}勝${l}敗。`);
  }
  if (!parts.length) return null;
  return article('次の相手', `${O}を探る`, parts.join(''), LINK_LINEUP);
}

/** 若手の芽（23歳以下で伸びしろのある自球団の選手。日によって載せる） */
function prospectArticle(view, pen) {
  const young = view.roster.filter((p) => p.isActive && (p.age ?? 99) <= 23 && (p.growthPotential ?? 1.0) >= 1.1);
  if (!young.length || !pen.pick([true, true, false], 90)) return null;
  const p = pen.pick(sortByDesc(young, (x) => x.growthPotential ?? 0.0).slice(0, 3), 91);
  const cands = p.isPitcher
    ? [
        p.pitching?.velocity != null ? [`最速${p.pitching.velocity}km`, (p.pitching.velocity - 140) * 4] : null,
        p.pitching?.control != null ? [`制球${p.pitching.control}`, p.pitching.control - 50] : null,
      ]
    : [
        p.batting?.meet != null ? [`ミート${p.batting.meet}`, p.batting.meet] : null,
        p.batting?.power != null ? [`パワー${p.batting.power}`, p.batting.power] : null,
        p.physical?.speed != null ? [`走力${p.physical.speed}`, p.physical.speed] : null,
      ];
  const strength = maxBy(cands.filter(Boolean), (x) => x[1])?.[0] ?? null;
  let now = null;
  if (p.isPitcher) {
    const st = p.seasonStats?.pitching;
    if (st && st.games > 0) now = `今季は${st.games}試合に投げて${st.wins}勝${st.losses}敗。`;
  } else {
    const st = p.seasonStats?.batting;
    if (st && st.atBats > 0) now = `今季は${st.atBats}打数で打率${rate3(st.hits / st.atBats)}。`;
  }
  const big = (p.growthPotential ?? 1.0) >= 1.3;
  return article(
    '若手の芽',
    `${familyName(p.name)}（${p.age}）`,
    `${p.age}歳の${positionNoun(p.position)}・${p.name}。` +
      (strength != null ? `${strength}が持ち味だ。` : '') +
      (now ?? 'まだ出番は少ない。') +
      (big
        ? pen.pick(['首脳陣は「必ず出てくる」と期待を寄せる。', '伸びしろは大きく、将来の中心選手と目される。'], 92)
        : pen.pick(['じっくり力をつけている。', '出番をつかめるか。'], 92)),
    LINK_LINEUP,
  );
}

/** 面の名前に使う球団の愛称（「宮崎アトラス」→「アトラス」） */
export function teamNick(label, city) {
  const s = (label.startsWith(city) ? label.slice(city.length) : label).trim();
  return s === '' ? label : s;
}

/** 2面を作る */
export function buildTeamPage(view, raw, team, me, own, tone, s, game, hero, leftover, pen) {
  const last10 = own.slice(-10);
  const form = last10.map((g) => outcomeFor(g, team));
  const now = [];
  if (last10.length) {
    const w = form.filter((x) => x > 0).length;
    const l = form.filter((x) => x < 0).length;
    const d = last10.length - w - l;
    now.push([`直近${last10.length}試合`, `${w}勝${l}敗${d > 0 ? `${d}分` : ''}`]);
    const scored = last10.reduce((a, g) => a + (g.home === team ? g.homeScore ?? 0 : g.awayScore ?? 0), 0);
    const lost = last10.reduce((a, g) => a + (g.home === team ? g.awayScore ?? 0 : g.homeScore ?? 0), 0);
    now.push(['1試合の得点', oneDecimal(scored / last10.length)]);
    now.push(['1試合の失点', oneDecimal(lost / last10.length)]);
  }
  const ranks = teamStatRanks(view, raw, team);
  const avgRank = ranks?.avgRank ?? null;
  const eraRank = ranks?.eraRank ?? null;
  if (ranks) {
    if (ranks.avg != null && ranks.avgRank != null) now.push(['チーム打率', `${rate3(ranks.avg)}（${ranks.avgRank}位）`]);
    if (ranks.era != null && ranks.eraRank != null) now.push(['チーム防御率', `${twoDecimals(ranks.era)}（${ranks.eraRank}位）`]);
  }
  const half = idiv((ranks?.teams ?? 0) + 1, 2);
  let nowNote = null;
  if (avgRank != null && eraRank != null) {
    if (avgRank <= half && eraRank <= half) nowNote = pen.pick(['投打がかみ合い、地力がついてきた。', '打っても投げても上位。崩れる気配は少ない。'], 80);
    else if (avgRank <= half) nowNote = pen.pick(['打線は好調だが、投手陣が踏ん張りきれていない。', '打ち勝つ野球。投手陣の立て直しが課題だ。'], 80);
    else if (eraRank <= half) nowNote = pen.pick(['投手陣は粘っているが、打線の援護が足りない。', '守り勝つ野球。あと1本が出れば上が見える。'], 80);
    else nowNote = pen.pick(['投打ともに下位。我慢の時期が続く。', '打線も投手陣も、もう一段の奮起が要る。'], 80);
  }

  // 調子の矢印（スタメンと、調子の振れた控え）
  const orderIds = new Map();
  list(obj(view.lineup)?.battingOrder)
    .map(obj)
    .filter(Boolean)
    .forEach((e) => orderIds.set(int(e.playerId) ?? 0, [str(e.position), int(e.battingOrder) ?? 0]));
  const fielders = view.roster.filter((p) => p.isActive && !p.isPitcher);
  const candidates = fielders.filter((p) => orderIds.has(p.id) || (p.condition ?? 2) >= 4 || (p.condition ?? 2) <= 0);
  const sorted = [...candidates].sort(
    (a, b) => Math.abs(arrowOf(b.condition)) - Math.abs(arrowOf(a.condition)) || (orderIds.get(a.id)?.[1] ?? 99) - (orderIds.get(b.id)?.[1] ?? 99),
  );
  const conditions = sortByDesc(sorted.slice(0, 5), (p) => arrowOf(p.condition)).map((p) => {
    const r = p.recent;
    let note;
    if (r == null) note = '';
    else if (r.hitStreak >= 3) note = `${r.hitStreak}試合連続安打`;
    else if (hotRecent(r)) note = `${r.games}試合で${r.hits}安打`;
    else if (coldRecent(r)) note = `${r.games}試合で${r.hits}安打`;
    else if (!orderIds.has(p.id)) note = '控え';
    else note = '';
    const pos = orderIds.get(p.id)?.[0];
    return { arrow: arrowOf(p.condition), name: familyName(p.name), position: (pos != null ? POS_SHORT[pos] : null) ?? '控', note };
  });

  // 投手陣の疲れ
  const pitchers = sortByDesc(
    view.roster.filter((p) => p.isActive && p.isPitcher && (p.fatigue ?? 0) >= 30),
    (p) => p.fatigue,
  )
    .slice(0, 3)
    .map((p) => {
      const f = p.fatigue ?? 0;
      return [familyName(p.name), `疲労${f}`, f >= 60];
    });
  let rotation = null;
  const starters = list(obj(view.lineup)?.starters)
    .map(int)
    .filter((x) => x != null);
  if (starters.length) {
    const next = int(raw?.nextStarterId);
    const k0 = starters.indexOf(next);
    const i = k0 >= 0 ? k0 : 0;
    const byId = new Map(view.roster.map((p) => [p.id, p]));
    const names = [];
    for (let k = 0; k < Math.min(3, starters.length); k++) {
      const p = byId.get(starters[(i + k) % starters.length]);
      if (p?.name != null) names.push(familyName(p.name));
    }
    rotation = names.join('→') || null;
  }

  const interview = s ? interviewOf(view, tone, s, game, team, pen) : null;
  const articles = [];
  const talk = heroTalk(hero, tone, pen);
  if (talk) articles.push(talk);
  const rep = opponentReport(view, raw, team, own);
  if (rep) articles.push(rep);
  const pro = prospectArticle(view, pen);
  if (pro) articles.push(pro);
  articles.push(...(interview != null ? leftover.filter((a) => a.kicker !== 'ひと言') : leftover));
  return {
    section: `${teamNick(view.teamLabel(team), me)}番`,
    interview,
    form,
    now,
    nowNote,
    conditions,
    pitchers,
    rotation,
    articles,
  };
}

// ---------------------------------------------------------------------------------------------
// 3面（記録面）

/** 戦評（回ごとの得点から流れを書く）。[見出し, 本文] */
export function reviewOf(s, ls, f, pen) {
  if (!ls) return null;
  const ours = s.home ? ls.homeRuns : ls.awayRuns;
  const theirs = s.home ? ls.awayRuns : ls.homeRuns;
  const halves = [];
  for (let i = 0; i < Math.max(ours.length, theirs.length); i++) {
    const top = s.home ? (i < theirs.length ? { inning: i + 1, us: false, runs: theirs[i] } : null) : i < ours.length ? { inning: i + 1, us: true, runs: ours[i] } : null;
    const bot = s.home ? (i < ours.length ? { inning: i + 1, us: true, runs: ours[i] } : null) : i < theirs.length ? { inning: i + 1, us: false, runs: theirs[i] } : null;
    [top, bot].filter((h) => h && h.runs > 0).forEach((h) => halves.push(h));
  }
  if (!halves.length) return null;
  let a = 0;
  let b = 0;
  const sentences = [];
  for (const h of halves) {
    const before = a - b;
    if (h.us) a += h.runs;
    else b += h.runs;
    const after = a - b;
    const who = h.us ? s.me : s.opp;
    let verb;
    if (before === 0 && a + b === h.runs) verb = '先制';
    else if (before <= 0 && after > 0 && h.us && before < 0) verb = '逆転';
    else if (before >= 0 && after < 0 && !h.us && before > 0) verb = '逆転';
    else if (after === 0) verb = '同点に追いつく';
    else if ((h.us && before === 0 && after > 0) || (!h.us && before === 0 && after < 0)) verb = '勝ち越し';
    else if ((h.us && after > 0) || (!h.us && after < 0)) verb = '加点';
    else verb = '反撃';
    sentences.push(`${h.inning}回に${who}が${h.runs}点を挙げて${verb}`);
  }
  let keep;
  if (sentences.length <= 4) keep = sentences;
  else {
    let big = 0;
    halves.forEach((h, i) => {
      if (h.runs > halves[big].runs) big = i;
    });
    keep = sentences
      .map((_, i) => i)
      .filter(
        (i) =>
          i === 0 ||
          i === sentences.length - 1 ||
          i === big ||
          sentences[i].includes('逆転') ||
          sentences[i].includes('同点') ||
          sentences[i].includes('勝ち越し'),
      )
      .slice(0, 5)
      .map((i) => sentences[i]);
  }
  let pitching = '';
  const ps = f?.ourPitchers;
  if (ps) {
    const runs = s.theirs === 0 ? '無失点' : `${s.theirs}失点`;
    if (ps.length === 1) pitching = `${s.me}は${familyName(ps[0].name)}が1人で投げ抜き、${runs}。`;
    else if (ps.length > 1) pitching = `${s.me}の投手陣は${ps.length}人の継投で${runs}。`;
  }
  const decider = f?.winningHit
    ? `決勝点は${f.winningHit.inning}回、${f.winningHit.name}の${f.winningHit.what}だった。`
    : f?.theirWinningHit
      ? `${f.theirWinningHit.inning}回、${f.theirWinningHit.name}に決勝の${f.theirWinningHit.what}を許した。`
      : '';
  const body = keep.join('。') + '。' + pitching + decider;
  let head;
  if (f?.walkOff === true) head = s.ours > s.theirs ? '最後に試合を決める' : '最後の最後に暗転';
  else if (f != null && f.trailed && s.ours > s.theirs) head = pen.pick(['粘りが逆転呼ぶ', '終盤の反撃が実る'], 100);
  else if (f != null && f.led && s.ours < s.theirs) head = pen.pick(['リード守れず', '逃げ切りに失敗'], 100);
  else if (s.ours > s.theirs && s.theirs === 0) head = '投手陣が零封リレー';
  else if (s.ours > s.theirs) head = pen.pick(['流れを渡さず', '序盤から主導権'], 100);
  else if (s.ours < s.theirs) head = pen.pick(['流れをつかめず', '反撃届かず'], 100);
  else head = '決着つかず';
  return [head, body];
}

export function gb(v) {
  return v % 1.0 === 0 ? String(Math.trunc(v)) : String(roundKt(v * 10) / 10);
}
export const gamesBehind = (leader, me) => (leader.wins - me.wins + (me.losses - leader.losses)) / 2.0;

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function buildRecordPage(view, raw, team, s, game, ls, f, pen) {
  const league = view.teamLeagues[team];
  const table = view.leagueTable(league);
  const top = table[0] ?? null;
  const standings = table.some((x) => x.gamesPlayed > 0)
    ? table.map((st, i) => {
        const sk = view.teamStreaks[st.team];
        const streak = sk && sk.count >= 3 && sk.kind !== 'D' ? `${sk.count}${sk.kind === 'W' ? '連勝' : '連敗'}` : '';
        return {
          rank: i + 1,
          team: view.teamShort(st.team),
          w: st.wins,
          l: st.losses,
          gb: i === 0 || top == null ? '―' : gb(gamesBehind(top, st)),
          note: streak,
          mine: st.team === team,
        };
      })
    : [];

  // 予告先発（次の日の全試合。自球団を先に）
  const upcoming = list(raw?.upcoming).map(obj).filter(Boolean);
  const firstDay = upcoming[0]?.date;
  const day = upcoming.filter((g) => sameJson(g.date, firstDay));
  const involves = (g) => str(g.home) === team || str(g.away) === team;
  const probables = sortBy(day, (g) => (involves(g) ? 0 : 1)).map((g) => {
    const home = str(g.home) ?? '';
    const away = str(g.away) ?? '';
    const hs = str(g.homeStarter) != null ? familyName(str(g.homeStarter)) : '未定';
    const aw = str(g.awayStarter) != null ? familyName(str(g.awayStarter)) : '未定';
    return [`${view.teamShort(away)}―${view.teamShort(home)}　${aw}―${hs}`, home === team || away === team];
  });
  let probablesTitle = null;
  if (upcoming.length && firstDay != null) {
    const m = int(obj(firstDay)?.month);
    const dd = int(obj(firstDay)?.day);
    probablesTitle = m != null && dd != null ? `予告先発　${m}月${dd}日` : null;
  }

  // 個人成績ベスト5（打率・本塁打・防御率）
  const boards = list(raw?.leaders).map(obj).filter(Boolean);
  const leaders = [
    ['avg', '打率'],
    ['homeruns', '本塁打'],
    ['era', '防御率'],
  ]
    .map(([id, label]) => {
      const bd = boards.find((x) => str(x.id) === id);
      if (!bd) return null;
      const rows = list(bd.rows)
        .map(obj)
        .filter(Boolean)
        .slice(0, 5)
        .map((r) => {
          const v = num(r.value);
          const value = id === 'avg' ? rate3(v) : id === 'era' ? (v != null ? twoDecimals(v) : '-') : `${v != null ? Math.trunc(v) : '-'}`;
          const t = str(r.team) ?? '';
          return { name: familyName(str(r.name) ?? ''), team: teamMark(view, t), value, mine: t === team };
        });
      return rows.length ? { title: label, rows } : null;
    })
    .filter(Boolean);

  // リーグ短信（ほかの球団の話題）
  const shorts = [];
  const lastDay = view.results.length ? view.results[view.results.length - 1].date : null;
  milestonesOn(view, lastDay)
    .filter((m) => m.team !== team)
    .slice(0, 2)
    .forEach((m) => {
      shorts.push(article('記録', `${familyName(m.name)}、${m.label}`, `${view.teamShort(m.team)}の${m.name}が${m.label}に到達した。`, LINK_GAMES));
    });
  sortByDesc(
    Object.entries(view.teamStreaks).filter(([t, st]) => t !== team && st.count >= 4 && st.kind !== 'D'),
    (e) => e[1].count,
  )
    .slice(0, 2)
    .forEach(([t, st]) => {
      const T = view.teamShort(t);
      shorts.push(
        st.kind === 'W'
          ? article('連勝', `${T}${st.count}連勝`, `${T}が${st.count}連勝と勢いに乗っている。`, LINK_GAMES)
          : article('連敗', `${T}${st.count}連敗`, `${T}は${st.count}連敗。トンネルを抜け出せない。`, LINK_GAMES),
      );
    });
  view.races
    .filter((r) => r.team !== team && !r.clinched && r.magic >= 1 && r.magic <= 20)
    .slice(0, 1)
    .forEach((r) => {
      const t = raceText(r, view.teamShort);
      if (t) shorts.push(article('マジック', t.head, t.body, LINK_GAMES));
    });

  let gameTitle = null;
  if (s) {
    const away = s.home ? s.opp : s.me;
    const home = s.home ? s.me : s.opp;
    const [as0, hs0] = s.home ? [s.theirs, s.ours] : [s.ours, s.theirs];
    const innings = ls ? Math.max(ls.awayRuns.length, ls.homeRuns.length) : 9;
    gameTitle = `${away} ${as0}―${hs0} ${home}` + (innings > 9 ? `（延長${innings}回）` : '');
  }
  const review = s ? reviewOf(s, ls, f, pen) : null;
  const boxes = game ? ownFirst(Object.keys(obj(game.teams) ?? {}), team).map((t) => boxTeam(view, game, t)).filter(Boolean) : [];
  return {
    game: gameTitle,
    reviewHead: review?.[0] ?? null,
    review: review?.[1] ?? null,
    boxes,
    notes: game ? boxNotes(view, game, team) : [],
    relays: game ? relayNotes(game, team) : [],
    leagueName: (league != null ? LEAGUE_NAMES[league] : null) ?? '',
    standings,
    probablesTitle,
    probables,
    leaders,
    shorts,
  };
}

const FRONT_KINDS = new Set(['記録達成', '決定', '日本一決定戦', '次戦予告', '警戒警報', '現役引退', 'ドラフト', 'トライアウト', 'トレード', '昇格・降格', '新体制', '人事']);

/** 1面に載せる記事と、2面へ回す記事に分ける */
export function splitFront(articles) {
  const front = [];
  const rest = [];
  articles.forEach((a) => {
    if (a.link === LINK_TIPS) return;
    if (FRONT_KINDS.has(a.kicker) && front.length < 2) front.push(a);
    else rest.push(a);
  });
  return [front, rest];
}

/** 見出しに入れる談話。長ければ読点で切り、それでも長ければ省く */
export function shortQuote(q, max = 18) {
  if (q.length <= max) return q;
  const stop = q.indexOf('。');
  if (stop >= 6 && stop <= max) return q.substring(0, stop);
  const comma = q.indexOf('、');
  if (comma >= 6 && comma <= max) return q.substring(0, comma);
  return q.slice(0, max - 1) + '…';
}

/** 表に添える球団の1字（「（宮）」）。ほかの球団と1字目がかぶるときは短い名前のまま */
export function teamMark(view, team) {
  const short = view.teamShort(team);
  const head = short.slice(0, 1);
  const keys = [...Object.keys(view.teamLeagues), ...Object.keys(view.teamLabels)];
  const clash = keys.some((k) => k !== team && view.teamShort(k).slice(0, 1) === head);
  return clash ? short : head;
}

export { joinNN };
