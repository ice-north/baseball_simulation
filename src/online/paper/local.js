// ============================================================
// 地元紙の記事・指導者の記事・年代記の文（アプリ `FrontPageLocal.kt`・`StaffNews.kt`・`Chronicle.kt` の写し）。
// ⚠ 文を変えるときはアプリと両方を直すこと（`kt.js` の先頭）。
// ============================================================
import { Pen, roundKt, idiv, rate3, maxBy, sortByDesc, joinNN, list, obj, int, str } from './kt.js';
import { TONE } from './copy.js';
import { dayKey, sameDate } from './paperView.js';

export const LINK_LINEUP = 'lineup';
export const LINK_GAMES = 'games';
export const LINK_TIPS = 'tips';

export const article = (kicker, title, body, link = null) => ({ kicker, title, body, link });

/** 地元紙の題字（「宮崎球報」）。⚠ 実在の新聞の名前に寄せない */
export const localTitle = (city) => `${city}球報`;

function era2(v) {
  const r = roundKt(v * 100);
  return `${idiv(r, 100)}.${String(r % 100).padStart(2, '0')}`;
}

/** 直近の試合で当たっている（12打数以上で4割以上） */
export const hotRecent = (r) => r != null && r.atBats >= 12 && r.hits * 1000 >= r.atBats * 400;
/** 直近の試合で当たりが止まっている（15打数以上で2安打以下） */
export const coldRecent = (r) => r != null && r.atBats >= 15 && r.hits <= 2;

const ints = (v) => list(v).map(int).filter((x) => x != null);

/** 回ごとの得点の表（記録に無ければ null） */
export function lineScoreOf(game, view) {
  const ls = obj(game.lineScore);
  if (!ls) return null;
  const away = ints(ls.away);
  const home = ints(ls.home);
  if (!away.length) return null;
  return {
    away: view.teamShort(str(game.away) ?? ''),
    home: view.teamShort(str(game.home) ?? ''),
    awayRuns: away,
    homeRuns: home,
    walkOff: game.walkOff === true,
  };
}

const idOf = (v) => int(v);

/** 試合の詳細から、その投手の球団 */
function pitcherTeam(game, id) {
  if (id == null) return null;
  const teams = obj(game.teams);
  if (!teams) return null;
  const hit = Object.entries(teams).find(([, players]) => list(players).some((p) => idOf(p?.id) === id));
  return hit ? hit[0] : null;
}

/**
 * 勝敗投手と本塁打の欄。自球団の選手は今季の数（「3勝1敗」「5号」）、他球団の選手は球団名を添える。
 * @returns {[string, string][]}
 */
export function boxLines(view, game, team, decisions) {
  const own = new Map(view.roster.map((p) => [p.id, p]));
  const pitcher = (ref, mark) => {
    const name = ref?.name;
    if (name == null) return null;
    const p = ref.id != null ? own.get(ref.id) : undefined;
    const st = p?.seasonStats?.pitching;
    let tail = null;
    if (p != null) {
      if (mark === 'S') tail = st && st.saves > 0 ? `${st.saves}S` : null;
      else tail = st ? `${st.wins}勝${st.losses}敗${st.saves > 0 ? `${st.saves}S` : ''}` : null;
    }
    let whose = null;
    if (p == null && game) {
      const t = pitcherTeam(game, ref.id);
      whose = t != null ? `（${view.teamShort(t)}）` : null;
    }
    return [mark, joinNN([name + (whose ?? ''), tail], ' ')];
  };
  const out = [
    pitcher(decisions?.winningPitcher, '勝'),
    pitcher(decisions?.savePitcher, 'S'),
    pitcher(decisions?.losingPitcher, '敗'),
  ].filter(Boolean);
  const teams = obj(game?.teams);
  const homers = teams
    ? Object.entries(teams).flatMap(([name, players]) =>
        list(players)
          .map(obj)
          .filter(Boolean)
          .map((p) => {
            const hr = int(p.batting?.homeruns) ?? 0;
            if (hr <= 0) return null;
            const id = idOf(p.id);
            const label = str(p.name) ?? '';
            if (name === team) {
              const total = id != null ? own.get(id)?.seasonStats?.batting?.homeruns : null;
              if (total != null && total >= hr) {
                const nums = [];
                for (let k = total - hr + 1; k <= total; k++) nums.push(k);
                return `${label} ${nums.join('・')}号`;
              }
              return label;
            }
            return `${label}（${view.teamShort(name)}）`;
          })
          .filter((x) => x != null),
      )
    : [];
  if (homers.length) out.push(['本', homers.join('、')]);
  return out;
}

