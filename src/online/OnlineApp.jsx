import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatGameDate, PROGRESSION_TIMES } from './shared.js';
import './online.css';
import { api, AUTH_KEY, dateTime, STATUS } from './api.js';
import { Login } from './LeaguePanels.jsx';
import DesktopView from './DesktopView.jsx';
import MobileView from './MobileView.jsx';
import { Drafts } from './Drafts.jsx';
import {
  readAuth,
  sameSession,
  isCurrentAuth,
  persistRefresh,
  clearAuth,
} from './authState.js';
// 別アカウントへ切替後も、旧タブの読取り応答で書込み権限を復活させない。
const viewForSession = (result, current) => ({
  ...result,
  writable:
    sameSession(readAuth(), current) &&
    !!(result.setupRequired || result.writable),
});
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
  const run = async (fn) => {
    if (locked.current) return;
    locked.current = true;
    viewSequence.current++;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      try {
        await reload();
      } catch {
        /* 通信失敗の文言を保持 */
      }
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
    await api('command', credentials, {
      requestId: crypto.randomUUID(),
      revision: view?.revision || 0,
      type,
      payload,
    });
    await reload();
    setMessage('保存しました');
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
  const compactMobile = mobile && view && !view.setupRequired;
  return (
    <div
      className={`online ${mobile ? 'online-mobile' : 'online-desktop'} ${compactMobile ? 'online-compact-shell' : ''}`}
    >
      {!compactMobile && (
        <header className="online-header">
          <a href="/online" className="online-brand">
            NEXT STAGE <span>オンラインペナント</span>
          </a>
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
        ) : view.setupRequired ? (
          <section className="online-card">
            <h1>リーグの準備</h1>
            <p>固定4球団、参加者2人でスタートします。</p>
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
                      SEASON {view.year} · {view.teamName}
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
                  <span>1日7回・夜間は休止</span>
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
            <Drafts
              key={`${auth.userId}:${auth.sessionId}:${view.year}:${view.teamName}:${view.phase?.id || 'season'}`}
              scope={`${auth.userId}:${auth.sessionId}:${view.year}:${view.teamName}:${view.phase?.id || 'season'}`}
            >
              {mobile ? (
                <MobileView
                  tab={screen === 'admin' ? 'today' : screen}
                  setTab={setScreen}
                  view={view}
                  local={config.local}
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
                  busy={busy || !view.writable}
                  run={run}
                  command={command}
                />
              )}
            </Drafts>
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
