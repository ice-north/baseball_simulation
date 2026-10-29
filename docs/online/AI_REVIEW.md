# 取り込み前のAIレビュー

今回の追加分は [未保存入力](UNSAVED_DRAFTS.md) と [場面別・年度別・通算・試合記録](RECORDED_STATISTICS.md) を参照。`server/recordedStats.mjs` の完了打席/走者アウト/年度境界、`situationalLabels.mjs` の母数・比較・排他、`recordedViews.mjs` の期間と由来、`archiveIndex.mjs` とStorageの原子的公開・整理、`Drafts.jsx` の復元と編集開始時点の保持を重点確認する。通常ゲームとの同一性・乱数・二重加算を実測で確認し、外部受入成功と混同しない。

[選手情報追加後の全体レビュー](REVIEW_20261028_3.md) に、認証の画面/送信境界、成績の桁境界、前回CIでのみ観測した詳細開閉失敗の確認状況を記録している。

選手情報の追加分は [PLAYER_INFORMATION.md](PLAYER_INFORMATION.md) を参照。`statsView.js` の計算・欠損・全名簿ソート、`playerInfo.js` の既存能力参照、一覧の既存ランク共用と詳細の実数値、`projection.mjs` の非破壊性を確認する。`check:online` に指標検査を追加済み。`check:online:label-ui` は投打全項目の列幅、ランク→実数値、未保存編成維持も検査する。

## レビュー依頼文

以下をレビュー担当AIへ渡してください。

> このPRは、既存の一人用ゲームに人間2球団＋CPU2球団の非同期オンライン独立リーグを追加します。
> `CLAUDE.md`、`docs/online/IMPLEMENTATION.md`、`docs/online/README.md`、`docs/online/REVIEWS.md`を読み、差分と実行経路を確認してください。
> 下記の検証を実行し、ゲーム進行・保存競合・認証・一人用回帰・スマホの操作性を優先してください。
> ローカル成功・通信fixture・実サービス受入・スマホ実機を区別し、未実行をPASSと扱わないでください。
> 指摘には対象ファイル、具体的な再現条件、影響、検証結果を付けてください。問題のない設計を推測だけで作り替えないでください。
> アカウント作成、秘密値登録、クラウド操作、公開は保留してください。自動マージはしないでください。

## 調べる入口

| 対象 | 入口 | 主な確認点 |
| --- | --- | --- |
| 一人用からの分離 | `src/main.jsx` / `src/online/OnlineApp.jsx` | 一人用の進行・保存の副作用をマウントしない |
| 共通の実試合 | `src/game/daySimulation.js` / `backgroundProgression.js` | 日次順序、重複加算、プレーオフの順位加算なし |
| 二人の所有 | `src/game/teamControl.js` | 従来セーブの先頭球団フォールバックと明示的な複数人間球団 |
| 年間進行 | `server/leagueEngine.mjs` | 実試合・背景球界・両者の提出・年度更新・NPBドラフト |
| 引き分け | `server/playoffReplay.mjs` / `seasonManager.js` | 再試合を追加しても必要勝数を増やさない。旧形式の既定判定を変えない |
| 毎日の編成 | `server/dailyLineup.mjs` / `lineupCommand.mjs` | 無効選手・重複・疲労・代役・予約ローテの保持 |
| 完全保存 | `server/worldSnapshot.mjs` | 未完了の背景大会、共有参照、プール、大学評価、選手/スタッフID採番、スタッフ氏名履歴 |
| 認証・版・再送 | `server/leagueService.mjs` / `http.mjs` | 参加者・最新端末・revision・操作IDと内容の一致 |
| 本番の保存 | `server/storage/supabaseStore.mjs` / SQL migration | DBリース・期限・世代比較・公開ポインタ・service_role限定 |
| 小さい応答 | `server/projection.mjs` | 相手の未確定案や巨大な世界データを返さない |
| スマホ | `src/online/MobileView.jsx` / `LeaguePanels.jsx` / CSS | 件数制限、固定ボタン、1画面1目的、タッチ幅、スクロール量 |
| PC | `src/online/DesktopView.jsx` / CSS | 既存surface/accent、左ナビ、選んだ操作だけを表示 |