/** 記事の文に入れる守備位置（「三塁手」「外野手」） */
export function positionNoun(pos) {
  switch (pos) {
    case 'pitcher':
      return '投手';
    case 'catcher':
      return '捕手';
    case 'first':
      return '一塁手';
    case 'second':
      return '二塁手';
    case 'third':
      return '三塁手';
    case 'short':
      return '遊撃手';
    case 'left':
    case 'center':
    case 'right':
      return '外野手';
    default:
      return '選手';
  }
}

const metrics = (p) => p.performance?.batting?.metrics ?? null;

/** 次の相手の警戒選手。打席の少ない時期（20打席未満）は書かない */
export function warningArticle(opp, roster, starter, pen) {
  const bats = roster.filter((p) => p.isActive && !p.isPitcher && (metrics(p)?.pa ?? 0) >= 20);
  const top = maxBy(bats, (p) => metrics(p)?.ops ?? 0.0);
  if (!top) return null;
  const m = metrics(top);
  const parts = [];
  parts.push(
    pen.pick(
      [
        `打率${rate3(m.avg)}、${m.homeruns}本塁打の${top.name}が${opp}打線の中心だ。`,
        `${opp}でいちばん怖いのは${top.name}。打率${rate3(m.avg)}、${m.homeruns}本塁打を記録している。`,
      ],
      16,
    ),
  );
  const r = top.recent;
  if (r) {
    if (hotRecent(r)) parts.push(`ここ${r.games}試合も${r.atBats}打数${r.hits}安打と当たっている。`);
    else if (r.hitStreak >= 5) parts.push(`${r.hitStreak}試合連続安打中と勢いもある。`);
  }
  const rest = bats.filter((p) => p !== top);
  const hot = maxBy(rest.filter((p) => hotRecent(p.recent)), (p) => p.recent.hits);
  let second = hot ? `${hot.name}も最近${hot.recent.games}試合で${hot.recent.hits}安打と好調。` : null;
  if (second == null) {
    const fast = maxBy(rest.filter((p) => (metrics(p)?.stolenBases ?? 0) >= 8), (p) => metrics(p).stolenBases);
    if (fast) second = `足の${fast.name}（${metrics(fast).stolenBases}盗塁）にも気をつけたい。`;
  }
  if (second != null) parts.push(second);
  if (starter?.name != null && starter.era != null && starter.era < 2.5 && starter.wins + starter.losses >= 3) {
    parts.push(`先発予想の${starter.name}も防御率${era2(starter.era)}と好調で、簡単には打てない。`);
  }
  return article(
    '警戒警報',
    pen.pick([`${opp}の${top.name}に要注意`, `警戒すべきは${top.name}`, `${top.name}を抑えられるか`, `${opp}打線のカギは${top.name}`], 17),
    parts.join(''),
    LINK_LINEUP,
  );
}

