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
/** 指導者の任せ方の下書き（変えた分野だけ `{ area: mode }`。`StaffPage.jsx` の `Modes`） */
export const STAFF_MODES_DRAFT = 'staff.modes';
/**
 * スマホの打順（2タップの表 `TapLineup.jsx`）の編集。中身は `tapLineup.js` の入れ物に
 * `dirty`（保存していない編集があるか）を添えたもの。⚠ PCの画面に切り替わったら
 * PCが引き取って消す（`DesktopView.jsx`。残すとPCで保存・取り消した後に古い編集が戻る）
 */
export const LINEUP_ORDER_DRAFT = 'lineup.order';
export function Drafts({ scope, phaseId = null, children }) {
  // 閉じる前の確認は、いま開いている手続きの下書きだけを見る（終わった手続きの印で警告しない）
  const phaseRef = useRef(phaseId);
  phaseRef.current = phaseId;
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
      // 画面の作り直しをまたいで持ち続ける、保存しない大きな値（全画面の編成で編集中の球団など）
      memory: new Map(),
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
      const staffModes = Object.keys(cache.values[STAFF_MODES_DRAFT] || {}).length > 0;
      if (!cache.values['lineup.dirty'] && !cache.values[LINEUP_ORDER_DRAFT]?.dirty && !cache.values[phaseDraftName(phaseRef.current, 'dirty')] && !staffModes)
        return;
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

/** 手続きごとの下書きの名前。手続きが替わったら別の下書きになる */
export const phaseDraftName = (phaseId, name) => `phase:${phaseId || 'none'}.${name}`;

/**
 * 画面が作り直されても同じオブジェクトを返す（この `Drafts` の中だけ、保存はしない）。
 * ⚠ スマホを横向きにすると、スマホ用とPC用の画面が入れ替わって下の部品が作り直される。
 *    全画面の編成は球団の写しをその場で書き換えるので、部品の中に持っていると
 *    回転しただけで編集が黙って消えていた。
 * @returns {[value, discard]} discard() で捨てる（次は create() から作り直す）
 */
export function useDraftMemory(name, create, keep = () => true) {
  const cache = useContext(Context);
  // 部品を作るときに1回だけ決める（残っている値が使えなければ作り直す）
  const [value] = useState(() => {
    const store = cache?.memory;
    if (store?.has(name) && keep(store.get(name))) return store.get(name);
    const next = create();
    store?.set(name, next);
    return next;
  });
  const discard = useCallback(() => {
    cache?.memory.delete(name);
  }, [cache, name]);
  return [value, discard];
}

/** `useDraftMemory` で持っている値を覗く（無ければ undefined）。作りはしない */
export function useDraftMemoryPeek(name) {
  const cache = useContext(Context);
  return cache?.memory.get(name);
}
/** 保存しない大きな値の入れ物そのもの（PCとスマホの編成画面で、同じ編集中の球団を受け渡す） */
export function useDraftMemoryStore() {
  return useContext(Context)?.memory || null;
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
