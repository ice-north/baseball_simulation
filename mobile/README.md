# オンライン対人版 スマホアプリ（Android）

オンライン対人モード専用のネイティブアプリ。試合やシーズンの計算はサーバー（`../server`、本番は Vercel の `../api/online.mjs`）が行い、アプリは「見る」「指示を送る」だけ。一人用モードは入れない。

## 構成

| モジュール | 中身 |
| --- | --- |
| `shared` | 通信（Ktor）、データの形、打順の編集、表示用の関数。Kotlin Multiplatform（いまは jvm だけ。iOS に進むときに target を足す） |
| `androidApp` | Jetpack Compose の画面（ログイン、ホーム、打順・ローテーション） |

- 接続先の既定は本番（`https://baseball-simulation-neon.vercel.app/api/online`）。ログイン画面の「接続先を変える（開発用）」でローカルの開発サーバーにも繋げる（エミュレーターから PC へは `http://10.0.2.2:3002/`）。
- ログインは Web 版と同じアカウント。**ログインすると、ほかの端末からは操作できなくなる**（サーバーが1人1端末で session を見ているため）。

## サーバーとの約束（壊さないために）

- アプリは `?action=login / refresh / view / command` を使う。ビューの項目名を変えるとアプリが壊れる。
- 編成の保存（`command` の `lineup`）は、ビューの `lineup` を**丸ごと**送り返し、`baseLineup` に編集前の塊を添える。アプリが知らない項目もそのまま返すので、編成に項目を足すのは構わない。
- `shared/src/jvmTest/resources/view-running.json` は開発サーバーの実際のビュー。ビューの形を変えたら、これを取り直して `ViewTest` が通ることを確かめる。

## ビルド

- GitHub Actions（`.github/workflows/android.yml`）が `mobile/` の変更ごとに検査と APK のビルドをする。APK は実行結果の Artifacts から落とす。
- 手元: Android Studio で `mobile/` を開く。または `./gradlew :androidApp:assembleDebug`。
- Android SDK の無い環境では `./gradlew -PsharedOnly :shared:jvmTest` で共通部分だけ検査できる。
- `ONLINE_TEST_ENDPOINT=http://127.0.0.1:3002/` を付けると、開発サーバー（開幕済みのリーグ）に繋いで打順の保存まで通す検査も動く。

## 署名

`androidApp/debug.keystore` は試作配布用（パスワードは Android 標準の `android`）。CI のたびに鍵が変わると上書きインストールできなくなるので固定してある。ストアに出すときは本番用の鍵を別に作り、リポジトリには置かない。