/** 監督の試合後のひと言（場面と気質で選ぶ。2面の一問一答でも使う） */
export function managerQuote(tone, s, pen, temper = 0) {
  const f = s.facts;
  let pool;
  if (tone === TONE.Win) {
    if (f?.walkOff === true) pool = ['最後まで諦めなかった選手たちのおかげ', 'ベンチもスタンドも一つになった', 'しびれる試合を、よく勝ち切ってくれた'];
    else if (f?.trailed === true) pool = ['よく追いついて、ひっくり返してくれた', '負けている展開でも下を向かなかった', '粘り強さが出た試合だった'];
    else if (s.theirs === 0) pool = ['投手陣が本当によく投げた', '守りからリズムをつくれた', 'バッテリーに尽きる'];
    else if (s.diff >= 5) pool = ['打線がよくつながった', '今日は打つべき人が打った', 'この勢いを続けたい'];
    else if (s.diff === 1) pool = ['苦しい試合をものにできた', 'こういう試合を拾えるのは大きい', '最後までよく守り切った'];
    else if (s.streak >= 3) pool = ['連勝は意識せず、一つずつ', 'いい流れで戦えている', '選手が自信を持ってやれている'];
    else pool = ['投打がかみ合った', 'いい形で勝てた', '次もこの形で戦いたい'];
  } else if (tone === TONE.Lose) {
    if (temper >= 1 && s.diff >= 3)
      pool = [s.ours <= 1 ? '打つ方がこれでは勝てない' : '投手陣は猛省しないといけない', 'こんな試合をしていては駄目だ', '全員が反省すべき内容だった'];
    else if (temper <= -1 && (s.diff >= 3 || s.streak >= 3)) pool = ['こういう日もある。選手を信じる', '焦る必要はない。やってきたことを続ける', '下を向く必要はない'];
    else if (f?.walkOff === true) pool = ['あと一歩だった。切り替える', '悔しいが、明日がある', '最後に踏ん張れなかった'];
    else if (s.ours === 0) pool = ['相手投手が良かった。次は打つ', '1点が遠かった', '打線のてこ入れも考える'];
    else if (s.diff >= 5) pool = ['完敗。すぐに立て直す', '今日は相手が上だった', '投手陣の踏ん張りが足りなかった'];
    else if (s.diff === 1) pool = ['あと1本が出なかった', '紙一重の試合だった', '勝ち切れなかったのは監督の責任'];
    else if (s.streak >= 3) pool = ['連敗は気にしない。やることをやるだけ', '流れを変える一打が欲しい', '必ず抜け出す'];
    else pool = ['切り替えて次に臨む', '反省して、また明日', '取れる点を取れなかった'];
  } else if (tone === TONE.Draw) pool = ['勝ち切れなかったのは悔しい', '負けなかったことを前向きに捉える', '痛み分け。次に生かす'];
  else return null;
  return pen.pick(pool, 18);
}

/** 試合後のひと言（監督と主役）。決まり文句から場面で選ぶ */
export function commentArticle(manager, tone, s, pen, temper = 0) {
  const boss = manager != null ? `${manager}監督` : '監督';
  const f = s.facts;
  const quote = managerQuote(tone, s, pen, temper);
  if (quote == null) return null;
  const tb = f?.topBatter;
  const hero =
    (tone === TONE.Win ? f?.winningHit?.name : null) ??
    (tb && (tb.hr > 0 || tb.rbi >= 2 || tb.hits >= 3) ? tb.name : null) ??
    (f?.ace && f.ace.outs >= 18 ? f.ace.name : null);
  let heroLine = null;
  if (hero != null) {
    const pitcher = f?.ace?.name === hero && f.topBatter?.name !== hero;
    let pool;
    if (tone === TONE.Win && pitcher) pool = ['「捕手のリードのおかげです」', '「野手に助けてもらいました」', '「次も長い回を投げたい」'];
    else if (tone === TONE.Win) pool = ['「チームの勝ちに貢献できてうれしい」', '「打ったのは甘い球。しっかり振れた」', '「次の試合も打てるよう準備します」'];
    else if (pitcher) pool = ['「粘り切れず悔しい」', '「次は勝ちにつながる投球を」'];
    else pool = ['「勝ちにつながらず悔しい」', '「明日こそ勝てるように」'];
    heroLine = `${hero}は${pen.pick(pool, 19)}と${tone === TONE.Win ? '笑顔を見せた' : '前を向いた'}。`;
  }
  return article('ひと言', `${boss}「${quote}」`, heroLine ?? `${boss}は試合後、そう振り返った。`, null);
}

/** 光る能力の一言（スカウトが見ている所）。無ければ null */
function scoutTrait(p) {
  if (p.isPitcher) {
    const v = p.pitching?.velocity ?? 0;
    const c = p.pitching?.control ?? 0;
    if (v >= 150) return { trait: `最速${v}kmの直球`, score: v - 140 };
    if (c >= 75) return { trait: '精密な制球', score: c - 65 };
    if (v >= 147) return { trait: `${v}kmの速球`, score: v - 142 };
    return null;
  }
  const pw = p.batting?.power ?? 0;
  const sp = p.physical?.speed ?? 0;
  const mt = p.batting?.meet ?? 0;
  if (pw >= 70) return { trait: '長打力', score: pw - 60 };
  if (sp >= 80) return { trait: '足の速さ', score: sp - 70 };
  if (mt >= 75) return { trait: '巧みなバットコントロール', score: mt - 65 };
  return null;
}

