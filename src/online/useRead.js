import { createContext, useContext, useEffect, useState } from 'react';
export const ReadContext = createContext(null);
export function useRead(action, query) {
  const read = useContext(ReadContext);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    data: null,
    error: '',
    loading: !!action,
  });
  const key = JSON.stringify(query);
  useEffect(() => {
    if (!action) return;
    let cancelled = false;
    setResult({ data: null, error: '', loading: true });
    Promise.resolve()
      .then(() => {
        if (!read) throw new Error('ログイン状態を確認できません');
        return read(action, JSON.parse(key));
      })
      .then((data) => {
        if (!cancelled) setResult({ data, error: '', loading: false });
      })
      .catch((error) => {
        if (!cancelled)
          setResult({ data: null, error: error.message, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [action, key, attempt, read]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}
