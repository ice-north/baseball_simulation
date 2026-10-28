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
export const MENUS = {
  standard: '標準（投手は制球・野手は打撃）',
  batting: '打撃練習',
  baserunning: '走塁練習',
  fielding: 'ノック',
  control: '投げ込み',
  velocity: '球速練習',
  intensive_power: '長打集中',
  intensive_meet: '巧打集中',
  intensive_speed: '走力集中',
  intensive_control: '制球集中',
  intensive_velocity: '球速集中',
  intensive_defense: '守備集中',
  intensive_eye: '選球眼集中',
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
export async function api(action, auth, body) {
  let response;
  try {
    response = await fetch(`/api/online?action=${action}`, {
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
    });
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