/** ドラフトの気配の1人（サーバーの `proWatch` の行）。形が崩れていれば null */
export function watchRow(o) {
  const r = obj(o);
  if (!r) return null;
  const name = str(r.name);
  const npb = str(r.npb);
  if (name == null || npb == null) return null;
  return { id: int(r.id), name, team: str(r.team) ?? '', npb, hot: str(r.level) === 'hot' };
}

/**
 * プロ注目。
 * - `watch`（サーバーの `proWatch`。ドラフトの気配）があれば**本物**: 自球団で NPB が見ている選手の話
 *   （「西武が○○に熱視線！」「○○に中日が接触」）。きのうの試合で活躍していれば毎日「プロ注目の○○が完封」。
 *   見られている選手がいなければ載せない（飾りの話を混ぜると、札の付いていない選手に「熱視線」が出る）。
 * - `watch` が無い（古いサーバー）ときは飾り: 若くて光る能力のある自球団の選手に、NPBのスカウトが見に来ている。
 * 毎日は載せない（2日に1日くらい。同じ日なら同じ）
 */
export function scoutArticle(roster, me, year, date, pen, watch = null, team = '', facts = null, s = null) {
  if (watch != null) return watchArticle(roster, me, year, date, pen, watch, team, facts, s);
  const picks = roster
    .filter((p) => p.isActive && (p.age ?? 99) <= 26)
    .map((p) => {
      const t = scoutTrait(p);
      return t ? { p, ...t } : null;
    })
    .filter(Boolean);
  if (!picks.length) return null;
  const day = (year ?? 0) * 400 + (date?.month ?? 0) * 31 + (date?.day ?? 0);
  if (!new Pen(day).pick([true, false], 20)) return null;
  const pick = new Pen(day).pick(sortByDesc(picks, (x) => x.score).slice(0, 4), 21);
  const p = pick.p;
  const scouts = Math.min(6, Math.max(1, 1 + idiv(pick.score, 4)));
  const pos = positionNoun(p.position);
  const school = p.origin?.highSchool != null ? `${p.origin.highSchool}出身。` : p.origin?.university != null ? `${p.origin.university}出身。` : '';
  const potential = (p.growthPotential ?? 1.0) >= 1.3 ? '伸びしろも大きく、' : '';
  return article(
    'プロ注目',
    pen.pick(
      [
        `${p.name}に熱視線 NPB${scouts}球団`,
        `プロ注目 ${me}の${p.name}`,
        scouts >= 3 ? `${p.name}の${pick.trait}にスカウト集結` : `${p.name}にスカウトの目`,
      ],
      22,
    ),
    `${p.age}歳の${pos}・${p.name}。${school}${pick.trait}に、NPB${scouts}球団のスカウトが` +
      pen.pick(['ネット裏で目を光らせた。', '視察に訪れた。', '熱心にメモを取っていた。'], 23) +
      `${potential}${pen.pick(['今後の成長が楽しみだ。', 'この先の伸びに注目が集まる。', '独立リーグから羽ばたく日は来るか。'], 24)}`,
    LINK_LINEUP,
  );
}

/** きのうの試合での活躍（「完封」「2発」など）。無ければ null */
function watchFeat(w, facts, s, tone) {
  if (!facts) return null;
  const ace = facts.ace;
  if (tone === TONE.Win && ace != null && ace.name === w.name && facts.complete === true) return s != null && s.theirs === 0 ? '完封' : '完投';
  const b = facts.batters.find((x) => x.name === w.name);
  if (b != null && b.hr >= 2) return `${b.hr}発`;
  if (b != null && b.hr === 1) return '一発';
  if (b != null && b.hits >= 3) return '猛打賞';
  if (tone === TONE.Win && ace != null && ace.name === w.name && ace.outs >= 18 && ace.runs <= 1) return '好投';
  return null;
}

