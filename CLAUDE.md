# 野球シミュレーター

## 技術スタック
Vite + React (JSX, no TypeScript), Tailwind CSS

## アーキテクチャ要点
- **TEAMS_DATA** はグローバルミュータブルオブジェクト（React stateではない）
- 変更後 `setUpdateTrigger(prev => prev + 1)` で再レンダリング
- lineup配列は **splice()で直接変更**すること（filter()で新配列を作るとスタメン増殖バグが再発する）
- 守備位置適正: `fitnessMult = 0.5 + (fitness / 100) * 0.5`（適正100=100%, 適正0=50%）

## 主要ファイル
- `src/App.jsx` (~5200行) - メインアプリ、試合シミュレーション、画面遷移（下記セクション参照）
- `src/game/autoSimulation.js` (~2000行) - 自動シミュレーション・buildDefense
- `src/game/lineupGenerator.js` (~250行) - AIオーダー編成・投手ローテーション生成
- `src/game/gameControls.js` (~180行) - resetGame・multiPitch・simMode
- `src/game/gameSetup.js` (~330行) - setupManagedGame・handleManagedGameEnd
- `src/game/saveSystem.js` (~160行) - セーブ/ロード/エクスポート/インポート
- `src/game/seasonProgress.js` (~230行) - 日程進行ハンドラー
- `src/simulation-logic.js` (~520行) - 物理演算（打球・投球）
- `src/components/ScheduleScreen.jsx` (~500行) - 日程/順位表/成績ランキング
- `src/components/LineupSettingScreen.jsx` (~1620行) - スタメン/投手起用/守備分析の3タブ
- `src/components/DateProgressScreen.jsx` (~1620行) - 日程進行画面
- `src/components/ManagementScreen.jsx` (~330行) - 管理画面ルーター
- `src/components/GameFlowScreens.jsx` (~160行) - ゲームフロー画面群
- `src/components/GameUIComponents.jsx` (~380行) - Sidebar・RenderBases・AccordionSection
- `src/components/` - 各画面コンポーネント（Camp, Tryout, OffSeason, Draft等）
- `src/season/` - シーズン管理（スケジュール生成, 日付進行, トライアウト, 年間進行）
- `src/data/playerNames.js` (210KB) - 姓3000件+名3000件の重み付き名前DB
- `src/players.js` - 初期選手データ
- `src/teams-data.js` - チームデータ

## App.jsx セクション構成（トークン節約のため必要なセクションだけ読むこと）

App.jsxは大きいファイルなので、作業に関連するセクションだけを `offset` + `limit` で読むこと。

| セクション | 行範囲 | 内容 |
|---|---|---|
| IMPORTS | L1-57 | import文 |
| APP_STATE | L58-340 | アプリ全体のstate定義（試合状態、チーム状態、セーブ等） |
| GAME_HANDLERS | L341-595 | 成績更新・打順変更・選手交代ハンドラー |
| AI_MANAGER | L596-1855 | 監督AI自動投手交代・盗塁判定ロジック |
| THROW_PITCH | L1856-2638 | throwPitch（投球シミュレーション本体、最大セクション） |
| GAME_CONTROLS | L2639-2696 | → `gameControls.js` に抽出済み（ラッパーのみ） |
| GAME_SETUP | L2697-2715 | → `gameSetup.js` に抽出済み（ラッパーのみ） |
| SEASON_PROGRESS | L2716-2722 | → `seasonProgress.js` に抽出済み（ラッパーのみ） |
| MANAGEMENT | L2723-2724 | → `ManagementScreen.jsx` に抽出済み |
| GAME_FLOW | L2725-2746 | → `GameFlowScreens.jsx` に抽出済み |
| RENDER | L2747-END | メインreturn（試合画面UI） |

### 編集作業ガイド
- **試合ロジック修正**: THROW_PITCH (L1856-2638) + AI_MANAGER (L596-1855)
- **画面遷移修正**: `ManagementScreen.jsx` + `GameFlowScreens.jsx`
- **UI修正**: RENDER (L2747-END) + `GameUIComponents.jsx`
- **日程進行修正**: `src/game/seasonProgress.js`
- **選手交代修正**: GAME_HANDLERS (L341-595)
- **試合セットアップ**: `src/game/gameSetup.js`

## ゲームフロー
```
NEW GAME → レギュレーション設定 → トライアウト(24人ドラフト) → キャンプ
→ レギュラーシーズン(日付進行で自動消化) → プレーオフ → ドラフト
→ オフシーズン(表彰/引退) → Year 2+(トライアウト15人→ロスター調整→キャンプ...)
```

## 投手起用ロール
- 先発: complete(完投型), short(ショートスターター), quality(勝ち権利交代), ace(エース)
- リリーフ: long(ロング), onepoint(ワンポイント), setup(セットアッパー), closer(守護神), ace_relief(中継ぎエース), behind(ビハインド), mopup(敗戦処理)
- `pitchingRotation.pitcherRoles` マップ + レガシー配列の両方を更新すること

