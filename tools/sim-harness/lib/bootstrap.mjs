// ============================================================
// sim-harness ブートストラップ
// ブラウザ前提のグローバル(window/alert/localStorage)をNode用にスタブする。
// **他のsrc/モジュールをimportする前に必ず最初にimportすること。**
// ============================================================

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.alert === 'undefined') {
  globalThis.alert = () => { /* headlessでは無視 */ };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    _s: {},
    getItem(k) { return this._s[k] ?? null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
    clear() { this._s = {}; },
  };
}

// src はリポジトリルート基準。このファイルは tools/sim-harness/lib/ にある。
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SRC = resolve(__dirname, '../../../src');
