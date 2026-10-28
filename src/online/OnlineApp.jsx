import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatGameDate, PROGRESSION_TIMES } from './shared.js';
import './online.css';
import { api, AUTH_KEY, dateTime, STATUS } from './api.js';
import { Login } from './LeaguePanels.jsx';
import DesktopView from './DesktopView.jsx';
import MobileView from './MobileView.jsx';
function readAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}
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
  const locked = useRef(false);
  const viewSequence = useRef(0);
  const mobile = useMobile();
  const authRef = useRef(auth);
  authRef.current = auth;
  const saveAuth = useCallback((value) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    setAuth(value);
    setView(null);
  }, []);
  useEffect(() => {
    api('config')
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  const reload = useCallback(async () => {
    if (!auth) return;
    const sequence = ++viewSequence.current;
    const result = await api('view', auth);
    if (authRef.current === auth && sequence === viewSequence.current)
      setView(result);
  }, [auth]);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.hidden || locked.current) return;
      try {
        const sequence = ++viewSequence.current;
        const result = await api('view', auth);
        if (!cancelled && sequence === viewSequence.current) setView(result);
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
    const timer = setInterval(async () => {
      if (auth.expiresAt > Date.now() + 120000 || locked.current) return;
      try {
        const result = await api('refresh', null, {
          refreshToken: auth.refreshToken,
        });
        if (!cancelled) {
          const next = { ...auth, ...result };
          localStorage.setItem(AUTH_KEY, JSON.stringify(next));
          setAuth(next);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [auth, saveAuth]);
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
    await api('command', auth, {
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
  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setView(null);
    setError('');
  };
  return (
    <div className={`online ${mobile ? 'online-mobile' : 'online-desktop'}`}>
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
      <main>
        {config?.local && (
          <p className="online-dev">ローカル検証モード（公開環境では無効）</p>
        )}
        {error && (
          <div role="alert" className="online-alert">
            {error}
            <button onClick={() => run(reload)} disabled={busy || !auth}>
              最新状態を確認
            </button>
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
                disabled={busy}
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
            {mobile ? (
              <MobileView
                view={view}
                auth={auth}
                busy={busy || !view.writable}
                run={run}
                command={command}
              />
            ) : (
              <DesktopView
                view={view}
                auth={auth}
                local={config.local}
                busy={busy || !view.writable}
                run={run}
                command={command}
              />
            )}
          </>
        )}
        {showTimes && (
          <div
            className="online-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="進行時刻"
          >
            <section className="online-card">
              <h2>進行時刻（日本時間）</h2>
              <p>{PROGRESSION_TIMES.join(' / ')}</p>
              <p>
                各時刻に1日進みます。決定待ち・停止中の分は後からまとめて進めません。
              </p>
              <button autoFocus onClick={() => setShowTimes(false)}>
                閉じる
              </button>
            </section>
          </div>
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
