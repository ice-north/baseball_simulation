import React, { useEffect, useState } from 'react';
import MobileTactics from './MobileTactics.jsx';
import { roleFor } from './tactics.js';
import { useDraftState, phaseDraftName } from './Drafts.jsx';
import GameHistory, { GameRecordButton } from './GameHistory.jsx';
import {
  decisionText,
  formatRate,
  ownOutcome,
  teamShort,
  teamLabel,
} from './gameText.js';
import { api, POS } from './api.js';
import {
  formatGameDate,
  PHASE_LABELS,
  sameEditState,
  ROSTER_LIMIT,
} from './shared.js';
import { ConditionMark, PlayerStatsButton } from './PlayerPerformance.jsx';
import { PageNav } from './PageNav.jsx';
import { Page } from './Page.jsx';
import TryoutPlanner, { PlayerLine } from './TryoutPlanner.jsx';
import PackSelect from './PackSelect.jsx';
import CampPlanner from './CampPlanner.jsx';
import {
  PYRAMID_LEAGUES,
  PROMOTION_PLACES,
  RELEGATION_FROM_BOTTOM,
  compareLeagueStanding,
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
  return (
    <section className="online-card online-login">
      <p className="online-eyebrow">JOIN</p>
      <h1>リーグに参加する</h1>
      {/* ⚠ **ここでは名前を聞かない**。始める手順は
          「参加する → セットを選ぶ → 球団名とプレイヤー名 → 決定」で、
          名前はセットの下で決める。2か所で聞くと、どちらが効くのか分からない */}
      <p>
        空いている球団のうち、下の階層で一番弱いものを引き継ぎます。
        このあと初期メンバーのセットを選び、球団名とプレイヤー名を決めます。
      </p>
      <button
        className="online-primary"
        disabled={busy}
        onClick={() => join({})}
      >
        参加する
      </button>
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
        rows: view.standings
          .filter((s) => view.teamLeagues[s.team] === league.id)
          .sort(compareLeagueStanding),
      })).filter((group) => group.rows.length)
    : [{ league: null, rows: view.standings }];
  return (
    <section className="online-card">
      <h2>リーグ順位</h2>
      {leagues.map(({ league, rows }) => (
        <table key={league?.id || 'all'} className="online-standings">
          {league && <caption>{league.name}</caption>}
          <thead>
            <tr>
              <th>球団</th>
              <th>勝</th>
              <th>敗</th>
              <th>分</th>
              <th>勝率</th>
              {/* ⚠ チーム打率・チーム防御率は**サーバーが選手成績から足し上げる**
                  （`teamSeasonStats`）。順位表は勝敗しか持っていない */}
              <th>打率</th>
              <th>防</th>
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
                    s.team === view.teamName ? 'online-own online-own-text' : '',
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
                  {/* ⚠ 打席・投球回が0なら「—」。開幕前は全球団がこれ */}
                  <td>
                    {view.teamStats?.[s.team]?.average != null
                      ? formatRate(view.teamStats[s.team].average)
                      : '—'}
                  </td>
                  <td>
                    {view.teamStats?.[s.team]?.era != null
                      ? view.teamStats[s.team].era.toFixed(2)
                      : '—'}
                  </td>
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
  // ⚠ PCは1日ぶん（リーグ全体なら6試合）を1ページにする
  const size = compact ? 2 : 6;
  const scopes = [
    ['own', '自球団'],
    ['league', 'リーグ全体'],
  ];
  return (
    <section className="online-card online-results">
      <div className="online-card-heading">
        <h2>試合</h2>
        {compact ? (
          <select
            aria-label="試合の表示範囲"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
              setPage(0);
            }}
          >
            {scopes.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          // ⚠ PCは切り替えをボタンで並べる（ほかのページの切り替えと同じ形）
          <div className="online-segments" role="group" aria-label="試合の表示範囲">
            {scopes.map(([id, label]) => (
              <button
                key={id}
                aria-pressed={scope === id}
                onClick={() => {
                  setScope(id);
                  setPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
      <div className="online-score-list">
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
      </div>
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

/**
 * 途中参加した人の初期メンバー選択。
 *
 * ⚠ **リーグ全体の手続きではない**。締め切りも全員の決定も関係しないので、
 *    選んだ時点で保存する（`pack` 命令）。
 * ⚠ 名簿に入るのは**次のキャンプ**。それまで球団はCPUが動かす。
 *    画面にそう書くこと——書かないと「選んだのに選手が変わらない」と見える。
 */
export function PendingPackPanel({ view, busy, run, command, mobile }) {
  const pending = view.pendingPack;
  if (!pending) return null;
  const chosen = pending.packs.find((p) => p.id === pending.chosen);
  const status = chosen
    ? `いま選んでいるのは「${chosen.name}」です。キャンプまでは何度でも選び直せます。`
    : 'まだ選んでいません。決めずにキャンプを迎えると、1つ目のセットになります。';
  const body = (
    <>
      {/* ⚠ PCは「20セットから1つ選びます」をセットの一覧の説明に任せる（2回出さない） */}
      <p>
        {mobile && '20セットから1つ選びます。'}選んだ24人は
        <strong>次の日曜のキャンプで名簿に入り</strong>、月曜の開幕から
        あなたの球団になります。それまでは引き継いだ選手でCPUが戦い、
        ストーブリーグとキャンプの手続きもCPUが決めます。
      </p>
      {mobile && <p className="online-muted">{status}</p>}
      <PackSelect
        packs={pending.packs}
        plan={{ packId: pending.chosen }}
        busy={busy}
        view={view}
        run={run}
        command={command}
        onChange={(next) => run(() => command('pack', { packId: next.packId }))}
      />
    </>
  );
  // ⚠ PCはほかのページと同じ枠（見出し・補足はページの上）
  if (!mobile)
    return (
      <Page title="初期メンバー選択" sub={status}>
        <section className="online-card online-decision">{body}</section>
      </Page>
    );
  return (
    <section className="online-card online-decision">
      <h2>初期メンバー選択</h2>
      {body}
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
  // ⚠ **キャンプは文面が別**。提出して待つものではなく、その場で1クールずつ
  //    実行する。「下書き」「決定」の言い方をすると、何を押せば進むのか
  //    分からなくなる
  const rulesText =
    phase.kind === 'camp'
      ? phase.deadline
        ? `締め切りは ${formatDeadline(phase.deadline)}。全員が4クール終えた時点で次へ進みます。締め切りまでに終わらなかったぶんは、最後に指示した内容で自動で行われます。`
        : '全員が4クール終えると次へ進みます。'
      : phase.deadline
    ? mobile
      ? `締め切り ${formatDeadline(phase.deadline)}。全員が決定するか、締め切りで進みます。`
      : `締め切りは ${formatDeadline(phase.deadline)}。全員が決定した時点で処理します。締め切りを過ぎると、未決定の球団は保存した下書き（無ければ標準案）で進みます。ほかに検討中の球団がいる間は、決定後も出し直せます。`
    : mobile
      ? '全員が決定すると進みます。'
      : '全員が決定した時点で処理します。この手続きに締め切りはありません。ほかに検討中の球団がいる間は、決定後も出し直せます。';
  const readyList = (
    <ul className="online-ready">
      {view.members.map((m) => (
        <li key={m.teamName} data-ready={m.ready || undefined}>
          {/* ⚠ 参加者が付けた球団名を出す。`label` は作成時の呼び名のまま */}
          {teamLabel(m.teamName)} ·{' '}
          {m.cpu ? 'CPUが決定（初期メンバー待ち）' : m.ready ? '決定済み' : '検討中'}
        </li>
      ))}
    </ul>
  );
  const alerts = (
    <>
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
    </>
  );
  const staleNote = planRevision !== null &&
    planRevision !== view.revision &&
    !phase.submission && (
      <p className="online-muted">
        他の操作で更新がありました。提出時に現在の内容を再検証します。
      </p>
    );
  const editor = plan && (
    <>
      {/* ⚠ 初期メンバー選択。開幕前はこれだけで、希望リストは出さない */}
      {phase.packs && (
        <PackSelect
          packs={phase.packs}
          plan={plan}
          busy={busy}
          view={view}
          run={run}
          command={command}
          onChange={(next) => {
            setDirty(true);
            setPlan(next);
          }}
        />
      )}
      {plan.rankedIds && (
        <TryoutPlanner
          plan={plan}
          candidates={phase.candidates}
          roster={view.roster}
          maxCount={Math.max(0, ROSTER_LIMIT - view.roster.length)}
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
          {/* ⚠ 名前だけでなく能力も並べる（トライアウトの候補と同じ1行）。
              名前を押すと詳しい成績と能力を開く */}
          <ul className="online-tryout-list online-release-list">
            {view.roster.map((p) => (
              <li key={p.id} data-wanted={plan.releaseIds.includes(p.id) || undefined}>
                <input
                  type="checkbox"
                  aria-label={`${p.name}（${p.age}歳 / ${POS[p.position]}）を退団させる`}
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
                <span className="online-tryout-person">
                  <PlayerLine player={p} />
                </span>
                {plan.releaseIds.includes(p.id) && (
                  <span className="online-tryout-mark">退団予定</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {/* ⚠ キャンプは**1クールずつその場で実行する**（一人用と同じ）。
          提出して締め切りを待つ形ではないので、決定のボタンは出さない */}
      {phase.kind === 'camp' && (
        <CampPlanner view={view} busy={busy} run={run} command={command} />
      )}
      {phase.kind === 'offseason' && (
        <p>最終順位を保存し、次年度のキャンプへ進みます。</p>
      )}
    </>
  );

  if (!mobile) {
    // ⚠ PCは**ほかの編集ページと同じ形**: 見出しの右に操作、本文にカード。
    //    以前は決定・下書きの保存が一番下（長い一覧の後ろ）にあり、
    //    ページごとに保存の場所が違うという指摘を受けた
    const readyCount = view.members.filter((m) => m.ready).length;
    return (
      <Page
        title={PHASE_LABELS[phase.kind]}
        sticky
        sub={
          `${phase.deadline ? `締め切り ${formatDeadline(phase.deadline)} · ` : ''}決定済み ${readyCount}/${view.members.length}球団` +
          (dirty ? ' · 保存していない変更があります' : phase.submission?.ready ? ' · あなたは決定済みです' : '')
        }
        actions={
          /* ⚠ **キャンプには決定の操作を出さない**。1クールずつその場で実行する
             形なので、提出して締め切りを待つものが無い。出すと「決定したのに
             クールが残っている」状態が作れてしまう */
          plan && phase.kind !== 'camp' && (
            <>
              <button disabled={busy || !dirty} onClick={resetSubmission}>
                変更を取り消す
              </button>
              <button disabled={busy} onClick={() => submit(false)}>
                {phase.submission?.ready ? '決定を取り消す' : '下書きを保存'}
              </button>
              <button
                className="online-primary"
                disabled={busy}
                onClick={() => submit(true)}
              >
                この内容で決定
              </button>
            </>
          )
        }
      >
        <fieldset className="online-form-fields online-phase" disabled={busy}>
          <section className="online-card online-phase-rules">
            <p>{rulesText}</p>
            {readyList}
            {alerts}
          </section>
          {editor && (
            <section className="online-card online-decision">
              {staleNote}
              {editor}
            </section>
          )}
          {!plan && !error && (
            <section className="online-card">
              <p>標準案を準備しています…</p>
            </section>
          )}
        </fieldset>
      </Page>
    );
  }

  return (
    <section className="online-card online-decision">
      <fieldset className="online-form-fields" disabled={busy}>
        <h2>{PHASE_LABELS[phase.kind]}</h2>
        {/* ⚠ 2人固定だった頃の「両者」という書き方を残さない。
            いまは1〜12人で、締め切りが来れば未提出でも先へ進む */}
        {/* ⚠ 「決定後も出し直せる」のは**ほかに検討中の人がいる間だけ**。
            最後の1人が決定した瞬間に処理されるので、無条件には書かない */}
        <p>{rulesText}</p>
        {readyList}
        {alerts}
        {/* ⚠ **キャンプは携帯でも回せるようにする**。表は23列あって携帯には
            入らないが、1クールずつ実行するのは携帯からでもできる必要がある
            （携帯だけの人は、出せないと4クールとも自動になる） */}
        {phase.kind === 'camp' && (
          <CampPlanner
            view={view}
            busy={busy}
            run={run}
            command={command}
            compact
          />
        )}
        {plan && phase.kind !== 'camp' && (
          <>
            <p>
              {plan.packId !== undefined
                  ? `初期メンバー: ${phase.packs?.find((x) => x.id === plan.packId)?.name || '未選択'}`
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
            {staleNote}
            <div className="online-actions">
              <button
                className="online-primary"
                disabled={busy}
                onClick={() => submit(true)}
              >
                この内容で決定
              </button>
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
/**
 * スマホ版の「打順」カード（打順の入れ替え＋采配の入口）。
 *
 * ⚠ **スマホ専用**。PCの打順・先発・投手の役割はスタメン設定・投手起用（PC専用の表）、
 *    方針と自動采配は `DesktopTactics` で決める。以前はPCもここを使っていて、
 *    同じものがコンボボックス版と一人用の画面の移植の2通りで編集できていた。
 */
export function LineupPanel({
  view,
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
  return (
    <section className="online-card online-lineup-card" hidden={hidden}>
      <div className="online-card-heading">
        <div>
          <h2>打順</h2>
          <p className="online-muted">次の試合から反映</p>
        </div>
        <button onClick={() => setShowTactics(true)}>采配</button>
        {onShowRoster && (
          <button
            onClick={onShowRoster}
            aria-label="投手・控えを含む選手成績 →"
          >
            選手成績
          </button>
        )}
      </div>
      <fieldset className="online-form-fields" disabled={busy}>
        {[...plan.battingOrder]
          .sort((a, b) => a.battingOrder - b.battingOrder)
          .map((entry, i) => (
            <div className="online-lineup" key={entry.battingOrder}>
              <b>{entry.battingOrder}</b>
              <span>{POS[entry.position]}</span>
              <span>
                <ConditionMark
                  player={view.roster.find((p) => p.id === entry.playerId) || {}}
                />
                <PlayerStatsButton
                  player={view.roster.find((p) => p.id === entry.playerId)}
                  panel="abilities"
                />
              </span>
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
      {showTactics && (
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