function watchArticle(roster, me, year, date, pen, watch, team, facts, s) {
  const ours = watch.filter((w) => w.team === team);
  if (!ours.length) return null;
  const playerOf = (w) => roster.find((p) => (w.id != null && p.id === w.id) || p.name === w.name) ?? null;
  const tone = s == null ? TONE.None : s.ours > s.theirs ? TONE.Win : s.ours < s.theirs ? TONE.Lose : TONE.Draw;
  // きのう活躍した人がいれば、その話（毎日）
  for (const w of ours) {
    const feat = watchFeat(w, facts, s, tone);
    if (feat == null) continue;
    const p = playerOf(w);
    const pos = p != null ? positionNoun(p.position) : '選手';
    return article(
      'プロ注目',
      pen.pick([`プロ注目の${w.name}が${feat}`, `${w.name}${feat} ${w.npb}のスカウトの前で`], 25),
      `${w.npb}が${w.hot ? '指名の候補に挙げる' : '追いかける'}${pos}・${w.name}が${feat}。` +
        pen.pick(['ネット裏のスカウトは「やはり良いものを持っている」とうなずいた。', 'スカウトの評価をまた一つ上げた。', '視察に訪れたスカウトの前で、存在感を見せつけた。'], 26),
      LINK_LINEUP,
    );
  }
  const day = (year ?? 0) * 400 + (date?.month ?? 0) * 31 + (date?.day ?? 0);
  if (!new Pen(day).pick([true, false], 20)) return null;
  const w = new Pen(day).pick(ours, 21);
  const p = playerOf(w);
  const pos = p != null ? positionNoun(p.position) : '選手';
  const age = p?.age != null ? `${p.age}歳の` : '';
  const trait = (p != null ? scoutTrait(p)?.trait : null) ?? null;
  if (w.hot)
    return article(
      'プロ注目',
      pen.pick([`${w.name}に${w.npb}が接触`, `${w.npb}、${w.name}の調査に本腰`, `${me}の${w.name}、${w.npb}が指名候補に`], 27),
      `${age}${pos}・${w.name}に、${w.npb}のスカウトが接触した。${trait ?? '素質'}を高く買い、指名に向けて調査を進めているという。` +
        pen.pick(['秋のドラフトへ、注目が集まる。', '独立リーグから羽ばたく日は近いか。'], 28),
      LINK_LINEUP,
    );
  return article(
    'プロ注目',
    pen.pick([`${w.npb}が${w.name}に熱視線！`, `プロ注目 ${me}の${w.name}`, `${w.name}の${trait ?? '素質'}に${w.npb}の目`], 29),
    `${age}${pos}・${w.name}。${trait ?? 'その素質'}に、${w.npb}のスカウトが` +
      pen.pick(['ネット裏で目を光らせた。', '視察に訪れた。', '熱心にメモを取っていた。'], 23) +
      pen.pick(['今後の成長が楽しみだ。', 'この先の伸びに注目が集まる。', '独立リーグから羽ばたく日は来るか。'], 24),
    LINK_LINEUP,
  );
}

// ---------------------------------------------------------------------------------------------
// 指導者の記事（StaffNews.kt）

export const ROLE_MANAGER = 'manager';
export const STAFF_ROLE_LABELS = { manager: '監督', pitching: '投手コーチ', batting: '野手コーチ' };

const shortName = (name) => {
  const s = String(name ?? '').split(' ')[0];
  return s.trim() ? s : name;
};
/** 監督（ビューの staff.seats の manager） */
export const staffManager = (staff) => staff?.seats?.find((s) => s.role === 'manager')?.coach ?? null;
const coachShort = (c) => shortName(c.name ?? '');
const trait = (c, key) => c?.traits?.find((t) => t.key === key)?.value ?? 0;

function freshEvents(view, events) {
  if (view.phase?.kind !== 'camp') return [];
  const year = view.year;
  if (year == null) return [];
  return list(events).filter((e) => (e.year ?? 0) === year);
}

function eventHead(e, short) {
  const team = e.team != null ? short(e.team) : '';
  const role = (e.role != null ? STAFF_ROLE_LABELS[e.role] : null) ?? '';
  const name = shortName(e.name ?? '');
  switch (e.kind) {
    case 'fire':
      return `${team}、${name}監督を解任`;
    case 'retire':
      return `${team}・${name}${role}が勇退`;
    case 'resign':
      return `${team}・${name}${role}が辞任`;
    case 'release':
      return `${team}、${name}${role}と別れ`;
    case 'promote':
      return `${team}、${name}が監督に昇格`;
    case 'turn':
      return `${team}の${name}、指導者の道へ`;
    default:
      if (e.mentor != null) return `${name}、恩師${String(e.mentor).split(' ')[0]}監督の下へ`;
      if (e.homecoming && e.role === ROLE_MANAGER) return `${name}、古巣${team}で初の監督`;
      if (e.homecoming) return `${name}が古巣${team}に${role}で戻る`;
      if (e.role === ROLE_MANAGER) return `${team}の新監督に${name}`;
      return `${team}の${role}に${name}`;
  }
}

