// ============================================================
// 紙面の言い回し（アプリ `FrontPageCopy.kt` の写し）。⚠ 文を変えるときはアプリと両方を直すこと。
// 照合の検査: mobile/tools/expect-paper.mjs が書き出す期待値を、アプリの検査（FrontPageWebTest）が読む。
// ============================================================
import { Pen, maxBy } from './kt.js';

export { Pen };

export const TONE = { Win: 'Win', Lose: 'Lose', Draw: 'Draw', None: 'None' };

/** 試合の詳細（ボックススコア）から分かる、自球団と相手のこと（GameFacts） */
export class GameFacts {
  constructor(o) {
    Object.assign(this, { ourInnings: null, theirInnings: null, ourHome: false, walkOff: false, winningHit: null, theirWinningHit: null }, o);
  }
  get diffs() {
    const ours = this.ourInnings;
    const theirs = this.theirInnings;
    if (!ours || !theirs) return [];
    const [away, home] = this.ourHome ? [theirs, ours] : [ours, theirs];
    let a = 0;
    let h = 0;
    const out = [];
    for (let i = 0; i < Math.max(away.length, home.length); i++) {
      if (i < away.length) {
        a += away[i];
        out.push(this.ourHome ? h - a : a - h);
      }
      if (i < home.length) {
        h += home[i];
        out.push(this.ourHome ? h - a : a - h);
      }
    }
    return out;
  }
  get trailed() {
    return this.diffs.some((d) => d < 0);
  }
  get led() {
    return this.diffs.some((d) => d > 0);
  }
  get maxDeficit() {
    const d = this.diffs;
    const min = d.length ? Math.min(...d) : 0;
    return -Math.min(min, 0);
  }
  get complete() {
    return this.ourPitchers.length === 1 && this.ourPitchers[0].outs >= 24;
  }
  get ace() {
    return this.ourPitchers[0] ?? null;
  }
  get topBatter() {
    return maxBy(this.batters, (b) => b.hr * 4 + b.rbi * 2 + b.hits);
  }
  get multiHomer() {
    return maxBy(this.batters.filter((b) => b.hr >= 2), (b) => b.hr * 10 + b.rbi);
  }

  static from(game, team) {
    const teams = game?.teams;
    if (!teams || typeof teams !== 'object') return null;
    const ours = (teams[team] || []).filter((p) => p && typeof p === 'object');
    if (!ours.length) return null;
    const otherKey = Object.keys(teams).find((k) => k !== team);
    const theirs = otherKey != null ? (teams[otherKey] || []).filter((p) => p && typeof p === 'object') : null;
    const ourHome = game.home === team;
    const h = game.winningHit;
    const hit =
      h && typeof h === 'object' && h.name != null
        ? winningHit(String(h.team ?? ''), String(h.name), num0(h.inning), h.homerun === true, h.hit === true, h.rbis == null ? 1 : num0(h.rbis))
        : null;
    const sum = (list, g, k) => list.reduce((s, p) => s + num0(p?.[g]?.[k]), 0);
    const [oi, ti] = innings(game, ourHome);
    return new GameFacts({
      ourHits: sum(ours, 'batting', 'hits'),
      theirHits: theirs ? sum(theirs, 'batting', 'hits') : null,
      ourHomeruns: sum(ours, 'batting', 'homeruns'),
      ourErrors: sum(ours, 'batting', 'errors'),
      ourSteals: sum(ours, 'batting', 'stolenBases'),
      ourPitchers: ours
        .map((p) => {
          const outs = num0(p?.pitching?.inningsPitched);
          return outs <= 0 ? null : { name: p.name ?? '', outs, runs: num0(p?.pitching?.runsAllowed), strikeouts: num0(p?.pitching?.strikeouts) };
        })
        .filter(Boolean)
        .sort((a, b) => b.outs - a.outs),
      batters: ours.map((p) => ({
        name: p.name ?? '',
        hits: num0(p?.batting?.hits),
        hr: num0(p?.batting?.homeruns),
        rbi: num0(p?.batting?.rbis),
        id: Number.isFinite(p.id) ? Math.trunc(p.id) : null,
      })),
      ourInnings: oi,
      theirInnings: ti,
      ourHome,
      walkOff: game.walkOff === true,
      winningHit: hit && hit.team === team ? hit : null,
      theirWinningHit: hit && hit.team !== team ? hit : null,
    });
  }
}

