import { useEffect, useState } from 'react';
import { api } from './api.js';
import { readAuth } from './authState.js';
export function useRead(action, query) {
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
    api(action, readAuth(), undefined, JSON.parse(key))
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
  }, [action, key, attempt]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}
