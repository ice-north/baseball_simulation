# 野球シミュレーター v2

物理演算による詳細な野球試合シミュレーション

## 📁 ファイル構成

```
baseball_simulation/
├── index.html              # メインHTML（開発用）
├── js/
│   ├── constants.js        # 定数データ（変化球効果等）
│   ├── simulation-logic.js # 試合ロジック（物理計算、守備判定）
│   └── players.js          # 選手データ
├── dist/
│   └── baseball-simulator-combined.html  # 結合版（配布用）
├── build.js                # 結合スクリプト
├── package.json            # npm設定
└── README.md               # このファイル
```

## 🚀 使い方

### 開発モード（コード編集時）

1. **サーバーを起動**
   ```bash
   # Pythonを使う場合（推奨）
   python3 -m http.server 8000

   # または npm scriptを使用
   npm run serve
   ```

2. **ブラウザで開く**
   ```
   http://localhost:8000
   ```

3. **コード編集**
   - `js/constants.js` - 変化球効果や定数を編集
   - `js/simulation-logic.js` - 試合ロジックを編集
   - `js/players.js` - 選手データを編集
   - `index.html` - UI部分を編集

### 配布用ファイルの生成

1. **ビルド実行**
   ```bash
   npm run build
   # または
   node build.js
   ```

2. **生成されたファイル**
   - `dist/baseball-simulator-combined.html` が作成されます
   - このファイルは単独で動作します（ダブルクリックで開けます）

## 💡 なぜファイルを分割？

### メリット

1. **トークン節約**: 編集時に必要なファイルだけ読み込む（84%削減）
2. **保守性向上**: コードが整理されて編集しやすい
3. **検索が高速**: 該当ファイルだけGrep可能

### 開発フロー

```
コード編集 → サーバーで確認 → ビルド → 配布
```

## 📝 主な機能

- 物理演算による打球シミュレーション
- 詳細な選手パラメータ
- 試合前の打順・守備位置変更
- 守備適性表示（デバッグ機能）
- イニング別スコア表示

## 🛠️ 技術スタック

- React 18（CDN）
- Tailwind CSS（CDN）
- Babel Standalone（JSX変換）
- Vanilla JavaScript（ES6+）

## ⚙️ カスタマイズ

### 変化球効果を変更

`js/constants.js`の`BALL_EFFECTS`を編集

### 選手能力を変更

`js/players.js`の`createDefaultPlayers()`または`createAwayPlayers()`を編集

### 物理計算パラメータを変更

`js/simulation-logic.js`の各関数を編集

## 📦 配布方法

1. `npm run build`で`dist/baseball-simulator-combined.html`を生成
2. このファイルを共有
3. 受け取った人はダブルクリックで開くだけ

## 🔧 トラブルシューティング

### CORSエラーが出る

→ ローカルサーバーを使ってください（`python3 -m http.server 8000`）

### ビルドエラーが出る

→ Node.jsがインストールされているか確認してください

### 画面が真っ白

→ ブラウザの開発者ツール（F12）でエラーを確認してください