const num0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);

function innings(game, ourHome) {
  const ls = game.lineScore;
  if (!ls || typeof ls !== 'object') return [null, null];
  const ints = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'number').map(Math.trunc) : []);
  const home = ints(ls.home);
  const away = ints(ls.away);
  if (!home.length && !away.length) return [null, null];
  return ourHome ? [home, away] : [away, home];
}

/** 決勝打。`what` は「本塁打」「適時打」「勝ち越しの打点」 */
export function winningHit(team, name, inning, homerun, hit, rbis) {
  return { team, name, inning, homerun, hit, rbis, what: homerun ? '本塁打' : hit ? '適時打' : '勝ち越しの打点' };
}

/** 1試合の場面（Situation） */
export function situation(me, opp, home, ours, theirs, streak, brokenStreak, rank, facts) {
  return { me, opp, home, ours, theirs, streak, brokenStreak, rank, facts, diff: Math.abs(ours - theirs), place: home ? '本拠地' : '敵地' };
}

/** アウトの数 → 投球回（'prose' は文の中、'box' は成績表の欄） */
export function inningsText(outs, style) {
  const whole = Math.trunc(outs / 3);
  const rest = outs % 3;
  if (style === 'prose') {
    if (rest === 0) return `${whole}回`;
    if (whole === 0) return `${rest}/3回`;
    return `${whole}回${rest}/3`;
  }
  const frac = rest === 1 ? '⅓' : rest === 2 ? '⅔' : '';
  return whole === 0 && frac ? frac : `${whole}${frac}`;
}

export const allowed = (runs) => (runs === 0 ? 'を無失点' : `を${runs}失点`);

