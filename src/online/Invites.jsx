import React, { useCallback, useEffect, useState } from 'react';
import { api, dateTime } from './api.js';

/**
 * 招待リンク（`server/invites.mjs`）。
 *
 * 人を増やす手順は「管理者がリンクを作って送る → 相手がリンクを開き、メールとパスワードを決める」だけ。
 * ⚠ 以前は管理者が Supabase の画面でアカウントを作り（Auto Confirm User を付け忘れると
 *    ログインできない）、パスワードまで決めて渡していた。管理者はプログラマではないので、
 *    Supabase の画面を開かずに済むようにした。
 */

/** 招待のURL。⚠ 開く先はオンラインの入口（`/online`。`vercel.json` の書き換え） */
export const inviteUrl = (token, origin = window.location.origin) =>
  `${origin}/online?invite=${encodeURIComponent(token)}`;

/** 開いたURLの招待の合言葉。無ければ null */
export const readInviteToken = (search = window.location.search) =>
  new window.URLSearchParams(search).get('invite') || null;

/** URLから合言葉を消す（登録のあとに再読み込みしても、もう一度登録画面を出さない） */
export function forgetInviteToken() {
  const url = new window.URL(window.location.href);
  if (!url.searchParams.has('invite')) return;
  url.searchParams.delete('invite');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** リーグ管理: 招待リンクを作る・未使用の一覧・取り消し（管理者だけ） */
export function InvitesAdmin({ invitesApi, busy, run }) {
  const [invites, setInvites] = useState(null);
  const [made, setMade] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    try {
      setInvites((await invitesApi.list()).invites);
      setLoadError('');
    } catch (error) {
      setLoadError(error.message);
    }
  }, [invitesApi]);
  useEffect(() => {
    load();
  }, [load]);
  const copy = async (text) => {
    try {
      await window.navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="online-card">
      <h2>参加者を招待</h2>
      <p className="online-muted">
        招待リンクを作って、LINEやメールで送ってください。受け取った人はリンクを開いてメールアドレスとパスワードを決めると、そのまま参加できます。
        リンクは1人1回だけ使えて、7日で切れます。
      </p>
      <div className="online-actions">
        <button
          className="online-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await invitesApi.send({ type: 'create' });
              setMade({ url: inviteUrl(result.token), expiresAt: result.expiresAt });
              setCopied(false);
              setInvites(result.invites);
            })
          }
        >
          招待リンクを作る
        </button>
      </div>
      {made && (
        <div className="online-invite-made" role="status">
          <p>
            このリンクを送ってください（{dateTime(made.expiresAt)}まで有効）。
            このリンクはこの画面を閉じると二度と表示されません。
          </p>
          <input
            readOnly
            value={made.url}
            aria-label="招待リンク"
            onFocus={(e) => e.target.select()}
          />
          <div className="online-actions">
            <button onClick={() => copy(made.url)}>{copied ? 'コピーしました' : 'コピー'}</button>
          </div>
        </div>
      )}
      {loadError && <p className="online-muted">{loadError}</p>}
      {invites && (
        <>
          <h3>まだ使われていない招待</h3>
          {!invites.length ? (
            <p className="online-muted">ありません。</p>
          ) : (
            <ul className="online-owner-list">
              {invites.map((invite) => (
                <li key={invite.id}>
                  <span>{dateTime(invite.createdAt)}に作成</span>
                  <small className="online-muted">{dateTime(invite.expiresAt)}まで</small>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await invitesApi.send({ type: 'revoke', id: invite.id });
                        setInvites(result.invites);
                      })
                    }
                  >
                    取り消す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** 招待リンクを開いた人の登録画面（ログイン前） */
export function InviteSignup({ token, busy, run, signedUp, skip }) {
  const [state, setState] = useState({ checking: true });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  useEffect(() => {
    let cancelled = false;
    api('inviteCheck', null, undefined, { invite: token })
      .then((result) => !cancelled && setState({ ok: true, expiresAt: result.expiresAt }))
      .catch((error) => !cancelled && setState({ error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [token]);
  const mismatch = again && password !== again;
  return (
    <section className="online-card online-login">
      <p className="online-eyebrow">INVITATION</p>
      <h1>リーグに招待されました</h1>
      {state.checking ? (
        <p>招待リンクを確かめています…</p>
      ) : state.error ? (
        <>
          <p>{state.error}</p>
          <button onClick={skip}>ログイン画面へ</button>
        </>
      ) : (
        <>
          <p>
            ログインに使うメールアドレスとパスワードを決めてください。登録するとそのまま参加の画面に進みます。
            （{dateTime(state.expiresAt)}まで有効）
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (password !== again) return;
              run(async () => {
                const result = await api('inviteRedeem', null, {
                  invite: token,
                  email,
                  password,
                });
                signedUp(result);
              });
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
              パスワード（8文字以上）
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              パスワード（確認）
              <input
                type="password"
                autoComplete="new-password"
                required
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
            </label>
            {mismatch && <p className="online-muted">パスワードが一致していません。</p>}
            <button className="online-primary" disabled={busy || mismatch}>
              登録して参加へ進む
            </button>
          </form>
          <button disabled={busy} onClick={skip}>
            もうアカウントがある（ログイン画面へ）
          </button>
        </>
      )}
    </section>
  );
}
