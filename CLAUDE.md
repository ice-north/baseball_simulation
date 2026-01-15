# 野球シミュレーター開発状況

## 現在のブランチ
`claude/check-branch-version-6u0MJ`

## 最新の実装内容（2026-01-15）

### 完了した機能

#### 1. 試合画面のバグ修正（2026-01-15）
- **選手消滅バグ修正**：選手配列をディープコピーに変更し、交代時の状態管理を改善
- **投手イニング表示修正**：投手の守備位置に依存せず投球成績で判定するように修正
- **球速undefined表示修正**：スコアボードで最後の投球データのみを表示するように改善

#### 2. コードベースリファクタリング（Phase 1完了）
**ファイル構造の整理**：
```
/baseball_simulation
├── index.html (メインアプリケーション)
├── js/
│   ├── players.js (選手データ)
│   ├── simulation-logic.js (物理演算)
│   ├── utils/
│   │   ├── constants.js (定数定義・拡張版)
│   │   └── physics.js (ユーティリティ関数)
│   └── game/
│       └── gameState.js (ゲーム状態管理)
```

**新規追加モジュール**：
- `js/utils/constants.js` - ポジション名・色・利き手ラベルを追加
- `js/utils/physics.js` - 7つのユーティリティ関数（formatInnings, getAbilityColor, getAbilityTextColor, getBestFitPosition, getStaminaPenalty, getInfielderEffectiveArm, getHandednessEffect）
- `js/game/gameState.js` - チーム/選手取得・成績更新関数

#### 3. 能力値表示の改善
- **3行レイアウト**（パワプロ風）
  ```
  １　中　韋駄天　#１　右左
  ミ　パ　走　肩　守
  65　45　90　55　75
  ```
- **7段階色付け**：
  - 90以上：ピンク (SS級)
  - 80-89：赤 (S級)
  - 70-79：オレンジ (A級)
  - 60-69：黄 (B級)
  - 50-59：緑 (C級)
  - 40-49：青 (D級)
  - 40未満：グレー (E級)

#### 4. UI/UX改善
- スタメン/控え入れ替え：青色統一、双方向交代可能
- 先発投手パネル：投げ手・フォーム・球速を1行に横並び
- 変化球名を日本語表記
- 文字サイズ全体的に拡大

#### 5. 打順変更機能
- 打順変更時に守備位置が選手に付いてくる
- 選手パネルクリックで打順変更・交代ができるUI

#### 6. ポジション適正システム
- 9ポジション適性値（0-100）を全選手に実装
- ベンチに下がる際、最適ポジションに自動変更

### 解決済みのバグ
- ✅ 投手ずらーっと問題（投手が全ポジションに出現）
- ✅ 選手消失バグ（2番・3番打者が消える）
- ✅ 打順変更時の守備位置入れ替わり問題
- ✅ 投手イニング表示の端数問題（11回2/3 → 正しい表示）
- ✅ 球速undefined表示問題

## ファイル構成

### メインファイル
- `index.html` (4,979行) - メインアプリケーション（React）
- `js/players.js` (583行) - 選手データ定義（24人ロスター）

### モジュール（新規追加）
- `js/utils/constants.js` - 変化球効果、投球フォーム効果、ポジション定義
- `js/utils/physics.js` - 物理演算・表示ユーティリティ
- `js/simulation-logic.js` - 物理計算ロジック
- `js/game/gameState.js` - ゲーム状態管理ヘルパー

### ディレクトリ構造
```
/baseball_simulation
├── index.html
├── CLAUDE.md
└── js/
    ├── players.js
    ├── simulation-logic.js
    ├── utils/
    │   ├── constants.js
    │   └── physics.js
    └── game/
        └── gameState.js
```

## 技術的なポイント

### 重要な関数・コンポーネント
- **ユーティリティ関数**（js/utils/physics.js）:
  - `formatInnings(outs)` - イニング表記（7回2/3）
  - `getAbilityTextColor(value)` - 能力値の色取得（7段階）
  - `getBestFitPosition(player)` - 最高適正ポジション取得
  - `getStaminaPenalty(current, max)` - スタミナ補正計算
  - `getHandednessEffect(throws, bats)` - 左右相性効果

- **ゲーム状態管理**（js/game/gameState.js）:
  - `getOffenseTeam(isTop, home, away)` - 攻撃チーム取得
  - `getCurrentBatter(team)` - 現在の打者取得
  - `getCurrentPitcher(team)` - 現在の投手取得
  - `updateBatterStats()` - 打者成績更新
  - `updatePitcherStats()` - 投手成績更新

- **選手交代・打順管理**（index.html）:
  - `handleSubstituteClick()` - スタメン/控え入れ替え
  - `handleBatterClick()` - 打順変更
  - `isSubstituting.current` - 交代処理の二重実行防止フラグ

### スタメンパネルの表示ロジック
- location: index.html:2854-2920 (Away), 3742-3808 (Home)
- 3行構成：
  1. 打順・守備・名前・背番号・利き手
  2. 能力ラベル（ミ・パ・走・肩・守）
  3. 能力値（7段階色付き）

### 控え選手パネルの表示
- location: index.html:2931-2957 (Away), 3837-3863 (Home)
- 簡略表示：守備・名前・利き手・M/P値

## コミット履歴（最近5件）
1. `2dd17a4` - Step 2進行中: gameState.js作成
2. `01e3e36` - Step 1完了: ユーティリティ関数の分離
3. `dcb2a6d` - 試合画面の3つのバグを修正
4. `2bd0fcb` - 選手パネルクリックで打順変更・交代ができるように改善
5. `95aee7d` - ポジション適正システムのデバッグ、スタメン同士の交代を禁止

## 次のセッションで実施すること

### 優先度高：試合外機能の開発
リファクタリングPhase 1が完了したので、次は試合外機能の実装に移ります：

1. **チーム管理画面**
   - 選手一覧表示
   - 選手編集機能
   - チーム名変更

2. **セーブ/ロード機能**
   - LocalStorageを使ったチームデータ保存
   - 複数チームの管理

3. **統計画面**
   - シーズン成績表示
   - 選手別成績ランキング

4. **その他**
   - シーズンモード（複数試合の管理）
   - ドラフト機能

### 将来的な改善（必要に応じて）
- リファクタリングPhase 2（UI componentの完全分離）
- パフォーマンス最適化
- テスト実装

## 注意事項
- ブラウザの強制リロード（Ctrl+Shift+R）で最新版を確認
- 変更後は必ずコミット＆プッシュ
- ブランチ：`claude/check-branch-version-6u0MJ`
- 現在のコード規模：約5,500行（index.html: 4,979行、その他: 約600行）

## リファクタリング状況

### Phase 1 完了（2026-01-15）
- ✅ Step 1: Utils抽出（constants.js, physics.js）
- ✅ Step 2: ゲーム状態管理抽出（gameState.js）
- ✅ ディレクトリ構造の整理（js/utils/, js/game/）

### Phase 2 保留
Step 3-7（選手交代ロジック、投球/打撃シミュレーション、UIコンポーネントの完全分離）は、試合機能が安定しているため保留。今後の機能追加時に必要に応じて段階的に実施。