export function winHeadline(s, pen) {
  const { me, opp } = s;
  const f = s.facts;
  const ace = f?.ace?.name;
  let pool;
  if (f?.theirHits === 0 && s.theirs === 0 && f.complete)
    pool = [`${ace}、ノーヒットノーラン！`, `快挙 ${ace}が無安打無得点`, `${ace} 歴史的快投 ノーノー達成`, `${ace}、${opp}打線に1本も許さず`];
  else if (f?.theirHits === 0 && s.theirs === 0)
    pool = [`${me}、継投でノーヒットノーラン`, `${me}投手陣 無安打リレーの快挙`, `${opp}打線を無安打に ${me}完璧リレー`];
  else if (f?.walkOff === true) {
    const h = f.winningHit;
    if (h?.homerun === true) pool = [`${h.name}サヨナラ弾！ ${me}劇勝`, `劇的 ${h.name}がサヨナラ本塁打`, `${h.name}、サヨナラアーチで${opp}を沈める`];
    else if (h?.hit === true) pool = [`${h.name}、サヨナラ打 ${me}劇的勝利`, `${h.name}が決めた ${me}サヨナラ勝ち`, `劇的 ${h.name}のサヨナラ打`];
    else pool = [`${me}サヨナラ勝ち ${opp}を振り切る`, `劇的 ${me}がサヨナラ勝ち`, `${me}、${opp}にサヨナラ勝ち`];
  } else if (s.theirs === 0 && f?.complete === true)
    pool = [`${ace}完封 ${me}が${opp}を零封`, `${ace}、圧巻の完封劇`, `${ace}が${opp}打線を封じる 完封勝利`, `${ace} 最後まで投げ抜き無失点`, `完封 ${ace}が${opp}を寄せ付けず`];
  else if (s.theirs === 0) pool = [`${me}、完封リレーで${opp}を零封`, `${me}投手陣 零封リレー`, `${me}、${opp}に得点許さず完封勝ち`, `鉄壁 ${me}が完封勝利`];
  else if (s.brokenStreak >= 3)
    pool = [`${me}、連敗を${s.brokenStreak}で止める`, `${me}ようやく白星 連敗ストップ`, `待望の勝利 ${me}が連敗脱出`, `${me}、${opp}を下し連敗に終止符`];
  else if (f != null && f.trailed && f.maxDeficit >= 3)
    pool = [`${me}、${f.maxDeficit}点差をひっくり返す`, `${me}大逆転勝ち ${f.maxDeficit}点差を跳ね返す`, `${me}執念の大逆転 ${opp}を下す`];
  else if (f != null && f.trailed && s.diff <= 3)
    pool = [
      `${me}逆転勝ち ${opp}を下す`,
      `${me}、逆転で${opp}を破る`,
      `${me}粘って逆転勝利`,
      (f.winningHit?.inning ?? 0) >= 7 ? `${me}、終盤に${opp}を逆転` : `${me}が逆転で白星`,
    ];
  else if (s.ours >= 10 || s.diff >= 7)
    pool = [`${me}打線爆発 ${s.ours}点大勝`, `${me}、${s.ours}得点の猛攻`, `${me}打線が大爆発 ${opp}を圧倒`, `${s.ours}点 ${me}が${opp}に大勝`, `${me}止まらぬ猛打 ${s.ours}-${s.theirs}`];
  else if (f?.multiHomer != null) {
    const b = f.multiHomer;
    pool = [`${b.name}${b.hr}発 ${me}快勝`, `${b.name}、${b.hr}本塁打の大暴れ`, `${b.name}が${b.hr}発 ${opp}を沈める`];
  } else if ((f?.ourHomeruns ?? 0) >= 3)
    pool = [`${me}${f.ourHomeruns}発の一発攻勢`, `${me}、アーチ${f.ourHomeruns}本で${opp}を圧倒`, `${me}一発攻勢 ${f.ourHomeruns}本塁打で快勝`];
  else if (s.diff === 1) pool = [`${me}、接戦を制す`, `${me}1点差を逃げ切る`, `${me}競り勝つ ${opp}を振り切る`, `しびれる1点差 ${me}に軍配`, `${me}、執念の1点差勝利`];
  else if (s.streak >= 5) pool = [`${me}破竹の${s.streak}連勝`, `${me}止まらない${s.streak}連勝`, `${s.streak}連勝 ${me}の勢い本物`];
  else if (s.streak >= 3)
    pool = [`${me}止まらない${s.streak}連勝`, `${me}${s.streak}連勝 勢い止まらず`, `${me}、${opp}も下して${s.streak}連勝`, `${me}波に乗る${s.streak}連勝`];
  else if ((f?.ace?.strikeouts ?? 0) >= 10)
    pool = [`${ace}${f.ace.strikeouts}奪三振 ${me}快勝`, `${ace}、三振の山 ${f.ace.strikeouts}奪三振`, `奪三振ショー ${ace}が${opp}を圧倒`];
  else if (f?.complete === true) pool = [`${ace}完投 ${me}勝利`, `${ace}、1人で投げ抜く`, `${ace}が完投勝利 ${opp}を下す`];
  else if ((f?.ourHits ?? 0) >= 15) pool = [`${me}${f.ourHits}安打の猛攻`, `${me}、${f.ourHits}安打で${opp}を圧倒`];
  else if ((f?.ourSteals ?? 0) >= 3) pool = [`${me}足でかき回す ${f.ourSteals}盗塁`, `${me}、機動力で${opp}を翻弄`];
  else if (s.rank === 1) pool = [`${me}、首位がっちり`, `首位${me}また勝った`, `${me}首位固め ${opp}を下す`];
  else
    pool = [
      `${me}快勝 ${opp}を下す`,
      `${me}、${opp}に勝利`,
      `${me}白星 ${opp}を退ける`,
      `${me}投打かみ合い勝利`,
      `${me}、${opp}戦を制す`,
      `${me}が${s.place}で白星`,
      `${me}、${opp}を破る`,
    ];
  return pen.pick(pool, 1);
}

