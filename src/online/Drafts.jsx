import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';

const Context = createContext(null);
const prefix = 'baseball-online-draft:';
export function Drafts({ scope, children }) {
  const cache = useMemo(() => {
    const key = prefix + scope;
    let values = {};
    let restoreError = false;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw && raw.length >= 64000) restoreError = true;
      if (raw && raw.length < 64000) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          values = parsed;
      }
    } catch {
      /* 保存禁止のブラウザでも、画面間の保持は続ける。 */
    }
    return {
      key,
      values,
      restoreError,
      write(name, value) {
        this.values[name] = value;
        try {
          sessionStorage.setItem(key, JSON.stringify(this.values));
        } catch {
          /* メモリ内には残す。 */
        }
      },
    };
  }, [scope]);
  useEffect(() => {
    try {
      sessionStorage.setItem(cache.key, JSON.stringify(cache.values));
    } catch {
      /* メモリ内には残す。 */
    }
    const warn = (event) => {
      if (!cache.values['lineup.dirty'] && !cache.values['phase.dirty']) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      try {
        sessionStorage.removeItem(cache.key);
      } catch {
        /* 任意の保存領域 */
      }
    };
  }, [cache]);
  return (
    <Context.Provider value={cache}>
      {cache.restoreError && (
        <p role="alert" className="online-alert">
          未保存案が大きすぎるため復元できませんでした。サーバーに保存済みの内容を表示します。
        </p>
      )}
      {children}
    </Context.Provider>
  );
}

// 同時に表示するフォームは一つ。保存先の値を同期更新し、アンマウント直前の入力も保持する。
export function useDraftState(name, initial) {
  const cache = useContext(Context);
  const [value, setValue] = useState(() => {
    if (cache && Object.hasOwn(cache.values, name)) return cache.values[name];
    const next = typeof initial === 'function' ? initial() : initial;
    if (cache) cache.values[name] = next;
    return next;
  });
  const current = useRef(value);
  current.current = value;
  const update = useCallback(
    (next) => {
      const previous = cache ? cache.values[name] : current.current;
      const result = typeof next === 'function' ? next(previous) : next;
      cache?.write(name, result);
      current.current = result;
      setValue(result);
    },
    [cache, name],
  );
  return [value, update];
}
