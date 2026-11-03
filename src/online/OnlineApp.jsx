import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatGameDate, PROGRESSION_TIMES } from './shared.js';
import './online.css';
import { api, AUTH_KEY, dateTime, STATUS } from './api.js';
import { Login, JoinLeague } from './LeaguePanels.jsx';
import DesktopView from './DesktopView.jsx';
import MobileView from './MobileView.jsx';
import { ReadContext } from './useRead.js';
import { setTeamLabels, teamLabel } from './gameText.js';
import { Drafts } from './Drafts.jsx';
import {
  readAuth,
  sameSession,
  isCurrentAuth,
  persistRefresh,
  clearAuth,
} from './authState.js';
// 別アカウントへ切替後も、旧タブの読取り応答で書込み権限を復活させない。
const viewForSession = (result, current) => {
  // ⚠ **描画より前に差し替えること**。球団名の表示は
  //    `gameText` のモジュール変数を引くので、ビューを受け取った時点で入れる
  setTeamLabels(result.teamLabels);
  return {
  ...result,
  // ⚠ `versionMismatch` も書ける扱いにする。ここを外すと「更新を取り込む」が
  //    押せず、古い形から抜け出せなくなる（取り込みは書き込みなので）
  writable:
    sameSession(readAuth(), current) &&
    !!(result.setupRequired || result.versionMismatch || result.writable),
  };
};
function useMobile() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia('(max-width: 767px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return mobile;
}
const COMMAND_MESSAGES = {
  create: 'リーグを作成しました',
  join: 'リーグに参加しました',
  migrate: '保存を新しい形式に移しました',
  pause: '進行を停止しました',
  resume: '進行を再開しました',
  backup: 'バックアップを取りました',
  restore: 'バックアップから戻しました',
  step: 'ターンを進めました',
  testmode: '検証モードを切り替えました',
  resolve: '手続きを締め切りました',
  reset: 'すべて消しました。リーグを作り直してください',
};