export function loseHeadline(s, pen) {
  const { me, opp } = s;
  const f = s.facts;
  let pool;
  if (f?.ourHits === 0 && s.ours === 0) pool = [`${me}、ノーヒットノーラン食らう`, `${me}打線沈黙 無安打無得点`, `屈辱 ${me}が無安打無得点`];
  else if (f?.ourHits === 0) pool = [`${me}、無安打に抑えられる`, `${me}打線 ヒット1本も出ず`];
  else if (s.ours === 0)
    pool = [`${me}、零封負け`, `${me}打線沈黙 ${opp}に完封される`, `${me}あと1本が出ず 零敗`, `${me}、${opp}投手陣を打てず`, `${me}ゼロ行進 ${opp}に零封`];
  else if (f?.walkOff === true) {
    const h = f.theirWinningHit;
    if (h?.homerun === true) pool = [`${me}、${h.name}にサヨナラ弾浴びる`, `${me}痛恨のサヨナラ負け`, `${me}、${opp}にサヨナラ負け`];
    else if (h?.hit === true) pool = [`${me}、${h.name}にサヨナラ打浴びる`, `${me}痛恨のサヨナラ負け`, `${me}、${opp}にサヨナラ負け`];
    else pool = [`${me}、サヨナラ負け`, `${me}痛恨のサヨナラ負け`, `${opp}にサヨナラ許す ${me}`];
  } else if (s.brokenStreak >= 3) pool = [`${me}、連勝${s.brokenStreak}でストップ`, `${me}の連勝止まる ${opp}に敗れる`, `${opp}が${me}の連勝を止める`];
  else if (s.diff >= 7 || s.theirs >= 10)
    pool = [`${me}投壊 ${s.theirs}失点の大敗`, `${me}、${opp}に大敗`, `${me}投手陣火だるま ${s.theirs}失点`, `${me}、${opp}打線を止められず`, `${me}大敗 ${s.ours}-${s.theirs}`];
  else if (f != null && f.led && s.diff <= 3) pool = [`${me}逆転負け ${opp}に屈す`, `${me}、リード守れず逆転負け`, `${me}痛い逆転負け`];
  else if ((f?.ourErrors ?? 0) >= 2) pool = [`${me}守乱で自滅`, `痛恨の${f.ourErrors}失策 ${me}敗れる`, `${me}、守りのミスから崩れる`];
  else if ((f?.ourHits ?? 0) >= 10) pool = [`${me}${f.ourHits}安打も実らず`, `${me}拙攻 好機生かせず`, `${me}、打っても届かず`];
  else if (s.diff === 1) pool = [`${me}あと一歩 惜敗`, `${me}、1点に泣く`, `${me}競り負ける ${opp}に惜敗`, `惜しくも1点差 ${me}敗れる`, `${me}、あと1点が遠く`];
  else if (s.streak >= 5) pool = [`${me}泥沼の${s.streak}連敗`, `${me}${s.streak}連敗 トンネル抜けず`, `${me}止まらぬ連敗 ${s.streak}に`];
  else if (s.streak >= 3) pool = [`${me}${s.streak}連敗 出口見えず`, `${me}、${opp}にも敗れ${s.streak}連敗`, `${me}${s.streak}連敗 トンネル続く`];
  else pool = [`${me}、${opp}に屈す`, `${me}黒星 ${opp}に敗れる`, `${me}、${opp}戦を落とす`, `${me}反撃及ばず`, `${me}、悔しい敗戦`, `${me}が${s.place}で黒星`];
  return pen.pick(pool, 1);
}

export const drawHeadline = (s, pen) =>
  pen.pick([`${s.me}、${s.opp}と痛み分け`, `${s.me}決着つかず ドロー`, `${s.me}、${s.opp}と引き分け`, `勝ち切れず ${s.me}ドロー`, `${s.me}と${s.opp}、譲らず`], 1);

