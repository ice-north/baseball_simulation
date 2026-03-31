# 野球シミュレーター リファクタリング計画

## 概要

| 項目 | 内容 |
|------|------|
| **現状** | `baseball-simulator-v25_15.html`（3,360行、153KB）の単一ファイル |
| **目標** | Vite + Reactプロジェクトへ移行し、ファイル分割で開発しやすくする |
| **対象環境** | Windows |
| **前提条件** | Node.js未インストール、プログラミング初心者 |

---

## Phase 1: 環境構築

### 1-1. Node.jsのインストール（Windows）

1. https://nodejs.org/ にアクセス
2. 緑色の「LTS」ボタン（推奨版）をクリックしてダウンロード
3. ダウンロードした `.msi` ファイルを実行
4. インストーラーの指示に従う（すべて「Next」でOK）
5. 「Automatically install the necessary tools」にチェックを入れる
6. インストール完了後、**PCを再起動**
7. PowerShellを開いて確認:
   ```powershell
   node --version
   npm --version
   ```
   → バージョン番号（例: `v20.x.x`）が表示されれば成功

### 1-2. Viteプロジェクト作成

```powershell
# 作業フォルダに移動
cd C:\path\to\baseball_simulation

# Viteプロジェクト作成（現在のフォルダに展開）
npm create vite@latest . -- --template react

# 依存パッケージをインストール
npm install

# Tailwind CSSをインストール
npm install -D tailwindcss postcss autoprefixer

# Tailwind設定ファイルを生成
npx tailwindcss init -p
```

### 1-3. 設定ファイルの内容

**tailwind.config.js**
```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**src/index.css**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**vite.config.js**（デフォルトのままでOK）
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

---

## Phase 2: ディレクトリ構成

```
baseball_simulation/
├── index.html                 # Viteエントリーポイント
├── package.json               # 依存関係
├── vite.config.js             # Vite設定
├── tailwind.config.js         # Tailwind設定
├── postcss.config.js          # PostCSS設定（自動生成）
│
└── src/
    ├── main.jsx               # Reactエントリーポイント
    ├── App.jsx                # メインコンポーネント（state管理の中心）
    ├── index.css              # グローバルスタイル
    │
    ├── data/                  # 静的データ定義
    │   ├── ballEffects.js         # 球種効果（12種類）
    │   ├── defaultPlayers.js      # 選手データ生成関数
    │   └── constants.js           # 定数（BABIP_CALIBRATION, COR等）
    │
    ├── logic/                 # ビジネスロジック（純粋関数）
    │   ├── physics.js             # 物理演算エンジン
    │   ├── gameRules.js           # ゲームルール計算
    │   └── simulation.js          # シミュレーションコア
    │
    └── components/            # UIコンポーネント
        ├── Scoreboard.jsx         # スコアボード・カウント表示
        ├── Field.jsx              # フィールドSVG描画
        ├── PitchLog.jsx           # 投球履歴
        ├── PlayerList.jsx         # 選手一覧（ホーム/アウェイ）
        ├── PlayerEditor.jsx       # 選手編集モーダル
        ├── Controls.jsx           # 操作ボタン（投球・リセット）
        ├── StatsDisplay.jsx       # 統計表示
        └── AccordionSection.jsx   # 折りたたみセクション
```

---

## Phase 3: ファイル分割詳細

### Step 1: データファイルの分離

#### `src/data/ballEffects.js`
**元の位置**: 19-32行目
**内容**: 12種類の球種効果設定
```javascript
export const ballEffects = {
  straight: { name: 'ストレート', whiffBonus: 0, groundballBonus: 0, weakBonus: -0.04, velocityMinus: 0 },
  twoSeam: { name: 'ツーシーム', whiffBonus: -0.05, groundballBonus: 0.12, weakBonus: 0.12, velocityMinus: 5 },
  slider: { name: 'スライダー', whiffBonus: 0.09, groundballBonus: 0.05, weakBonus: -0.02, velocityMinus: 12 },
  // ... 残り9種類
};
```

#### `src/data/defaultPlayers.js`
**元の位置**: 424-750行目
**内容**: 選手生成関数
```javascript
export const createPlayerStats = () => ({
  batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0 },
  pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 }
});

