# 野球シミュレーター開発状況

## 現在のブランチ
`claude/review-baseball-simulator-hSqpn`

## 最新の実装内容

### 2026-01-20: ゲームロジックの外部ファイル化完了

#### 9. ゲームロジックの外部ファイル化（最新）
**自動シミュレーション機能の分離とCORS問題の解決**

**実施内容**：
1. **ゲームロジックの外部化**（625行）
   - `js/game/autoSimulation.js` - 自動シミュレーション機能
     - `autoSimulateGame()` - 1試合の完全物理演算
     - `autoSimulateDailyGames()` - 当日全試合の実行
     - `advanceDate()` - 日程進行処理

2. **CORSエラー対応**
   - UIコンポーネントはBabelスタンドアロン版の制限により外部JSXファイル化不可
   - file://プロトコルでの外部JSX読み込みはCORSエラーが発生
   - UIコンポーネントはindex.html内に整理・統合して配置

**最終結果**：
- **index.html**: 7,220行 → 6,608行（612行削減、8.5%削減）
- **外部ファイル**: 625行（autoSimulation.js）
- **総行数**: 8,247行（全ファイル含む）

**ファイル構成**：
```
/baseball_simulation
├── index.html (6,608行) - メインアプリケーション
├── js/
│   ├── game/
│   │   ├── gameState.js
│   │   └── autoSimulation.js (NEW)
│   ├── season/
│   │   ├── seasonManager.js
│   │   ├── scheduleGenerator.js
│   │   ├── calendarUI.js
│   │   ├── regulationSettings.js
│   │   └── dateProgression.js
│   ├── utils/
│   │   ├── constants.js
│   │   └── physics.js
│   ├── players.js
│   ├── teams-data.js
│   └── simulation-logic.js
```

**技術的制約と学び**：
- **Babelスタンドアロン版の制限**: 外部JSXファイルの読み込み非対応（CORSエラー）
- **file://プロトコルの制限**: XMLHttpRequestによる外部ファイル読み込み不可
- **解決策**:
  - 通常のJavaScriptファイルのみ外部化可能
  - JSXコンポーネントはindex.html内に配置
  - または、Vite/WebpackなどのビルドツールとHTTPサーバーの導入が必要

**メリット**：
- 自動シミュレーション機能の保守性向上
- file://プロトコルでも正常動作（開発環境不要）
- 将来的なビルドツール導入への布石

### 2026-01-19: シーズン日程管理システム統合完了

#### 8. シーズン管理システムの完全統合（最新）
**新システムモジュールをメインアプリケーションに統合**

**統合した内容**：
1. **シーズンデータの初期化**
   - `createSeasonData()`でシーズンデータを作成
   - `generateFullSeasonSchedule()`で年間60試合のスケジュール自動生成
   - `assignPitchersToSchedule()`で投手ローテーションを自動割り当て
   - `initializeStandings()`で順位表を初期化

2. **スケジュール画面の刷新**
   - カレンダー表示を新システムに統合（月選択: 3-9月）
   - チーム別カレンダー表示（チームAの試合のみ表示）
   - 本日の対戦カードを新システムから取得
   - フェーズ表示をヘッダーに追加（春季キャンプ、レギュラーシーズン等）

3. **日付進行機能の実装**
   - ボタン: 「1日進める」「次の試合日」「次フェーズ」
   - `progressDate()`, `progressToNextGame()`, `progressToNextPhase()`を使用
   - 日付とフェーズが連動して自動更新

4. **レギュレーション設定画面の追加**
   - サイドバーに「⚙️ レギュレーション設定」メニューを追加
   - プリセット選択（独立リーグ、プロ野球、高校野球、大学野球）
   - 詳細設定（DH制、チーム数、年間試合数、プレーオフ形式、延長最大回数）
   - オフシーズンのみ変更可能な制限を実装
   - 設定の保存と検証機能

5. **フェーズシステムの表示**
   - ヘッダーに現在のフェーズをバッジ表示
   - フェーズに応じた背景色（春季キャンプ: 緑、レギュラーシーズン: 青、等）
   - フェーズ説明の表示

**変更したファイル**：
- `index.html` - シーズン管理システムの統合、UIの刷新

**削除した簡易実装**：
- 旧カレンダー生成関数（`generateInitialCalendar()`）
- ハードコードされた対戦スケジュール（`allGames`オブジェクト）
- 簡易的な日付管理（旧`currentDate`、`seasonYear`）

**後方互換性**：
- `seasonYear`, `currentDate`, `leagueStandings`は既存コードとの互換性のため残存
- 新システムの`seasonData`から取得するように変更

### 2026-01-19: 日程管理システム実装（モジュール作成）

#### 7. シーズン日程管理システム（モジュール実装）
**独立リーグモデルの年間スケジュール管理**

**実装した機能**：
1. **シーズンフェーズシステム**
   - 春季キャンプ（1-2月）
   - レギュラーシーズン（3-9月）
   - プレーオフ（10月前半）
   - ドラフト（10月後半）
   - トライアウト（11月）
   - オフシーズン（12月）- レギュレーション変更可能