/** 小見出し（その日の主役）。試合の詳細が無ければ null */
export function heroSubhead(s, tone, pen) {
  const won = tone === TONE.Win;
  const lost = tone === TONE.Lose;
  const f = s.facts;
  if (!f) return null;
  const b = f.topBatter;
  const p = f.ace;
  const pitcherDay =
    p != null && won && ((f.theirHits === 0 && s.theirs === 0) || (f.complete && s.theirs <= 1) || p.strikeouts >= 10) && (b == null || b.hr < 2);
  if (pitcherDay) {
    const line = `${inningsText(p.outs, 'prose')}${allowed(p.runs)}${p.strikeouts >= 7 ? `・${p.strikeouts}奪三振` : ''}`;
    return pen.pick([`${p.name} ${line}の快投`, `${p.name}、${line}`, `投げては${p.name}が${line}`], 2);
  }
  if (b != null && (b.hr > 0 || b.rbi >= 3 || b.hits >= 3)) {
    const parts = [b.hits > 0 ? `${b.hits}安打` : null, b.hr > 0 ? `${b.hr}本塁打` : null, b.rbi > 0 ? `${b.rbi}打点` : null].filter(Boolean).join('・');
    let pool;
    if (lost && b.hits >= 3) pool = [`${b.name} ${parts}も孤軍奮闘`, `${b.name}、意地の${parts}`, `${b.name}気を吐く ${parts}`];
    else if (lost) pool = [`${b.name} ${parts}も実らず`, `${b.name}、意地の一打`];
    else if (!won) pool = [`${b.name} ${parts}`, `${b.name}、${parts}の活躍`];
    else if (b.hr >= 2) pool = [`${b.name} ${parts}の大暴れ`, `${b.name}、1試合${b.hr}発`, `主役は${b.name} ${parts}`];
    else if (b.hits >= 4) pool = [`${b.name} ${b.hits}安打の固め打ち`, `${b.name}、${parts}の大当たり`, `${b.name}止まらない ${parts}`];
    else if (b.hits >= 3) pool = [`${b.name} 猛打賞（${parts}）`, `${b.name}、${parts}の活躍`, `${b.name}が猛打賞`];
    else if (b.hr >= 1 && b.rbi >= 3) pool = [`${b.name} 一発含む${b.rbi}打点`, `${b.name}、${parts}で勝利に貢献`, `${b.name}の一発が効く`];
    else if (b.rbi >= 3) pool = [`${b.name} ${b.rbi}打点の活躍`, `${b.name}、勝負強く${b.rbi}打点`, `${b.name}がチャンスで決める`];
    else pool = [`${b.name}に一発`, `${b.name}、${parts}`, `${b.name}のアーチ`];
    return pen.pick(pool, 2);
  }
  if (p != null && p.outs >= 15) {
    const line = `${inningsText(p.outs, 'prose')}${allowed(p.runs)}`;
    return lost
      ? pen.pick([`${p.name} ${line}も援護なく`, `${p.name}、${line}の力投報われず`, `${p.name}が${line}`], 2)
      : pen.pick([`${p.name} ${line}の好投`, `${p.name}、${line}で試合をつくる`, `${p.name}が${line}`], 2);
  }
  return null;
}

/** リード文（1文目＝結果、2文目＝勝敗と順位、3文目＝打線か投手のひと言） */
export function gameLead(s, dateText, tone, record, pen) {
  const score = `${s.ours}-${s.theirs}`;
  const on = dateText != null ? `${dateText}、` : '';
  const of = dateText != null ? `${dateText}の` : '';
  let first;
  if (tone === TONE.Win)
    first = pen.pick(
      [
        `${on}${s.me}は${s.place}で${s.opp}と対戦し、${score}で勝利した。`,
        `${s.me}が${s.place}で${s.opp}を${score}で破った。`,
        `${of}${s.opp}戦、${s.me}は${score}で白星を挙げた。`,
        `${s.me}は${s.opp}に${score}で勝ち、星を一つ伸ばした。`,
      ],
      3,
    );
  else if (tone === TONE.Lose)
    first = pen.pick(
      [
        `${on}${s.me}は${s.place}で${s.opp}と対戦し、${score}で敗れた。`,
        `${s.me}は${s.place}で${s.opp}に${score}で敗れた。`,
        `${of}${s.opp}戦、${s.me}は${score}で星を落とした。`,
        `${s.me}は${s.opp}に${score}で屈した。`,
      ],
      3,
    );
  else first = `${on}${s.me}は${s.place}で${s.opp}と対戦し、${score}で引き分けた。`;
  const f = s.facts;
  let decisive = null;
  if (f != null && tone === TONE.Win && f.winningHit != null) {
    const h = f.winningHit;
    decisive = f.walkOff
      ? `${h.inning}回裏、${h.name}の${h.what}で試合を決めた。`
      : pen.pick([`${h.inning}回に${h.name}の${h.what}で勝ち越した。`, `決勝点は${h.inning}回、${h.name}の${h.what}。`], 12);
  } else if (f != null && tone === TONE.Lose && f.theirWinningHit != null) {
    const h = f.theirWinningHit;
    decisive = pen.pick([`${h.inning}回に${h.name}の${h.what}で勝ち越された。`, `${h.inning}回、${h.name}に決勝の${h.what}を許した。`], 12);
  }
  let color = null;
  if (f != null) {
    if (tone === TONE.Win && f.ourHits >= 10) color = pen.pick([`打線は${f.ourHits}安打と振れていた。`, `${f.ourHits}安打を放った打線が試合を決めた。`], 4);
    else if (tone === TONE.Win && f.ourPitchers.length >= 3)
      color = pen.pick([`投手陣は${f.ourPitchers.length}人の継投でつないだ。`, `${f.ourPitchers.length}投手の継投が実った。`], 4);
    else if (tone === TONE.Lose && f.ourHits === 0) color = '打線は無安打に抑えられた。';
    else if (tone === TONE.Lose && f.ourHits <= 3) color = pen.pick([`打線はわずか${f.ourHits}安打に抑えられた。`, `散発${f.ourHits}安打では勝てなかった。`], 4);
    else if (tone === TONE.Lose && f.ourErrors >= 1) color = pen.pick([`守りの${f.ourErrors}失策も響いた。`, `${f.ourErrors}失策が痛かった。`], 4);
    else if (f.ourSteals >= 2) color = `足を使った攻め（${f.ourSteals}盗塁）も見せた。`;
  }
  return [first, decisive, record, color].filter((x) => x != null).join('');
}