## 再現する検証

```sh
npm ci
npm run check:full
npm run build
npm run check:online:season
```

`check:full`には操作API、保存先の通信fixture、引き分け・疲労境界を含む。
通年検査は別で、実試合を243日消化し、全4球団75試合、プレーオフ優勝、NPBドラフト、契約、トライアウト、年度更新、次年度キャンプを確認する。
既存の多年次検査だけをオンライン受入の代わりにしない。

画面検査の起動方法は `README.md` に記載。
新しい空の一時保存先・独立したブラウザプロフィールを使用する。
`check:online:ui`は既存の通常プレイ用リーグに対して実行しない。

- 二人の初期編成→キャンプ→開幕を行い、一方だけの決定では進まない。
- PCで選手を入れ替えて保存し、数値IDが文字列に変わって拒否されない。
- 同じ人のスマホログイン後、旧PCの更新操作が拒否される。
- スマホで打順を変えて保存でき、保存ボタンを探してスクロールしない。
- 320〜767px幅で横にはみ出さず、画面高に対して長い縦スクロールにならない。
- 試合は2件、お知らせは4件ずつ。トライアウト結果96人を縦に一括表示しない。
- 一人用タイトルが表示され、オンラインへの導線がある。一人用のセーブには書き込まない。

## 保存と失敗の境界

通常コマンドは作業用のbundleだけを変更し、処理途中の例外時は公開しない。
日次処理は世界をコピーし、計算失敗時に最後の正常なゲームを保持したエラー停止を公開する。
共有Storageのアップロードだけでは正本を変更せず、DBのリース・期限・世代が一致したときだけ公開する。
公開応答を失った場合は新しいオブジェクトを削除しない。再送または最新状態の取得で確認する。
プロセス強制終了時はリースが最大10分残る。期限切れ後の古い処理は公開できないことを実サービスで確認する。

復元時は日付・試合・提出を一式で戻す一方、過去の端末権限や古い操作の再実行を復活させない。
手元への退避ツールはクラウド接続が必要なため、今回のローカル受入には含めていない。

## 保留中の外部受入

SQLの実適用、RLS、Supabase Auth・トークン更新、実Storageの公開切替、複数関数インスタンス、Vercel上の日次計算の時間・メモリ、Cron、退避ツール、iOS/Android実機は未実施。
`README.md`の公開環境受入が終わるまで本運用開始は保留する。
無料枠で収まるかは実測が必要。CIの成功だけで外部サービスの受入完了と判断しない。

追加レビューの指摘と再現条件は [REVIEW_20261028.md](REVIEW_20261028.md) に記録。認証競合は `npm run check:online:auth-ui`、サーバー境界と復元は `check:online` で再現する。

第2回レビューは [REVIEW_20261028_2.md](REVIEW_20261028_2.md)。同一ログインの別タブで提出・編成を保存し、古い入力を保持する側が最新revisionを取得しても上書きできないことを確認する。`check:online:edit-ui` は標準案の読込み失敗・別手続きの応答・保存中入力・スマホ確認と一覧縮小を配布HTML/API fixtureで検査する。

成績ラベルは [PERFORMANCE_LABELS.md](PERFORMANCE_LABELS.md)。通常ゲームのソース変更がないこと、サーバーが自チーム以外の3球団も平均に含めること、欠損から盗塁成功率を作らないこと、ラベルを試合計算に使わないことを確認する。`check:online:label-ui`で閲覧・投打切替・打順の未保存編集の保持を再現できる。

スマホ省スペース化は [MOBILE_LAYOUT.md](MOBILE_LAYOUT.md)。下部3操作と固定の保存/決定が重ならないこと、一覧の最終行とページ送りが重ならないこと、ResizeObserverで画面高が変わっても有効なページになること、メニュー更新で編集・お知らせ選択を失わないことを確認する。
