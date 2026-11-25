import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReplayViewer from './ReplayViewer.jsx';
import MobileReplay from './MobileReplay.jsx';
import { useRead } from './useRead.js';
import { useMobile } from './useMobile.js';
import { ShowMore } from './PageNav.jsx';
import { turnLabel } from './shared.js';
import { formatStat } from './statsView.js';
import { ownOutcome, teamShort, teamLabel } from './gameText.js';
import { inOnlineRoot } from './dialogPortal.js';
import { ScoringPlays } from './ScoringPlays.jsx';
import { scoreBoard } from './scoreBoard.js';
import { hasInningPlays, inningPlays } from './gamePlays.js';
import { TeamMark } from './look/Art.jsx';
import { useLook } from './look/LookContext.jsx';
import { hasLivePlays } from './look/playByPlay.js';
import LivePlays from './look/LivePlays.jsx';
const GROUPS = {
  batting: [
    [
      'basic',
      '打撃・基本',
      [
        ['atBats', '打数'],
        ['hits', '安打'],
        ['homeruns', '本'],
        ['rbis', '打点'],
      ],
    ],
    [
      'extra',
      '四死球・三振',
      [
        ['walks', '四球'],
        ['hitByPitch', '死球'],
        ['strikeouts', '三振'],
        ['sacrificeFlies', '犠飛'],
      ],
    ],
    [
      'running',
      '走塁・犠打',
      [
        ['stolenBases', '盗塁'],
        ['caughtStealing', '盗塁死'],
        ['sacrificeBunts', '犠打'],
        ['plateAppearances', '打席'],
      ],
    ],
    [
      'hits',
      '長打・守備',
      [
        ['doubles', '二塁打'],
        ['triples', '三塁打'],
        ['errors', '失策'],
        ['fieldingChances', '守備機会'],
      ],
    ],
  ],
  pitching: [
    [
      'basic',
      '投球・基本',
      [
        ['inningsPitched', '回', 'innings'],
        ['runsAllowed', '失点'],
        ['earnedRuns', '自責'],
        ['strikeouts', '奪三振'],
      ],
    ],
    [
      'allowed',
      '被安打・四死球',
      [
        ['hits', '被安打'],
        ['homeruns', '被本'],
        ['walks', '四球'],
        ['hitBatters', '死球'],
      ],
    ],
    [
      'record',
      '球数・勝敗',
      [
        ['pitches', '球数'],
        ['wins', '勝'],
        ['losses', '敗'],
        ['saves', 'S'],
      ],
    ],
    [
      'other',
      '救援・先発',
      [
        ['holds', 'H'],
        ['gamesStarted', '先発'],
        ['qualityStarts', 'QS'],
        ['highQualityStarts', 'HQS'],
      ],
    ],
  ],
};
export function Panel({ title, close, children, wide = false, mobileReplay = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current,
      trigger = document.activeElement;
    node.showModal();
    return () => {
      if (node.open) node.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const dismiss = () => {
    ref.current.close();
    close();
  };
  // ⚠ 試合結果のカード（`.online-score`）の中から開くので、`.online` の直下へ出す
  //    （`dialogPortal.js`）。カードの grid が観戦リプレイの中まで当たっていた
  return inOnlineRoot(
    <dialog
      ref={ref}
      className={`online-player-dialog online-game-dialog ${wide ? 'online-replay-dialog' : ''} ${mobileReplay ? 'online-mobile-replay-dialog' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
    >
      <header>
        <h2>{title}</h2>
        {!mobileReplay && (
          <button aria-label={`${title}を閉じる`} onClick={dismiss}>
            閉じる
          </button>
        )}
      </header>
      {children}
    </dialog>,
  );
}
function RequestState({ result }) {
  return result.loading ? (
    <p>記録を読み込んでいます…</p>
  ) : result.error ? (
    <div role="alert">
      {result.error}
      <button onClick={result.retry}>再取得</button>
    </div>
  ) : null;
}
// 過去の試合の一覧に最初に出す数と「続きを表示」で足す数（X1。ページ送りはやめた）
const HISTORY_STEP = 6;
/**
 * 記録に載っている項目だけの区分（`knownOnly`）。練習試合の箱は一部の項目しか残さないので、
 * そのまま出すと列の多くが「—」になっていた。どの選手にも無い項目の列を外し、空になった区分も外す
 */
function knownGroups(game) {
  const has = { batting: new Set(), pitching: new Set() };
  for (const rows of Object.values(game.teams || {}))
    for (const p of rows || [])
      for (const category of ['batting', 'pitching'])
        for (const [key, value] of Object.entries(p[category] || {}))
          if (value != null) has[category].add(key);
  return Object.fromEntries(
    Object.entries(GROUPS).map(([category, groups]) => [
      category,
      groups
        .map(([id, label, columns]) => [id, label, columns.filter(([key]) => has[category].has(key))])
        .filter(([, , columns]) => columns.length),
    ]),
  );
}
/**
 * 画面に出た直後に測るための効果。⚠ `useLayoutEffect` は**サーバー描画で警告**が出るので
 * （検査が `renderToString` を使う）、ブラウザのときだけ `useLayoutEffect` を使う。
 */
const useAfterPaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** その区分に出場した選手か（打撃は打席・走塁・守備、投球は投げた選手） */
const appeared = (p, category) =>
  category === 'batting'
    ? (p.batting?.plateAppearances ||
        p.batting?.atBats ||
        p.batting?.walks ||
        p.batting?.hitByPitch ||
        p.batting?.sacrificeBunts ||
        p.battingOrder ||
        p.batting?.stolenBases ||
        p.batting?.caughtStealing ||
        p.batting?.fieldingChances) > 0
    : (p.pitching?.pitches || p.pitching?.inningsPitched) > 0;

export function BoxScore({ game, ownTeam, knownOnly = false }) {
  const groups = knownOnly ? knownGroups(game) : GROUPS;
  // ⚠ **ページを分けず全員を出す**（小窓の中を縦に送る）。以前は PC 12人・スマホ6人で区切って
  //    いて、1試合に出た打者は13〜16人いるので毎回2ページ目ができ、ページ送りは表の下
  //    （1280×800 では小窓の外）にあって、残りの数人が見えないままになっていた。
  //    スマホも 2026-11-25（M1）から全員を出す
  const [wide, setWide] = useState(
    () => window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => {
      setWide(media.matches);
      setGroup(media.matches ? 'overview' : 'basic');
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [team, setTeam] = useState(
      [game.home, game.away].includes(ownTeam) ? ownTeam : game.home,
    ),
    [category, setCategory] = useState('batting'),
    [groupId, setGroup] = useState(() =>
      window.matchMedia('(min-width: 768px)').matches ? 'overview' : 'basic',
    ),
    [sort, setSort] = useState(null);
  const overviewColumns = [
    ...new Map(
      groups[category].flatMap((g) => g[2]).map((c) => [c[0], c]),
    ).values(),
  ];
  const group =
    wide && groupId === 'overview'
      ? ['overview', '主要成績一覧', overviewColumns]
      : groups[category].find(([id]) => id === groupId) || groups[category][0];
  // ⚠ **タブを変えても枠が動かない**（いしだ 2026-11-20）。出た高さの最大を覚えて床にする。
  //    小窓を開いている間だけの値で、閉じれば消える
  // ⚠ **PC だけ**（スマホは小窓が縦に送れるので当てない。CSS の
  //    `.online-desktop … .online-record-area` と同じ。2026-11-20 監査: スマホにも当たっていた）
  const areaRef = useRef(null);
  const [floor, setFloor] = useState(0);
  useAfterPaint(() => {
    if (!wide) return;
    const height = areaRef.current?.offsetHeight || 0;
    if (height > floor) setFloor(height);
  });
  const rows = [...(game.teams?.[team] || [])].filter((p) => appeared(p, category));
  // ⚠ **タブを変えても枠の高さを変えない**（いしだ 2026-11-20「タブを切り替えるたびに
  //    枠が動くので見にくい」）。球団×打撃/投球のどれを選んでも足りる高さを先に決める。
  //    行数はこの試合で決まるので、開いている間は動かない
  const maxRows = Math.max(
    1,
    ...[game.away, game.home].flatMap((name) =>
      ['batting', 'pitching'].map(
        (c) => (game.teams?.[name] || []).filter((p) => appeared(p, c)).length,
      ),
    ),
  );
  rows.sort((a, b) => {
    if (!sort) return (a.battingOrder || 99) - (b.battingOrder || 99);
    const x = a[category]?.[sort.key],
      y = b[category]?.[sort.key];
    if (x == null || y == null)
      return x == null && y == null ? 0 : x == null ? 1 : -1;
    return (x - y) * (sort.asc ? 1 : -1);
  });
  return (
    <>
      <div className="online-stat-tools">
        <div className="online-segments" aria-label="試合成績の球団">
          {[game.away, game.home].map((name) => (
            <button
              key={name}
              title={name}
              aria-label={name}
              aria-pressed={team === name}
              onClick={() => {
                setTeam(name);
              }}
            >
              <TeamMark team={name} size={16} />
              {teamShort(name)}
            </button>
          ))}
        </div>
        {wide ? (
          // ⚠ PCは**並んだタブ**（選手成績の表と同じ）。打撃・投球を選び、その区分を並べる
          <div
            className="online-group-tabs"
            role="group"
            aria-label="試合成績の表示項目"
          >
            <div className="online-segments">
              {['batting', 'pitching'].map((c) => (
                <button
                  key={c}
                  aria-pressed={category === c}
                  onClick={() => {
                    setCategory(c);
                    setGroup('overview');
                        setSort(null);
                  }}
                >
                  {c === 'batting' ? '打撃' : '投球'}
                </button>
              ))}
            </div>
            <div className="online-segments">
              {[['overview', '主要成績'], ...groups[category]].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={group[0] === id}
                  onClick={() => {
                    setGroup(id);
                        setSort(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <select
            aria-label="試合成績の表示項目"
            value={`${category}:${group[0]}`}
            onChange={(e) => {
              const [c, g] = e.target.value.split(':');
              setCategory(c);
              setGroup(g);
              setSort(null);
            }}
          >
            {Object.entries(groups).flatMap(([c, list]) =>
              list.map(([id, label]) => (
                <option key={`${c}:${id}`} value={`${c}:${id}`}>
                  {label}
                </option>
              )),
            )}
          </select>
        )}
      </div>
      {/* ⚠ 高さを先に決めた枠で包む（タブを変えても動かない）。行数ぶんの場所は
          CSS（`--rows` × `--online-record-row`）で取り、**実際に出た高さの最大**を
          測って床にする（見出しが2行に折れる区分があり、行数だけでは足りない） */}
      <div
        className="online-record-area"
        ref={areaRef}
        style={{ '--rows': maxRows, ...(wide && floor ? { minHeight: `${floor}px` } : {}) }}
      >
      <table className="online-record-table">
        <thead>
          <tr>
            <th>選手</th>
            {group[2].map(([key, label]) => (
              <th key={key}>
                <button
                  aria-label={`${label}で並べ替え`}
                  aria-pressed={sort?.key === key}
                  onClick={() => {
                    setSort({
                      key,
                      asc: sort?.key === key ? !sort.asc : false,
                    });
                      }}
                >
                  {label}
                  {sort?.key === key ? (sort.asc ? '▲' : '▼') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.key || p.id}>
              <th title={p.name}>{p.name}</th>
              {group[2].map(([key, , format = 'count']) => (
                // `data-zero`: 新しい見た目（試作）で 0 を沈ませる（数える項目だけ。防御率 0.00 は沈ませない）
                <td key={key} data-zero={format === 'count' && p[category]?.[key] === 0 ? '' : undefined}>
                  {formatStat({ format }, p[category]?.[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>この区分の出場記録はありません。</p>}
      </div>
      {game.legacy && (
        <small className="online-stat-note">
          記録を取り始める前の試合です。残っていない項目は「—」です。
        </small>
      )}
    </>
  );
}
export function GameRecordButton({
  game,
  year,
  ownTeam,
  children,
  className = 'online-record-button',
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={className}
        onClick={() => setOpen(true)}
        aria-label={`${teamLabel(game.home)}対${teamLabel(game.away)}の試合成績`}
      >
        {children || '個人成績'}
      </button>
      {open && (
        <GameRecord
          id={game.gameId}
          year={year}
          ownTeam={ownTeam}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
/**
 * その半回の攻撃（打席の順）。スコアボードの回の数字を押すと開く。
 * ⚠ 中身はサーバーが残した `game.plays`（`gamePlays.js` が読む形にする）。
 */
function InningPlays({ game, inning, half }) {
  const data = inningPlays(game, inning, half);
  const label = `${inning}回${half === 'bottom' ? '裏' : '表'}`;
  return (
    <section className="online-inning-plays" aria-label={`${label}の攻撃`}>
      <h4>
        {label}　{teamShort(data?.team || (half === 'bottom' ? game.home : game.away))}の攻撃
      </h4>
      {data?.rows?.length ? (
        <ol>
          {data.rows.map((row, i) => (
            /* ⚠ 色の決め方は `gamePlays.js` の `playTone`（点＝赤・安打＝黄・アウトは落とす） */
            <li key={i} data-tone={row.tone}>
              {row.order != null && <b>{row.order}</b>}
              <span className="online-inning-play-name">{row.name}</span>
              <span className="online-inning-play-text">{row.text}</span>
              {row.runs > 0 && <em>{row.runs}点</em>}
              <small>{row.outs}死</small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="online-muted">この回の打席の記録はありません。</p>
      )}
    </section>
  );
}

/**
 * スコアボード（回ごとの得点・R H E・勝敗投手）。中身は `scoreBoard.js`。
 * 古い試合（回ごとの記録が無い）は出さない。
 *
 * ⚠ いしだ 2026-11-19「スコアをクリックすると、その回の攻撃を時系列で表示してほしい」。
 *    回の数字を押すと、その半回の打席を順に出す（`gamePlays.js`）。
 *    打席の記録が無い試合（`plays` の無い古い試合）は押せない。
 */
export function ScoreBoard({ game, ownTeam, compact = false }) {
  const board = scoreBoard(game);
  // 開いている半回（`{ inning, half }`）。もう一度押すと閉じる
  const [open, setOpen] = useState(null);
  const playable = hasInningPlays(game);
  if (!board) return null;
  const toggle = (inning, half) =>
    setOpen((now) =>
      now && now.inning === inning && now.half === half ? null : { inning, half },
    );
  return (
    <figure
      className={compact ? 'online-scoreboard is-compact' : 'online-scoreboard'}
      aria-label="スコアボード"
      // 延長戦は列が増えるので、スマホの小さい盤では枠を詰める（320px で11回が横にはみ出していた）
      data-extra={board.innings > 9 || undefined}
    >
      {compact && <small className="online-scoreboard-date">{turnLabel(game.date)}</small>}
      <table>
        <thead>
          <tr>
            <th scope="col" className="online-scoreboard-team">
              <span className="online-sr-only">球団</span>
            </th>
            {Array.from({ length: board.innings }, (_, i) => (
              <th key={i} scope="col">
                {i + 1}
              </th>
            ))}
            <th scope="col" className="online-scoreboard-total" title="得点">
              R
            </th>
            <th scope="col" className="online-scoreboard-total" title="安打">
              H
            </th>
            <th scope="col" className="online-scoreboard-total" title="失策">
              E
            </th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.team} data-own={row.team === ownTeam || undefined}>
              <th scope="row" className="online-scoreboard-team" title={teamLabel(row.team)}>
                <TeamMark team={row.team} size={16} />
                {teamShort(row.team)}
              </th>
              {row.cells.map((cell, i) => {
                const half = row.team === game.home ? 'bottom' : 'top';
                const inning = i + 1;
                const picked =
                  open && open.inning === inning && open.half === half;
                return (
                  <td
                    key={i}
                    data-scored={/^[1-9]/.test(cell) || undefined}
                    data-open={picked || undefined}
                  >
                    {/* ⚠ **数字そのものを押せるようにする**（見た目は変えない）。
                        押せない試合（打席の記録が無い）と、やらなかった回（空・x）は
                        ただの数字のまま */}
                    {playable && cell !== '' && cell !== 'x' ? (
                      <button
                        type="button"
                        aria-expanded={!!picked}
                        aria-label={`${inning}回${half === 'bottom' ? '裏' : '表'}の攻撃`}
                        onClick={() => toggle(inning, half)}
                      >
                        {cell}
                      </button>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
              <td className="online-scoreboard-total">{row.runs}</td>
              <td className="online-scoreboard-total">{row.hits ?? '—'}</td>
              <td className="online-scoreboard-total">{row.errors ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <InningPlays game={game} inning={open.inning} half={open.half} />}
      {board.decisions.length > 0 && (
        <figcaption>
          {board.decisions.map((d) => (
            /* ⚠ 勝ちは赤・負けは青（いしだ 2026-11-20）。S・Hは今までの黄色のまま */
            <span key={d.label} data-mark={d.label}>
              <b>{d.label}</b> {d.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
function GameRecord({ id, year, ownTeam, close }) {
  const compact = window.matchMedia('(max-width: 767px)').matches;
  // 見せ方: 'stats' 個人成績・'watch' 観戦リプレイ・'live' 打席速報・'motion' 動きで見る（打席速報の動き版）
  const [mode, setMode] = useState('stats');
  // 新しい見た目（試作）段3: 打席速報（入のときだけ。塁と打球の記録がある試合だけ）
  const look = useLook();
  const result = useRead('game', { id, year }),
    game = result.data;
  const liveReady = look.on && hasLivePlays(game);
  const watch = mode === 'watch';
  const showLive = (mode === 'live' || mode === 'motion') && liveReady;
  return (
    <Panel
      title="試合成績"
      close={close}
      wide={(watch || (showLive && mode === 'motion')) && !compact}
      mobileReplay={watch && compact && !!game}
    >
      <RequestState result={result} />
      {game && (
        <>
          {(game.replay?.frames?.length > 0 || liveReady) && (
            <nav className="online-replay-launch" aria-label="試合の表示">
              <button aria-pressed={!watch && !showLive} onClick={() => setMode('stats')}>
                個人成績
              </button>
              {liveReady && (
                <button aria-pressed={showLive && mode === 'live'} onClick={() => setMode('live')}>
                  打席速報
                </button>
              )}
              {liveReady && (
                <button aria-pressed={showLive && mode === 'motion'} onClick={() => setMode('motion')}>
                  動きで見る
                </button>
              )}
              {game.replay?.frames?.length > 0 && (
                <button aria-pressed={watch} onClick={() => setMode('watch')}>
                  {compact ? '試合経過' : '観戦リプレイ'}
                </button>
              )}
            </nav>
          )}
          {showLive && <LivePlays key={mode} game={game} motion={mode === 'motion'} />}
          {/* ⚠ スマホは小窓を縦に収めるため、点数の大きな1行はスコアボードがあれば出さない（同じ点数が2回並ぶ） */}
          {!watch && !showLive && !(compact && scoreBoard(game)) && (
            <p className="online-game-summary">
              <small>{turnLabel(game.date)}</small>
              <strong>
                <span title={teamLabel(game.away)}>
                  <TeamMark team={game.away} size={22} />
                  {teamShort(game.away)}
                </span>{' '}
                {game.awayScore} – {game.homeScore}{' '}
                <span title={teamLabel(game.home)}>
                  {teamShort(game.home)}
                  <TeamMark team={game.home} size={22} />
                </span>
              </strong>
            </p>
          )}
          {!watch && !showLive && <ScoreBoard game={game} ownTeam={ownTeam} compact={compact} />}
          {showLive ? null : watch ? (
            compact ? (
              <MobileReplay game={game} close={close} />
            ) : (
              <ReplayViewer game={game} />
            )
          ) : game.teams ? (
            <>
              {/* ⚠ **得点経過は、回ごとの攻撃が無い試合だけ**（いしだ 2026-11-19
                  「得点経過は、スコアボードの得点を押すことで見れるようになったため削除」）。
                  いまの試合はスコアボードの数字を押せば、その回の全打席が順に出る。
                  ただし**前からある試合には打席の記録が無い**ので、その試合まで消すと
                  点の動きを見る手段がなくなる。だから古い試合にだけ残す。
                  スマホは小窓を縦に収めるため、「試合経過」（リプレイ）がある試合では出さず
                  そちらで追う。⚠ 本番はリプレイを残さない（ONLINE_RECORD_REPLAY）ので、
                  無い試合では畳んで出す（以前はスマホで得点経過を見る手段が無かった） */}
              {!hasInningPlays(game) &&
                (compact ? (
                  !(game.replay?.frames?.length > 0) && <ScoringPlays game={game} folded />
                ) : (
                  <ScoringPlays game={game} />
                ))}
              <BoxScore game={game} ownTeam={ownTeam} />
            </>
          ) : (
            <p>この試合は得点のみの記録です。</p>
          )}
        </>
      )}
    </Panel>
  );
}
export default function GameHistory({ view }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="online-history-button" onClick={() => setOpen(true)}>
        過去の試合・個人成績
      </button>
      {open && <History view={view} close={() => setOpen(false)} />}
    </>
  );
}
function History({ view, close }) {
  const mobile = useMobile();
  const [year, setYear] = useState(view.year),
    [shown, setShown] = useState(HISTORY_STEP),
    [scope, setScope] = useState('own');
    // ⚠ 「続きを表示」は**読む数を増やして読み直す**（`size`。上限はサーバーの GAMES_PAGE_MAX）。
  //    読み直す間も前の一覧を残す（`keep`）ので、押しても一覧が一度消えない
  const result = useRead('games', { year, page: 0, size: Math.min(shown, 200), scope }, { keep: true });
  return (
    <Panel title="試合記録" close={close}>
      <div className="online-stat-tools">
        <select
          aria-label="試合記録の年度"
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setShown(HISTORY_STEP);
          }}
        >
          {(view.seasonYears || [view.year]).map((n) => (
            <option key={n} value={n}>
              {n}年目
            </option>
          ))}
        </select>
        {!mobile ? (
          // ⚠ PCは試合結果のページと同じボタンの切り替え
          <div className="online-segments" role="group" aria-label="試合記録の範囲">
            {[
              ['own', '自球団'],
              ['league', 'リーグ全体'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={scope === id}
                onClick={() => {
                  setScope(id);
                  setShown(HISTORY_STEP);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <select
            aria-label="試合記録の範囲"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setShown(HISTORY_STEP);
            }}
          >
            <option value="own">自球団</option>
            <option value="league">リーグ全体</option>
          </select>
        )}
      </div>
      <RequestState result={result} />
      {result.data && (
        <>
          <div className="online-game-history-list">
            {result.data.games.map((g) => {
              const outcome = ownOutcome(g, view.teamName);
              return (
                <article key={g.gameId}>
                  {/* ⚠ ゲーム内の日付は出さない。オンラインはターンで進む */}
                  <small>{turnLabel(g.date)}</small>
                  <span
                    className={`online-outcome ${outcome ? `is-${outcome.tone}` : 'is-none'}`}
                    aria-label={outcome ? `自球団の${outcome.mark}` : undefined}
                  >
                    {outcome?.mark || ''}
                  </span>
                  <span className="online-game-line">
                    <span title={teamLabel(g.away)}>
                      <TeamMark team={g.away} size={16} />
                      {teamShort(g.away)}
                    </span>{' '}
                    <b>
                      {g.awayScore} – {g.homeScore}
                    </b>{' '}
                    <span title={teamLabel(g.home)}>
                      {teamShort(g.home)}
                      <TeamMark team={g.home} size={16} />
                    </span>
                  </span>
                  <GameRecordButton
                    game={g}
                    year={year}
                    ownTeam={view.teamName}
                  />
                </article>
              );
            })}
          </div>
          {!result.data.count && <p>この年度の試合記録はありません。</p>}
          <ShowMore
            shown={Math.min(shown, 200, result.data.games.length)}
            count={Math.min(result.data.count, 200)}
            step={HISTORY_STEP}
            setShown={setShown}
          />
        </>
      )}
    </Panel>
  );
}