/** 試合の無い時期の大見出しとリード */
export function phaseCopy(phase, pendingPack, preseason, me, pen) {
  let heads;
  let leads;
  if (pendingPack || phase === 'pack_select') {
    heads = [`${me}始動 初期メンバー選びへ`, `新球団${me}、24人の顔ぶれは`, `${me}誕生 まずはメンバー選び`];
    leads = ['新リーグの幕開け。まずは24人の顔ぶれを決めるところから始まる。', 'どのセットを選ぶかで、球団の色が決まる。悩みどころだ。'];
  } else if (phase === 'initial_tryout') {
    heads = [`${me}、初期編成で戦力を整える`, `${me}補強へ 足りない所を埋める`];
    leads = ['開幕前の最後の補強。足りない位置を埋めておきたい。'];
  } else if (phase === 'camp') {
    heads = [`${me}、春季キャンプで鍛錬`, `${me}キャンプイン 若手に期待`, `球春到来 ${me}が始動`, `${me}、汗を流す春`];
    leads = [
      '開幕を前に、選手たちは汗を流している。誰が伸びるかは練習の選び方次第だ。',
      'キャンプは1クールずつ。伸びた能力を見ながら次の練習を決めたい。',
      '本人の希望と噛み合う練習ほど身につく。首脳陣の腕の見せどころだ。',
    ];
  } else if (phase === 'contract') {
    heads = [`${me}、契約更改の季節`, `${me}ストーブリーグ 誰を残すか`, `${me}、来季へ向けて編成に着手`];
    leads = ['シーズンが終わり、来季の陣容を考える時期に入った。', '残す選手、手放す選手。オフの決断が来季を左右する。'];
  } else if (phase === 'tryout') {
    heads = [`${me}、トライアウトで新戦力探し`, `${me}補強へ トライアウトに注目`, `掘り出し物は居るか ${me}がトライアウトへ`];
    leads = ['新しい顔ぶれを探すトライアウト。他球団との取り合いになる。', 'どの選手を何番目に狙うか。希望順の付け方が勝負だ。'];
  } else if (phase === 'offseason') {
    heads = [`${me}、新シーズンへ`, `${me}、新たな1年が始まる`, `${me}来季へ再出発`];
    leads = ['年度が替わり、新しいシーズンの準備が始まる。'];
  } else if (preseason) {
    heads = [`開幕へ ${me}準備着々`, `${me}、開幕を待つ`, `いよいよ開幕 ${me}の戦いが始まる`];
    leads = ['開幕に向けて、スタメンと投手起用を整えておきたい。'];
  } else {
    heads = [`${me}、次の戦いへ`, `${me}、次戦に備える`];
    leads = [];
  }
  return [pen.pick(heads, 1), leads.length ? pen.pick(leads, 3) : null];
}

