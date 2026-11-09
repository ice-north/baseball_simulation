/**
 * 読むだけの窓口（`team` / `player` / `games` / `game` / `defaults`）の答えを覚えておく。
 *
 * 【なぜ】選手を押す・試合一覧のページを戻る・トレードの相手を選び直すたびに、毎回サーバーへ
 *   取りに行っていた（そのたびに「読み込み中」）。答えはリーグに何か書かれるまで変わらない。
 *
 * 【いつまで使うか】リーグの版（view.revision）が同じ間だけ。版は試合が進む・誰かが保存する
 *   たびに上がるので、上がったら次に開いたときに取り直す。
 *   終わった試合の詳細（`game`）は後から変わらないので、版に関係なく使い回す。
 *
 * ⚠ 失敗は覚えない（次に開いたときにやり直す）。
 * ⚠ 同じものを同時に読みに行ったら、1本の通信にまとめる。
 * ⚠ ログインし直したら捨てる（`clear`）。別の人の答えを見せないため。
 *    アプリ（mobile の AppViewModel.read）も同じ決まりで覚えている。
 */
const LIMIT = 60;
// 版に関係なく使い回すもの（後から変わらない）
const STABLE = new Set(['game']);

const keyOf = (action, query) => {
  const entries = Object.entries(query || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .sort();
  return `${action}?${entries.join('&')}`;
};

export function createReadCache({ limit = LIMIT } = {}) {
  const entries = new Map();
  const flights = new Map();
  // 捨てた（`clear`）あとに返ってきた古い通信の答えを覚えないための印
  let epoch = 0;
  const fresh = (action, entry, revision) =>
    !!entry &&
    (STABLE.has(action) ||
      (Number.isInteger(revision) && entry.revision === revision));
  return {
    /** 覚えていて、まだ使えるなら答えを返す（無ければ undefined） */
    peek(action, query, revision) {
      const key = keyOf(action, query);
      const entry = entries.get(key);
      return fresh(action, entry, revision) ? entry.value : undefined;
    },
    /** 覚えていればそれを、無ければ `load()` で取って覚える */
    async get(action, query, revision, load) {
      const key = keyOf(action, query);
      const entry = entries.get(key);
      if (fresh(action, entry, revision)) {
        // 最近使った順に並べ直す（古いものから捨てるため）
        entries.delete(key);
        entries.set(key, entry);
        return entry.value;
      }
      const flightKey = `${key}#${revision}`;
      if (flights.has(flightKey)) return flights.get(flightKey);
      const started = epoch;
      const flight = (async () => {
        const value = await load();
        if (started === epoch) {
          entries.delete(key);
          entries.set(key, { revision, value });
          while (entries.size > limit) entries.delete(entries.keys().next().value);
        }
        return value;
      })();
      flights.set(flightKey, flight);
      try {
        return await flight;
      } finally {
        if (flights.get(flightKey) === flight) flights.delete(flightKey);
      }
    },
    clear() {
      epoch++;
      entries.clear();
      flights.clear();
    },
  };
}
