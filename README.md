# 野球シミュレーター v2

リアルタイム物理演算による野球シミュレーションゲーム

## 🚀 起動方法

### 初回セットアップ
```bash
npm install
```

### 開発サーバー起動
```bash
npm run dev
```

ブラウザで http://localhost:3000 が自動的に開きます。

### プロダクションビルド
```bash
npm run build
npm run preview
```

## 📁 プロジェクト構成

```
/baseball_simulation
├── index.html          # エントリーポイント（11行）
├── src/
│   ├── main.jsx        # Reactエントリー
│   ├── App.jsx         # メインアプリケーション
│   ├── index.css       # Tailwind CSS
│   ├── utils/          # ユーティリティ関数
│   ├── game/           # ゲームロジック
│   ├── season/         # シーズン管理
│   └── data/           # データファイル
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## ✨ 機能

- リアルタイム試合シミュレーション
- 物理演算による打球軌道
- シーズン進行管理
- トライアウト＆ドラフト
- 選手能力編集
- 複数年プレイ対応

## 🛠️ 技術スタック

- React 18
- Vite 5
- Tailwind CSS 3
- ES Modules

## 📝 開発履歴

### 2026-01-23: Vite移行完了
- 7,563行のindex.htmlを分割
- ES module形式への完全移行
- Claude Codeのフリーズ問題解決
- 開発体験の大幅改善