function weight(e) {
  switch (e.kind) {
    case 'fire':
      return 6;
    case 'retire':
      return e.role === ROLE_MANAGER ? 5 : 2;
    case 'promote':
      return 4;
    case 'hire':
      return (e.role === ROLE_MANAGER ? 3 : 1) + (e.mentor != null || e.homecoming ? 2 : 0);
    case 'resign':
      return 2;
    case 'turn':
      return 1;
    default:
      return 0;
  }
}

/** 地元紙の指導者の記事 */
export function staffLocalArticles(view, me, offPhase, pen) {
  const staff = view.staff;
  if (!staff) return [];
  const out = [];
  const manager = staffManager(staff);
  if (offPhase) {
    const brief = list(view.leagueStaff?.teams).find((t) => t.team === view.teamName)?.manager;
    if (manager != null && brief?.isNew === true && view.phase?.kind === 'camp') {
      const ms = coachShort(manager);
      out.push(
        article(
          '新体制',
          pen.pick([`${ms}新監督、${manager.color ?? ''}を掲げる`, `${me}は${ms}新体制 ${manager.color ?? ''}`], 60),
          `今季から指揮を執る${manager.name ?? ''}監督（${manager.age ?? 0}歳、${manager.origin ?? ''}）。${manager.color ?? ''}が持ち味で、性格は${manager.personality ?? ''}。` +
            (manager.delegation != null ? `コーチへの${manager.delegation}。` : ''),
          LINK_LINEUP,
        ),
      );
    }
    const ours = freshEvents(view, staff.events);
    if (ours.length) {
      const top = maxBy(ours, weight);
      out.push(article('人事', eventHead(top, view.teamShort), ours.map((e) => `${e.text ?? ''}。`).join(''), LINK_LINEUP));
    }
  } else if (list(staff.rifts).length && pen.pick([true, false, false, false], 61)) {
    const rift = pen.pick(staff.rifts, 62);
    out.push(
      article(
        'ベンチの空気',
        rift.role === 'pitching' ? '継投をめぐり首脳陣の意見割れる' : '攻め方をめぐり首脳陣の意見割れる',
        `${rift.text ?? ''}。関係者によると、話し合いは平行線のままだという。`,
        LINK_LINEUP,
      ),
    );
  }
  return out;
}

/** 全国紙の指導者の記事 */
export function staffNationalArticles(view, offPhase, winners) {
  const league = view.leagueStaff;
  if (!league) return [];
  const out = [];
  if (offPhase) {
    const events = sortByDesc(freshEvents(view, league.events), weight);
    if (events.length)
      out.push(article('人事', eventHead(events[0], view.teamShort), events.slice(0, 6).map((e) => `${e.text ?? ''}。`).join(''), LINK_GAMES));
  } else {
    const hit = list(league.teams)
      .filter((t) => winners.has(t.team))
      .map((t) => {
        const m = t.manager;
        return m && (m.totalWins ?? 0) > 0 && m.totalWins % 100 === 0 ? [t, m] : null;
      })
      .find(Boolean);
    if (hit) {
      const [t, m] = hit;
      out.push(
        article(
          '記録',
          `${view.teamShort(t.team)}・${m.shortName ?? ''}監督、通算${m.totalWins}勝`,
          `${view.teamShort(t.team)}の${m.name ?? ''}監督が、監督として通算${m.totalWins}勝に到達した。${m.color ?? ''}で白星を積み重ねてきた。`,
          LINK_GAMES,
        ),
      );
    }
  }
  return out;
}

/** 試合後のひと言の話し手（自球団の監督。いなければ人の呼び名を監督として）と、その人の気質 */
export function commentSpeaker(view) {
  const m = staffManager(view.staff);
  if (m) return [coachShort(m), trait(m, 'temper')];
  const label = view.members.find((x) => x.teamName === view.teamName)?.label;
  const owner = label != null && label.trim() !== '' && !label.startsWith('プレイヤー') ? label : null;
  return [owner, 0];
}

