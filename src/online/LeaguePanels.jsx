import React, { useEffect, useState } from 'react';
import MobileTactics from './MobileTactics.jsx';
import { PitcherRoles, AutoTactics } from './PreGameTactics.jsx';
import { roleFor, STRATEGY_FIELDS } from './tactics.js';
import { useDraftState, phaseDraftName } from './Drafts.jsx';
import GameHistory, { GameRecordButton } from './GameHistory.jsx';
import {
  decisionText,
  formatRate,
  ownOutcome,
  teamShort,
  teamLabel,
} from './gameText.js';
import { api, POS, MENUS } from './api.js';
import { formatGameDate, PHASE_LABELS, sameEditState } from './shared.js';
import {
  AbilityGrade,
  ConditionMark,
  PlayerStatsButton,
} from './PlayerPerformance.jsx';
import { PageNav } from './PageNav.jsx';
import TryoutPlanner from './TryoutPlanner.jsx';
import {
  PYRAMID_LEAGUES,
  PROMOTION_PLACES,
  RELEGATION_FROM_BOTTOM,
} from './pyramidLeague.js';
export { PageNav } from './PageNav.jsx';

/**
 * リーグに参加する画面。
 *
 * ⚠ **ログイン直後の非参加者がここに来る**。参加するにはログインが要るが、
 *    ログインに参加者であることを求めると永遠に入れない（鶏と卵）。
 *    サーバーは非参加者にも `joinRequired` のビューを返す。
 * ⚠ **招待コードは廃止した**。アカウントは管理者が Supabase で作らない限り
 *    増えない（公開サインアップは無効）ので、入口はそこで絞れている。
 *    その上にコードを重ねると、人を呼ぶたびに発行と受け渡しの手間が増えるだけだった。
 * ⚠ 球団名は**表示名**として扱われる。内部の球団名は引き継いだ球団のまま
 *    （記録の選手キーまで名前で繋がっているため）。
 */
export function JoinLeague({ busy, join, logout }) {
  const [teamName, setTeamName] = useState('');
  return (
    <section className="online-card online-login">
      <p className="online-eyebrow">JOIN</p>
      <h1>リーグに参加する</h1>
      <p>
        空いている球団のうち、下の階層で一番弱いものを引き継ぎます。
        球団名は好きに付けられます。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          join({ teamName: teamName.trim() });
        }}
      >
        <label>
          球団名（空なら元の名前のまま）
          <input
            value={teamName}
            maxLength={24}
            onChange={(e) => setTeamName(e.target.value)}
          />
        </label>
        <button className="online-primary" type="submit" disabled={busy}>
          参加する
        </button>
      </form>
      <button disabled={busy} onClick={logout}>
        別のアカウントでログインし直す
      </button>
    </section>
  );
}

export function Login({ local, login, busy }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <section className="online-card online-login">
      <p className="online-eyebrow">ONLINE LEAGUE</p>
      <h1>今日の球団を、見に行こう。</h1>
      <p>参加者みんなで育てる独立リーグ。留守の間も、ペナントは少しずつ進みます。</p>
      {local ? (
        <div className="online-actions">
          <button disabled={busy} onClick={() => login({ user: 'player1' })}>
            プレイヤー1で入る
          </button>
          <button disabled={busy} onClick={() => login({ user: 'player2' })}>
            プレイヤー2で入る
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login({ email, password });
          }}
        >
          <label>
            メールアドレス
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            パスワード
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="online-primary" disabled={busy}>
            ログイン
          </button>
        </form>
      )}
    </section>
  );
}
/**
 * 順位表。部ごとに分け、昇格・降格の線を引く。
 * ⚠ **`view.standings` は全球団を通した並び**。1部と2部を混ぜたまま出すと、
 *    2部の首位が表の1位に見えて「優勝争い」と取り違える（実測で起きた）。
 *    `teamLeagues` が無い古いビューでは従来どおり1つの表で出す。
 */
