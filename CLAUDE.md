# 野球シミュレーター

## 技術スタック
Vite + React (JSX, no TypeScript), Tailwind CSS

## アーキテクチャ要点
- **TEAMS_DATA** はグローバルミュータブルオブジェクト（React stateではない）
- 変更後 `setUpdateTrigger(prev => prev + 1)` で再レンダリング
- lineup配列は **splice()で直接変更**すること（filter()で新配列を作るとスタメン増殖バグが再発する）
- 守備位置適正: `fitnessMult = 0.5 + (fitness / 100) * 0.5`（適正100=100%, 適正0=50%）

## 主要ファイル
- `src/App.jsx` (6364行) - メインアプリ、試合シミュレーション、画面遷移
- `src/game/autoSimulation.js` (1410行) - 自動シミュレーション・buildDefense
- `src/simulation-logic.js` (517行) - 物理演算（打球・投球）
- `src/components/LineupSettingScreen.jsx` (959行) - スタメン/投手起用/守備分析の3タブ
- `src/components/` - 各画面コンポーネント（Camp, Tryout, OffSeason, Draft等）
- `src/season/` - シーズン管理（スケジュール生成, 日付進行, トライアウト, 年間進行）
- `src/data/playerNames.js` (210KB) - 姓3000件+名3000件の重み付き名前DB
- `src/players.js` - 初期選手データ
- `src/teams-data.js` - チームデータ

## ゲームフロー
```
NEW GAME → レギュレーション設定 → トライアウト(24人ドラフト) → キャンプ
→ レギュラーシーズン(日付進行で自動消化) → プレーオフ → ドラフト
→ オフシーズン(表彰/引退) → Year 2+(トライアウト15人→ロスター調整→キャンプ...)
```

## 投手起用ロール
- 先発: complete(完投型), short(ショートスターター), quality(勝ち権利交代)
- リリーフ: long(ロング), onepoint(ワンポイント), setup(セットアッパー), closer(守護神)
- `pitchingRotation.pitcherRoles` マップ + レガシー配列の両方を更新すること
