// 既存エンジンのブラウザ依存をNodeの実行境界だけで吸収する。
// ブラウザ画面・オンラインの照会APIからこのモジュールを読み込まない。
globalThis.window ??= globalThis;
globalThis.alert ??= () => {};
globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
