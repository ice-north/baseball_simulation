import { AUTH_KEY } from './api.js';
export function readAuth(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(AUTH_KEY));
    return value &&
      typeof value.accessToken === 'string' &&
      typeof value.userId === 'string' &&
      typeof value.sessionId === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}
export function sameSession(a, b) {
  return !!(
    a &&
    b &&
    typeof a.sessionId === 'string' &&
    a.sessionId.length > 0 &&
    a.userId === b.userId &&
    a.sessionId === b.sessionId
  );
}
export function isCurrentAuth(auth, storage = globalThis.localStorage) {
  const current = readAuth(storage);
  return sameSession(current, auth) && current.accessToken === auth.accessToken;
}
export function persistRefresh(
  expected,
  next,
  storage = globalThis.localStorage,
) {
  if (!isCurrentAuth(expected, storage)) return false;
  storage.setItem(AUTH_KEY, JSON.stringify(next));
  return true;
}
export function clearAuth(expected, storage = globalThis.localStorage) {
  if (sameSession(readAuth(storage), expected)) storage.removeItem(AUTH_KEY);
}
