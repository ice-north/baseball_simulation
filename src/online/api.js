export const AUTH_KEY = 'baseball-online-auth-v1';
export const POS = {
  pitcher: '投',
  catcher: '捕',
  first: '一',
  second: '二',
  third: '三',
  short: '遊',
  left: '左',
  center: '中',
  right: '右',
};
/**
 * 守備位置の正式名。⚠ **短縮（`POS`）と同じ場所に置くこと**。別々の場所に
 *    置くと、片方だけ直して画面ごとに呼び方が変わる。
 */
export const POS_FULL = {
  pitcher: '投手',
  catcher: '捕手',
  first: '一塁',
  second: '二塁',
  third: '三塁',
  short: '遊撃',
  left: '左翼',
  center: '中堅',
  right: '右翼',
};
export const STATUS = {
  running: '進行中',
  waiting: '決定待ち',
  paused: '一時停止',
  error: '要確認・停止中',
};
export const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '停止中';
export async function api(action, auth, body, query = {}) {
  let response;
  try {
    response = await fetch(
      `/api/online?${new window.URLSearchParams({ action, ...query })}`,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(auth
            ? {
                Authorization: `Bearer ${auth.accessToken}`,
                'X-Online-Session': auth.sessionId,
              }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: window.AbortSignal.timeout(290000),
      },
    );
  } catch {
    throw new Error(
      '通信結果を確認できません。再読込して最新の状態を確認してください',
    );
  }
  let result;
  try {
    result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error();
  } catch {
    throw new Error(
      'サーバーの応答を確認できません。再読み込みして状態を確認してください',
    );
  }
  if (!response.ok) {
    const error = new Error(
      typeof result.error === 'string'
        ? result.error
        : 'サーバー処理に失敗しました。最新状態を確認してください',
    );
    error.code = result.code;
    throw error;
  }
  return result;
}
