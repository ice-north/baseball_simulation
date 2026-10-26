# 野球シミュレーター開発ガイド

過去の設計判断・実測記録は [詳細アーカイブ](docs/archive/CLAUDE-full.md) に保存している。数値や行番号は履歴として扱い、変更時は現在のコードとハーネスで確かめる。

## 起動と検証

- `npm run dev`: 開発サーバー。保存領域のオリジンを固定するため `vite.config.js` の `strictPort` を維持する。
- `npm run build`: 配布用の単一HTMLを生成する。
- `npm run lint -- --quiet`: React Hooks の呼出順を検査する。
- `npm run check:full`: セーブ、試合、ドラフト、大会、複数年進行まで検査する。

## 実装の入口

- `src/App.jsx`: 手動試合、管理画面の接続。`[SECTION:]` マーカーで対象箇所を探す。
- `src/game/autoSimulation.js`: 自動試合。共通の物理演算は `src/simulation-logic.js`、投球判断は `src/game/pitchCalling.js`。
- `src/components/DateProgressScreen.jsx`: 日付進行とイベント。フェーズの定義は `src/season/seasonManager.js` と `src/season/dateProgression.js`。
- `src/components/LineupSettingScreen.jsx`: 打順、守備位置、投手起用。
- `src/game/saveSystem.js`: スロット、バックアップ、ロード、ファイル入出力。形式移行は `src/game/saveMigration.js`。
- `src/corporate/worldData.js`: 並行世界の初期化。`TEAMS_DATA` とともにロード失敗時の復元対象。

## 変更時の不変条件

- 大学の在学生はチーム名簿を正本とし、プールとの二重登録を避ける。
- 年度末の戦力外は所属リーグと企業チームの担当範囲を分け、大学の在学生を解雇しない。
- 保存する前に生きた状態を変更しない。IndexedDB の書き込みはトランザクション完了を確認する。
- 日付を飛ばす操作でも強制イベントを一度だけ処理する。試合日程を変更したらプレーオフと全国大会の順序も確認する。
- 既存の数値調整は `npm run check:season` で集計を確認する。
