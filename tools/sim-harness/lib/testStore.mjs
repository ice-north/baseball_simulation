// 検査用の保存先。既定はメモリ上で、`SIM_HARNESS_FILE_STORE=1` のときだけ本物の
// FileStore（gzip してディスクへ書く）を使う。
//
// ⚠ 検査の時間の大半は試合ではなく保存だった。online-service-check の内訳を取ると
//    約75%が FileStore の gzip 圧縮・展開と巨大な JSON 文字列の変換で、読むたび・
//    書くたびにリーグ全体を丸ごと処理していた。保存の形そのものを確かめるのは
//    online-storage-check の役目なので、ほかの検査はメモリで回してよい。
//
// FileStore と同じ約束を守ること。
//   - read() は毎回まっさらな複製を返す（呼んだ側が書き換えても保存は変わらない）。
//     複製は JSON を通す。structuredClone だと undefined や Date が残り、
//     本番（JSON で保存）と結果がずれる。
//   - transaction() は1本の列に積み、`{ unchanged }` なら書かない。
//   - 同じパスで作り直すと前の内容が見える（再起動の再現に使う検査がある）。
import { FileStore } from '../../../server/storage/fileStore.mjs';
import {
  splitBundle,
  assembleBundle,
  assembleLight,
} from '../../../server/storage/snapshotParts.mjs';

const memory = new Map();
const empty = () => ({ league: null, sessions: {}, receipts: {} });

export class MemoryStore {
  constructor(path) {
    this.path = path;
    this.queue = Promise.resolve();
  }
  // 本番の保存（SupabaseStore）と同じく、芯と部分に分けて持つ。
  // ⚠ 命令は**まず軽く読む**（世界の部分は番人）。世界に触れたら全体でやり直す。
  //    検査のほぼ全部がここを通るので、軽い読みの取りこぼしはここで見つかる
  //    （`SIM_HARNESS_WHOLE_STORE=1` で分けない従来の形にも戻せる）。
  async read() {
    const stored = memory.get(this.path);
    if (stored === undefined) return empty();
    if (typeof stored === 'string') return JSON.parse(stored);
    const parts = Object.fromEntries(
      Object.entries(stored.parts).map(([name, text]) => [name, JSON.parse(text)]),
    );
    return assembleBundle(JSON.parse(stored.core), stored.order, parts);
  }
  // 本番（SupabaseStore.readLight）と同じく、読むだけの処理に芯だけを渡す（世界・記録は番人）
  async readLight() {
    const stored = memory.get(this.path);
    if (stored === undefined || typeof stored === 'string' || process.env.SIM_HARNESS_WHOLE_STORE === '1') {
      this.lastReadMode = 'full';
      return { bundle: await this.read(), touched: () => null };
    }
    const refs = Object.fromEntries(Object.keys(stored.parts).map((name) => [name, {}]));
    const run = assembleLight(JSON.parse(stored.core), stored.order, {}, refs);
    this.lastReadMode = 'light';
    return { bundle: run.bundle, touched: () => run.tracker.touched };
  }
  transaction(fn, { full = false } = {}) {
    const result = this.queue.then(async () => {
      const whole = process.env.SIM_HARNESS_WHOLE_STORE === '1';
      let light = !full && !whole;
      // 何回読んだか（世界に触れて全体でやり直すと2）。全体の印の付け忘れを見る
      let attempts = 0;
      for (;;) {
        attempts++;
        const stored = memory.get(this.path);
        const split = stored !== undefined && typeof stored !== 'string';
        let value, run;
        if (light && split) {
          const records =
            stored.parts.records === undefined ? {} : { records: JSON.parse(stored.parts.records) };
          const refs = Object.fromEntries(Object.keys(stored.parts).map((name) => [name, {}]));
          run = assembleLight(JSON.parse(stored.core), stored.order, records, refs);
          value = run.bundle;
        } else value = await this.read();
        let outcome, prepared;
        try {
          outcome = await fn(value);
          if (run && !outcome?.unchanged) prepared = run.inspect(value);
        } catch (error) {
          if (run && (run.tracker.touched || error?.name === 'DataCloneError')) {
            if (process.env.PARTS_DEBUG) console.log('escalate(throw)', run.tracker.touched, error.stack.split('\n').slice(0, 6).join(' | '));
            light = false;
            continue;
          }
          throw error;
        }
        if (run && (run.tracker.touched || (!outcome?.unchanged && !prepared))) {
          if (process.env.PARTS_DEBUG) console.log('escalate', run.tracker.touched);
          light = false;
          continue;
        }
        if (outcome?.unchanged) return outcome.value;
        if (whole) memory.set(this.path, JSON.stringify(value));
        else if (prepared) {
          const parts = { ...stored.parts };
          if (prepared.whole || prepared.records === undefined) delete parts.records;
          else parts.records = JSON.stringify(prepared.records);
          memory.set(this.path, { core: JSON.stringify(prepared.core), order: prepared.order, parts });
        } else {
          const next = splitBundle(value);
          memory.set(this.path, {
            core: JSON.stringify(next.core),
            order: next.order,
            parts: Object.fromEntries(
              Object.entries(next.parts).map(([name, data]) => [name, JSON.stringify(data)]),
            ),
          });
        }
        this.lastMode = run ? 'light' : 'full';
        this.lastAttempts = attempts;
        return outcome?.value;
      }
    });
    this.queue = result.catch(() => {});
    return result;
  }
}

export function createTestStore(path) {
  return process.env.SIM_HARNESS_FILE_STORE === '1'
    ? new FileStore(path)
    : new MemoryStore(path);
}
