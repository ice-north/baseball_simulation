# GitHub Pages 公開手引書

このガイドでは、野球シミュレーターをGitHub Pagesで公開する手順を説明します。

---

## 前提条件

- GitHubアカウントを持っている
- リポジトリがGitHubにプッシュ済み
- リポジトリがPublic設定になっている（無料プランの場合）

---

## 手順

### Step 1: ファイル名の変更

GitHub Pagesはデフォルトで `index.html` をトップページとして表示します。

```bash
# 現在のファイル名を index.html にリネーム
mv baseball-simulator-v25_15.html index.html

# 変更をコミット
git add .
git commit -m "Rename to index.html for GitHub Pages"
git push origin main
```

> **補足**: 元のファイル名のままでも公開可能ですが、URLが長くなります。
> - リネーム後: `https://ユーザー名.github.io/リポジトリ名/`
> - リネームなし: `https://ユーザー名.github.io/リポジトリ名/baseball-simulator-v25_15.html`

---

### Step 2: GitHub Pages を有効化

1. GitHubでリポジトリページを開く
2. **Settings**（設定）タブをクリック
3. 左サイドバーの **Pages** をクリック
4. **Source** セクションで以下を設定:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. **Save** をクリック

![GitHub Pages設定の場所](https://docs.github.com/assets/cb-28260/images/help/pages/publishing-source-drop-down.png)

---

### Step 3: 公開を確認

1. 設定保存後、数分待つ（通常1〜3分）
2. Pagesの設定画面に緑色のメッセージが表示される:
   ```
   Your site is live at https://ユーザー名.github.io/リポジトリ名/
   ```
3. URLをクリックしてサイトを確認

---

## トラブルシューティング

### サイトが表示されない場合

| 問題 | 解決策 |
|-----|-------|
| 404エラー | ファイル名が `index.html` か確認 |
| ビルド失敗 | Actions タブでエラーログを確認 |
| 変更が反映されない | ブラウザのキャッシュをクリア（Ctrl+Shift+R） |
| まだ準備中 | 5分ほど待ってから再度アクセス |

### リポジトリがPrivateの場合

GitHub無料プランではPrivateリポジトリでGitHub Pagesを使えません。

**選択肢:**
1. リポジトリをPublicに変更する
2. GitHub Pro（有料）にアップグレード
3. Vercel/Netlifyを使う（Privateでも無料で可能）

---

## オプション: カスタムドメイン

独自ドメイン（例: `baseball-sim.com`）を使いたい場合:

### 1. ドメインを購入
- お名前.com
- Google Domains
- Cloudflare など

### 2. DNS設定
ドメイン管理画面で以下のレコードを追加:

```
Type: CNAME
Name: www
Value: ユーザー名.github.io
```

または（Apexドメインの場合）:
```
Type: A
Name: @
Value: 185.199.108.153
       185.199.109.153
       185.199.110.153
       185.199.111.153
```

### 3. GitHub側の設定
1. Settings → Pages
2. **Custom domain** にドメインを入力
3. **Enforce HTTPS** にチェック

---

## 将来的な拡張について

### 現在の構成（静的サイト）でできること
- ゲームのプレイ
- ローカルストレージへのデータ保存（ブラウザ内）
- オフラインプレイ（Service Worker追加で可能）

### 動的機能が必要な場合

以下の機能を追加したい場合は、バックエンドが必要です:

| 機能 | 必要な技術 |
|-----|----------|
| ユーザー登録/ログイン | 認証サーバー（Firebase Auth等） |
| 成績のクラウド保存 | データベース（Firestore等） |
| ランキング機能 | API サーバー |
| マルチプレイ対戦 | WebSocket サーバー |

**推奨スタック（将来的に）:**
- **Firebase**: 認証 + データベース + ホスティングが一体化
- **Supabase**: オープンソース版Firebase
- **Vercel + PlanetScale**: Next.js + MySQL

---

## クイックリファレンス

```bash
# 1. ファイルをリネーム
mv baseball-simulator-v25_15.html index.html

# 2. コミット & プッシュ
git add .
git commit -m "Rename to index.html for GitHub Pages"
git push origin main

# 3. GitHubでPages設定を有効化（ブラウザで操作）

# 4. 公開URL
# https://ユーザー名.github.io/baseball_simulation/
```

---

## 参考リンク

- [GitHub Pages 公式ドキュメント](https://docs.github.com/ja/pages)
- [カスタムドメイン設定](https://docs.github.com/ja/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [GitHub Actions でのデプロイ](https://docs.github.com/ja/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