export function Standings({ view }) {
  const leagues = view.teamLeagues
    ? PYRAMID_LEAGUES.map((league) => ({
        league,
        rows: view.standings.filter(
          (s) => view.teamLeagues[s.team] === league.id,
        ),
      })).filter((group) => group.rows.length)
    : [{ league: null, rows: view.standings }];
  return (
    <section className="online-card">
      <h2>リーグ順位</h2>
      {leagues.map(({ league, rows }) => (
        <table key={league?.id || 'all'}>
          {league && <caption>{league.name}</caption>}
          <thead>
            <tr>
              <th>球団</th>
              <th>勝</th>
              <th>敗</th>
              <th>分</th>
              <th>勝率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const up = league && league.up.length && i < PROMOTION_PLACES[0];
              const down =
                league &&
                league.down.length &&
                i >= rows.length - RELEGATION_FROM_BOTTOM[0];
              return (
                <tr
                  key={s.team}
                  className={[
                    s.team === view.teamName ? 'online-own' : '',
                    up ? 'is-promotion' : '',
                    down ? 'is-relegation' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <th>
                    <span className="online-rank">{i + 1}</span>
                    {teamLabel(s.team)}
                    {/* ⚠ 人が持っている球団だけ、名前を括弧で添える。
                        CPUに付けると誰かが持っているように見える。
                        呼び名が球団名と同じときはサーバーが空で返す */}
                    {view.teamOwners &&
                      Object.hasOwn(view.teamOwners, s.team) && (
                        <small className="online-owner">
                          （{view.teamOwners[s.team] || 'プレイヤー'}）
                        </small>
                      )}
                    {up ? <small className="online-move">昇格圏</small> : null}
                    {down ? (
                      <small className="online-move">降格圏</small>
                    ) : null}
                  </th>
                  <td>{s.wins}</td>
                  <td>{s.losses}</td>
                  <td>{s.draws || 0}</td>
                  <td>{formatRate(s.winRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </section>
  );
}

export function Results({ view, compact = false }) {
  const [mode, setMode] = useState('results');
  const [page, setPage] = useState(0);
  const [scope, setScope] = useState(compact ? 'own' : 'league');
  const all = mode === 'results' ? [...view.results].reverse() : view.upcoming;
  const list =
    scope === 'own'
      ? all.filter(
          (game) => game.home === view.teamName || game.away === view.teamName,
        )
      : all;
  const size = compact ? 2 : 4;
  return (
    <section className="online-card">
      <div className="online-card-heading">
        <h2>試合</h2>
        <select
          aria-label="試合の表示範囲"
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
            setPage(0);
          }}
        >
          <option value="own">自球団</option>
          <option value="league">リーグ全体</option>
        </select>
      </div>
      <div className="online-segments">
        {[
          ['results', '結果'],
          ['upcoming', '日程'],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={mode === id}
            onClick={() => {
              setMode(id);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {list.length ? (
        list.slice(page * size, page * size + size).map((g) => {
          const outcome = mode === 'results' && ownOutcome(g, view.teamName);
          const decisions = decisionText(g.decisions);
          const name = compact ? teamShort : teamLabel;
          return (
            <article className="online-score" key={g.gameId || g.id}>
              <header>
                <small>{formatGameDate(g.date)}</small>
                {outcome && (
                  <span className={`online-outcome is-${outcome.tone}`}>
                    {outcome.mark}
                  </span>
                )}
                {mode === 'results' && view.gameDetailsAvailable && (
                  <GameRecordButton
                    game={g}
                    year={view.year}
                    ownTeam={view.teamName}
                  />
                )}
              </header>
              <div>
                <span title={teamLabel(g.away)}>{name(g.away)}</span>
                <strong>
                  {mode === 'results' ? `${g.awayScore} – ${g.homeScore}` : '×'}
                </strong>
                <span title={teamLabel(g.home)}>{name(g.home)}</span>
              </div>
              {decisions && (
                <small className="online-score-decisions">{decisions}</small>
              )}
            </article>
          );
        })
      ) : (
        <p className="online-empty">
          {mode === 'results'
            ? '試合結果はまだありません。'
            : '今後の試合予定はありません。'}
        </p>
      )}
      <PageNav page={page} count={list.length} size={size} setPage={setPage} />
      {view.gameDetailsAvailable && <GameHistory view={view} />}
    </section>
  );
}
/**
 * お知らせの種類ごとの見出し。
 * ⚠ **種類を足したらここにも足すこと**。昇降格（`promotion`）は
 *    `picks` ではなく `moves` を持つので、`noticeItems` も合わせて見る。
 *    以前は `n.picks.length` を直接読んでいて、1年目の終わりに
 *    昇降格のお知らせが入るとリーグ便りごと画面が落ちていた。
 */
const NOTICE_LABELS = {
  draft: 'NPBドラフト',
  tryout: 'トライアウト',
  promotion: '昇格・降格',
};
/** 締め切りの日時を日本時間で「11/8(日) 0:00」の形にする */
export function formatDeadline(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  if (Number.isNaN(d.getTime())) return '';
  const week = '日月火水木金土'[d.getUTCDay()];
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${week}) ${d.getUTCHours()}:${minutes}`;
}
const noticeItems = (notice) => notice?.picks || notice?.moves || [];
const leagueName = (id) =>
  PYRAMID_LEAGUES.find((league) => league.id === id)?.name || id;
const tierOf = (id) =>
  PYRAMID_LEAGUES.find((league) => league.id === id)?.tier ?? 0;
const isPromotion = (move) => tierOf(move.to) < tierOf(move.from);

export function Notices({ view, compact = false }) {
  const [selected, setSelected] = useState('notice:0');
  const [page, setPage] = useState(0);
  const [kind, index] = selected.split(':');
  const notice = view.notices[Number(index)];
  const history = view.history[Number(index)];
  const picks = kind === 'notice' ? noticeItems(notice) : [];
  const label = compact ? teamShort : teamLabel;
  const size = 8;
  useEffect(() => {
    if (!view.notices.length && !view.history.length) return;
    if ((kind === 'notice' && !notice) || (kind === 'history' && !history)) {
      setSelected(view.notices.length ? 'notice:0' : 'history:0');
      setPage(0);
    }
  }, [kind, notice, history, view.notices.length, view.history.length]);
  return (
    <section className="online-card">
      <h2>リーグ便り</h2>
      {view.notices.length + view.history.length ? (
        <>
          <label className="online-sr-only" htmlFor="online-news-select">
            見るお知らせ
          </label>
          <select
            id="online-news-select"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPage(0);
            }}
          >
            {view.notices.map((n, i) => (
              <option key={`n:${i}`} value={`notice:${i}`}>
                {n.year}年 {NOTICE_LABELS[n.type] || 'お知らせ'}
                （{noticeItems(n).length}
                {n.type === 'promotion' ? '球団' : '人'}）
              </option>
            ))}
            {view.history.map((h, i) => (
              <option key={`h:${i}`} value={`history:${i}`}>
                {h.year}年の最終順位
              </option>
            ))}
          </select>
          {kind === 'notice' ? (
            <>
              <div
                className={`online-news-list ${compact ? 'is-compact' : ''}`}
              >
                {picks.slice(page * size, page * size + size).map((p, j) =>
                  notice?.type === 'promotion' ? (
                    <article key={j}>
                      <b>{label(p.teamId)}</b>
                      <span>
                        {leagueName(p.from)} → {leagueName(p.to)}
                        {isPromotion(p) ? '（昇格）' : '（降格）'}
                      </span>
                    </article>
                  ) : (
                    <article key={j}>
                      <b>
                        {typeof p.round === 'number' ? `${p.round}巡` : p.round}{' '}
                        {p.name}
                      </b>
                      <span>→ {label(p.npbTeam || p.team)}</span>
                    </article>
                  ),
                )}
              </div>
              <PageNav
                page={page}
                count={picks.length}
                size={size}
                setPage={setPage}
              />
            </>
          ) : (
            history?.standings.map((s, i) => (
              <p className="online-history-row" key={s.team}>
                {i + 1}. {teamLabel(s.team)}　{s.wins}勝{s.losses}敗
              </p>
            ))
          )}
        </>
      ) : (
        <p>リーグの動きがここに届きます。</p>
      )}
    </section>
  );
}

export function PhasePanel({ view, auth, busy, run, command, mobile }) {
  const phase = view.phase;
  const [plan, setPlan] = useDraftState(
    phaseDraftName(phase.id, 'plan'),
    phase.submission?.plan || null,
  );
  const [dirty, setDirty] = useDraftState(phaseDraftName(phase.id, 'dirty'), false);
  const [planRevision, setPlanRevision] = useState(null);
  const [baseSubmission, setBaseSubmission] = useDraftState(phaseDraftName(phase.id, 'base'), () =>
    structuredClone(phase.submission || null),
  );
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!phase.submission)
      api('defaults', auth)
        .then((d) => {
          if (!cancelled) {
            if (d.phaseId !== phase.id) {
              setError('手続きが更新されました。最新状態を確認してください');
              return;
            }
            setError('');
            setPlan((old) => old || d.plan);
            setPlanRevision(d.revision);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [auth, phase.id, phase.submission]);
  const submissionChanged = !sameEditState(
    baseSubmission,
    phase.submission || null,
  );
  useEffect(() => {
    if (mobile && submissionChanged && !dirty) {
      setPlan(phase.submission ? structuredClone(phase.submission.plan) : null);
      setBaseSubmission(structuredClone(phase.submission || null));
    }
  }, [
    mobile,
    submissionChanged,
    phase.submission,
    dirty,
    setPlan,
    setBaseSubmission,
  ]);
  const submit = (ready) =>
    run(async () => {
      await command('submit', {
        phaseId: phase.id,
        plan,
        ready,
        baseSubmission,
      });
      setBaseSubmission({ plan: structuredClone(plan), ready });
      setDirty(false);
    });
  const resetSubmission = () =>
    run(async () => {
      setError('');
      try {
        let next = phase.submission?.plan;
        if (!next) {
          const defaults = await api('defaults', auth);
          if (defaults.phaseId !== phase.id)
            throw new Error(
              '手続きが更新されました。最新状態を確認してください',
            );
          next = defaults.plan;
        }
        setPlan(structuredClone(next));
        setBaseSubmission(structuredClone(phase.submission || null));
        setDirty(false);
      } catch (error) {
        setError(error.message);
        throw error;
      }
    });
  // 「標準案に戻す」（以前の「おすすめ順に戻す」）。⚠ **保存済みの下書きではなく、いつも標準案を取り直す**。
  //    以前は上の `resetSubmission`（保存案を読み直す）を流用しており、
  //    下書きを一度保存すると、押しても下書きに戻るだけで、おすすめ順には戻らなかった。
  //    保存済みの提出があるなら、戻した内容は未保存の編集として扱う
  const resetToDefaults = () =>
    run(async () => {
      setError('');
      try {
        const defaults = await api('defaults', auth);
        if (defaults.phaseId !== phase.id)
          throw new Error('手続きが更新されました。最新状態を確認してください');
        setPlan(structuredClone(defaults.plan));
        setDirty(!!phase.submission);
      } catch (error) {
        setError(error.message);
        throw error;
      }
    });
  return (
    <section className="online-card online-decision">
      <fieldset className="online-form-fields" disabled={busy}>
        <h2>{PHASE_LABELS[phase.kind]}</h2>
        {/* ⚠ 2人固定だった頃の「両者」という書き方を残さない。
            いまは1〜12人で、締め切りが来れば未提出でも先へ進む */}
        <p>
          {/* ⚠ 「決定後も出し直せる」のは**ほかに検討中の人がいる間だけ**。
              最後の1人が決定した瞬間に処理されるので、無条件には書かない */}
          {phase.deadline
            ? mobile
              ? `締め切り ${formatDeadline(phase.deadline)}。全員が決定するか、締め切りで進みます。`
              : `締め切りは ${formatDeadline(phase.deadline)}。全員が決定した時点で処理します。締め切りを過ぎると、未決定の球団は保存した下書き（無ければ標準案）で進みます。ほかに検討中の球団がいる間は、決定後も出し直せます。`
            : mobile
              ? '全員が決定すると進みます。'
              : '全員が決定した時点で処理します。この手続きに締め切りはありません。ほかに検討中の球団がいる間は、決定後も出し直せます。'}
        </p>
        <ul className="online-ready">
          {view.members.map((m) => (
            <li key={m.teamName}>
              {/* ⚠ 参加者が付けた球団名を出す。`label` は作成時の呼び名のまま */}
              {teamLabel(m.teamName)} · {m.ready ? '決定済み' : '検討中'}
            </li>
          ))}
        </ul>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button onClick={resetSubmission}>
              {phase.submission ? '保存案を読み直す' : '標準案を再取得'}
            </button>
          </div>
        )}
        {submissionChanged && (!mobile || dirty) && (
          <div role="alert" className="online-edit-notice">
            <p>
              別の操作で提出が更新されました。現在の入力を破棄して保存済みの内容を読み直せます。
            </p>
            <button onClick={resetSubmission}>最新の提出を読み直す</button>
          </div>
        )}
        {plan && (
          <>
            {mobile ? (
              <p>
                {phase.kind === 'camp'
                  ? `練習方針: ${MENUS[plan.menu]}`
                  : plan.rankedIds
                    ? `${plan.count}人を獲得する希望リスト（${plan.rankedIds.length}候補）`
                    : plan.releaseIds
                      ? `退団予定 ${plan.releaseIds.length}人`
                      : 'シーズンを締めて次年度へ進みます。'}
                <br />
                {dirty
                  ? '編集中の内容（未保存）です。'
                  : phase.submission
                    ? '保存済みの内容を確認します。'
                    : '標準案を使用します。'}{' '}
                詳細はPCで調整できます。
              </p>
            ) : (
              <>
                {plan.rankedIds && (
                  <TryoutPlanner
                    plan={plan}
                    candidates={phase.candidates}
                    roster={view.roster}
                    maxCount={Math.max(0, 24 - view.roster.length)}
                    busy={busy}
                    onChange={(next) => {
                      setDirty(true);
                      setPlan(next);
                    }}
                    onReset={resetToDefaults}
                  />
                )}
                {plan.releaseIds && (
                  <>
                    <p>
                      チェックした選手が退団します。最低9人を残してください。既に9人未満の場合は新たな退団はできません。
                    </p>
                    {view.roster.map((p) => (
                      <div className="online-check-info" key={p.id}>
                        <label className="online-check" key={p.id}>
                          <input
                            type="checkbox"
                            checked={plan.releaseIds.includes(p.id)}
                            onChange={(e) => {
                              setDirty(true);
                              setPlan({
                                releaseIds: e.target.checked
                                  ? [...plan.releaseIds, p.id]
                                  : plan.releaseIds.filter((id) => id !== p.id),
                              });
                            }}
                          />
                          {p.name}（{p.age}歳 / {POS[p.position]}）
                        </label>
                        <PlayerStatsButton player={p} panel="abilities">
                          情報
                        </PlayerStatsButton>
                      </div>
                    ))}
                  </>
                )}
                {plan.menu && (
                  <label>
                    球団の主練習（全4回）
                    <select
                      value={plan.menu}
                      onChange={(e) => {
                        setDirty(true);
                        setPlan({ menu: e.target.value });
                      }}
                    >
                      {Object.entries(MENUS).map(([id, label]) => (
                        <option value={id} key={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {phase.kind === 'offseason' && (
                  <p>最終順位を保存し、次年度のキャンプへ進みます。</p>
                )}
              </>
            )}
            {planRevision !== null &&
              planRevision !== view.revision &&
              !phase.submission && (
                <p className="online-muted">
                  他の操作で更新がありました。提出時に現在の内容を再検証します。
                </p>
              )}
            <div className="online-actions">
              <button
                className="online-primary"
                disabled={busy}
                onClick={() => submit(true)}
              >
                この内容で決定
              </button>
              {!mobile && (
                <button disabled={busy} onClick={() => submit(false)}>
                  下書きを保存
                </button>
              )}
              {phase.submission?.ready && (
                <button disabled={busy} onClick={() => submit(false)}>
                  決定を取り消す
                </button>
              )}
            </div>
          </>
        )}
        {!plan && !error && <p>標準案を準備しています…</p>}
      </fieldset>
    </section>
  );
}
export function LineupPanel({
  view,
  mobile,
  busy,
  run,
  command,
  onShowRoster,
  hidden = false,
}) {
  const [plan, setPlan] = useDraftState('lineup.plan', () =>
    structuredClone(view.lineup),
  );
  const [dirty, setDirty] = useDraftState('lineup.dirty', false);
  const [baseLineup, setBaseLineup] = useDraftState('lineup.base', () =>
    structuredClone(view.lineup),
  );
  const [section, setSection] = useState('batting');
  const [showTactics, setShowTactics] = useState(false);
  const [tacticsError, setTacticsError] = useState('');
  const save = () =>
    run(async () => {
      setTacticsError('');
      try {
        await command('lineup', { ...plan, baseLineup });
        setDirty(false);
      } catch (error) {
        setTacticsError(error.message);
        throw error;
      }
    });
  useEffect(() => {
    if (!dirty) {
      setPlan(structuredClone(view.lineup));
      setBaseLineup(structuredClone(view.lineup));
    }
  }, [view.lineup, dirty, setPlan, setBaseLineup]);
  const change = (next) => {
    if (next.starters && next.starters !== plan.starters && next.pitcherRoles) {
      next = {
        ...next,
        pitcherRoles: Object.fromEntries(
          Object.entries(next.pitcherRoles).map(([id, role]) => [
            id,
            roleFor(
              role,
              next.starters.some((x) => String(x) === id),
            ),
          ]),
        ),
      };
    }
    setPlan(next);
    setDirty(true);
  };
  const move = (i, delta) => {
    const entries = [...plan.battingOrder].sort(
      (a, b) => a.battingOrder - b.battingOrder,
    );
    [entries[i], entries[i + delta]] = [entries[i + delta], entries[i]];
    change({
      ...plan,
      battingOrder: entries.map((e, j) => ({ ...e, battingOrder: j + 1 })),
    });
  };
  const fielders = view.roster.filter((p) => p.position !== 'pitcher');
  return (
    <section className="online-card online-lineup-card" hidden={hidden}>
      <div className="online-card-heading">
        {mobile ? (
          <div>
            <h2>打順</h2>
            <p className="online-muted">次の試合から反映</p>
          </div>
        ) : (
          <h2>編成・采配</h2>
        )}
        {mobile && <button onClick={() => setShowTactics(true)}>采配</button>}
        {mobile && onShowRoster && (
          <button
            onClick={onShowRoster}
            aria-label="投手・控えを含む選手成績 →"
          >
            選手成績
          </button>
        )}
      </div>
      <fieldset className="online-form-fields" disabled={busy}>
        {!mobile && (
          <div className="online-segments">
            {[
              ['batting', '打順・守備'],
              ['pitchers', '先発'],
              ['roles', '投手の役割'],
              ['strategy', '基本方針'],
              ['autoTactics', '自動采配'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={section === id}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!mobile && <p className="online-muted">次回の進行から反映します。</p>}
        {(mobile || section === 'batting') &&
          [...plan.battingOrder]
            .sort((a, b) => a.battingOrder - b.battingOrder)
            .map((entry, i) => (
              <div className="online-lineup" key={entry.battingOrder}>
                <b>{entry.battingOrder}</b>
                <span>{POS[entry.position]}</span>
                {mobile ? (
                  <span>
                    <ConditionMark
                      player={
                        view.roster.find((p) => p.id === entry.playerId) || {}
                      }
                    />
                    <PlayerStatsButton
                      player={view.roster.find((p) => p.id === entry.playerId)}
                      panel="abilities"
                    />
                  </span>
                ) : (
                  <div className="online-lineup-picker">
                    <select
                      aria-label={`${entry.battingOrder}番の選手`}
                      value={entry.playerId}
                      onChange={(e) =>
                        change({
                          ...plan,
                          battingOrder: plan.battingOrder.map((x) =>
                            x === entry
                              ? {
                                  ...x,
                                  playerId: fielders.find(
                                    (p) => String(p.id) === e.target.value,
                                  )?.id,
                                }
                              : x,
                          ),
                        })
                      }
                    >
                      {fielders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}（{POS[p.position]}）
                        </option>
                      ))}
                    </select>
                    <PlayerStatsButton
                      player={view.roster.find((p) => p.id === entry.playerId)}
                      panel="abilities"
                    >
                      情報
                    </PlayerStatsButton>
                  </div>
                )}
                <button
                  aria-label={`${entry.battingOrder}番を上げる`}
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`${entry.battingOrder}番を下げる`}
                  disabled={busy || i === 7}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
              </div>
            ))}
        {!mobile && section === 'pitchers' && (
          <>
            <h3>先発ローテーション</h3>
            <p>
              選択した順に先発します。並びを変更した場合は先頭から再開します。
            </p>
            {view.roster
              .filter((p) => p.position === 'pitcher')
              .map((p) => (
                <div className="online-check-info" key={p.id}>
                  <label className="online-check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={plan.starters.includes(p.id)}
                      onChange={(e) =>
                        change({
                          ...plan,
                          starters: e.target.checked
                            ? [...plan.starters, p.id]
                            : plan.starters.filter((id) => id !== p.id),
                        })
                      }
                    />
                    {p.name}（
                    <ConditionMark player={p} />
                    疲労{p.fatigue}）
                    {plan.starters.includes(p.id) &&
                      ` · ${plan.starters.indexOf(p.id) + 1}番手`}
                  </label>
                  <PlayerStatsButton player={p} panel="abilities">
                    情報
                  </PlayerStatsButton>
                </div>
              ))}
          </>
        )}
        {!mobile && section === 'roles' && (
          <PitcherRoles view={view} plan={plan} change={change} />
        )}
        {!mobile && section === 'autoTactics' && (
          <AutoTactics plan={plan} change={change} />
        )}
        {!mobile && section === 'strategy' && (
          <>
            {Object.entries(STRATEGY_FIELDS).map(([key, [label, values]]) => (
              <label key={key}>
                {label}
                <select
                  value={plan.strategy[key] || Object.keys(values)[0]}
                  onChange={(e) =>
                    change({
                      ...plan,
                      strategy: { ...plan.strategy, [key]: e.target.value },
                    })
                  }
                >
                  {Object.entries(values).map(([v, text]) => (
                    <option key={v} value={v}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </>
        )}

        <div className="online-actions">
          <button
            className="online-primary"
            disabled={busy || !dirty}
            onClick={save}
          >
            編成を保存
          </button>
          <button
            disabled={busy || !dirty}
            onClick={() => {
              setPlan(structuredClone(view.lineup));
              setDirty(false);
            }}
          >
            編集を戻す
          </button>
        </div>
      </fieldset>
      {mobile && showTactics && (
        <MobileTactics
          view={view}
          plan={plan}
          change={change}
          busy={busy}
          dirty={dirty}
          save={save}
          error={tacticsError}
          close={() => setShowTactics(false)}
        />
      )}
    </section>
  );
}
