import React, { useEffect, useState } from 'react';
import MobileTactics from './MobileTactics.jsx';
import { PitcherRoles, AutoTactics } from './PreGameTactics.jsx';
import { roleFor, STRATEGY_FIELDS } from './tactics.js';
import { useDraftState } from './Drafts.jsx';
import GameHistory, { GameRecordButton } from './GameHistory.jsx';
import { decisionText, formatRate, ownOutcome, teamShort } from './gameText.js';
import { api, POS, MENUS } from './api.js';
import { formatGameDate, PHASE_LABELS, sameEditState } from './shared.js';
import {
  AbilityGrade,
  ConditionMark,
  PlayerStatsButton,
} from './PlayerPerformance.jsx';
import { PageNav } from './PageNav.jsx';
import TryoutPlanner from './TryoutPlanner.jsx';
export { PageNav } from './PageNav.jsx';

/**
 * 招待コードで参加する画面。
 *
 * ⚠ **ログイン直後の非参加者がここに来る**。参加するにはログインが要るが、
 *    ログインに参加者であることを求めると永遠に入れない（鶏と卵）。
 *    サーバーは非参加者にも `joinRequired` のビューを返すので、
 *    ここでコードを受け取る。
 * ⚠ 球団名は**表示名**として扱われる。内部の球団名は引き継いだ球団のまま
 *    （記録の選手キーまで名前で繋がっているため）。
 */
export function JoinLeague({ busy, join, logout }) {
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  return (
    <section className="online-card online-login">
      <p className="online-eyebrow">JOIN</p>
      <h1>リーグに参加する</h1>
      <p>
        管理者から受け取った招待コードを入れてください。
        空いている球団のうち、一番下のものを引き継ぎます。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          join({ code: code.trim(), teamName: teamName.trim() });
        }}
      >
        <label>
          招待コード
          <input
            required
            value={code}
            maxLength={16}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label>
          球団名（空なら元の名前のまま）
          <input
            value={teamName}
            maxLength={24}
            onChange={(e) => setTeamName(e.target.value)}
          />
        </label>
        <button className="online-primary" type="submit" disabled={busy || !code.trim()}>
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
      <p>二人で育てる独立リーグ。留守の間も、ペナントは少しずつ進みます。</p>
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
export function Standings({ view }) {
  return (
    <section className="online-card">
      <h2>リーグ順位</h2>
      <table>
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
          {view.standings.map((s, i) => (
            <tr
              key={s.team}
              className={s.team === view.teamName ? 'online-own' : ''}
            >
              <th>
                <span className="online-rank">{i + 1}</span>
                {s.team}
              </th>
              <td>{s.wins}</td>
              <td>{s.losses}</td>
              <td>{s.draws || 0}</td>
              <td>{formatRate(s.winRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
          const name = compact ? teamShort : (team) => team;
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
                <span title={g.away}>{name(g.away)}</span>
                <strong>
                  {mode === 'results' ? `${g.awayScore} – ${g.homeScore}` : '×'}
                </strong>
                <span title={g.home}>{name(g.home)}</span>
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
export function Notices({ view, compact = false }) {
  const [selected, setSelected] = useState('notice:0');
  const [page, setPage] = useState(0);
  const [kind, index] = selected.split(':');
  const notice = view.notices[Number(index)];
  const history = view.history[Number(index)];
  const picks = kind === 'notice' ? notice?.picks || [] : [];
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
                {n.year}年 {n.type === 'draft' ? 'NPBドラフト' : 'トライアウト'}
                （{n.picks.length}人）
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
                {picks.slice(page * size, page * size + size).map((p, j) => (
                  <article key={j}>
                    <b>
                      {typeof p.round === 'number' ? `${p.round}巡` : p.round}{' '}
                      {p.name}
                    </b>
                    <span>
                      →{' '}
                      {compact
                        ? teamShort(p.npbTeam || p.team)
                        : p.npbTeam || p.team}
                    </span>
                  </article>
                ))}
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
                {i + 1}. {s.team}　{s.wins}勝{s.losses}敗
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
    'phase.plan',
    phase.submission?.plan || null,
  );
  const [dirty, setDirty] = useDraftState('phase.dirty', false);
  const [planRevision, setPlanRevision] = useState(null);
  const [baseSubmission, setBaseSubmission] = useDraftState('phase.base', () =>
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
  return (
    <section className="online-card online-decision">
      <fieldset className="online-form-fields" disabled={busy}>
        <h2>{PHASE_LABELS[phase.kind]}</h2>
        {/* ⚠ 2人固定だった頃の「両者」という書き方を残さない。
            いまは1〜12人で、締め切りが来れば未提出でも先へ進む */}
        <p>
          {phase.deadline
            ? mobile
              ? '全員が決定するか、締め切りで進みます。'
              : '全員が決定すると一度だけ処理します。締め切りを過ぎると、未提出の球団は標準案で進みます。決定後も締め切り前なら出し直せます。'
            : mobile
              ? '全員が決定すると進みます。'
              : '全員が決定すると一度だけ処理します。この手続きに締め切りはありません。決定後も出し直せます。'}
        </p>
        <ul className="online-ready">
          {view.members.map((m) => (
            <li key={m.teamName}>
              {m.label} · {m.ready ? '決定済み' : '検討中'}
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
                    onReset={resetSubmission}
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