export const createHomeTeamPlayers = () => { /* 9選手分のデータ */ };
export const createAwayTeamPlayers = () => { /* 9選手分のデータ */ };
```

#### `src/data/constants.js`
**元の位置**: 40-44行目
**内容**: 物理定数・設定値
```javascript
export const BABIP_CALIBRATION = 0.32;  // BABIP校正係数
export const COR = 0.45;                 // 反発係数
export const MAX_EXTRA_INNINGS = 12;     // 延長最大回数
```

---

### Step 2: ロジックファイルの分離

#### `src/logic/physics.js`
**元の位置**: 55-399行目（約345行）
**内容**: 物理演算エンジン

| 関数名 | 行番号 | 説明 |
|--------|--------|------|
| `calculatePhysicsContact` | 55-136 | タイミングウィンドウベースのコンタクト計算 |
| `getTunnelingEffect` | 143-157 | 前球との軌道錯覚効果 |
| `calculateLaunchAngle` | 162-187 | ミート品質から打出し角度を計算 |
| `calculateBattedBallPhysics` | 192-229 | 打球パラメータ（飛距離・滞空時間）計算 |
| `judgeFielderReach` | 236-399 | 守備範囲判定（エリア別） |

#### `src/logic/gameRules.js`
**元の位置**: 1138-1232行目（約95行）
**内容**: ゲームルール計算

| 関数名 | 行番号 | 説明 |
|--------|--------|------|
| `getCountAdjustment` | 1138-1146 | カウント状況による補正 |
| `getStaminaPenalty` | 1149-1175 | スタミナ消耗による能力低下 |
| `getInfielderEffectiveArm` | 1178-1189 | 内野手の実効肩力（左投げペナルティ） |
| `getHandednessEffect` | 1192-1228 | 投手-打者の左右相性 |

#### `src/logic/simulation.js`
**元の位置**: 1233-1579行目（約350行）
**内容**: シミュレーションコア

| 関数名 | 行番号 | 説明 |
|--------|--------|------|
| `determineContactResultPhysics` | 1233-1357 | 打撃結果判定（物理モデル） |
| `advanceRunners` | 1548-1579 | 走者進塁処理 |

**注意**: `simulatePitch`（1359-1540行）と`throwPitch`（1581-2265行）はstateを直接操作するため、App.jsxに残す。

---

### Step 3: UIコンポーネントの分離

#### `src/components/AccordionSection.jsx`
**元の位置**: 2690-2700行目（約10行）
**Props**: `title`, `isOpen`, `onToggle`, `children`
**説明**: 折りたたみ可能なセクション

#### `src/components/Controls.jsx`
**元の位置**: 3020-3038行目（約20行）
**Props**: `onThrowPitch`, `onMultiPitch`, `onReset`, `gameOver`
**説明**: 「1球投げる」「10球」「1000球」「リセット」ボタン

#### `src/components/PitchLog.jsx`
**元の位置**: 3065-3091行目（約30行）
**Props**: `pitchLog`
**説明**: 投球履歴の表示リスト

#### `src/components/Field.jsx`
**元の位置**: 2441-2686行目（約250行）
**Props**: `bases`, `defense`, `onPositionClick`
**説明**: 野球場SVG描画、守備位置表示、ランナー表示

#### `src/components/Scoreboard.jsx`
**元の位置**: 2700-2962行目（約260行）
**Props**: `score`, `inning`, `isTopInning`, `count`, `outs`, `bases`
**説明**: イニングスコア表、カウント表示、塁上状況

#### `src/components/PlayerList.jsx`
**元の位置**: 3094-3183行目（約90行）
**Props**: `players`, `onEdit`, `currentBatterIndex`
**説明**: チーム選手一覧、打順表示

#### `src/components/PlayerEditor.jsx`
**元の位置**: 3187-3353行目（約170行）
**Props**: `player`, `onSave`, `onClose`, `ballEffects`
**説明**: 選手パラメータ編集モーダル

#### `src/components/StatsDisplay.jsx`
**元の位置**: 散在（統計表示部分を統合）
**Props**: `batterStats`, `pitcherStats`, `battedBallStats`
**説明**: 各種統計の表示コンポーネント

---

## Phase 4: 移行手順（実行順序）

### Step 1: 基盤構築
1. Viteプロジェクト作成
2. Tailwind CSS設定
3. 元HTMLの内容をApp.jsxにコピー（動作確認）

### Step 2: データ分離
1. `src/data/constants.js` 作成 → App.jsxでimport確認
2. `src/data/ballEffects.js` 作成 → App.jsxでimport確認
3. `src/data/defaultPlayers.js` 作成 → App.jsxでimport確認

### Step 3: ロジック分離
1. `src/logic/physics.js` 作成 → 動作確認
2. `src/logic/gameRules.js` 作成 → 動作確認
3. `src/logic/simulation.js` 作成 → 動作確認

### Step 4: コンポーネント分離（簡単なものから）
1. `AccordionSection.jsx` → 動作確認
2. `Controls.jsx` → 動作確認
3. `PitchLog.jsx` → 動作確認
4. `Scoreboard.jsx` → 動作確認
5. `Field.jsx` → 動作確認
6. `PlayerList.jsx` → 動作確認
7. `PlayerEditor.jsx` → 動作確認
8. `StatsDisplay.jsx` → 動作確認

### Step 5: 最終調整
1. App.jsxの整理・不要コード削除
2. 全機能の動作テスト
3. 元HTMLファイルをバックアップ用に保持

---

## 日常使用コマンド

| コマンド | 用途 | タイミング |
|---------|------|-----------|
| `npm install` | パッケージインストール | 最初の1回のみ |
| `npm run dev` | 開発サーバー起動 | 開発開始時 |
| `Ctrl + C` | サーバー停止 | 開発終了時 |
| `npm run build` | 本番ビルド | デプロイ時のみ |

**開発サーバー起動後**: ブラウザで http://localhost:5173 を開く

---

## 重要ファイルパス

| ファイル | 役割 | 行数目安 |
|---------|------|---------|
| `baseball-simulator-v25_15.html` | 元ファイル（バックアップ） | 3,360行 |
| `src/App.jsx` | メインコンポーネント | 約1,200行 |
| `src/logic/physics.js` | 物理演算エンジン | 約350行 |
| `src/logic/simulation.js` | シミュレーションコア | 約350行 |
| `src/components/Field.jsx` | フィールド描画 | 約250行 |
| `src/components/Scoreboard.jsx` | スコアボード | 約260行 |

---

## 注意事項

1. **元HTMLファイルは削除しない** - バックアップとして必ず残す
2. **1ステップずつ実行** - 各ファイル作成後に`npm run dev`で動作確認
3. **エラー発生時** - Claude Codeが修正するので慌てない
4. **import文の書き方** - 相対パスで記述（例: `import { ballEffects } from './data/ballEffects'`）