// ---------------------------------------------------------------------------------------------
// 年代記の文（Chronicle.kt）。raceText・worldText は chronicleText.js（PC と同じ文）

/** 裏の大会のうち、いま紙面に載せるもの（同じ年で、その日から120日以内） */
export function recentWorld(view) {
  const d = view.currentDate;
  const year = view.year;
  if (!d || year == null) return [];
  return view.chronicle.world.filter((w) => {
    if (w.year !== year) return false;
    const days = (d.month - w.month) * 30 + (d.day - w.day);
    return days >= 0 && days <= 120;
  });
}

/** その日（date の試合の日）に届いた節目 */
export function milestonesOn(view, date) {
  if (!date || view.year == null) return [];
  const key = dayKey(view.year, date.month, date.day);
  return view.chronicle.milestones.filter((m) => dayKey(m.year, m.month, m.day) === key);
}

export const milestoneBody = (items, short) =>
  items
    .slice(0, 4)
    .map((m) => `${short ? `${short(m.team)}の` : ''}${m.name}が${m.label}`)
    .join('、') +
  'に到達した。' +
  (items.some((m) => m.kind === 'career') ? '通算はこのリーグを始めてからの数。' : '');

export const retiredBody = (items, short) =>
  items
    .slice(0, 3)
    .map((r) => {
      const parts = joinNN([r.seasons > 0 ? `このリーグで${r.seasons}年` : null, r.line != null ? `通算${r.line}` : null], '、');
      return (
        `${short ? `${short(r.team)}の` : ''}${r.name}（${r.age ?? '-'}歳）が現役を退いた。` +
        (parts === '' ? '' : `${parts}。`) +
        (r.secondCareer != null ? `今後は${r.secondCareer}として球界に残る。` : '') +
        (r.hallOfFame ? '殿堂入りの成績を残した。' : '')
      );
    })
    .join('') + (items.length > 3 ? `ほかに${items.length - 3}人がユニフォームを脱いだ。` : '');

// ---------------------------------------------------------------------------------------------
// 継投の理由（ChangeReason.kt）・短信の1行（FrontPageNational.kt）

export const readableChangeReason = (text) =>
  text
    .replace(/\(DP:[^)]*\)/g, '')
    .replaceAll('ダメージ蓄積で降板', '打ち込まれて降板')
    .replace(/球数制限到達\((\d+)\/(\d+)球\)/g, (_, _a, b) => `球数の上限（${b}球）に到達`)
    .replace(/スタミナ限界\((\d+)%\)/g, (_, a) => `スタミナ切れ（残り${a}%）`);

export function winnerOf(g) {
  if (g.homeScore == null || g.awayScore == null) return null;
  if (g.homeScore > g.awayScore) return g.home;
  if (g.awayScore > g.homeScore) return g.away;
  return null;
}
export function loserOf(g) {
  const w = winnerOf(g);
  return w == null ? null : w === g.home ? g.away : g.home;
}

/** 連勝・連敗の添え書き（「宮崎3連勝」）。3つ以上のときだけ */
export function streakNote(view, team) {
  const s = view.teamStreaks[team];
  if (!s || s.count < 3 || s.kind === 'D') return null;
  return `${view.teamShort(team)}${s.count}${s.kind === 'W' ? '連勝' : '連敗'}`;
}

/** 短信の1行（「宮崎 5-3 那覇（宮崎3連勝）」） */
export function shortLine(view, g, latest) {
  const base = `${view.teamShort(g.away)} ${g.awayScore}-${g.homeScore} ${view.teamShort(g.home)}`;
  const w = winnerOf(g);
  const l = loserOf(g);
  const note = latest ? joinNN([w != null ? streakNote(view, w) : null, l != null ? streakNote(view, l) : null], '、') : '';
  return note === '' ? base : `${base}（${note}）`;
}

/** [team] から見た試合の結果（1 勝ち・−1 負け・0 引き分け） */
export function outcomeFor(g, team) {
  const h = g.home === team;
  const a = (h ? g.homeScore : g.awayScore) ?? 0;
  const b = (h ? g.awayScore : g.homeScore) ?? 0;
  return a > b ? 1 : a < b ? -1 : 0;
}

export { sameDate };