export default function OnlineApp() {
  const [auth, setAuth] = useState(readAuth);
  const [config, setConfig] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showTimes, setShowTimes] = useState(false);
  const [busy, setBusy] = useState(false);
  // 表示幅でPC/スマホの部品が切り替わっても、選択中の画面は失わない。
  const [screen, setScreen] = useState('today');
  const locked = useRef(false);
  const viewSequence = useRef(0);
  const refreshFlight = useRef(null);
  const timesDialog = useRef(null);
  const mobile = useMobile();
  const authRef = useRef(auth);
  authRef.current = auth;
  const saveAuth = useCallback((value) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    authRef.current = value;
    viewSequence.current++;
    setAuth(value);
    setView(null);
    setScreen('today');
  }, []);
  const renewAuth = useCallback(async (expected) => {
    const pending = refreshFlight.current;
    if (
      pending &&
      pending.auth.accessToken === expected.accessToken &&
      sameSession(pending.auth, expected)
    )
      return pending.promise;
    const promise = api('refresh', null, {
      refreshToken: expected.refreshToken,
    }).then((result) => {
      const next = { ...expected, ...result };
      if (authRef.current === expected && persistRefresh(expected, next)) {
        authRef.current = next;
        setAuth(next);
        setError('');
      }
      return next;
    });
    const flight = { auth: expected, promise };
    refreshFlight.current = flight;
    try {
      return await promise;
    } finally {
      if (refreshFlight.current === flight) refreshFlight.current = null;
    }
  }, []);
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== AUTH_KEY) return;
      const next = readAuth();
      if (sameSession(next, authRef.current)) {
        authRef.current = next;
        setAuth(next);
      } else {
        viewSequence.current++;
        setView((old) => (old ? { ...old, writable: false } : old));
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    let cancelled = false;
    api('config')
      .then((value) => {
        if (!cancelled) setConfig(value);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const reload = useCallback(async () => {
    const current = authRef.current;
    if (!current) return;
    const sequence = ++viewSequence.current;
    const result = await api('view', current);
    if (
      sameSession(authRef.current, current) &&
      sequence === viewSequence.current
    )
      setView(viewForSession(result, current));
  }, []);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (
        document.hidden ||
        locked.current ||
        (auth?.refreshToken && auth.expiresAt <= Date.now())
      )
        return;
      try {
        const sequence = ++viewSequence.current;
        const result = await api('view', auth);
        if (!cancelled && sequence === viewSequence.current)
          setView(viewForSession(result, auth));
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    if (!auth) return;
    poll();
    const timer = setInterval(poll, 60000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [auth]);
  useEffect(() => {
    if (!auth?.refreshToken) return;
    let cancelled = false;
    const refresh = async () => {
      if (
        cancelled ||
        locked.current ||
        !isCurrentAuth(auth) ||
        auth.expiresAt > Date.now() + 120000
      )
        return;
      try {
        await renewAuth(auth);
      } catch (e) {
        if (!cancelled && authRef.current === auth && isCurrentAuth(auth))
          setError(e.message);
      }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [auth, renewAuth]);
  const readDetail = useCallback(
    async (action, query) => {
      const expected = authRef.current;
      const check = () => {
        if (
          !sameSession(readAuth(), expected) ||
          !sameSession(authRef.current, expected)
        )
          throw new Error(
            '別のタブでログインが変更されました。ログインし直してください。',
          );
      };
      check();
      const credentials =
        expected.refreshToken && expected.expiresAt <= Date.now()
          ? await renewAuth(expected)
          : expected;
      check();
      const result = await api(action, credentials, undefined, query);
      check();
      return result;
    },
    [renewAuth],
  );
  // 結果を `{ ok, error }` で返す。⚠ 失敗しても例外は外へ出さない（文言は上の帯に出す）。
  //    呼ぶ側が成否で振る舞いを変えたいとき（全画面の編成を閉じるか）に使う
  const run = async (fn) => {
    if (locked.current) return { ok: false, error: '別の操作を処理中です' };
    locked.current = true;
    viewSequence.current++;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      return { ok: true };
    } catch (e) {
      setError(e.message);
      try {
        await reload();
      } catch {
        /* 通信失敗の文言を保持 */
      }
      return { ok: false, error: e.message };
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const command = async (type, payload) => {
    const current = authRef.current;
    const checkSession = (credentials) => {
      if (!sameSession(readAuth(), credentials))
        throw new Error(
          '別のタブでログインが変更されました。操作するにはログインし直してください。',
        );
    };
    checkSession(current);
    const credentials =
      current?.refreshToken && current.expiresAt <= Date.now()
        ? await renewAuth(current)
        : current;
    checkSession(credentials);
    const send = (revision) =>
      api('command', credentials, {
        requestId: crypto.randomUUID(),
        revision,
        type,
        payload,
      });
    try {
      await send(view?.revision || 0);
    } catch (error) {
      // ⚠ **編成と手続きの提出は、版のずれだけなら最新の版で1回だけ送り直す**。
      //    版はリーグ全体で1つなので、毎正時の進行や他の参加者の操作だけで
      //    「他の操作で更新されました」になり、編成を保存し直す羽目になっていた。
      //    どちらも自分の保存済みの内容（`baseLineup` / `baseSubmission`）で
      //    本当の食い違いを別に確かめているので、送り直しても上書き事故は起きない。
      if (error?.code !== 'revision' || !['lineup', 'submit'].includes(type))
        throw error;
      const latest = await api('view', credentials);
      await send(latest?.revision || 0);
    }
    await reload();
    // ⚠ 操作ごとに文言を変える。作成や参加でも「保存しました」と出ていた
    setMessage(COMMAND_MESSAGES[type] || '保存しました');
  };
  const login = (fields) =>
    run(async () => saveAuth(await api('login', null, fields)));
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (showTimes) timesDialog.current?.showModal();
  }, [showTimes]);
  const logout = () =>
    run(async () => {
      const expected = authRef.current;
      try {
        const current =
          expected.refreshToken && expected.expiresAt <= Date.now()
            ? await renewAuth(expected)
            : expected;
        await api('logout', current, {});
      } finally {
        clearAuth(expected);
        authRef.current = null;
        viewSequence.current++;
        setAuth(null);
        setView(null);
        setShowTimes(false);
        setScreen('today');
      }
    });
  // ⚠ 更新の取り込み待ちの画面ではヘッダー（ログアウト）を隠さない。
  //    スマホではここに戻る手段が他に無く、ログアウトできなくなっていた
  const compactMobile = mobile && view && !view.setupRequired && !view.versionMismatch;
  return (
    <div
      className={`online ${mobile ? 'online-mobile' : 'online-desktop'} ${compactMobile ? 'online-compact-shell' : ''}`}
    >
      {!compactMobile && (
        <header className="online-header">
          <a href="/online" className="online-brand">
            NEXT STAGE <span>オンラインペナント</span>
          </a>
          <TestControls
            view={view}
            allowStep={config?.allowStep}
            busy={busy}
            run={run}
            command={command}
          />
          <nav>
            <a href="/">一人用</a>
            {auth && (
              <button onClick={logout} disabled={busy}>
                ログアウト
              </button>
            )}
          </nav>
        </header>
      )}
      <main>
        {config?.local && !compactMobile && (
          <p className="online-dev">ローカル検証モード（公開環境では無効）</p>
        )}
        {error && (
          <div role="alert" className="online-alert">
            {error}
            {(!config || auth) && (
              <button
                onClick={() =>
                  run(
                    config
                      ? reload
                      : async () => setConfig(await api('config')),
                  )
                }
                disabled={busy}
              >
                {config ? '最新状態を確認' : '接続を再確認'}
              </button>
            )}
          </div>
        )}
        {message && (
          <p role="status" className="online-success">
            {message}
          </p>
        )}
        {!config ? (
          <p>接続を確認しています…</p>
        ) : !auth ? (
          <Login local={config.local} login={login} busy={busy} />
        ) : !view ? (
          <p>リーグを読み込んでいます…</p>
        ) : view.joinRequired ? (
          <JoinLeague
            busy={busy || !view.writable}
            logout={logout}
            join={(payload) => run(() => command('join', payload))}
          />
        ) : view.versionMismatch ? (
          /* ⚠ 古い形のリーグ。**黙って表示しないこと**。以前は版の印が無く、
             4球団の頃のリーグが2部制のコードでそのまま出ていた。
             ⚠ `canMigrate` が false でも管理者には押させる。保存済みのビューを
             返す経路では中身を見られないので判定できず、ここで隠すと
             「取り込めるのにボタンが無い」が起きる。押せば理由が返る */
          <section className="online-card">
            <h1>ゲームの更新を取り込みます</h1>
            <p>
              保存されている世界の形が、いまのゲームと違います。取り込むまで試合は進みません。
            </p>
            {view.reason && <p className="online-muted">{view.reason}</p>}
            {view.isAdmin ? (
              <>
                <button
                  className="online-primary"
                  disabled={busy || !view.writable}
                  onClick={() => run(() => command('migrate'))}
                >
                  更新を取り込む
                </button>
                <p className="online-muted online-spaced">
                  次の正時の自動処理でも取り込まれます。取り込めない形式だった場合は、押すと理由が表示されます。
                </p>
              </>
            ) : (
              <p>管理者が取り込むまでお待ちください。自動でも取り込まれます。</p>
            )}
          </section>
        ) : view.setupRequired ? (
          <section className="online-card">
            <h1>リーグの準備</h1>
            <p>1部6球団・2部6球団の12球団でスタートします。</p>
            {view.isAdmin && !mobile ? (
              <button
                className="online-primary"
                disabled={busy || !view.writable}
                onClick={() => run(() => command('create'))}
              >
                リーグを作成
              </button>
            ) : (
              <p>管理者がPCからリーグを作成するまでお待ちください。</p>
            )}
          </section>
        ) : (
          <>
            {!compactMobile && (
              <>
                <section className="online-season">
                  <div>
                    <p>
                      SEASON {view.year} · {teamLabel(view.teamName)}
                    </p>
                    <h1>
                      {formatGameDate(view.currentDate)}{' '}
                      <small>{STATUS[view.status]}</small>
                    </h1>
                  </div>
                  <div className="online-next">
                    次の進行（日本時間）
                    <strong>{dateTime(view.nextAdvanceAt)}</strong>
                    <button disabled={busy} onClick={() => run(reload)}>
                      更新
                    </button>
                  </div>
                </section>
                <div className="online-clock-info">
                  {/* ⚠ 進行の刻みを変えたらここも直すこと。
                      毎正時24ターンに変えたあと「1日7回・夜間は休止」が
                      残っていた（画面だけ古い説明を出し続けていた）。 */}
                  <span>毎正時・月〜金が試合／土日は手続き</span>
                  <button onClick={() => setShowTimes(true)}>進行時刻</button>
                </div>
              </>
            )}
            {!view.writable && (
              <p role="alert" className="online-alert">
                別の端末でログインしたため閲覧のみです。操作するにはログインし直してください。
              </p>
            )}
            {view.error && (
              <p role="alert" className="online-alert">
                {view.error}
              </p>
            )}
            <ReadContext.Provider value={readDetail}>
              {/* ⚠ **手続きの切り替わりで作り直さないこと**（鍵に手続きを入れない）。
                  以前は手続きが締め切られた瞬間に下の画面がまるごと作り直され、
                  編集中の打順（全画面の編成も含む）が黙って消えていた。
                  手続きごとの下書きは、名前に手続きの id を入れて分けている（`PhasePanel`）。 */}
              <Drafts
                key={`${auth.userId}:${auth.sessionId}:${view.year}:${view.teamName}`}
                scope={`${auth.userId}:${auth.sessionId}:${view.year}:${view.teamName}`}
                phaseId={view.phase?.id || null}
              >
                {mobile ? (
                  <MobileView
                    tab={screen === 'admin' ? 'today' : screen}
                    setTab={setScreen}
                    view={view}
                    local={config.local}
                    allowStep={config.allowStep}
                    loading={busy}
                    reloadView={() => run(reload)}
                    logout={logout}
                    showTimes={() => setShowTimes(true)}
                    auth={auth}
                    busy={busy || !view.writable}
                    run={run}
                    command={command}
                  />
                ) : (
                  <DesktopView
                    tab={screen === 'news' ? 'games' : screen}
                    setTab={setScreen}
                    view={view}
                    auth={auth}
                    local={config.local}
                    allowStep={config.allowStep}
                    busy={busy || !view.writable}
                    run={run}
                    command={command}
                  />
                )}
              </Drafts>
            </ReadContext.Provider>
          </>
        )}
        {showTimes && (
          <dialog
            ref={timesDialog}
            className="online-overlay"
            onClose={() => setShowTimes(false)}
            aria-label="進行時刻"
          >
            <section className="online-card">
              <h2>進行時刻（日本時間）</h2>
              <p>{PROGRESSION_TIMES.join(' / ')}</p>
              <p>
                各時刻に1日進みます。決定待ち・停止中の分は後からまとめて進めません。
              </p>
              <button autoFocus onClick={() => timesDialog.current.close()}>
                閉じる
              </button>
            </section>
          </dialog>
        )}
        {busy && (
          <p role="status" className="online-working">
            処理中です。画面を閉じずにお待ちください…
          </p>
        )}
      </main>
    </div>
  );
}

/**
 * 見出しに置く検証用のボタン（管理者・検証モードの間だけ）。
 *
 * ⚠ **遊んでいるリーグでは出さないこと**。1日進められる／全部消せるのは、
 *    作っている間に時間を待たずに試すためのもの。検証モード（`testMode`）か
 *    環境変数（`ONLINE_ALLOW_STEP`）が立っているときだけ出す。
 * ⚠ 「1日程進める」は、決定待ちの手続きがあれば**それを締め切る**。
 *    手続き中は試合が進まないので、そうしないとボタンが効かない日が続く。
 * ⚠ リセットは**二度押し**にする。押し間違いで全員の成績が消える。
 */
function TestControls({ view, allowStep, busy, run, command }) {
  const [confirming, setConfirming] = useState(false);
  // ⚠ **リーグがまだ無いときは出さない**。押しても「リーグがまだありません」で
  //    断られるだけで、リセット直後に押せるように見えるのが紛らわしい
  if (!view || view.setupRequired || view.joinRequired) return null;
  if (!view.isAdmin || !(view.testMode || allowStep)) return null;
  const waiting = !!view.phase;
  return (
    <div className="online-testbar">
      <button
        disabled={busy || (!waiting && view.status !== 'running')}
        title={
          waiting
            ? '決定待ちの手続きをいま締め切ります'
            : '1ターン（ゲーム内1日・1試合）進めます'
        }
        onClick={() => run(() => command(waiting ? 'resolve' : 'step'))}
      >
        1日程進める
      </button>
      {confirming ? (
        <>
          <button
            className="online-danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await command('reset');
                setConfirming(false);
              })
            }
          >
            本当に消す
          </button>
          <button disabled={busy} onClick={() => setConfirming(false)}>
            やめる
          </button>
        </>
      ) : (
        <button
          disabled={busy}
          title="リーグも成績もすべて消して、作成前の状態に戻します"
          onClick={() => setConfirming(true)}
        >
          全データリセット
        </button>
      )}
    </div>
  );
}
