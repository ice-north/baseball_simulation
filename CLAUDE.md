# 野球シミュレーター開発状況

## 現在のブランチ
`claude/continue-from-handoff-9Q6sg`

## 最新の実装内容

### 2026-01-22: NEW GAMEフロー完成＆自動シミュレーション統合

#### 15. ゲーム開始フロー実装
**完全なNEW GAMEフローとシーズン進行の自動化**

**実施内容**：
1. **スタート画面の実装**
   - StartScreenコンポーネント作成
   - [NEW GAME] / [CONTINUE] / [EDIT] の3ボタン配置
   - CONTINUE/EDITは将来実装のためグレーアウト

2. **NEW GAMEフローの統合**
   - NewGameRegulationsScreen: レギュレーション設定画面
     - プリセット選択（独立リーグ、プロ野球、高校野球、大学野球）
     - 詳細設定（DH制、チーム数、年間試合数、プレーオフ形式、延長回数）
   - 初期トライアウト: チーム数×30人の選手をドラフト（24人獲得）
   - CampScreen: 春季キャンプ画面（プレースホルダー）
   - シーズン開始: 3月から日程管理画面へ

3. **ドラフト完了検出ロジック**
   - TryoutScreenにuseEffectを追加
   - currentPick >= draftOrder.lengthで完了を検出
   - 初期トライアウトの場合は自動的にキャンプ画面へ遷移（1秒遅延）
   - 通常トライアウトはonCompleteコールバックで手動遷移

4. **日付進行と自動シミュレーションの統合**
   - **handleProgressDate(days)**:
     - 指定日数進める → 新しい日の全試合を自動シミュレーション
   - **handleProgressToNextGame()**:
     - 次の試合日まで進む → その日の全試合を自動シミュレーション
   - **handleProgressToNextPhase()**:
     - 次フェーズまで進む → 現フェーズの全未消化試合を一括シミュレーション

5. **自動シミュレーション関数の実装**
   - `simulateGamesOnDate(seasonData)`:
     - 当日の全試合を取得
     - 既に結果がある試合はスキップ
     - window.autoSimulateGame()で試合実行
     - recordGameResult()で順位表に反映
   - `simulateAllRemainingGames(seasonData)`:
     - 現在フェーズの全未消化試合を取得
     - 一括で自動シミュレーション実行
     - フェーズ遷移時に使用

**ゲームフロー**：
```
スタート画面
  ↓ [NEW GAME]
レギュレーション設定
  ↓ プリセット/詳細設定
初期トライアウト（チーム数×30人）
  ↓ ドラフト24ラウンド（自動進行）
春季キャンプ
  ↓ [キャンプ終了]
シーズン開始（3月）
  ↓ 日付進行ボタン（1日/次試合/次フェーズ）
  ↓ 自動で試合消化＆順位表更新
プレーオフ → オフシーズン → Year 2...
```

**技術的改善**：
- GameFlowControllerで画面遷移を一元管理
- gameFlowStateステート追加: 'title', 'newgame_regulations', 'newgame_tryout', 'newgame_camp', 'season'
- screenModeステート: 'start', 'game', 'management'
- 初期化関数initializeNewGame()でレギュレーションからシーズンデータ生成
- TryoutScreenにisInitialTryout propを追加（年1: 30人、年2+: 15人）

**効果**：
- ユーザーがゲームを最初から開始できる
- レギュレーションを自由にカスタマイズ可能
- 日付を進めるだけで試合が自動消化される
- 順位表がリアルタイムに更新される
- 複数年プレイに対応したシームレスなフロー

### 2026-01-22: 選手名データベース改善

#### 13. 選手名データベースの重み付け修正
**実際の名前出現率に基づく正確な重み付けシステム**

**実施内容**：
1. **重み付けアルゴリズムの修正**
   - 従来: 簡易的な4段階重み（10/5/3/1）
   - 新方式: 実際のパーセンテージをそのまま重みとして使用
   - 例: 佐藤 1.772%、鈴木 1.720%、高橋 1.341%