/** 「順位の行方」の見出しと本文 */
export function standingsCopy({ me, rankIndex, size, top, topRecord, second, gapToSecond, gapToSecondValue, behind, behindValue, leagueName, placeText, pen }) {
  let pool;
  if (rankIndex === 0 && gapToSecondValue === 0)
    pool = [
      [`${me}、${second}と首位に並ぶ`, `${second}とゲーム差なしで${leagueName}の首位を争っている。`],
      [`首位争い ${me}と${second}が並ぶ`, `${me}と${second}がゲーム差なしで並ぶ大混戦だ。`],
    ];
  else if (rankIndex > 0 && behindValue === 0)
    pool = [
      [`${me}、首位${top}と並ぶ`, `首位の${top}（${topRecord}）とゲーム差なし。抜け出せるか。`],
      [`${me}首位タイ`, `${top}とゲーム差なしで並んでいる。`],
    ];
  else if (rankIndex === 0 && gapToSecondValue != null && gapToSecondValue >= 5)
    pool = [
      [`${me}独走 2位に${gapToSecond}差`, `2位の${second}に${gapToSecond}ゲーム差をつけ、${leagueName}の首位を独走している。`],
      [`${me}、首位を快走`, `2位の${second}とは${gapToSecond}差。このまま逃げ切れるか。`],
    ];
  else if (rankIndex === 0 && gapToSecondValue != null && gapToSecondValue <= 1)
    pool = [
      [`首位${me}、${second}が${gapToSecond}差で追う`, `首位に立つが、2位の${second}とは${gapToSecond}差。気の抜けない争いが続く。`],
      [`首位攻防 ${me}と${second}が競る`, `${me}が首位、${second}が${gapToSecond}差で続く混戦だ。`],
    ];
  else if (rankIndex === 0)
    pool = [
      [`${me}が首位を走る`, `2位の${second ?? '-'}とは${gapToSecond ?? '-'}差。`],
      [`${me}、首位をキープ`, `${leagueName}の首位を守っている。2位${second ?? '-'}とは${gapToSecond ?? '-'}差。`],
    ];
  else if (behindValue != null && behindValue <= 1.5)
    pool = [
      [`首位まで${behind}差 ${me}射程圏`, `首位の${top}（${topRecord}）とは${behind}差。逆転も見えてきた。`],
      [`${me}、首位${top}を追う`, `${top}とのゲーム差は${behind}。直接対決が鍵になる。`],
    ];
  else if (rankIndex === size - 1 && size > 1)
    pool = [
      [`${me}最下位 巻き返しへ`, `${top}が${topRecord}で首位。${me}は${placeText}と苦しいが、まだ挽回の機会はある。`],
      [`${me}、浮上のきっかけを`, `今は${placeText}。連勝で流れを変えたい。`],
    ];
  else
    pool = [
      [`首位は${top}`, `${top}が${topRecord}で${leagueName}を引っ張る。${me}は${placeText}。`],
      [`${top}が首位を快走`, `${me}は${placeText}。上位との差を詰められるか。`],
      [`${me}、上位をうかがう`, `首位は${top}（${topRecord}）。${me}は${placeText}。`],
    ];
  return pen.pick(pool, 5);
}

export const leaderTitle = (name, label, rank, pen) =>
  pen.pick(
    rank === 1
      ? [`${name}、${label}トップ`, `${name}が${label}で首位`, `${label}争い ${name}が先頭`, `${name}、${label}の頂点に`]
      : [`${name}、${label}${rank}位`, `${name}が${label}${rank}位 上位うかがう`, `${label}争い ${name}が${rank}位につける`],
    6,
  );

export function benchTitle(hot, tired, me, pen) {
  if (hot != null) return pen.pick([`${hot}が絶好調`, `${hot}、好調キープ`, `乗ってる${hot}`, `${hot}の調子が上向き`], 7);
  if (tired != null) return pen.pick([`${tired}に疲れ`, `${tired}お疲れ気味 休養も`, `${tired}、疲労の色`], 7);
  return pen.pick([`${me}の話題`, `${me}こぼれ話`], 7);
}

export const nextGameTitle = (opp, home, pen) =>
  pen.pick(
    home
      ? [`次は${opp}戦（本拠地）`, `本拠地で${opp}を迎え撃つ`, `次戦は本拠地で${opp}と`, `${opp}を迎えて`]
      : [`次は${opp}戦（敵地）`, `敵地で${opp}と対戦`, `次戦は敵地で${opp}と`, `${opp}の本拠地に乗り込む`],
    8,
  );