## 降板ルール（3条件のいずれかで降板）
1. **球数制限**: ロール別上限（complete:120, ace:110, quality:100, short:65, closer:40, setup:35, ace_relief:40, long:60, onepoint:15, behind/mopup:50）
2. **スタミナ25%以下**: 先発・リリーフ共通。残りスタミナが最大の25%を切ったら降板
3. **ダメージポイント制（先発のみ）**: 単打/四球=4pt, 長打=6pt, 失点=10pt。閾値は1回=45→9回=5（5刻みで減少）。イニングまたぎで-10pt回復（最低0）
- `gameState.starterDamagePoints` で積算を追跡

## スタミナによるパフォーマンス低下（`src/utils/physics.js` getStaminaPenalty）
- **50%以上**: ペナルティなし
- **50%未満**: 2次曲線 `deficit = 1 - staminaRate * 2` で急激に悪化
  - 球速: `-Math.round(deficit² * 20)` → 最大-20
  - 制球: `-Math.round(deficit² * 30)` → 最大-30
- 目安: 40%→球速-1/制球-1、30%→-3/-5、20%→-7/-11、10%→-13/-19、0%→-20/-30
- 降板閾値(25%)時点で既に球速-9、制球-14程度

## キャンプ練習メニュー（`src/season/yearProgressionSystem.js`）

キャンプは4クール。毎クール、メイン1つ+サブ1つを選択して実行。
成長量は年齢・経験値・ポジション補正あり。能力値80以上で成長減衰。

### メイン練習（TRAINING_MENUS）
| メニュー | 対象能力 | 成長量目安 | 備考 |
|---|---|---|---|
| 打撃練習 | ミート, パワー | 各+0〜2/クール | 野手向け |
| 走塁練習 | 走力, 盗塁 | 各+0〜2/クール | 野手向け |
| 守備練習 | 守備, 肩力 | 各+0〜2/クール | 投手野手共通 |
| 選球眼練習 | 選球眼 | +0〜2/クール | 野手向け |
| スタミナ練習 | スタミナ | +0〜2/クール | 投手向け |
| 制球練習 | 制球 | +0〜2/クール | 投手向け |
| 球速練習 | 球速 | +0〜2km/クール | 155km以上は減衰 |
| 新球種習得 | 新変化球 | 大成功(25%):Lv65-75 / 成功(50%):Lv10-19 / 失敗(25%):習得不可 | 投手のみ、球種選択可 |

### サブ練習（SUB_TRAINING_MENUS）
メインより効果小。基本は40%の確率で+1、そのうち30%で+2。
| メニュー | 効果 | 備考 |
|---|---|---|
| ランニング | 走力+0〜2、体力+1〜4(確定)、投手スタミナ+1(20%) | 安定枠 |
| 筋トレ | パワー+0〜2、肩力+1(25%) | |
| ストレッチ | 各能力+1(各10%)、回復+1(30%) | 広く薄く |
| 守備補強 | 守備+0〜2、弱ポジ適正+3(30%) | |
| 変化球練習 | 全変化球Lv+1/クール | 投手のみ、年齢補正あり |
| 新球種習得 | 成功率12%、成功時Lv20-39 | 投手のみ、球種ランダム |
| フォーム改造 | 成功20%: フォーム変更+制球+3〜5 / 失敗: 制球-1〜3 | 投手ハイリスク |
| 打席変更 | switch化15% / 反対20% / switch→片30%。失敗: ミート-1〜2 | ハイリスク |
| サブポジ練習 | 指定ポジ適正+9〜15 | ポジション選択可 |
| Cリード学習 | Cリード+1〜3 | 捕手向け |

### 派遣（Year2以降、キャンプ全期間）
派遣した選手は通常練習不参加。結果はキャンプ終了時に判明。
各チーム各派遣先1人ずつ、リーグ全体で合計8人まで。

**大学野球留学**（22歳以下 / 総合力55以下）
| 対象 | 大成功(25%) | 成功(50%) | 失敗(25%) |
|---|---|---|---|
| 投手 | 制球+12〜25, 球速+1〜4, 変化球+7〜19, スタミナ+7〜22 | 制球+8〜17, 球速+1〜3, 変化球+5〜12, スタミナ+5〜14 | 成長なし |
| 野手 | ミート+12〜24, 選球眼+9〜18, 守備+7〜15, パワー+3〜7 | ミート+8〜16, 選球眼+6〜12, 守備+5〜10, パワー+2〜5 | 成長なし |

**プロ研修**（24歳以下 / 総合力50以下）
| 対象 | 大成功(25%) | 成功(50%) | 失敗(25%) |
|---|---|---|---|
| 投手 | 球速+6〜12, スタミナ+15〜36, 制球+3〜7 | 球速+4〜8, スタミナ+10〜24, 制球+2〜5 | 成長なし |
| 野手 | パワー+12〜24, 走力+9〜18, 肩力+6〜13, ミート+3〜7 | パワー+8〜16, 走力+6〜12, 肩力+4〜9, ミート+2〜5 | 成長なし |

- 覚醒チャンス: 成功時20% / 大成功時30%で追加ボーナス（成長量も1.5倍）