2. **データ規模の拡張**
   - 姓: 3000件（0.004% ～ 1.772%の範囲）
   - 名: 3000件（全て0.033%で均等）
   - 合計: 6000件の名前データ

3. **生成プロセス**
   - CSVデータをPythonスクリプトでパース
   - JavaScript形式で出力（window.PLAYER_NAMES）
   - 重み付きランダム選択関数を実装

4. **ファイル情報**
   - ファイルパス: `js/data/playerNames.js`
   - ファイルサイズ: 約210KB（210,533文字）
   - 関数: getRandomSurname(), getRandomGivenName(), generateRandomPlayerName()

**データ構造**：
```javascript
window.PLAYER_NAMES = {
  surnames: [
    { name: '佐藤', weight: 1.772 },
    { name: '鈴木', weight: 1.720 },
    // ... 3000件
  ],
  givenNames: [
    { name: '蒼', weight: 0.033 },
    { name: '碧', weight: 0.033 },
    // ... 3000件（全て0.033）
  ]
};
```

**効果**：
- より現実的な名前の出現頻度
- 「佐藤」「鈴木」などの一般的な姓が適切に多く生成される
- 珍しい名前も適度に出現

**システム統合**：
1. **index.html**
   - `js/data/playerNames.js`の読み込みを追加
   - トライアウトシステムで選手名データベースを使用可能に

2. **tryoutSystem.js**
   - ハードコードされた20件の名前リストを削除
   - `window.generateRandomPlayerName()`を使用して3000×3000から選択
   - トライアウト候補者の名前がリアルに

3. **team-editor.html**
   - 選手名データベースの読み込みを追加
   - ランダム選手生成時に`generateRandomPlayerName()`を使用
   - 「選手1」「選手2」のような仮名から卒業

#### 14. 年間進行システム実装（Phase 3-5完了）
**シーズンを跨いで無限にプレイできるシステム**

**実施内容**：
1. **yearProgressionSystem.js 作成**（新規ファイル）
   - `processSeasonEnd()` - シーズン終了処理と表彰
     - 8タイトル: 首位打者、本塁打王、打点王、盗塁王、最優秀防御率、最多勝、最多セーブ、最多奪三振
   - `updateAllPlayerAges()` - 全選手の年齢+1
   - `checkRetirement()` - 引退判定
     - 40歳以上: 必ず引退
     - 35歳以上: 出場機会減少で引退
     - 30歳以上: 5%の確率でランダム引退
   - `processRetirements()` - 全チームの引退処理
   - `releasePlayer()` - 選手解雇機能
   - `resetSeasonStats()` - シーズン成績を通算に加算してリセット
   - `recordAwardsToPlayers()` - 獲得タイトルを選手記録に追加
   - `advanceToNextYear()` - 次年度への完全移行（統合関数）

2. **殿堂入りシステム**（独立リーグ設定）
   - 投手: 通算100勝以上
   - 野手: 通算1000安打または200本塁打以上
   - 引退時に殿堂入り該当者は特別表示

3. **オフシーズン画面**（🏆 オフシーズン）
   - シーズン結果表示
     - 優勝チーム（金色の大きな表示）
     - 個人タイトル8種類（選手名・チーム・成績）
   - 引退選手リスト
     - 殿堂入り選手は金色で特別表示
     - 引退理由を表示（年齢、出場機会減少、自己都合）
   - 次年度開始ボタン（Year 2, Year 3...と進む）

4. **ロスター管理画面**（👥 ロスター管理）
   - チーム選択ドロップダウン
   - ロスター人数表示（24人制限）
   - 全選手リスト
     - 名前、ポジション、年齢、利き手
     - シーズン成績（打率/防御率、本塁打/勝敗）
   - 解雇ボタン（確認ダイアログ付き）
   - 24人超過時の警告表示