2. **日程生成ロジック**
   - ラウンドロビン方式の総当たり戦
   - 投手ローテーション自動割り当て
   - 年間試合数設定可能（デフォルト60試合）
   - 試合日判定（月曜休み）

3. **レギュレーション設定**
   - DH制のON/OFF
   - 年間試合数（チームあたり）
   - チーム数（2-12チーム）
   - プレーオフ形式（single/double/none）
   - 延長最大回数
   - ロスター構成（スタメン・控え野手・控え投手）

4. **日付進行機能**
   - 1日ずつ進行
   - 次の試合日まで進行
   - 次のフェーズまでスキップ
   - 指定日へジャンプ

5. **プリセット設定**
   - 独立リーグ（4チーム、60試合、DH無し）
   - プロ野球（6チーム、143試合、DH有り）
   - 高校野球（8チーム、40試合、DH無し）
   - 大学野球（6チーム、52試合、DH有り）

**新規追加モジュール**：
- `js/season/seasonManager.js` - シーズンデータ管理、日付処理
- `js/season/scheduleGenerator.js` - 日程自動生成、投手ローテーション
- `js/season/calendarUI.js` - カレンダー表示補助関数
- `js/season/regulationSettings.js` - レギュレーション設定・検証
- `js/season/dateProgression.js` - 日付進行・フェーズ遷移

**データ構造**：
```javascript
seasonData = {
  year: 1,                        // シーズン年数
  currentDate: {year, month, day}, // 現在の日付
  phase: 'regular_season',         // 現在のフェーズ
  schedule: [...],                 // 試合スケジュール
  results: [...],                  // 試合結果
  standings: [...],                // 順位表
  settings: {                      // レギュレーション
    useDH: false,
    gamesPerSeason: 60,
    teamsCount: 4,
    playoffFormat: 'single'
  }
}
```

### 2026-01-15: 試合画面改善

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
- `index.html` (6,608行) - メインアプリケーション（React）
  - UIコンポーネント（EditScreen, ScheduleScreen, PlayerStatsScreen, RegulationsScreen）を内包
- `js/players.js` - 選手データ定義（24人ロスター）
- `js/teams-data.js` - チームデータ管理

### ゲームロジック
- `js/simulation-logic.js` - 物理計算ロジック
- `js/game/gameState.js` - ゲーム状態管理ヘルパー
- `js/game/autoSimulation.js` (625行) - 自動シミュレーション（2026-01-20追加）

### シーズン管理
- `js/season/seasonManager.js` - シーズンデータ管理
- `js/season/scheduleGenerator.js` - 日程自動生成
- `js/season/calendarUI.js` - カレンダー表示補助
- `js/season/regulationSettings.js` - レギュレーション設定
- `js/season/dateProgression.js` - 日付進行・フェーズ遷移

### ユーティリティ
- `js/utils/constants.js` - 定数定義（変化球効果、投球フォーム効果、ポジション定義）
- `js/utils/physics.js` - 物理演算・表示ユーティリティ

### ディレクトリ構造
```
/baseball_simulation
├── index.html (6,608行)
├── CLAUDE.md
└── js/
    ├── players.js
    ├── simulation-logic.js
    ├── teams-data.js
    ├── utils/
    │   ├── constants.js
    │   └── physics.js
    ├── game/
    │   ├── gameState.js
    │   └── autoSimulation.js ← NEW (2026-01-20)
    └── season/
        ├── seasonManager.js
        ├── scheduleGenerator.js
        ├── calendarUI.js
        ├── regulationSettings.js
        └── dateProgression.js
```

**注意**: UIコンポーネント（EditScreen等）はBabelスタンドアロン版の制限によりindex.html内に配置

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

### トークン削減（プランC実施）- 完了
**目的**: セッション制限回避（10回 → 10-11回に改善）

**削減内容**:
1. physics.js関数の重複削除: 約130行
   - formatInnings, getAbilityColor, getAbilityTextColor, getBestFitPosition
   - getStaminaPenalty, getInfielderEffectiveArm, getHandednessEffect
2. gameState.js関数のラッパー化: 約17行
3. 装飾的コメント簡略化: 約28行
4. 連続空行の圧縮: 1行

**結果**:
- **4,979行 → 4,803行**（176行削減）
- **推定トークン削減: 約3,600トークン（4-5%削減）**
- **セッション回数: 10回 → 約10-11回**

### Phase 2 保留
Step 3-7（選手交代ロジック、投球/打撃シミュレーション、UIコンポーネントの完全分離）は、試合機能が安定しているため保留。

**さらなる削減のためには**:
- 大きな関数の外部化（投球/打撃シミュレーション）- 約500-1,000行削減可能
- 冗長なコメントの簡潔化 - 約100-200行削減可能
- 重複ロジックのリファクタリング - 約200-300行削減可能
- **合計ポテンシャル**: 約800-1,500行（セッション回数を15-20回に延長可能）