5. **トライアウト画面改善**
   - 獲得選手が24人超過時の警告バナー表示
   - 「ロスター管理で解雇が必要です」とガイダンス

**ゲームフロー**：
```
Year 1開始
 ↓
トライアウト（24人獲得）
 ↓
レギュラーシーズン（60試合）
 ↓
プレーオフ
 ↓
オフシーズン画面
  - 表彰
  - 引退処理
  - 年齢+1
  - 次年度へ
 ↓
Year 2開始（ループ）
 ↓
トライアウト（15人追加）
 ↓
ロスター管理（解雇で24人に調整）
 ↓
...（無限ループ）
```

**Phase 3-5の達成**：
- ✅ Phase 3: プロドラフト/殿堂入り（引退・殿堂入りシステム）
- ✅ Phase 4: 解雇システム（ロスター整理機能）
- ✅ Phase 5: 年間進行システム（シーズンループ）

### 2026-01-20: 年間サイクルシステム Phase 1 実装

#### 11. Phase 1: データ構造の拡張（最新）
**選手データに年齢・プロキャリア情報を追加**

**実施内容**：
1. **選手データ構造の拡張**（team-editor.html）
   - `age` プロパティを追加（デフォルト: 20歳、ランダム: 18-25歳）
   - `professionalCareer` オブジェクトを追加
     - `isDrafted`: プロ入りフラグ（初期値: false）
     - `draftYear`: ドラフトされた年（初期値: null）
     - `draftTeam`: ドラフト先チーム名（初期値: null）
     - `achievements`: 獲得タイトル配列（首位打者、盗塁王など）

2. **UIの更新**
   - 選手カードに年齢表示を追加（例: "#1 | 20歳"）
   - 選手編集フォームに年齢入力欄を追加（15-50歳）
   - ランダム選手生成時に18-25歳の年齢を自動設定

3. **データ構造例**：
```javascript
const player = {
  id: 1,
  name: '韋駄天',
  age: 20,              // NEW
  position: 'center',
  batting: { ... },
  physical: { ... },
  fielding: { ... },
  catching: { ... },
  pitching: { ... },
  positionFitness: { ... },
  professionalCareer: {  // NEW
    isDrafted: false,
    draftYear: null,
    draftTeam: null,
    achievements: []
  },
  seasonStats: { ... },
  careerStats: { ... }
};
```

#### 12. Phase 2: トライアウトシステム（最新）
**選手獲得システムの実装**

**実施内容**：
1. **新規ファイル作成**（js/season/tryoutSystem.js）
   - `generateTryoutCandidates(year, teamCount)`: 候補者生成
     - 年1: チーム数 × 30人（4チームで120人）
     - 年2以降: チーム数 × 15人（4チームで60人）
     - 18-25歳のランダム選手
   - `calculatePlayerRank(player)`: AI推薦ランク計算（S/A/B/C/D）
     - 投手: 球速、制球、スタミナ、変化球で評価
     - 野手: ミート、パワー、走力、守備、肩で評価
   - `generateSnakeDraftOrder(teams, rounds)`: スネークドラフト順序生成
   - `selectPlayerForAI(candidates, roster)`: AI自動選択ロジック

2. **メインゲーム統合**（index.html）
   - サイドバーに「🎯 トライアウト」メニュー追加
   - TryoutScreenコンポーネント実装
     - トライアウト候補者一覧表示
     - AI推薦ランク表示（S/A/B/C/D、色分け）
     - ポジション・ランクフィルター
     - スネークドラフト自動進行
     - ユーザー選手選択UI
     - AI自動選択（0.5秒待機）
     - 獲得選手リスト表示（24人まで）

3. **スネークドラフト仕様**：
   ```
   ラウンド1: ユーザー → AI1 → AI2 → AI3
   ラウンド2: AI3 → AI2 → AI1 → ユーザー （逆順）
   ラウンド3: ユーザー → AI1 → AI2 → AI3
   ...（24ラウンド繰り返し）
   ```

4. **AI推薦ランク基準**：
   - S級: 総合評価80以上（超一流）
   - A級: 総合評価70-79（一流）
   - B級: 総合評価60-69（レギュラー級）
   - C級: 総合評価50-59（控え級）
   - D級: 総合評価50未満（育成候補）

**次のステップ（Phase 3-5）**：
- **Phase 3**: プロドラフトシステム（殿堂入り）
- **Phase 4**: 解雇システム（選手整理）
- **Phase 5**: 年間進行システム（シーズンループ）

### 2026-01-20: チーム/選手エディターツール追加

#### 10. スタンドアロンのチーム/選手エディター（最新）
**スケーラブルなチーム管理ツールの実装**

**実施内容**：
1. **team-editor.html の作成**（712行）
   - 完全独立したチーム/選手編集ツール
   - Reactベースの直感的なUI
   - file://プロトコルで動作（開発環境不要）

2. **実装済み機能**
   - **チーム管理**: 追加/削除/一覧表示（無制限）
   - **選手管理**: 追加/削除/編集（全能力値対応）
   - **ランダム生成**: 位置別に適正な能力値で自動生成
   - **JSONエクスポート**: ファイルとしてダウンロード
   - **JSONインポート**: ファイルから読み込み

3. **データ管理の改善**
   - teams-data.jsの肥大化を防止
   - 100チーム以上でも対応可能
   - JSONファイルで簡単に共有・バックアップ

**メリット**：
- **スケーラビリティ**: チーム数を増やしても管理が容易
- **データ分離**: コードとデータの完全分離
- **柔軟性**: ユーザーが自由にチームを作成
- **共有可能**: JSONファイルで簡単に配布
- **バックアップ**: ファイルで簡単にバックアップ

**使用方法**：
```
1. team-editor.htmlをブラウザで開く
2. チーム・選手を編集
3. JSONエクスポートで保存
4. （将来）メインゲームで読み込み
```

**今後の実装予定**：
- メインゲーム（index.html）とのJSON読み込み統合
- データ検証機能（24人ロスター等）
- CSVエクスポート（Excel編集用）
- プリセットテンプレート

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
- `team-editor.html` (712行) - チーム/選手エディター（2026-01-20追加）
  - スタンドアロンツール
  - チーム・選手の追加/編集/削除
  - JSONエクスポート/インポート
  - ランダム選手生成
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
- `js/season/tryoutSystem.js` - トライアウトシステム
- `js/season/yearProgressionSystem.js` - 年間進行システム ← NEW (2026-01-22)

### ユーティリティ
- `js/utils/constants.js` - 定数定義（変化球効果、投球フォーム効果、ポジション定義）
- `js/utils/physics.js` - 物理演算・表示ユーティリティ

### ディレクトリ構造
```
/baseball_simulation
├── index.html (6,608行) - メインゲーム
├── team-editor.html (712行) - チーム/選手エディター ← NEW (2026-01-20)
├── TEAM_EDITOR_README.md - エディターの使い方 ← NEW (2026-01-20)
├── CLAUDE.md - 開発状況
└── js/
    ├── players.js
    ├── simulation-logic.js
    ├── teams-data.js
    ├── data/
    │   └── playerNames.js (210KB) - 選手名データベース ← UPDATED (2026-01-22)
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
        ├── dateProgression.js
        ├── tryoutSystem.js
        └── yearProgressionSystem.js ← NEW (2026-01-22)
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
1. `df2015c` - NEW GAMEフロー完成＆自動シミュレーション統合
2. `6615230` - バグ修正: ロスター管理・オフシーズン画面のsetAllTeamsエラー修正
3. `02cf15b` - ドキュメント更新: 年間進行システム実装を記録
4. `4a0386d` - 年間進行システム実装（Phase 3-5完了）
5. `108caaa` - ドキュメント更新: 選手名データベース統合を記録

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
